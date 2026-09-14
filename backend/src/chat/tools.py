"""LangChain tools for the chat agent, bound to one user.

Same four operations as the MCP server, but called in-process via
todo.service — no SSE hop. Each tool closes over `user_id`, so the model
never sees credentials and there is no cross-user leak.

The list tool deliberately returns the TEXT presenter (`format_todos`):
the consumer is a sentence, not a component. Programs that render UI
should use `query_todos` + `TodoListOut` (see `todo/service.py` and the
MCP `list_todos_structured` tool) instead of parsing chat text.

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


class AskUserArgs(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=300,
        description="Short clarification question for the user. Ask alone, no other tools in the same turn.",
    )
    options: list[str] = Field(
        default_factory=list,
        max_length=4,
        description="Up to 4 short options, each naming task + date + ID so the reply resolves to one candidate.",
    )


def drop_nones(kwargs: dict) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None}


def build_tools_for_user(user_id: int) -> list[StructuredTool]:
    """Create the four todo tools closed over `user_id`."""

    async def list_todos_tool(
        completed: Optional[bool] = None,
        include_archived: bool = False,
        query: Optional[str] = None,
        target_date: Optional[str] = None,
        overdue: bool = False,
    ) -> str:
        kwargs = drop_nones(
            {"completed": completed, "query": query, "target_date": target_date}
        )
        return await asyncio.to_thread(
            todo_service.list_todos,
            user_id,
            include_archived=include_archived,
            overdue=overdue,
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

    async def ask_user_tool(question: str, options: list[str] | None = None) -> str:
        """Terminal clarification hook. The service intercepts this call,
        emits an `ask_user` SSE event, and ends the turn — the returned
        string only lands in history so the next turn remembers what was asked."""
        opts = options or []
        if opts:
            return f"Asked user: {question} Options: {' | '.join(opts)}"
        return f"Asked user: {question}"

    return [
        StructuredTool.from_function(
            coroutine=list_todos_tool,
            name="list_todos",
            description=(
                "List todo tasks for the authenticated user. "
                "Normal 'my todos/tasks today': pass target_date=today and leave "
                "completed UNSET so open+done come back with counts. "
                "completed=False only for open/remaining/left/unfinished/overdue, "
                "True only for done/finished/completed. "
                "query: fuzzy name filter, combine with target_date when the user "
                "names a task plus a day. "
                "Echo EVERY returned bullet to the user, never hide rows; "
                "a wrong (unfiltered) listing means re-calling with target_date. "
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
                "Use IDs from listed results, never guess one. "
                "A date word narrows candidates ('X today' = only rows dated today); "
                "with zero or 2+ matches, call ask_user instead of acting."
            ),
            args_schema=UpdateTodoArgs,
        ),
        StructuredTool.from_function(
            coroutine=archive_todo_tool,
            name="archive_todo",
            description="Archive a todo task so it is hidden from normal listings.",
            args_schema=ArchiveTodoArgs,
        ),
        StructuredTool.from_function(
            coroutine=ask_user_tool,
            name="ask_user",
            description=(
                "Ask the user a clarifying question INSTEAD of acting. Use when "
                "zero or 2+ tasks match, or a pronoun has no single clear target. "
                "Terminal: call it alone, with no other tools in the same turn."
            ),
            args_schema=AskUserArgs,
        ),
    ]
