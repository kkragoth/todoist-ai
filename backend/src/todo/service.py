"""Pure user-scoped todo operations (no MCP, no FastAPI, no headers).

This module is the single source of truth for todo CRUD. Both the MCP
tools (mcp_server/tools.py) and the chat agent (chat/tools.py) call these
functions in-process, so the backend never SSE-hops to itself.

Each function opens a short-lived DB session, touches only rows owned
by `user_id`, broadcasts a `todos-changed` SSE event, and returns a
display-ready string the model can echo verbatim.
"""

from datetime import date

from core.database import SessionLocal
from todo import events, models


def format_todos(todos: list) -> str:
    """Render todos as display-ready lines so the model echoes them verbatim."""
    lines = []
    for t in todos:
        mark = "✅" if t.completed else "❌"
        lines.append(f"• {mark} {t.task} (ID: {t.id}, {t.todo_date})")
    return "\n".join(lines)


def list_todos(
    user_id: int,
    completed: bool | None = None,
    include_archived: bool = False,
) -> str:
    db = SessionLocal()
    try:
        query = db.query(models.Todo).filter(models.Todo.user_id == user_id)
        if completed is not None:
            query = query.filter(models.Todo.completed == completed)
        if not include_archived:
            query = query.filter(models.Todo.archived == False)  # noqa: E712
        todos = query.order_by(models.Todo.id).all()
    finally:
        db.close()
    if not todos:
        return "No tasks found."
    return format_todos(todos)


def add_todo(
    user_id: int,
    task: str,
    todo_date: str | None = None,
) -> str:
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
        todo = models.Todo(task=task, todo_date=target, user_id=user_id)
        db.add(todo)
        db.commit()
        db.refresh(todo)
        events.broadcast(
            user_id, {"type": "todos-changed", "action": "created", "id": todo.id}
        )
        return f"Successfully added todo #{todo.id}: '{todo.task}' for {todo.todo_date}"
    finally:
        db.close()


def update_todo(
    user_id: int,
    todo_id: int,
    task: str | None = None,
    todo_date: str | None = None,
    completed: bool | None = None,
) -> str:
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
            .filter(models.Todo.id == todo_id, models.Todo.user_id == user_id)
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
        events.broadcast(
            user_id, {"type": "todos-changed", "action": "updated", "id": todo.id}
        )
        return f"Updated Task #{todo.id}: • {mark} {todo.task} (ID: {todo.id}, {todo.todo_date})"
    finally:
        db.close()


def archive_todo(user_id: int, todo_id: int) -> str:
    db = SessionLocal()
    try:
        todo = (
            db.query(models.Todo)
            .filter(models.Todo.id == todo_id, models.Todo.user_id == user_id)
            .first()
        )
        if not todo:
            return "Error: Todo not found."
        todo.archived = True
        db.commit()
        db.refresh(todo)
        events.broadcast(
            user_id, {"type": "todos-changed", "action": "archived", "id": todo.id}
        )
        return f"Archived Task #{todo.id} '{todo.task}'. It will no longer show up in listings."
    finally:
        db.close()
