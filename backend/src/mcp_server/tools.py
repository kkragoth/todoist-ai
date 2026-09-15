"""Todo MCP tools (user-scoped only).

Thin wrappers over todo.service — the same functions the chat agent
calls in-process.
"""

from fastmcp.dependencies import CurrentHeaders

from mcp_server.server import mcp
from mcp_server.utils import resolve_user_from_headers
from todo import service as todo_service


@mcp.tool()
def list_todos(
    completed: bool | None = None,
    include_archived: bool = False,
    query: str | None = None,
    target_date: str | None = None,
    overdue: bool = False,
    headers: dict = CurrentHeaders(),
) -> str:
    """List todo tasks for the authenticated user.

    Args:
        completed: Leave out for normal listings (returns all with open/done
            counts). False = unfinished only, True = completed only.
        include_archived: True also shows archived tasks. Default False (hidden).
        query: Fuzzy name filter, e.g. 'milk' matches 'buy milk'.
            Combine with target_date when a task name plus a day is given.
        target_date: One day as YYYY-MM-DD (e.g. today). Omit for all dates.
        overdue: True = only past-due open tasks.
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.list_todos(
        user.id,
        completed=completed,
        include_archived=include_archived,
        query=query,
        target_date=target_date,
        overdue=overdue,
    )


@mcp.tool()
def list_todos_structured(
    completed: bool | None = None,
    include_archived: bool = False,
    query: str | None = None,
    target_date: str | None = None,
    overdue: bool = False,
    headers: dict = CurrentHeaders(),
) -> dict:
    """List todo tasks as typed JSON for programs (not chat text).

    Same filters as list_todos. Returns
    {"open": int, "done": int, "todos": [{id, task, completed, archived,
    user_id, todo_date, created_at}]}. Prefer this when rendering UI —
    use list_todos only when echoing sentences.

    Args:
        completed: Leave out for normal listings (returns all with open/done
            counts). False = unfinished only, True = completed only.
        include_archived: True also shows archived tasks. Default False (hidden).
        query: Fuzzy name filter, e.g. 'milk' matches 'buy milk'.
            Combine with target_date when a task name plus a day is given.
        target_date: One day as YYYY-MM-DD (e.g. today). Omit for all dates.
        overdue: True = only past-due open tasks.
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return {"error": str(e), "open": 0, "done": 0, "todos": []}
    try:
        todos = todo_service.query_todos(
            user.id,
            completed=completed,
            include_archived=include_archived,
            query=query,
            target_date=target_date,
            overdue=overdue,
        )
    except ValueError as e:
        return {"error": str(e), "open": 0, "done": 0, "todos": []}
    return todo_service.to_todo_list_out(todos).model_dump(mode="json")


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


@mcp.tool()
def delete_todo(
    todo_id: int,
    headers: dict = CurrentHeaders(),
) -> str:
    """Permanently delete a todo task (hard delete, cannot be undone).
    Prefer archive_todo (soft-hide) unless the caller explicitly wants
    the row gone.

    Args:
        todo_id: The ID of the task to delete.
    """
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return f"Error: {e}"
    return todo_service.delete_todo(user.id, todo_id=todo_id)
