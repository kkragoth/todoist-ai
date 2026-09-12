from datetime import date

from pydantic import BaseModel


class TodoCreate(BaseModel):
    task: str
    todo_date: date | None = None

class TodoUpdate(BaseModel):
    todo_date: date | None = None
    completed: bool | None = None
    archived: bool | None = None
