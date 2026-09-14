"""Todo MCP tools (no presets, user-scoped only).

Thin wrappers over todo.service — the same functions the chat agent
calls in-process. No range_preset / target_date filters for now.
"""

from fastmcp.dependencies import CurrentHeaders

from mcp_server.server import mcp
from mcp_server.utils import resolve_user_from_headers
from todo import service as todo_service


@mcp.tool()
def list_todos(
    completed: bool | None = None,
    include_archived: bool = False,
    headers: dict = CurrentHeaders(),
) -> str:
    """List todo tasks for the authenticated user.

    Args:
        completed: False = unfinished only, True = completed only, leave out = all.
        include_archived: True also shows archived tasks. Default False (hidden).
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.list_todos(
        user.id, completed=completed, include_archived=include_archived
    )


@mcp.tool()
def add_todo(
    task: str,
    todo_date: str | None = None,
    headers: dict = CurrentHeaders(),
) -> str:
    """Add a new todo item for the authenticated user.

    Args:
        task: Task description.
        todo_date: Target date in YYYY-MM-DD format. Defaults to today if omitted.
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.add_todo(user.id, task=task, todo_date=todo_date)


@mcp.tool()
def update_todo(
    todo_id: int,
    task: str | None = None,
    todo_date: str | None = None,
    completed: bool | None = None,
    headers: dict = CurrentHeaders(),
) -> str:
    """Modify an existing todo: rename, reschedule, or (un)complete it.
    Use IDs from listed results, never guess one. Before acting you must
    have exactly one candidate: compare the user's words against listed
    task text and dates. With zero or 2+ matches, ask the user (naming
    task + date + ID options) instead of acting. All/both/every means one
    call per matching ID.

    Args:
        todo_id: The ID of the task to update.
        task: New task description (omit to keep).
        todo_date: New target date in YYYY-MM-DD format (omit to keep).
        completed: True = mark done, False = mark open (omit to keep).
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.update_todo(
        user.id,
        todo_id=todo_id,
        task=task,
        todo_date=todo_date,
        completed=completed,
    )


@mcp.tool()
def archive_todo(
    todo_id: int,
    headers: dict = CurrentHeaders(),
) -> str:
    """Archive a todo task so it is hidden from normal listings.
    Use IDs from listed results, never guess one. With zero or 2+ matches,
    ask the user instead of acting; all/both/every means one call per
    matching ID.

    Args:
        todo_id: The ID of the task to archive.
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.archive_todo(user.id, todo_id=todo_id)
