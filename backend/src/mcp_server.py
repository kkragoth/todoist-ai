"""Authenticated Todo MCP tools (no presets, user-scoped only).

Auth comes from the HTTP Authorization header (Bearer JWT), read via
CurrentHeaders — the model never sees or supplies credentials.
Every tool resolves the current user from that header and only touches
that user's rows. No range_preset / target_date filters for now.
"""

from datetime import date

import jwt
from fastmcp import FastMCP
from fastmcp.dependencies import CurrentHeaders

from auth.models import User
from auth.utils.security import ALGORITHM, SECRET_KEY
from core.database import SessionLocal
from todo import events, models

mcp = FastMCP("Todoist AI MCP")


def _format_todos(todos: list) -> str:
    """Render todos as display-ready lines so the model echoes them verbatim."""
    lines = []
    for t in todos:
        mark = "✅" if t.completed else "❌"
        lines.append(f"• {mark} {t.task} (ID: {t.id}, {t.todo_date})")
    return "\n".join(lines)


def _get_current_user(headers: dict) -> User:
    """Resolve the JWT user from request headers. Raises ValueError if bad."""
    auth = (headers or {}).get("authorization", "")
    if not auth.startswith("Bearer "):
        raise ValueError("Missing Authorization header — log in first.")
    token = auth[len("Bearer ") :].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
    except Exception:
        raise ValueError("Invalid or expired token — log in again.")
    if not username:
        raise ValueError("Invalid token — log in again.")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
    finally:
        db.close()
    if not user:
        raise ValueError("User not found — register first.")
    return user


@mcp.tool()
def list_todos(
    completed: bool | None = None,
    include_archived: bool = False,
    headers: dict = CurrentHeaders(),
) -> str:
    """List todo tasks for the authenticated user.

    Args:
        completed: False = unfinished only, True = completed only, omit = all.
        include_archived: True also shows archived tasks. Default False (hidden).
    """
    try:
        user = _get_current_user(headers)
    except ValueError as e:
        return f"Error: {e}"
    db = SessionLocal()
    try:
        query = db.query(models.Todo).filter(models.Todo.user_id == user.id)
        if completed is not None:
            query = query.filter(models.Todo.completed == completed)
        if not include_archived:
            query = query.filter(models.Todo.archived == False)  # noqa: E712
        todos = query.order_by(models.Todo.id).all()
    finally:
        db.close()
    if not todos:
        return "No tasks found."
    return _format_todos(todos)


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
        user = _get_current_user(headers)
    except ValueError as e:
        return f"Error: {e}"
    target: date
    if todo_date:
        try:
            target = date.fromisoformat(todo_date)
        except ValueError:
            return f"Error: bad todo_date '{todo_date}' — use YYYY-MM-DD."
    else:
        target = date.today()
    db = SessionLocal()
    try:
        todo = models.Todo(task=task, todo_date=target, user_id=user.id)
        db.add(todo)
        db.commit()
        db.refresh(todo)
        events.broadcast(user.id, {"type": "todos-changed", "action": "created", "id": todo.id})
        return f"Successfully added todo #{todo.id}: '{todo.task}' for {todo.todo_date}"
    finally:
        db.close()


@mcp.tool()
def update_todo(
    todo_id: int,
    task: str | None = None,
    todo_date: str | None = None,
    completed: bool | None = None,
    headers: dict = CurrentHeaders(),
) -> str:
    """Modify an existing todo: rename, reschedule, or (un)complete it.

    Args:
        todo_id: The ID of the task to update.
        task: New task description (omit to keep).
        todo_date: New target date in YYYY-MM-DD format (omit to keep).
        completed: True = mark done, False = mark open (omit to keep).
    """
    try:
        user = _get_current_user(headers)
    except ValueError as e:
        return f"Error: {e}"
    new_date: date | None = None
    if todo_date:
        try:
            new_date = date.fromisoformat(todo_date)
        except ValueError:
            return f"Error: bad todo_date '{todo_date}' — use YYYY-MM-DD."
    db = SessionLocal()
    try:
        todo = (
            db.query(models.Todo)
            .filter(models.Todo.id == todo_id, models.Todo.user_id == user.id)
            .first()
        )
        if not todo:
            return "Error: Todo not found."
        if task is not None:
            todo.task = task
        if new_date is not None:
            todo.todo_date = new_date
        if completed is not None:
            todo.completed = completed
        db.commit()
        db.refresh(todo)
        mark = "✅" if todo.completed else "❌"
        events.broadcast(user.id, {"type": "todos-changed", "action": "updated", "id": todo.id})
        return f"Updated Task #{todo.id}: • {mark} {todo.task} (ID: {todo.id}, {todo.todo_date})"
    finally:
        db.close()


@mcp.tool()
def archive_todo(
    todo_id: int,
    headers: dict = CurrentHeaders(),
) -> str:
    """Archive a todo task so it is hidden from normal listings.

    Args:
        todo_id: The ID of the task to archive.
    """
    try:
        user = _get_current_user(headers)
    except ValueError as e:
        return f"Error: {e}"
    db = SessionLocal()
    try:
        todo = (
            db.query(models.Todo)
            .filter(models.Todo.id == todo_id, models.Todo.user_id == user.id)
            .first()
        )
        if not todo:
            return "Error: Todo not found."
        todo.archived = True
        db.commit()
        db.refresh(todo)
        events.broadcast(user.id, {"type": "todos-changed", "action": "archived", "id": todo.id})
        return f"Archived Task #{todo.id} '{todo.task}'. It will no longer show up in listings."
    finally:
        db.close()
