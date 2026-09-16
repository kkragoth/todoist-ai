"""Typed argument schemas for the chat agent tools.

Split out of `tools.py` so the wire shapes read without the impl noise.
All closed value sets use enums; open text stays `str | None`.
"""

from pydantic import BaseModel, Field

from . import config
from .protocol import (
    HIGHLIGHT_MAX_IDS,
    MAX_SUGGESTION_CHARS,
    MAX_SUGGESTIONS,
    DatePreset,
    Density,
    ListSort,
    TodoStatusFilter,
    TodosView,
)


class ListTodosArgs(BaseModel):
    completed: bool | None = Field(
        default=None,
        description="Leave UNSET for normal 'my todos/tasks today' questions so both open and done return with counts. Only False for open/remaining/left/unfinished/overdue, True for done/finished/completed.",
    )
    include_archived: bool = Field(
        default=False, description="True also shows archived tasks. Default False (hidden)."
    )
    query: str | None = Field(
        default=None,
        description="Fuzzy name filter, e.g. 'milk' matches 'buy milk'. Pass it when the user names a task; combine with target_date when they also say a day ('clean up my room today').",
    )
    target_date: str | None = Field(
        default=None,
        description="YYYY-MM-DD for one day. Pass today for 'today' questions, or the named day. Omit for all dates. Never answer a 'today' question from an unfiltered listing — re-call with target_date instead of hiding rows.",
    )
    overdue: bool = Field(
        default=False, description="True = only past-due open tasks."
    )


class AddTodoArgs(BaseModel):
    task: str = Field(description="Task description.")
    todo_date: str | None = Field(
        default=None, description="Target date in YYYY-MM-DD format. Defaults to today if omitted."
    )


class UpdateTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to update.")
    task: str | None = Field(default=None, description="New task description (omit to keep).")
    todo_date: str | None = Field(
        default=None, description="New target date in YYYY-MM-DD format (omit to keep)."
    )
    completed: bool | None = Field(
        default=None, description="True = mark done, False = mark open (omit to keep)."
    )


class ArchiveTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to archive.")


class DeleteTodoArgs(BaseModel):
    todo_id: int = Field(description="The ID of the task to permanently delete.")


class AskUserArgs(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=config.MAX_QUESTION_CHARS,
        description="Short clarification question for the user. Ask alone, no other tools in the same turn.",
    )
    options: list[str] = Field(
        default_factory=list,
        max_length=config.MAX_ASK_OPTIONS,
        description="Up to 4 short options, each naming task + date + ID so the reply resolves to one candidate.",
    )


class SetTodosFilterArgs(BaseModel):
    status: TodoStatusFilter | None = Field(
        default=None, description="One of: all | open | done. Omit to keep the current filter."
    )
    date_preset: DatePreset | None = Field(
        default=None,
        description="One of: all | overdue | today | tomorrow | week | later | custom. Omit to keep.",
    )
    start_date: str | None = Field(
        default=None, description="YYYY-MM-DD, only meaningful with date_preset=custom."
    )
    end_date: str | None = Field(
        default=None, description="YYYY-MM-DD, only meaningful with date_preset=custom."
    )
    archived: bool | None = Field(default=None, description="True shows archived tasks. Omit to keep.")


class SetTodosViewArgs(BaseModel):
    view: TodosView | None = Field(
        default=None, description="One of: list | grouped | grouped_by_day. Omit to keep."
    )
    sort: ListSort | None = Field(default=None, description="One of: asc | desc. Omit to keep.")
    density: Density | None = Field(
        default=None, description="One of: comfortable | compact. Omit to keep."
    )


class HighlightTodosArgs(BaseModel):
    ids: list[int] = Field(
        min_length=1,
        max_length=HIGHLIGHT_MAX_IDS,
        description="Todo IDs to flash-highlight in the list so the user sees them.",
    )


class SuggestFollowupsArgs(BaseModel):
    suggestions: list[str] = Field(
        min_length=1,
        max_length=MAX_SUGGESTIONS,
        description=(
            f"2-{MAX_SUGGESTIONS} short follow-up actions the user likely wants next, "
            f"each under {MAX_SUGGESTION_CHARS} chars."
        ),
    )
