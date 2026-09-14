from typing import Any, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """One chat turn. History is server-owned — the client only sends
    the new message plus which thread it belongs to."""

    message: str = Field(min_length=1, description="The user's new message.")
    thread_id: Optional[str] = Field(
        default=None,
        description="Conversation thread id. Omit to continue the most recent thread.",
    )
    # Optional per-request provider override. When omitted, the server
    # default (LLM_PROVIDER env) applies. Easily swappable per call.
    provider: Optional[str] = Field(
        default=None, description="One of: ollama, llamacpp, openrouter."
    )
    model: Optional[str] = Field(
        default=None, description="Model name for the provider. Defaults per provider env."
    )


class HistoryOut(BaseModel):
    thread_id: int
    title: str
    provider: Optional[str] = None
    model: Optional[str] = None
    message_count: int
    updated_at: Optional[str] = None
    messages: list[dict[str, Any]]


class ThreadSummary(BaseModel):
    thread_id: int
    title: str
    provider: Optional[str] = None
    model: Optional[str] = None
    message_count: int
    updated_at: Optional[str] = None
