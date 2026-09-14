"""LangChain tools for the chat agent, bound to one user.

Same four operations as the MCP server, but called in-process via
todo.service — no SSE hop. Each tool closes over `user_id`, so the model
never sees credentials and there is no cross-user leak.

Explicit nulls are dropped before calling the service: small models send
{"completed": None}, which would otherwise override server defaults.
Real False/0/"" are kept.
"""

import asyncio
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from todo import service as todo_service


class ListTodosArgs(BaseModel):
    completed: Optional[bool] = Field(
        default=None,
        description="False = unfinished only, True = completed only, leave out for all.",
    )
    include_archived: bool = Field(
        default=False, description="True also shows archived tasks. Default False (hidden)."
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


def drop_nones(kwargs: dict) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None}


def build_tools_for_user(user_id: int) -> list[StructuredTool]:
    """Create the four todo tools closed over `user_id`."""

    async def list_todos_tool(
        completed: Optional[bool] = None, include_archived: bool = False
    ) -> str:
        kwargs = drop_nones({"completed": completed})
        return await asyncio.to_thread(
            todo_service.list_todos,
            user_id,
            include_archived=include_archived,
            **kwargs,
        )

    async def add_todo_tool(task: str, todo_date: Optional[str] = None) -> str:
        kwargs = drop_nones({"todo_date": todo_date})
        return await asyncio.to_thread(
            todo_service.add_todo, user_id, task=task, **kwargs
        )

    async def update_todo_tool(
        todo_id: int,
        task: Optional[str] = None,
        todo_date: Optional[str] = None,
        completed: Optional[bool] = None,
    ) -> str:
        kwargs = drop_nones(
            {"task": task, "todo_date": todo_date, "completed": completed}
        )
        return await asyncio.to_thread(
            todo_service.update_todo, user_id, todo_id=todo_id, **kwargs
        )

    async def archive_todo_tool(todo_id: int) -> str:
        return await asyncio.to_thread(
            todo_service.archive_todo, user_id, todo_id=todo_id
        )

    return [
        StructuredTool.from_function(
            coroutine=list_todos_tool,
            name="list_todos",
            description=(
                "List todo tasks for the authenticated user. "
                "completed: False = unfinished only, True = completed only, "
                "leave it out for all. "
                "include_archived: True also shows archived tasks."
            ),
            args_schema=ListTodosArgs,
        ),
        StructuredTool.from_function(
            coroutine=add_todo_tool,
            name="add_todo",
            description=(
                "Add a new todo item for the authenticated user. "
                "task: description. todo_date: YYYY-MM-DD, defaults to today."
            ),
            args_schema=AddTodoArgs,
        ),
        StructuredTool.from_function(
            coroutine=update_todo_tool,
            name="update_todo",
            description=(
                "Modify an existing todo: rename, reschedule, or (un)complete it. "
                "Use IDs from listed results, never guess one."
            ),
            args_schema=UpdateTodoArgs,
        ),
        StructuredTool.from_function(
            coroutine=archive_todo_tool,
            name="archive_todo",
            description="Archive a todo task so it is hidden from normal listings.",
            args_schema=ArchiveTodoArgs,
        ),
    ]
