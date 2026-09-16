"""LangChain tools for the chat agent, bound to one user per turn.

Same operations as the MCP server, but called in-process via
todo.service — no SSE hop. Each tool reads `user_id` from the injected
`ToolRuntime[ChatContext]`, so the model never sees credentials.

Shapes live in `tool_args.py`; this module holds impl + wiring.
The list tool returns TEXT as content plus STRUCTURED `TodoListOut`
as artifact (`content_and_artifact`): the model sees text, the service
forwards the artifact as a `ui_data` widget. One DB query, two presenters.

Explicit nulls are dropped before calling the service: small models send
{"completed": None}, which would otherwise override server defaults.
Real False/0/"" are kept.
"""

import asyncio
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import StructuredTool
from pydantic import BaseModel

from todo import service as todo_service

from .events import clean_suggestions
from .protocol import (
    ClientCapability,
    DatePreset,
    Density,
    ListSort,
    TodoStatusFilter,
    TodosView,
    ToolName,
    normalize_capabilities,
)
from .tool_args import (
    AddTodoArgs,
    ArchiveTodoArgs,
    AskUserArgs,
    DeleteTodoArgs,
    HighlightTodosArgs,
    ListTodosArgs,
    SetTodosFilterArgs,
    SetTodosViewArgs,
    SuggestFollowupsArgs,
    UpdateTodoArgs,
)

# Re-exported for backward compat (import from `tool_args` in new code).
__all__ = [
    "ChatContext",
    "ListTodosArgs",
    "AddTodoArgs",
    "UpdateTodoArgs",
    "ArchiveTodoArgs",
    "DeleteTodoArgs",
    "AskUserArgs",
    "SetTodosFilterArgs",
    "SetTodosViewArgs",
    "HighlightTodosArgs",
    "SuggestFollowupsArgs",
    "drop_nones",
    "build_tools_for_user",
]


class ChatContext(BaseModel):
    """Per-turn runtime context injected into every tool call.

    Carries who owns the rows (`user_id`) and whether the client renders
    widgets (`ui_enabled`). Never model-visible: `ToolRuntime` strips it
    from the tool schema, so the model cannot see or forge it.
    """

    user_id: int
    ui_enabled: bool = False


def get_chat_context(runtime: ToolRuntime[ChatContext]) -> ChatContext:
    """Unwrap the runtime context as a ChatContext (dict-tolerant)."""
    context = runtime.context
    if isinstance(context, ChatContext):
        return context
    if isinstance(context, dict):
        return ChatContext(**context)
    raise TypeError(f"Unexpected chat context type: {type(context).__name__}")


def drop_nones(kwargs: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if value is not None}


def format_web_list_text(out: Any) -> str:
    """Compact list presenter for web clients.

    Same facts as the bullet presenter (counts, names, dates, IDs),
    framed as data plus an inline directive so the model narrates
    instead of echoing rows the widget already shows.
    """
    lines = [
        f"{out.open} open, {out.done} done. These rows render as widgets in the UI "
        "— reply with one friendly sentence plus key IDs, do NOT re-list rows:"
    ]
    for item in out.todos:
        state = "done" if item.completed else "open"
        lines.append(f"[{item.id}] {item.task} | {state} | {item.todo_date}")
    return "\n".join(lines)


# --- Tool implementations (one user per turn via runtime context) ---


async def list_todos_tool(
    completed: bool | None = None,
    include_archived: bool = False,
    query: str | None = None,
    target_date: str | None = None,
    overdue: bool = False,
    *,
    runtime: ToolRuntime[ChatContext],
) -> tuple[str, dict | None]:
    # Single-query pipeline: one DB hit, text content for the model plus
    # a JSON-safe structured artifact the service forwards as `ui_data`.
    # Empty/error results carry no artifact, so no widget is rendered.
    context = get_chat_context(runtime)
    try:
        rows = await asyncio.to_thread(
            todo_service.query_todos,
            context.user_id,
            include_archived=include_archived,
            overdue=overdue,
            **drop_nones(
                {"completed": completed, "query": query, "target_date": target_date}
            ),
        )
    except ValueError as exc:
        return f"Error: {exc}", None
    if not rows:
        return "No tasks found.", None
    out = todo_service.to_todo_list_out(rows)
    if context.ui_enabled:
        # Web clients render rows as widgets; CLI echoes bullets verbatim.
        return format_web_list_text(out), out.model_dump(mode="json")
    return (
        todo_service.format_todos_from_out(out),
        out.model_dump(mode="json"),
    )


async def add_todo_tool(
    task: str,
    todo_date: str | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    kwargs = drop_nones({"todo_date": todo_date})
    return await asyncio.to_thread(
        todo_service.add_todo, get_chat_context(runtime).user_id, task=task, **kwargs
    )


async def update_todo_tool(
    todo_id: int,
    task: str | None = None,
    todo_date: str | None = None,
    completed: bool | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    kwargs = drop_nones(
        {"task": task, "todo_date": todo_date, "completed": completed}
    )
    return await asyncio.to_thread(
        todo_service.update_todo,
        get_chat_context(runtime).user_id,
        todo_id=todo_id,
        **kwargs,
    )


async def archive_todo_tool(
    todo_id: int, *, runtime: ToolRuntime[ChatContext]
) -> str:
    return await asyncio.to_thread(
        todo_service.archive_todo, get_chat_context(runtime).user_id, todo_id=todo_id
    )


async def delete_todo_tool(
    todo_id: int, *, runtime: ToolRuntime[ChatContext]
) -> str:
    return await asyncio.to_thread(
        todo_service.delete_todo, get_chat_context(runtime).user_id, todo_id=todo_id
    )


async def ask_user_tool(
    question: str,
    options: list[str] | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """Terminal clarification hook. The service emits `ask_user` and ends
    the turn — the return string only lands in history for next-turn context."""
    _ = runtime
    opts = options or []
    if opts:
        return f"Asked user: {question} Options: {' | '.join(opts)}"
    return f"Asked user: {question}"


async def set_todos_filter_tool(
    status: TodoStatusFilter | None = None,
    date_preset: DatePreset | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    archived: bool | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """UI-only passthrough: no DB work. The service emits `ui_action`
    and the web client applies the filter locally."""
    _ = runtime
    applied = drop_nones(
        {
            "status": status,
            "date_preset": date_preset,
            "start_date": start_date,
            "end_date": end_date,
            "archived": archived,
        }
    )
    return f"Filter change requested (client applies it): {applied or 'no-op'}"


async def set_todos_view_tool(
    view: TodosView | None = None,
    sort: ListSort | None = None,
    density: Density | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """UI-only passthrough for list/grouped/by-day + sort + density."""
    _ = runtime
    applied = drop_nones({"view": view, "sort": sort, "density": density})
    return f"View change requested (client applies it): {applied or 'no-op'}"


async def highlight_todos_tool(
    ids: list[int] | None = None, *, runtime: ToolRuntime[ChatContext]
) -> str:
    """UI-only passthrough: the client flash-highlights these IDs."""
    _ = runtime
    return f"Highlight requested (client applies it): {ids or []}"


async def suggest_followups_tool(
    suggestions: list[str] | None = None, *, runtime: ToolRuntime[ChatContext]
) -> str:
    """UI-only passthrough: the service emits `ui_suggestions` and the
    client renders them as tappable chips."""
    _ = runtime
    clean = clean_suggestions(suggestions)
    return f"Suggested follow-ups (client renders them): {clean or 'none'}"


# --- Tool wiring ---

LIST_DESCRIPTION_BASE = (
    "List todo tasks for the authenticated user. "
    "Normal 'my todos/tasks today': pass target_date=today and leave "
    "completed UNSET so open+done come back with counts. "
    "completed=False only for open/remaining/left/unfinished/overdue, "
    "True only for done/finished/completed. "
    "query: fuzzy name filter, combine with target_date when the user "
    "names a task plus a day. "
)
# Web rows render as widgets: narrate with counts + key IDs, never
# re-list. CLI must echo every bullet, it has no widgets.
LIST_DESCRIPTION_WEB = LIST_DESCRIPTION_BASE + (
    "Result rows render as widgets in the UI: answer with one friendly "
    "sentence using the counts plus key IDs, never re-list rows. "
    "A wrong (unfiltered) listing means re-calling with target_date. "
    "include_archived: True also shows archived tasks."
)
LIST_DESCRIPTION_CLI = LIST_DESCRIPTION_BASE + (
    "Echo EVERY returned bullet to the user, never hide rows; "
    "a wrong (unfiltered) listing means re-calling with target_date. "
    "include_archived: True also shows archived tasks."
)

LIST_TODOS_WEB_TOOL = StructuredTool.from_function(
    coroutine=list_todos_tool,
    name=ToolName.LIST_TODOS.value,
    description=LIST_DESCRIPTION_WEB,
    args_schema=ListTodosArgs,
    response_format="content_and_artifact",
)

LIST_TODOS_CLI_TOOL = StructuredTool.from_function(
    coroutine=list_todos_tool,
    name=ToolName.LIST_TODOS.value,
    description=LIST_DESCRIPTION_CLI,
    args_schema=ListTodosArgs,
    response_format="content_and_artifact",
)

ADD_TODO_TOOL = StructuredTool.from_function(
    coroutine=add_todo_tool,
    name=ToolName.ADD_TODO.value,
    description=(
        "Add a new todo item for the authenticated user. "
        "task: description. todo_date: YYYY-MM-DD, defaults to today."
    ),
    args_schema=AddTodoArgs,
)

UPDATE_TODO_TOOL = StructuredTool.from_function(
    coroutine=update_todo_tool,
    name=ToolName.UPDATE_TODO.value,
    description=(
        "Modify an existing todo: rename, reschedule, or (un)complete it. "
        "Use IDs from listed results, never guess one. "
        "A date word narrows candidates ('X today' = only rows dated today); "
        "with zero or 2+ matches, call ask_user instead of acting."
    ),
    args_schema=UpdateTodoArgs,
)

ARCHIVE_TODO_TOOL = StructuredTool.from_function(
    coroutine=archive_todo_tool,
    name=ToolName.ARCHIVE_TODO.value,
    description=(
        "Archive a todo task so it is hidden from normal listings. "
        "Prefer this over delete_todo unless the user says delete/remove permanently."
    ),
    args_schema=ArchiveTodoArgs,
)

DELETE_TODO_TOOL = StructuredTool.from_function(
    coroutine=delete_todo_tool,
    name=ToolName.DELETE_TODO.value,
    description=(
        "Permanently delete a todo task (hard delete, cannot be undone). "
        "Only use when the user explicitly says delete/remove permanently; "
        "otherwise prefer archive_todo."
    ),
    args_schema=DeleteTodoArgs,
)

ASK_USER_TOOL = StructuredTool.from_function(
    coroutine=ask_user_tool,
    name=ToolName.ASK_USER.value,
    description=(
        "Ask the user a clarifying question INSTEAD of acting. Use when "
        "zero or 2+ tasks match, or a pronoun has no single clear target. "
        "Terminal: call it alone, with no other tools in that turn."
    ),
    args_schema=AskUserArgs,
)

SET_TODOS_FILTER_TOOL = StructuredTool.from_function(
    coroutine=set_todos_filter_tool,
    name=ToolName.SET_TODOS_FILTER.value,
    description=(
        "Change the web list FILTER (client-local, no DB write). "
        "Call when the user asks to show/filter the list "
        "(e.g. 'show today', 'only overdue', 'hide archived'). "
        "Non-terminal: call it, then narrate the result. "
        "The client applies it; never claim rows changed without it."
    ),
    args_schema=SetTodosFilterArgs,
)

SET_TODOS_VIEW_TOOL = StructuredTool.from_function(
    coroutine=set_todos_view_tool,
    name=ToolName.SET_TODOS_VIEW.value,
    description=(
        "Change the web list VIEW/SORT/DENSITY (client-local). "
        "Call for 'group by day', 'flat list', 'compact', "
        "'newest first' style requests. Non-terminal: then narrate."
    ),
    args_schema=SetTodosViewArgs,
)

HIGHLIGHT_TODOS_TOOL = StructuredTool.from_function(
    coroutine=highlight_todos_tool,
    name=ToolName.HIGHLIGHT_TODOS.value,
    description=(
        "Flash-highlight todo IDs in the web list so the user "
        "sees them (client-local). Call with IDs from listed "
        "results after answering 'which ones' style questions. "
        "Non-terminal: then narrate."
    ),
    args_schema=HighlightTodosArgs,
)

SUGGEST_FOLLOWUPS_TOOL = StructuredTool.from_function(
    coroutine=suggest_followups_tool,
    name=ToolName.SUGGEST_FOLLOWUPS.value,
    description=(
        "Offer 2-4 tappable follow-up chips in the web UI "
        "(client-local). Call once per turn after answering, "
        "with short actions you can actually do "
        "(e.g. 'Show only open', 'Group by day', 'Archive done "
        "tasks'). Non-terminal: call it, then finish narrating."
    ),
    args_schema=SuggestFollowupsArgs,
)


def build_tools_for_user(
    capabilities: tuple[str, ...] | list[str] | set[str] | set[ClientCapability] = (),
) -> list[StructuredTool]:
    """Collect the chat tools for these capabilities.

    Data tools are always present. UI-only tools (no DB work — the real
    effect happens client-side when it applies the `ui_action` event) are
    only added when ui_action is in `capabilities`, so CLI clients
    never see them. Per-turn user binding travels via `ChatContext`,
    not closures.
    """
    normalized = normalize_capabilities(capabilities)
    ui_enabled = ClientCapability.UI_ACTION in normalized

    tools = [
        LIST_TODOS_WEB_TOOL if ui_enabled else LIST_TODOS_CLI_TOOL,
        ADD_TODO_TOOL,
        UPDATE_TODO_TOOL,
        ARCHIVE_TODO_TOOL,
        DELETE_TODO_TOOL,
        ASK_USER_TOOL,
    ]

    if ui_enabled:
        tools.extend(
            [
                SET_TODOS_FILTER_TOOL,
                SET_TODOS_VIEW_TOOL,
                HIGHLIGHT_TODOS_TOOL,
                SUGGEST_FOLLOWUPS_TOOL,
            ]
        )

    return tools


# Backward-compat aliases for the previous private names.
_context = get_chat_context
_LIST_DESCRIPTION_BASE = LIST_DESCRIPTION_BASE
_LIST_DESCRIPTION_WEB = LIST_DESCRIPTION_WEB
_LIST_DESCRIPTION_CLI = LIST_DESCRIPTION_CLI
_list_todos_web = LIST_TODOS_WEB_TOOL
_list_todos_cli = LIST_TODOS_CLI_TOOL
_add_todo = ADD_TODO_TOOL
_update_todo = UPDATE_TODO_TOOL
_archive_todo = ARCHIVE_TODO_TOOL
_delete_todo = DELETE_TODO_TOOL
_ask_user = ASK_USER_TOOL
_set_todos_filter = SET_TODOS_FILTER_TOOL
_set_todos_view = SET_TODOS_VIEW_TOOL
_highlight_todos = HIGHLIGHT_TODOS_TOOL
_suggest_followups = SUGGEST_FOLLOWUPS_TOOL
