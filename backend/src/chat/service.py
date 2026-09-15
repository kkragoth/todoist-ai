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
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, ToolMessage

from . import config, history
from .llm_factory import make_llm
from .prompt import system_prompt
from .protocol import (
    TOOL_TO_UI_ACTION,
    UI_DATA_MAX_ROWS,
    UI_STATE_KEYS,
    ChatEventType,
    ClientCapability,
    ToolName,
    UiActionName,
    WidgetKind,
    has_ui_action,
    normalize_capabilities,
)
from .protocol import MAX_SUGGESTION_CHARS as SUGGESTION_CHARS
from .protocol import MAX_SUGGESTIONS as SUGGESTION_LIMIT
from .tools import build_tools_for_user

logger = logging.getLogger(__name__)

ASK_USER_TOOL = ToolName.ASK_USER
SUGGEST_TOOL = ToolName.SUGGEST_FOLLOWUPS

# Max chips per turn / chars per chip for `ui_suggestions`.
MAX_SUGGESTIONS = SUGGESTION_LIMIT
MAX_SUGGESTION_CHARS = SUGGESTION_CHARS


def clean_suggestions(raw) -> list[str]:
    """Clean suggest_followups args into chip labels. Mirrors the frontend
    caps in `chat.ts` so both ends agree on max 4 chips of 40 chars."""
    items = raw if isinstance(raw, list) else []
    return [
        str(s).strip()[:MAX_SUGGESTION_CHARS]
        for s in items
        if str(s).strip()
    ][:MAX_SUGGESTIONS]

# UI-only tools (no DB work) -> client-local `ui_action` events.
# Mapping: tool name -> ui_action `action` name sent over SSE.
UI_ACTION_TOOLS = {tool.value: action.value for tool, action in TOOL_TO_UI_ACTION.items()}


def build_ui_data_event(artifact) -> dict | None:
    """Build a `ui_data` todo_list widget from a list_todos artifact.

    None when there is nothing worth rendering (empty/error results carry
    no artifact). Counts cover the full result set even when rows are
    truncated, so the client can print "showing 30 of 47".
    """
    if not isinstance(artifact, dict):
        return None
    todos = artifact.get("todos")
    if not todos:
        return None
    rows = todos[:UI_DATA_MAX_ROWS]
    return {
        "type": ChatEventType.UI_DATA.value,
        "widget": WidgetKind.TODO_LIST.value,
        "open": artifact.get("open", 0),
        "done": artifact.get("done", 0),
        "total": len(todos),
        "truncated": len(todos) > len(rows),
        "todos": rows,
    }


def strip_artifacts(messages: list) -> list:
    """Drop ToolMessage artifacts before history persistence.

    Artifacts are live-turn side channels (full widget row sets) — storing
    them would bloat every history row in postgres. Content is untouched,
    so next-turn context is identical.
    """
    stripped = []
    for m in messages:
        if isinstance(m, ToolMessage) and getattr(m, "artifact", None) is not None:
            stripped.append(m.model_copy(update={"artifact": None}))
        else:
            stripped.append(m)
    return stripped


def format_ui_context(ui_state) -> str | None:
    """Render opaque client view state for the prompt. Never trusts enums —
    the client re-validates everything before applying."""
    if not isinstance(ui_state, dict) or not ui_state:
        return None
    parts = []
    for key in UI_STATE_KEYS:
        value = ui_state.get(key)
        if value is None or value == "":
            continue
        parts.append(f"{key}={value}")
    return ", ".join(parts) or None


def normalize_ask(args) -> dict | None:
    """Build an ask_user event from raw tool args. None when unusable."""
    if not isinstance(args, dict):
        return None
    question = str(args.get("question") or "").strip()
    if not question:
        return None
    raw_options = args.get("options") or []
    if not isinstance(raw_options, list):
        raw_options = []
    options = [str(o).strip() for o in raw_options if str(o).strip()][
        : config.MAX_ASK_OPTIONS
    ]
    return {
        "type": ChatEventType.ASK_USER.value,
        "question": question[: config.MAX_QUESTION_CHARS],
        "options": options,
    }


def text_delta(content) -> str:
    """Extract printable text from an LLM chunk's content.

    Handles plain strings and content blocks like [{"type": "text", ...}].
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if isinstance(block.get("text"), str):
                    parts.append(block["text"])
        return "".join(parts)
    return ""


def safe_text(value) -> str:
    """Coerce anything to SSE-safe text. ToolMessage content is str today,
    but a future tool returning structured content must not kill the
    stream inside json.dumps in router.py."""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return str(value)


class AnswerPrefixStripper:
    """Drops decorative result-marks from the very start of a streamed answer.

    The model likes to echo tool results as "✅ Updated Task #7: ...", and
    that leading ✅ reads as "task completed" even when the task is still
    open. Only the answer start is touched — echoed `• ✅/❌` result lines
    keep their completion marks, and ❌ is never stripped (it can't falsely
    imply completion). The prefix is buffered until the first real char
    because the mark and the text may arrive in separate chunks.
    """

    MARKS = "✅✔✓🎉👍"
    WS = " \t\n"

    def __init__(self) -> None:
        self._buf = ""
        self._done = False

    def feed(self, delta: str) -> str:
        if self._done:
            return delta
        self._buf += delta
        rest = self._buf.lstrip(self.WS + self.MARKS)
        if not rest:
            return ""
        self._done = True
        self._buf = ""
        return rest


async def run_turn(
    *,
    user_id: int,
    user_text: str,
    thread_id: int | str | None = None,
    provider: str | None = None,
    model: str | None = None,
    client=None,
    is_disconnected=None,
) -> AsyncGenerator[dict, None]:
    """Run one full reason/act loop for this turn, yielding event dicts.

    `client` is the optional ChatRequest.client (BaseModel or dict) with
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

    if isinstance(client, dict):
        raw_caps = client.get("capabilities") or []
        ui_state = client.get("ui_state")
        capabilities = normalize_capabilities(raw_caps)
    elif client is not None:
        raw_caps = getattr(client, "capabilities", None) or []
        if raw_caps and isinstance(list(raw_caps)[0], ClientCapability):
            capabilities = set(raw_caps)
        else:
            capabilities = normalize_capabilities(raw_caps)
        ui_state = getattr(client, "ui_state", None)
    else:
        capabilities = set()
        ui_state = None

    tools = build_tools_for_user(user_id, capabilities)
    agent = create_agent(model=llm, tools=tools)

    stored = await history.get_history(user_id, thread_id)
    user_message = HumanMessage(content=user_text)
    messages = [
        system_prompt(
            datetime.now().strftime("%Y-%m-%d"),
            ui_context=format_ui_context(ui_state),
            has_ui_tools=has_ui_action(capabilities),
        ),
        *stored,
        user_message,
    ]

    fresh: list = []
    seen_tool_ids: set = set()
    tool_names: dict[str, str] = {}  # tool_call id -> name (for tool_result)
    ask_event: dict | None = None
    ask_call_ids: set = set()
    ui_call_ids: set = set()
    ask_done = False
    prefix_stripper = AnswerPrefixStripper()

    def call_parts(tc) -> tuple:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", None)
        call_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
        return name, args, call_id

    def announce_tool_call(tc) -> dict | None:
        name, args, call_id = call_parts(tc)
        key = call_id or (name, str(args or ""))
        if key in seen_tool_ids:
            return None
        seen_tool_ids.add(key)
        if call_id and name:
            tool_names[call_id] = name
        return {"type": ChatEventType.TOOL_CALL.value, "tool": name, "args": args or {}}

    def check_ask(tc) -> dict | None:
        """Route one ask_user call to its event. The first call wins; later
        ones are ignored. A malformed call still yields a fallback question
        so the turn never ends silently.

        Every ask_user call id is recorded so its ToolMessage can be
        suppressed (the client already got the ask_user event) while still
        landing in history for next-turn context.
        """
        nonlocal ask_event
        name, args, call_id = call_parts(tc)
        if name != ASK_USER_TOOL:
            return None
        if call_id:
            tool_names[call_id] = ASK_USER_TOOL.value
            ask_call_ids.add(call_id)
        if ask_event is not None:
            return None
        event = normalize_ask(args)
        if event is None:
            logger.warning(
                "chat ask_user with unusable args (user_id=%s args=%r)",
                user_id,
                str(args)[:120],
            )
            event = {
                "type": ChatEventType.ASK_USER.value,
                "question": "Could you clarify which task you mean?",
                "options": [],
            }
        ask_event = event
        logger.info(
            "chat ask_user (user_id=%s question=%r)",
            user_id,
            event["question"][:80],
        )
        return event

    def check_ui_action(tc) -> dict | None:
        """Route one UI-only call to its event. Non-terminal: the loop keeps
        going so the model narrates after driving the view. The call id is
        recorded so its ack ToolMessage stays in history but never surfaces
        as tool_result noise."""
        name, args, call_id = call_parts(tc)
        if name not in UI_ACTION_TOOLS:
            return None
        key = call_id or (name, str(args or ""))
        if key in seen_tool_ids:
            return None
        seen_tool_ids.add(key)
        if call_id and name:
            tool_names[call_id] = name
            ui_call_ids.add(call_id)
        return {
            "type": ChatEventType.UI_ACTION.value,
            "action": UI_ACTION_TOOLS[name],
            "args": args or {},
        }

    def check_suggest(tc) -> dict | None:
        """Route one suggest_followups call to its event. Non-terminal and
        idempotent per call: cleaned chips (max 4, max 40 chars each) render
        as tappable follow-ups. Empty suggestions emit nothing. The call id
        is recorded so its ack ToolMessage stays in history but never
        surfaces as tool_result noise."""
        name, args, call_id = call_parts(tc)
        if name != SUGGEST_TOOL:
            return None
        key = call_id or (name, str(args or ""))
        if key in seen_tool_ids:
            return None
        seen_tool_ids.add(key)
        if call_id and name:
            tool_names[call_id] = name
            ui_call_ids.add(call_id)
        raw = (args or {}).get("suggestions") if isinstance(args, dict) else []
        suggestions = clean_suggestions(raw)
        if not suggestions:
            return None
        return {"type": ChatEventType.UI_SUGGESTIONS.value, "suggestions": suggestions}

    def route_tool_call(tc) -> dict | None:
        """Route one tool call to its SSE event. Ask calls yield ask_user,
        suggest calls yield ui_suggestions, UI calls yield ui_action,
        everything else a generic tool_call. None means duplicate."""
        tool_name = call_parts(tc)[0]
        if tool_name == ASK_USER_TOOL:
            return check_ask(tc)
        if tool_name == SUGGEST_TOOL:
            return check_suggest(tc)
        if tool_name in UI_ACTION_TOOLS:
            return check_ui_action(tc)
        return announce_tool_call(tc)

    try:
        # asyncio.timeout (not an elapsed check inside the loop): fires even
        # when the provider hangs without yielding any chunk.
        async with asyncio.timeout(config.TURN_TIMEOUT_SECONDS):
            async for mode, data in agent.astream(
                {"messages": messages},
                config={"recursion_limit": config.RECURSION_LIMIT},
                stream_mode=["messages", "updates"],
            ):
                if is_disconnected is not None and await is_disconnected():
                    logger.info("chat client disconnected, stopping turn (user_id=%s)", user_id)
                    break

                if mode == "messages":
                    chunk, meta_ignored = data
                    # The "messages" stream yields chunks from every node,
                    # including the tools node (ToolMessage carrying the full
                    # tool output as content). Only the model node speaks for
                    # the answer — tool output has its own tool_result event
                    # from the "updates" branch below. Without this guard the
                    # tool output is emitted as answer tokens and then
                    # restated by the model, i.e. every answer appears twice.
                    if isinstance(chunk, ToolMessage):
                        continue
                    delta = text_delta(getattr(chunk, "content", ""))
                    if delta:
                        delta = prefix_stripper.feed(delta)
                    if delta:
                        yield {"type": ChatEventType.TOKEN.value, "content": delta}
                    for tc in getattr(chunk, "tool_calls", None) or []:
                        event = route_tool_call(tc)
                        if event is not None:
                            yield event
                elif mode == "updates":
                    for node_ignored, update in (data or {}).items():
                        upd = update.get("messages") if isinstance(update, dict) else None
                        if not upd:
                            continue
                        msgs = upd if isinstance(upd, list) else [upd]
                        for m in msgs:
                            if isinstance(m, ToolMessage):
                                tool_call_id = getattr(m, "tool_call_id", "")
                                tool = tool_names.get(
                                    tool_call_id, getattr(m, "name", "")
                                )
                                if tool == ASK_USER_TOOL.value or tool_call_id in ask_call_ids:
                                    # Client already got the ask_user event;
                                    # keep the message in history, skip the noise.
                                    ask_done = True
                                elif tool in UI_ACTION_TOOLS or tool_call_id in ui_call_ids:
                                    # Client already got the ui_action event;
                                    # the ack stays in history, loop continues.
                                    pass
                                else:
                                    yield {
                                        "type": ChatEventType.TOOL_RESULT.value,
                                        "tool": tool,
                                        "output": safe_text(getattr(m, "content", "")),
                                    }
                                    if has_ui_action(capabilities):
                                        widget = build_ui_data_event(
                                            getattr(m, "artifact", None)
                                        )
                                        if widget is not None:
                                            yield widget
                            for tc in getattr(m, "tool_calls", None) or []:
                                event = route_tool_call(tc)
                                if event is not None:
                                    yield event
                        fresh.extend(msgs)
                    if ask_done:
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
