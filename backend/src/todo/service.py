"""Pure user-scoped todo operations (no MCP, no FastAPI, no headers).

This module is the single source of truth for todo CRUD. Both the MCP
tools (mcp_server/tools.py) and the chat agent (chat/tools.py) call these
functions in-process, so the backend never SSE-hops to itself.

Split by consumer (text for talking, JSON for rendering):

- `query_todos` — pure data query, returns ORM rows. Raises ValueError
  on bad date strings instead of returning error text.
- `format_todos` — text presenter FOR THE LLM (echo-verbatim lines with
  an `N open, M done:` summary the model must not recount).
- `to_todo_list_out` — JSON presenter FOR PROGRAMS (REST/MCP/clients).
- `list_todos` — back-compat wrapper returning the text presenter,
  used by the chat agent. New code should prefer `query_todos`.

Each function opens a short-lived DB session and touches only rows
owned by `user_id`. Mutations broadcast a `todos-changed` SSE event.
"""

from datetime import date
from difflib import SequenceMatcher

from core.database import SessionLocal
from todo import events, models, schemas

# Easy toggle for ambiguous "what are my todos" queries: None = show both
# open and done with a summary line, False = open only, True = done only.
# The chat/MCP `completed` arg overrides this only when explicitly passed.
LIST_DEFAULT_COMPLETED: bool | None = None

# Minimum SequenceMatcher ratio to keep a non-substring fuzzy hit.
FUZZY_THRESHOLD = 0.4


def fuzzy_score(query: str, text: str) -> float:
    """Rank `text` against `query`. Substring hits score highest so exact
    words always outrank typo guesses; otherwise fall back to ratio."""
    q = query.lower().strip()
    t = text.lower()
    if not q:
        return 1.0
    if q in t:
        return 1.0
    tokens = q.split()
    if tokens and all(tok in t for tok in tokens):
        return 0.95
    return SequenceMatcher(None, q, t).ratio()


def format_todos(todos: list) -> str:
    """Text presenter FOR THE LLM — display-ready lines echoed verbatim.

    First line is always a summary so ambiguous queries ("what are my
    todos") show open/done counts without extra tool calls.
    """
    return format_todos_from_out(to_todo_list_out(todos))


def format_todos_from_out(out: schemas.TodoListOut) -> str:
    """Same text presenter, rendered from the structured result instead of
    ORM rows. Single-query pipeline: query once, present twice (text for
    the model, JSON for widgets) — output is byte-identical to format_todos."""
    lines = [f"{out.open} open, {out.done} done:"]
    for t in out.todos:
        mark = "✅" if t.completed else "❌"
        lines.append(f"• {mark} {t.task} (ID: {t.id}, {t.todo_date})")
    return "\n".join(lines)


def to_todo_list_out(todos: list) -> schemas.TodoListOut:
    """JSON presenter FOR PROGRAMS — typed counts plus typed rows."""
    items = [
        schemas.TodoOut(
            id=t.id,
            task=t.task,
            completed=bool(t.completed),
            archived=bool(t.archived),
            user_id=t.user_id,
            todo_date=t.todo_date,
            created_at=t.created_at,
        )
        for t in todos
    ]
    return schemas.TodoListOut(
        open=sum(1 for t in todos if not t.completed),
        done=sum(1 for t in todos if t.completed),
        todos=items,
    )


def parse_filter_date(value: str | date | None, name: str) -> date | None:
    """Accept an ISO string or a date, return a date. Raises ValueError."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"bad {name} '{value}' — use YYYY-MM-DD.")


def query_todos(
    user_id: int,
    completed: bool | None = None,
    include_archived: bool = False,
    query: str | None = None,
    target_date: str | date | None = None,
    date_from: str | date | None = None,
    date_to: str | date | None = None,
    overdue: bool = False,
) -> list:
    """Pure data query: user-scoped ORM rows, fuzzy-ranked when `query`
    is given. Raises ValueError on bad date strings."""
    target = parse_filter_date(target_date, "target_date")
    start = parse_filter_date(date_from, "date_from")
    end = parse_filter_date(date_to, "date_to")
    today = date.today()
    db = SessionLocal()
    try:
        db_query = db.query(models.Todo).filter(models.Todo.user_id == user_id)
        if completed is not None:
            db_query = db_query.filter(models.Todo.completed == completed)
        if not include_archived:
            db_query = db_query.filter(models.Todo.archived == False)  # noqa: E712
        if target:
            db_query = db_query.filter(models.Todo.todo_date == target)
        if start:
            db_query = db_query.filter(models.Todo.todo_date >= start)
        if end:
            db_query = db_query.filter(models.Todo.todo_date <= end)
        if overdue:
            db_query = db_query.filter(models.Todo.todo_date < today)
            if completed is None:
                db_query = db_query.filter(models.Todo.completed == False)  # noqa: E712
        todos = db_query.order_by(models.Todo.id).all()
    finally:
        db.close()
    if query and query.strip():
        scored = [(fuzzy_score(query, t.task), t) for t in todos]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        todos = [t for s, t in scored if s >= FUZZY_THRESHOLD]
    return todos


def list_todos(
    user_id: int,
    completed: bool | None = None,
    include_archived: bool = False,
    query: str | None = None,
    target_date: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    overdue: bool = False,
) -> str:
    """Back-compat text wrapper for the chat agent. New code: `query_todos`."""
    try:
        todos = query_todos(
            user_id,
            completed=completed,
            include_archived=include_archived,
            query=query,
            target_date=target_date,
            date_from=date_from,
            date_to=date_to,
            overdue=overdue,
        )
    except ValueError as e:
        return f"Error: {e}"
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
