from typing import Any, Optional

from pydantic import BaseModel, Field


class ClientInfo(BaseModel):
    """Who is talking to chat. Web clients advertise `ui_action` so the
    model may drive view/filter state; the CLI omits it and stays data-only.
    `ui_state` is opaque client view context (route search params, view,
    sort, density) echoed back into the system prompt — never trusted raw."""

    kind: str = Field(default="cli", description='One of: "web" | "cli".')
    capabilities: list[str] = Field(
        default_factory=list,
        description='e.g. ["ui_action"] for web clients that apply ui_action events locally.',
    )
    ui_state: Optional[dict[str, Any]] = Field(
        default=None, description="Client-local view/filter snapshot for prompt context."
    )


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
    client: Optional[ClientInfo] = Field(
        default=None, description="Client kind + capabilities + view snapshot."
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
