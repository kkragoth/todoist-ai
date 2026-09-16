"""Server-side ReAct loop (ported from agentic-cli/main.py, I/O removed).

create_agent wires a graph with two nodes that alternate until done:
  model node -> AIMessage; plain text (FINAL answer, loop ends) or
                text + tool_calls (loop continues)
  tools node -> executes each tool_call, appends a ToolMessage per result,
                hands control back to the model node
That model->tools->model cycle IS the ReAct loop. `recursion_limit`
bounds it so a confused model spins at most N rounds instead of forever.

Streaming: agent.astream(stream_mode=["messages", "updates"]).
"messages" yields LLM chunks token-by-token; "updates" yields per-node
full messages so tool calls/results are announced live.

Yields event dicts (JSON-serializable, SSE-framed by router.py):
  {"type": "token", "content": "..."}
  {"type": "tool_call", "tool": ..., "args": {...}}
  {"type": "tool_result", "tool": ..., "output": "..."}
  {"type": "ui_data", "widget": "todo_list", "open": ..., "done": ...,
   "total": ..., "truncated": ..., "todos": [...]}
  {"type": "ask_user", "question": "...", "options": [...]}
  {"type": "ui_suggestions", "suggestions": ["...", ...]}
  {"type": "ui_action", "action": ..., "args": {...}}
  {"type": "done"}
  {"type": "error", "message": "..."}

ask_user is terminal: the first ask_user tool call is surfaced as an
ask_user event (not a generic tool_call) and ends the turn after its
ToolMessage lands in history, so the user's next message continues with
full context. Extra ask_user calls in the same turn are ignored.

ui_action is NON-terminal (unlike ask_user): UI-only tools
(set_todos_filter/set_todos_view/highlight_todos, gated by the
"ui_action" capability) emit ui_action on first sight and the loop
continues so the model can e.g. filter then narrate. Their ToolMessages
stay in history but never surface as tool_result noise. CLI clients
omit the capability and never see these tools or events.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import datetime
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, ToolMessage

from . import config, history
from .events import (
    AnswerPrefixStripper,
    build_ui_data_event,
    clean_suggestions,
    format_ui_context,
    normalize_ask,
    safe_text,
    strip_artifacts,
    text_delta,
)
from .llm_factory import make_llm
from .prompt import system_prompt
from .protocol import (
    TOOL_TO_UI_ACTION,
    ChatEventType,
    ClientCapability,
    ToolName,
    UiActionName,
    has_ui_action,
)
from .schemas import ClientInfo
from .tools import ChatContext, build_tools_for_user

logger = logging.getLogger(__name__)

# Dedup key: stable call id when present, otherwise name+args fallback.
DedupKey = str | tuple[str | None, str]


def parse_tool_name(name: object) -> ToolName | None:
    """Coerce a raw tool name to its enum, or None when unknown."""
    if isinstance(name, ToolName):
        return name
    if isinstance(name, str):
        try:
            return ToolName(name)
        except ValueError:
            return None
    return None


def ui_action_for(tool: ToolName) -> UiActionName | None:
    return TOOL_TO_UI_ACTION.get(tool)


class TurnState:
    """Per-turn routing state for one `run_turn` loop.

    Routing rules: ask_user terminal, ui_action/suggest non-terminal,
    tool-call dedup by call id.
    """

    def __init__(self, *, user_id: int, capabilities: set[ClientCapability]) -> None:
        self.user_id = user_id
        self.capabilities = capabilities
        self.seen_tool_ids: set[DedupKey] = set()
        self.tool_names: dict[str, str] = {}  # tool_call id -> tool name
        self.ask_event: dict[str, Any] | None = None
        self.ask_call_ids: set[str] = set()
        self.ui_call_ids: set[str] = set()
        self.ask_done = False
        self.prefix_stripper = AnswerPrefixStripper()

    @staticmethod
    def call_parts(tool_call: dict[str, Any] | Any) -> tuple[Any, Any, str | None]:
        if isinstance(tool_call, dict):
            return tool_call.get("name"), tool_call.get("args"), tool_call.get("id")
        return (
            getattr(tool_call, "name", None),
            getattr(tool_call, "args", None),
            getattr(tool_call, "id", None),
        )

    def _dedup_key(self, name: Any, args: Any, call_id: str | None) -> DedupKey:
        if call_id:
            return call_id
        return (str(name) if name is not None else None, str(args or ""))

    def _remember(self, name: Any, call_id: str | None, extra_ids: set[str] | None = None) -> None:
        if call_id and name is not None:
            self.tool_names[call_id] = str(name)
            if extra_ids is not None:
                extra_ids.add(call_id)

    def announce_tool_call(self, tool_call: dict[str, Any] | Any) -> dict[str, Any] | None:
        name, args, call_id = self.call_parts(tool_call)
        key = self._dedup_key(name, args, call_id)
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        self._remember(name, call_id)
        return {"type": ChatEventType.TOOL_CALL.value, "tool": name, "args": args or {}}

    def check_ask(self, tool_call: dict[str, Any] | Any) -> dict[str, Any] | None:
        """Route one ask_user call. First call wins; malformed still yields
        a fallback question so the turn never ends silently."""
        name, args, call_id = self.call_parts(tool_call)
        if parse_tool_name(name) is not ToolName.ASK_USER:
            return None
        self._remember(ToolName.ASK_USER.value, call_id, self.ask_call_ids)
        if self.ask_event is not None:
            return None
        event = normalize_ask(args)
        if event is None:
            logger.warning(
                "chat ask_user with unusable args (user_id=%s args=%r)",
                self.user_id,
                str(args)[:120],
            )
            event = {
                "type": ChatEventType.ASK_USER.value,
                "question": "Could you clarify which task you mean?",
                "options": [],
            }
        self.ask_event = event
        logger.info(
            "chat ask_user (user_id=%s question=%r)",
            self.user_id,
            event["question"][:80],
        )
        return event

    def check_ui_action(self, tool_call: dict[str, Any] | Any) -> dict[str, Any] | None:
        """Route one UI-only call. Non-terminal: loop continues so the model
        narrates after driving the view."""
        name, args, call_id = self.call_parts(tool_call)
        tool = parse_tool_name(name)
        ui_action = ui_action_for(tool) if tool is not None else None
        if tool is None or ui_action is None:
            return None
        key = self._dedup_key(name, args, call_id)
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        self._remember(name, call_id, self.ui_call_ids)
        return {
            "type": ChatEventType.UI_ACTION.value,
            "action": ui_action.value,
            "args": args or {},
        }

    def check_suggest(self, tool_call: dict[str, Any] | Any) -> dict[str, Any] | None:
        """Route one suggest_followups call. Empty suggestions emit nothing."""
        name, args, call_id = self.call_parts(tool_call)
        if parse_tool_name(name) is not ToolName.SUGGEST_FOLLOWUPS:
            return None
        key = self._dedup_key(name, args, call_id)
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        self._remember(name, call_id, self.ui_call_ids)
        raw = args.get("suggestions") if isinstance(args, dict) else []
        suggestions = clean_suggestions(raw)
        if not suggestions:
            return None
        return {"type": ChatEventType.UI_SUGGESTIONS.value, "suggestions": suggestions}

    def route_tool_call(self, tool_call: dict[str, Any] | Any) -> dict[str, Any] | None:
        """Route one tool call to its SSE event. None means duplicate."""
        tool = parse_tool_name(self.call_parts(tool_call)[0])
        if tool is ToolName.ASK_USER:
            return self.check_ask(tool_call)
        if tool is ToolName.SUGGEST_FOLLOWUPS:
            return self.check_suggest(tool_call)
        if tool is not None and ui_action_for(tool) is not None:
            return self.check_ui_action(tool_call)
        return self.announce_tool_call(tool_call)

    def translate_message_chunk(self, chunk: Any) -> list[dict[str, Any]]:
        """Translate one "messages"-mode chunk into SSE events.

        Tool-node messages are skipped: tool output has its own
        tool_result event. Without this guard every answer appears twice.
        """
        if isinstance(chunk, ToolMessage):
            return []
        events: list[dict[str, Any]] = []
        delta = text_delta(getattr(chunk, "content", ""))
        if delta:
            delta = self.prefix_stripper.feed(delta)
        if delta:
            events.append({"type": ChatEventType.TOKEN.value, "content": delta})
        for tool_call in getattr(chunk, "tool_calls", None) or []:
            event = self.route_tool_call(tool_call)
            if event is not None:
                events.append(event)
        return events

    def translate_tool_message(self, message: ToolMessage) -> list[dict[str, Any]]:
        """Translate one tools-node ToolMessage into SSE events.

        Ask/UI acks stay in history but never surface as tool_result noise.
        Sets `ask_done` so the loop breaks after the ask ToolMessage lands.
        """
        tool_call_id = getattr(message, "tool_call_id", "")
        tool = self.tool_names.get(tool_call_id, getattr(message, "name", ""))
        if parse_tool_name(tool) is ToolName.ASK_USER or tool_call_id in self.ask_call_ids:
            self.ask_done = True
            return []
        if parse_tool_name(tool) is not None and ui_action_for(parse_tool_name(tool)) is not None:
            return []
        if tool_call_id in self.ui_call_ids:
            return []
        events = [
            {
                "type": ChatEventType.TOOL_RESULT.value,
                "tool": tool,
                "output": safe_text(getattr(message, "content", "")),
            }
        ]
        if has_ui_action(self.capabilities):
            widget = build_ui_data_event(getattr(message, "artifact", None))
            if widget is not None:
                events.append(widget)
        return events

    def handle_node_update(self, node_update: dict[str, Any] | None) -> list[dict[str, Any]]:
        """Translate one `updates`-mode node payload into SSE events."""
        message_payload = node_update.get("messages") if isinstance(node_update, dict) else None
        if not message_payload:
            return []
        messages = message_payload if isinstance(message_payload, list) else [message_payload]
        events: list[dict[str, Any]] = []
        for message in messages:
            if isinstance(message, ToolMessage):
                events.extend(self.translate_tool_message(message))
            for tool_call in getattr(message, "tool_calls", None) or []:
                event = self.route_tool_call(tool_call)
                if event is not None:
                    events.append(event)
        return events


async def run_turn(
    *,
    user_id: int,
    user_text: str,
    thread_id: int | str | None = None,
    provider: str | None = None,
    model: str | None = None,
    client: ClientInfo | None = None,
    is_disconnected: Callable[[], Awaitable[bool]] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run one full reason/act loop for this turn, yielding event dicts.

    Only clients advertising the ui_action capability get the UI tools
    and their ui_action events.
    """
    try:
        llm = make_llm(provider=provider, model=model)
        active_provider, active_model = config.resolve_provider_and_model(
            provider, model
        )
    except (ValueError, RuntimeError) as exc:
        yield {"type": ChatEventType.ERROR.value, "message": str(exc)}
        return

    if client is not None:
        capabilities = set(client.capabilities or [])
        ui_state = client.ui_state
    else:
        capabilities = set()
        ui_state = None

    tools = build_tools_for_user(capabilities)
    agent = create_agent(model=llm, tools=tools, context_schema=ChatContext)
    turn_context = ChatContext(
        user_id=user_id, ui_enabled=has_ui_action(capabilities)
    )

    stored = await history.get_history(user_id, thread_id)
    user_message = HumanMessage(content=user_text)
    messages = [
        system_prompt(
            datetime.now().date(),
            ui_context=format_ui_context(ui_state),
            has_ui_tools=has_ui_action(capabilities),
        ),
        *stored,
        user_message,
    ]

    new_history_messages: list = []
    turn_state = TurnState(user_id=user_id, capabilities=capabilities)

    try:
        # asyncio.timeout fires even when the provider hangs without yielding.
        async with asyncio.timeout(config.TURN_TIMEOUT_SECONDS):
            async for mode, data in agent.astream(
                {"messages": messages},
                config={"recursion_limit": config.RECURSION_LIMIT},
                context=turn_context,
                stream_mode=["messages", "updates"],
            ):
                if is_disconnected is not None and await is_disconnected():
                    logger.info("chat client disconnected, stopping turn (user_id=%s)", user_id)
                    break

                if mode == "messages":
                    chunk, _metadata = data
                    for event in turn_state.translate_message_chunk(chunk):
                        yield event
                elif mode == "updates":
                    for _node_name, node_update in (data or {}).items():
                        for event in turn_state.handle_node_update(node_update):
                            yield event
                        update_messages = (
                            node_update.get("messages")
                            if isinstance(node_update, dict)
                            else None
                        )
                        if update_messages:
                            items = (
                                update_messages
                                if isinstance(update_messages, list)
                                else [update_messages]
                            )
                            new_history_messages.extend(items)
                    if turn_state.ask_done:
                        break

        if new_history_messages:
            await history.append_turn(
                user_id,
                thread_id,
                [user_message, *strip_artifacts(new_history_messages)],
                provider=active_provider,
                model=active_model,
            )
        yield {"type": ChatEventType.DONE.value}
    except TimeoutError:
        logger.warning("chat turn timed out (user_id=%s)", user_id)
        yield {
            "type": ChatEventType.ERROR.value,
            "message": f"Turn timed out after {config.TURN_TIMEOUT_SECONDS:g}s. Try a smaller request.",
        }
    except Exception:
        logger.exception("chat turn failed (user_id=%s)", user_id)
        yield {"type": ChatEventType.ERROR.value, "message": "that turn failed. Try rephrasing."}
