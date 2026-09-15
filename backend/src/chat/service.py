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
from collections.abc import AsyncGenerator
from datetime import datetime

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
    has_ui_action,
)
from .schemas import ClientInfo
from .tools import ChatContext, build_tools_for_user

logger = logging.getLogger(__name__)

# UI-only tools (no DB work) -> client-local `ui_action` events.
# Mapping: tool name -> ui_action `action` name sent over SSE.
UI_ACTION_TOOLS = {tool.value: action.value for tool, action in TOOL_TO_UI_ACTION.items()}


class TurnState:
    """Per-turn routing state for one `run_turn` loop.

    Replaces the six closures that used to share six `nonlocal` vars.
    Routing rules (unchanged): ask_user terminal, ui_action/suggest
    non-terminal, tool-call dedup by call id.
    """

    def __init__(self, *, user_id: int, capabilities: set[ClientCapability]) -> None:
        self.user_id = user_id
        self.capabilities = capabilities
        self.seen_tool_ids: set = set()
        self.tool_names: dict[str, str] = {}  # tool_call id -> name (for tool_result)
        self.ask_event: dict | None = None
        self.ask_call_ids: set = set()
        self.ui_call_ids: set = set()
        self.ask_done = False
        self.prefix_stripper = AnswerPrefixStripper()

    @staticmethod
    def call_parts(tc) -> tuple:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", None)
        call_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
        return name, args, call_id

    def announce_tool_call(self, tc) -> dict | None:
        name, args, call_id = self.call_parts(tc)
        key = call_id or (name, str(args or ""))
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        if call_id and name:
            self.tool_names[call_id] = name
        return {"type": ChatEventType.TOOL_CALL.value, "tool": name, "args": args or {}}

    def check_ask(self, tc) -> dict | None:
        """Route one ask_user call to its event. The first call wins; later
        ones are ignored. A malformed call still yields a fallback question
        so the turn never ends silently.

        Every ask_user call id is recorded so its ToolMessage can be
        suppressed (the client already got the ask_user event) while still
        landing in history for next-turn context.
        """
        name, args, call_id = self.call_parts(tc)
        if name != ToolName.ASK_USER:
            return None
        if call_id:
            self.tool_names[call_id] = ToolName.ASK_USER.value
            self.ask_call_ids.add(call_id)
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

    def check_ui_action(self, tc) -> dict | None:
        """Route one UI-only call to its event. Non-terminal: the loop keeps
        going so the model narrates after driving the view. The call id is
        recorded so its ack ToolMessage stays in history but never surfaces
        as tool_result noise."""
        name, args, call_id = self.call_parts(tc)
        if name not in UI_ACTION_TOOLS:
            return None
        key = call_id or (name, str(args or ""))
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        if call_id and name:
            self.tool_names[call_id] = name
            self.ui_call_ids.add(call_id)
        return {
            "type": ChatEventType.UI_ACTION.value,
            "action": UI_ACTION_TOOLS[name],
            "args": args or {},
        }

    def check_suggest(self, tc) -> dict | None:
        """Route one suggest_followups call to its event. Non-terminal and
        idempotent per call: cleaned chips (max 4, max 40 chars each) render
        as tappable follow-ups. Empty suggestions emit nothing. The call id
        is recorded so its ack ToolMessage stays in history but never
        surfaces as tool_result noise."""
        name, args, call_id = self.call_parts(tc)
        if name != ToolName.SUGGEST_FOLLOWUPS:
            return None
        key = call_id or (name, str(args or ""))
        if key in self.seen_tool_ids:
            return None
        self.seen_tool_ids.add(key)
        if call_id and name:
            self.tool_names[call_id] = name
            self.ui_call_ids.add(call_id)
        raw = (args or {}).get("suggestions") if isinstance(args, dict) else []
        suggestions = clean_suggestions(raw)
        if not suggestions:
            return None
        return {"type": ChatEventType.UI_SUGGESTIONS.value, "suggestions": suggestions}

    def route_tool_call(self, tc) -> dict | None:
        """Route one tool call to its SSE event. Ask calls yield ask_user,
        suggest calls yield ui_suggestions, UI calls yield ui_action,
        everything else a generic tool_call. None means duplicate."""
        tool_name = self.call_parts(tc)[0]
        if tool_name == ToolName.ASK_USER:
            return self.check_ask(tc)
        if tool_name == ToolName.SUGGEST_FOLLOWUPS:
            return self.check_suggest(tc)
        if tool_name in UI_ACTION_TOOLS:
            return self.check_ui_action(tc)
        return self.announce_tool_call(tc)

    def translate_message_chunk(self, chunk) -> list[dict]:
        """Translate one "messages"-mode chunk into SSE events.

        Tool-node messages are skipped here: tool output has its own
        tool_result event from `translate_tool_message` below. Without
        this guard the tool output is emitted as answer tokens and then
        restated by the model, i.e. every answer appears twice.
        """
        # The "messages" stream yields chunks from every node, including
        # the tools node (ToolMessage carrying the full tool output as
        # content). Only the model node speaks for the answer.
        if isinstance(chunk, ToolMessage):
            return []
        events = []
        delta = text_delta(getattr(chunk, "content", ""))
        if delta:
            delta = self.prefix_stripper.feed(delta)
        if delta:
            events.append({"type": ChatEventType.TOKEN.value, "content": delta})
        for tc in getattr(chunk, "tool_calls", None) or []:
            event = self.route_tool_call(tc)
            if event is not None:
                events.append(event)
        return events

    def translate_tool_message(self, message: ToolMessage) -> list[dict]:
        """Translate one tools-node ToolMessage into SSE events.

        Ask/UI acks stay in history but never surface as tool_result
        noise (the client already got the ask_user/ui_action event).
        Sets `ask_done` so the loop breaks after the ask ToolMessage
        lands in history.
        """
        tool_call_id = getattr(message, "tool_call_id", "")
        tool = self.tool_names.get(tool_call_id, getattr(message, "name", ""))
        if tool == ToolName.ASK_USER.value or tool_call_id in self.ask_call_ids:
            # Client already got the ask_user event;
            # keep the message in history, skip the noise.
            self.ask_done = True
            return []
        if tool in UI_ACTION_TOOLS or tool_call_id in self.ui_call_ids:
            # Client already got the ui_action event;
            # the ack stays in history, loop continues.
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


async def run_turn(
    *,
    user_id: int,
    user_text: str,
    thread_id: int | str | None = None,
    provider: str | None = None,
    model: str | None = None,
    client: ClientInfo | None = None,
    is_disconnected=None,
) -> AsyncGenerator[dict, None]:
    """Run one full reason/act loop for this turn, yielding event dicts.

    `client` is the optional validated ChatRequest.client with
    kind/capabilities/ui_state. Only clients advertising `"ui_action"` get
    the UI tools and their `ui_action` events.
    """
    try:
        llm = make_llm(provider=provider, model=model)
        active_provider, active_model = config.resolve_provider_and_model(
            provider, model
        )
    except (ValueError, RuntimeError) as e:
        yield {"type": ChatEventType.ERROR.value, "message": str(e)}
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

    fresh: list = []
    state = TurnState(user_id=user_id, capabilities=capabilities)

    try:
        # asyncio.timeout (not an elapsed check inside the loop): fires even
        # when the provider hangs without yielding any chunk.
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
                    chunk, _meta = data
                    for event in state.translate_message_chunk(chunk):
                        yield event
                elif mode == "updates":
                    for _node, update in (data or {}).items():
                        upd = update.get("messages") if isinstance(update, dict) else None
                        if not upd:
                            continue
                        msgs = upd if isinstance(upd, list) else [upd]
                        for m in msgs:
                            if isinstance(m, ToolMessage):
                                for event in state.translate_tool_message(m):
                                    yield event
                            for tc in getattr(m, "tool_calls", None) or []:
                                event = state.route_tool_call(tc)
                                if event is not None:
                                    yield event
                        fresh.extend(msgs)
                    if state.ask_done:
                        break

        if fresh:
            await history.append_turn(
                user_id,
                thread_id,
                [user_message, *strip_artifacts(fresh)],
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
    except Exception as e:
        logger.exception("chat turn failed (user_id=%s)", user_id)
        yield {"type": ChatEventType.ERROR.value, "message": f"that turn failed ({e}). Try rephrasing."}
