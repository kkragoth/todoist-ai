"""Pure event helpers for the chat ReAct loop (no I/O, no LLM).

Moved verbatim out of `service.py` so the turn loop reads as
build-messages → delegate chunks to `TurnState` → persist. Every
function here is a leaf: same inputs, same event dicts, no behavior
change. The SSE wire shape (`type` strings, keys) is frozen — see
`router.py`, which frames these dicts as `data: {...}` lines.
"""

import json

from langchain_core.messages import ToolMessage

from . import config
from .protocol import (
    MAX_SUGGESTION_CHARS as SUGGESTION_CHARS,
)
from .protocol import (
    MAX_SUGGESTIONS as SUGGESTION_LIMIT,
)
from .protocol import UI_DATA_MAX_ROWS, UI_STATE_KEYS, ChatEventType, WidgetKind

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
