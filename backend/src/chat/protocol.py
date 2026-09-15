"""Single source of truth for the chat wire protocol.

All SSE `type` values, `widget` kinds, tool names, `ui_action` names,
client kinds/capabilities, and UI filter/view enums live here as `StrEnum`
so both the service (routing/dedup) and the tools (LLM arg schemas) share
one definition. Frontend mirrors these in `frontend/src/lib/chat.ts` —
keep the string VALUES in sync; the names may differ.

Why enums: raw `"ui_action"` / `"todo_list"` / `"set_filter"` literals
were scattered across service.py, tools.py, schemas.py and the frontend
switch statements, so a typo silently dropped events. `StrEnum` keeps
JSON output identical (`json.dumps(Member)` → `"value"`) while letting
`in` checks and dict keys type-check.
"""

from enum import StrEnum


class ClientKind(StrEnum):
    CLI = "cli"
    WEB = "web"


class ClientCapability(StrEnum):
    UI_ACTION = "ui_action"


class ChatEventType(StrEnum):
    TOKEN = "token"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    UI_DATA = "ui_data"
    ASK_USER = "ask_user"
    UI_SUGGESTIONS = "ui_suggestions"
    UI_ACTION = "ui_action"
    DONE = "done"
    ERROR = "error"


class WidgetKind(StrEnum):
    TODO_LIST = "todo_list"


class ToolName(StrEnum):
    LIST_TODOS = "list_todos"
    ADD_TODO = "add_todo"
    UPDATE_TODO = "update_todo"
    ARCHIVE_TODO = "archive_todo"
    DELETE_TODO = "delete_todo"
    ASK_USER = "ask_user"
    SET_TODOS_FILTER = "set_todos_filter"
    SET_TODOS_VIEW = "set_todos_view"
    HIGHLIGHT_TODOS = "highlight_todos"
    SUGGEST_FOLLOWUPS = "suggest_followups"


class UiActionName(StrEnum):
    SET_FILTER = "set_filter"
    SET_VIEW = "set_view"
    HIGHLIGHT = "highlight"


class TodoStatusFilter(StrEnum):
    ALL = "all"
    OPEN = "open"
    DONE = "done"


class DatePreset(StrEnum):
    ALL = "all"
    OVERDUE = "overdue"
    TODAY = "today"
    TOMORROW = "tomorrow"
    WEEK = "week"
    LATER = "later"
    CUSTOM = "custom"


class TodosView(StrEnum):
    LIST = "list"
    GROUPED = "grouped"
    GROUPED_BY_DAY = "grouped_by_day"


class ListSort(StrEnum):
    ASC = "asc"
    DESC = "desc"


class Density(StrEnum):
    COMFORTABLE = "comfortable"
    COMPACT = "compact"


# UI-only tools (no DB work) -> client-local `ui_action` events.
TOOL_TO_UI_ACTION: dict[ToolName, UiActionName] = {
    ToolName.SET_TODOS_FILTER: UiActionName.SET_FILTER,
    ToolName.SET_TODOS_VIEW: UiActionName.SET_VIEW,
    ToolName.HIGHLIGHT_TODOS: UiActionName.HIGHLIGHT,
}

# Shared caps: backend clean_suggestions + frontend chat.ts agree.
# Single source here; config.py re-exports for compat.
MAX_SUGGESTIONS = 4
MAX_SUGGESTION_CHARS = 40

# Max widget rows per `ui_data` event. Counts cover the full set.
UI_DATA_MAX_ROWS = 30

# Max todo ids per highlight request (tool schema + frontend slice).
HIGHLIGHT_MAX_IDS = 20

# Opaque client view keys echoed into the prompt (never trusted raw).
UI_STATE_KEYS: tuple[str, ...] = (
    "status",
    "date_preset",
    "start_date",
    "end_date",
    "archived",
    "view",
    "sort",
    "density",
)


def normalize_capabilities(raw: object) -> set[ClientCapability]:
    """Coerce arbitrary capability input to known members only.

    Unknown strings are dropped so a misspelled capability can never
    enable tools or events.
    """
    items = raw if isinstance(raw, (list, tuple, set)) else []
    out: set[ClientCapability] = set()
    for item in items:
        try:
            out.add(ClientCapability(item))
        except ValueError:
            continue
    return out


def has_ui_action(capabilities: set[ClientCapability]) -> bool:
    return ClientCapability.UI_ACTION in capabilities
