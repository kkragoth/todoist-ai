from typing import Any

from pydantic import BaseModel, Field

from .protocol import ClientCapability, ClientKind


class ClientInfo(BaseModel):
    """Who is talking to chat. Web clients advertise `ui_action` so the
    model may drive view/filter state; the CLI omits it and stays data-only.
    `ui_state` is opaque client view context (route search params, view,
    sort, density) echoed back into the system prompt — never trusted raw."""

    kind: ClientKind = Field(default=ClientKind.CLI, description='One of: "web" | "cli".')
    capabilities: list[ClientCapability] = Field(
        default_factory=list,
        description='e.g. ["ui_action"] for web clients that apply ui_action events locally.',
    )
    ui_state: dict[str, Any] | None = Field(
        default=None, description="Client-local view/filter snapshot for prompt context."
    )


class ChatRequest(BaseModel):
    """One chat turn. History is server-owned — the client only sends
    the new message plus which thread it belongs to."""

    message: str = Field(min_length=1, max_length=4000, description="The user's new message.")
    thread_id: str | None = Field(
        default=None,
        description="Conversation thread id. Omit to continue the most recent thread.",
    )
    # Optional per-request provider override. When omitted, the server
    # default (LLM_PROVIDER env) applies. Easily swappable per call.
    provider: str | None = Field(
        default=None, description="One of: ollama, llamacpp, openrouter."
    )
    model: str | None = Field(
        default=None, description="Model name for the provider. Defaults per provider env."
    )
    client: ClientInfo | None = Field(
        default=None, description="Client kind + capabilities + view snapshot."
    )


class HistoryOut(BaseModel):
    thread_id: int
    title: str
    provider: str | None = None
    model: str | None = None
    message_count: int
    updated_at: str | None = None
    messages: list[dict[str, Any]]


class ThreadSummary(BaseModel):
    thread_id: int
    title: str
    provider: str | None = None
    model: str | None = None
    message_count: int
    updated_at: str | None = None
