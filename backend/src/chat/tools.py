"""LangChain tools for the chat agent, bound to one user per turn.

Same operations as the MCP server, but called in-process via
todo.service — no SSE hop. Each tool reads `user_id` from the injected
`ToolRuntime[ChatContext]`, so the model never sees credentials and
there is no cross-user leak. Tools are module-level functions; the
service passes the context per turn via `create_agent(context_schema=)`
+ `agent.astream(context=)`.

The list tool returns the TEXT presenter (`format_todos_from_out`) as
content plus the STRUCTUED result (`TodoListOut`, JSON-safe) as artifact
(`response_format="content_and_artifact"`): the model only sees text,
while the service forwards the artifact to web clients as a `ui_data`
widget event. One DB query, two presenters. Programs that render UI
should use `query_todos` + `TodoListOut` (see `todo/service.py` and the
MCP `list_todos_structured` tool) instead of parsing chat text.

Explicit nulls are dropped before calling the service: small models send
{"completed": None}, which would otherwise override server defaults.
Real False/0/"" are kept.
"""

import asyncio
from typing import Optional

from langchain.tools import ToolRuntime
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from todo import service as todo_service

from . import config
from .events import clean_suggestions
from .protocol import (
    HIGHLIGHT_MAX_IDS,
    MAX_SUGGESTION_CHARS,
    MAX_SUGGESTIONS,
    ClientCapability,
    DatePreset,
    Density,
    ListSort,
    TodosView,
    TodoStatusFilter,
    ToolName,
    normalize_capabilities,
)


class ChatContext(BaseModel):
    """Per-turn runtime context injected into every tool call.

    Carries who owns the rows (`user_id`) and whether the client renders
    widgets (`ui_enabled`). Never model-visible: `ToolRuntime` strips it
    from the tool schema, so the model cannot see or forge it.
    """

    user_id: int
    ui_enabled: bool = False


def _context(runtime: ToolRuntime[ChatContext]) -> ChatContext:
    """Unwrap the runtime context as a ChatContext (dict-tolerant)."""
    ctx = runtime.context
    if isinstance(ctx, ChatContext):
        return ctx
    if isinstance(ctx, dict):
        return ChatContext(**ctx)
    raise TypeError(f"Unexpected chat context type: {type(ctx).__name__}")


class ListTodosArgs(BaseModel):
    completed: Optional[bool] = Field(
        default=None,
        description="Leave UNSET for normal 'my todos/tasks today' questions so both open and done return with counts. Only False for open/remaining/left/unfinished/overdue, True for done/finished/completed.",
    )
    include_archived: bool = Field(
        default=False, description="True also shows archived tasks. Default False (hidden)."
    )
    query: Optional[str] = Field(
        default=None,
        description="Fuzzy name filter, e.g. 'milk' matches 'buy milk'. Pass it when the user names a task; combine with target_date when they also say a day ('clean up my room today').",
    )
    target_date: Optional[str] = Field(
        default=None,
        description="YYYY-MM-DD for one day. Pass today for 'today' questions, or the named day. Omit for all dates. Never answer a 'today' question from an unfiltered listing — re-call with target_date instead of hiding rows.",
    )
    overdue: bool = Field(
        default=False, description="True = only past-due open tasks."
    )


class AddTodoArgs(BaseModel):
    task: str = Field(description="Task description.")
    todo_date: Optional[str] = Field(
        default=None, description="Target date in YYYY-MM-DD format. Defaults to today if omitted."
    )


class UpdateTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to update.")
    task: Optional[str] = Field(default=None, description="New task description (omit to keep).")
    todo_date: Optional[str] = Field(
        default=None, description="New target date in YYYY-MM-DD format (omit to keep)."
    )
    completed: Optional[bool] = Field(
        default=None, description="True = mark done, False = mark open (omit to keep)."
    )


class ArchiveTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to archive.")


class DeleteTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to permanently delete.")


class AskUserArgs(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=config.MAX_QUESTION_CHARS,
        description="Short clarification question for the user. Ask alone, no other tools in the same turn.",
    )
    options: list[str] = Field(
        default_factory=list,
        max_length=config.MAX_ASK_OPTIONS,
        description="Up to 4 short options, each naming task + date + ID so the reply resolves to one candidate.",
    )


class SetTodosFilterArgs(BaseModel):
    status: Optional[TodoStatusFilter] = Field(
        default=None, description='One of: all | open | done. Omit to keep the current filter.'
    )
    date_preset: Optional[DatePreset] = Field(
        default=None,
        description="One of: all | overdue | today | tomorrow | week | later | custom. Omit to keep.",
    )
    start_date: Optional[str] = Field(
        default=None, description="YYYY-MM-DD, only meaningful with date_preset=custom."
    )
    end_date: Optional[str] = Field(
        default=None, description="YYYY-MM-DD, only meaningful with date_preset=custom."
    )
    archived: Optional[bool] = Field(default=None, description="True shows archived tasks. Omit to keep.")


class SetTodosViewArgs(BaseModel):
    view: Optional[TodosView] = Field(
        default=None, description="One of: list | grouped | grouped_by_day. Omit to keep."
    )
    sort: Optional[ListSort] = Field(default=None, description="One of: asc | desc. Omit to keep.")
    density: Optional[Density] = Field(
        default=None, description="One of: comfortable | compact. Omit to keep."
    )


class HighlightTodosArgs(BaseModel):
    ids: list[int] = Field(
        min_length=1,
        max_length=HIGHLIGHT_MAX_IDS,
        description="Todo IDs to flash-highlight in the list so the user sees them.",
    )


class SuggestFollowupsArgs(BaseModel):
    suggestions: list[str] = Field(
        min_length=1,
        max_length=MAX_SUGGESTIONS,
        description=(
            f"2-{MAX_SUGGESTIONS} short follow-up actions the user likely wants next, "
            f"each under {MAX_SUGGESTION_CHARS} chars."
        ),
    )


def drop_nones(kwargs: dict) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None}


def format_web_list_text(out) -> str:
    """Compact list presenter for web clients. Same facts as the bullet
    presenter (counts, names, dates, IDs — everything ask_user options and
    disambiguation need), but framed as data plus an inline directive, so
    the model narrates instead of echoing rows the widget already shows."""
    lines = [
        f"{out.open} open, {out.done} done. These rows render as widgets in the UI "
        "— reply with one friendly sentence plus key IDs, do NOT re-list rows:"
    ]
    for t in out.todos:
        state = "done" if t.completed else "open"
        lines.append(f"[{t.id}] {t.task} | {state} | {t.todo_date}")
    return "\n".join(lines)


async def list_todos_tool(
    completed: Optional[bool] = None,
    include_archived: bool = False,
    query: Optional[str] = None,
    target_date: Optional[str] = None,
    overdue: bool = False,
    *,
    runtime: ToolRuntime[ChatContext],
) -> tuple[str, dict | None]:
    # Single-query pipeline: one DB hit, text content for the model plus
    # a JSON-safe structured artifact the service forwards as `ui_data`.
    # Empty/error results carry no artifact, so no widget is rendered.
    ctx = _context(runtime)
    try:
        rows = await asyncio.to_thread(
            todo_service.query_todos,
            ctx.user_id,
            include_archived=include_archived,
            overdue=overdue,
            **drop_nones(
                {"completed": completed, "query": query, "target_date": target_date}
            ),
        )
    except ValueError as e:
        return f"Error: {e}", None
    if not rows:
        return "No tasks found.", None
    out = todo_service.to_todo_list_out(rows)
    if ctx.ui_enabled:
        # Web clients render rows as widgets: compact data text with an
        # inline do-not-relist directive (far harder to ignore than a
        # system-prompt tail). CLI keeps the echo-verbatim bullets.
        return format_web_list_text(out), out.model_dump(mode="json")
    return (
        todo_service.format_todos_from_out(out),
        out.model_dump(mode="json"),
    )


async def add_todo_tool(
    task: str,
    todo_date: Optional[str] = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    kwargs = drop_nones({"todo_date": todo_date})
    return await asyncio.to_thread(
        todo_service.add_todo, _context(runtime).user_id, task=task, **kwargs
    )


async def update_todo_tool(
    todo_id: int,
    task: Optional[str] = None,
    todo_date: Optional[str] = None,
    completed: Optional[bool] = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    kwargs = drop_nones(
        {"task": task, "todo_date": todo_date, "completed": completed}
    )
    return await asyncio.to_thread(
        todo_service.update_todo,
        _context(runtime).user_id,
        todo_id=todo_id,
        **kwargs,
    )


async def archive_todo_tool(
    todo_id: int, *, runtime: ToolRuntime[ChatContext]
) -> str:
    return await asyncio.to_thread(
        todo_service.archive_todo, _context(runtime).user_id, todo_id=todo_id
    )


async def delete_todo_tool(
    todo_id: int, *, runtime: ToolRuntime[ChatContext]
) -> str:
    return await asyncio.to_thread(
        todo_service.delete_todo, _context(runtime).user_id, todo_id=todo_id
    )


async def ask_user_tool(
    question: str,
    options: list[str] | None = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """Terminal clarification hook. The service intercepts this call,
    emits an `ask_user` SSE event, and ends the turn — the returned
    string only lands in history so the next turn remembers what was asked."""
    opts = options or []
    if opts:
        return f"Asked user: {question} Options: {' | '.join(opts)}"
    return f"Asked user: {question}"


async def set_todos_filter_tool(
    status: Optional[TodoStatusFilter] = None,
    date_preset: Optional[DatePreset] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    archived: Optional[bool] = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """UI-only passthrough: no DB work. The service emits a `ui_action`
    event and the web client applies the filter locally. The string
    only lands in history so the next turn remembers the view change."""
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
    view: Optional[TodosView] = None,
    sort: Optional[ListSort] = None,
    density: Optional[Density] = None,
    *,
    runtime: ToolRuntime[ChatContext],
) -> str:
    """UI-only passthrough for list/grouped/by-day + sort + density."""
    applied = drop_nones({"view": view, "sort": sort, "density": density})
    return f"View change requested (client applies it): {applied or 'no-op'}"


async def highlight_todos_tool(
    ids: list[int] | None = None, *, runtime: ToolRuntime[ChatContext]
) -> str:
    """UI-only passthrough: the client flash-highlights these IDs."""
    return f"Highlight requested (client applies it): {ids or []}"


async def suggest_followups_tool(
    suggestions: list[str] | None = None, *, runtime: ToolRuntime[ChatContext]
) -> str:
    """UI-only passthrough: the service emits a `ui_suggestions` event
    and the client renders them as tappable chips. The strings only
    land in history so the next turn remembers what was offered."""
    clean = clean_suggestions(suggestions)
    return f"Suggested follow-ups (client renders them): {clean or 'none'}"


_LIST_DESCRIPTION_BASE = (
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
_LIST_DESCRIPTION_WEB = _LIST_DESCRIPTION_BASE + (
    "Result rows render as widgets in the UI: answer with one friendly "
    "sentence using the counts plus key IDs, never re-list rows. "
    "A wrong (unfiltered) listing means re-calling with target_date. "
    "include_archived: True also shows archived tasks."
)
_LIST_DESCRIPTION_CLI = _LIST_DESCRIPTION_BASE + (
    "Echo EVERY returned bullet to the user, never hide rows; "
    "a wrong (unfiltered) listing means re-calling with target_date. "
    "include_archived: True also shows archived tasks."
)

_list_todos_web = StructuredTool.from_function(
    coroutine=list_todos_tool,
    name=ToolName.LIST_TODOS.value,
    description=_LIST_DESCRIPTION_WEB,
    args_schema=ListTodosArgs,
    response_format="content_and_artifact",
)

_list_todos_cli = StructuredTool.from_function(
    coroutine=list_todos_tool,
    name=ToolName.LIST_TODOS.value,
    description=_LIST_DESCRIPTION_CLI,
    args_schema=ListTodosArgs,
    response_format="content_and_artifact",
)

_add_todo = StructuredTool.from_function(
    coroutine=add_todo_tool,
    name=ToolName.ADD_TODO.value,
    description=(
        "Add a new todo item for the authenticated user. "
        "task: description. todo_date: YYYY-MM-DD, defaults to today."
    ),
    args_schema=AddTodoArgs,
)

_update_todo = StructuredTool.from_function(
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

_archive_todo = StructuredTool.from_function(
    coroutine=archive_todo_tool,
    name=ToolName.ARCHIVE_TODO.value,
    description=(
        "Archive a todo task so it is hidden from normal listings. "
        "Prefer this over delete_todo unless the user says delete/remove permanently."
    ),
    args_schema=ArchiveTodoArgs,
)

_delete_todo = StructuredTool.from_function(
    coroutine=delete_todo_tool,
    name=ToolName.DELETE_TODO.value,
    description=(
        "Permanently delete a todo task (hard delete, cannot be undone). "
        "Only use when the user explicitly says delete/remove permanently; "
        "otherwise prefer archive_todo."
    ),
    args_schema=DeleteTodoArgs,
)

_ask_user = StructuredTool.from_function(
    coroutine=ask_user_tool,
    name=ToolName.ASK_USER.value,
    description=(
        "Ask the user a clarifying question INSTEAD of acting. Use when "
        "zero or 2+ tasks match, or a pronoun has no single clear target. "
        "Terminal: call it alone, with no other tools in that turn."
    ),
    args_schema=AskUserArgs,
)

_set_todos_filter = StructuredTool.from_function(
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

_set_todos_view = StructuredTool.from_function(
    coroutine=set_todos_view_tool,
    name=ToolName.SET_TODOS_VIEW.value,
    description=(
        "Change the web list VIEW/SORT/DENSITY (client-local). "
        "Call for 'group by day', 'flat list', 'compact', "
        "'newest first' style requests. Non-terminal: then narrate."
    ),
    args_schema=SetTodosViewArgs,
)

_highlight_todos = StructuredTool.from_function(
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

_suggest_followups = StructuredTool.from_function(
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
    capabilities: tuple[str, ...] | list[str] | set[str] = (),
) -> list[StructuredTool]:
    """Collect the chat tools for these capabilities.

    Data tools are always present. UI-only tools (no DB work — the real
    effect happens client-side when it applies the `ui_action` event) are
    only added when `"ui_action"` is in `capabilities`, so CLI clients
    never see them. Per-turn user binding travels via `ChatContext`,
    not closures.
    """
    caps = normalize_capabilities(capabilities)
    ui_enabled = ClientCapability.UI_ACTION in caps

    tools = [
        _list_todos_web if ui_enabled else _list_todos_cli,
        _add_todo,
        _update_todo,
        _archive_todo,
        _delete_todo,
        _ask_user,
    ]

    if ui_enabled:
        tools.extend(
            [
                _set_todos_filter,
                _set_todos_view,
                _highlight_todos,
                _suggest_followups,
            ]
        )

    return tools
