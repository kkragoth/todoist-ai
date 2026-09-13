from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import asyncio
import json

from auth.models import User
from auth.utils.security import get_current_user, get_query_user
from core.database import get_db
from . import events, schemas, models

router = APIRouter(prefix="/api/todos", tags=["Todos"])

@router.get("")
def get_todos(
    target_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    completed: bool | None = None,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Query todos. If target_date is provided, filter by that specific date.
    date_from/date_to define an inclusive range filter (e.g. a week).
    If completed is provided, filter by completion status (False = unfinished).
    Archived todos are hidden unless include_archived is True."""
    query = db.query(models.Todo).filter(models.Todo.user_id == current_user.id)
    if target_date:
        query = query.filter(models.Todo.todo_date == target_date)
    if date_from:
        query = query.filter(models.Todo.todo_date >= date_from)
    if date_to:
        query = query.filter(models.Todo.todo_date <= date_to)
    if completed is not None:
        query = query.filter(models.Todo.completed == completed)
    if not include_archived:
        query = query.filter(models.Todo.archived == False)  # noqa: E712
    return query.all()

@router.get("/events")
async def todo_events(user: User = Depends(get_query_user)):
    """SSE stream of todo changes for one user.

    The token rides in the query string because browsers can't set headers
    on an EventSource. get_query_user runs the same check as every other
    endpoint, so a bad token gets the same 401.
    """
    queue = events.subscribe(user.id)

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            events.unsubscribe(user.id, queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.post("")
def create_todo(
    todo: schemas.TodoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_date = todo.todo_date or date.today()
    new_todo = models.Todo(task=todo.task, todo_date=target_date, owner=current_user)
    db.add(new_todo)
    db.commit()
    db.refresh(new_todo)
    events.broadcast(current_user.id, {"type": "todos-changed", "action": "created", "id": new_todo.id})
    return new_todo

@router.patch("/{todo_id}")
def update_todo(
    todo_id: int,
    update_data: schemas.TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reschedule, complete/uncomplete, or archive a todo item."""
    todo = db.query(models.Todo).filter(
        models.Todo.id == todo_id,
        models.Todo.user_id == current_user.id
    ).first()

    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    if update_data.todo_date is not None:
        todo.todo_date = update_data.todo_date
    if update_data.completed is not None:
        todo.completed = update_data.completed
    if update_data.archived is not None:
        todo.archived = update_data.archived

    db.commit()
    db.refresh(todo)
    events.broadcast(current_user.id, {"type": "todos-changed", "action": "updated", "id": todo.id})
    return todo
