from datetime import date, datetime

from pydantic import BaseModel, Field


class TodoCreate(BaseModel):
    task: str = Field(min_length=1, max_length=500)
    todo_date: date | None = None


class TodoUpdate(BaseModel):
    task: str | None = Field(default=None, min_length=1, max_length=500)
    todo_date: date | None = None
    completed: bool | None = None
    archived: bool | None = None


class TodoOut(BaseModel):
    """One todo as typed JSON for programs (REST/MCP/clients).

    Same keys the ORM rows already serialize to — the frontend
    `Todo` interface in `frontend/src/lib/api.ts` mirrors this.
    """

    model_config = {"from_attributes": True}

    id: int
    task: str
    completed: bool
    archived: bool
    user_id: int
    todo_date: date
    created_at: datetime | None = None


class TodoListOut(BaseModel):
    """Structured list result: counts are computed, never LLM-counted."""

    open: int
    done: int
    todos: list[TodoOut]
