"""Server-owned conversation history, persisted in postgres.

Canonical history is the native LangChain message list (Human/AI/Tool).
Rows store one {"type": ..., "data": {...}} payload each; reads use
langchain's public messages_from_dict so tool_call IDs survive round-trip.

Thread IDs are integer PKs scoped by user_id on every access.
Clients may send thread_id as string (or omit it): unknown IDs fork
a new thread, omitted IDs resolve to the most recent thread.

Public API is async (FastAPI path); `*_db` helpers are the sync
implementations run in a thread. New code should use the async names.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages.utils import messages_from_dict
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import SessionLocal
from . import config
from .models import ChatMessage, ChatThread

logger = logging.getLogger(__name__)

DEFAULT_TITLE = "New chat"
ThreadId = int | str | None


def utcnow_naive() -> datetime:
    """Naive UTC now, matching existing DateTime columns (no tz)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def message_to_payload(message: Any) -> dict[str, Any]:
    """Serialize one LangChain message to a JSON-safe row payload."""
    dumped = message.model_dump(mode="json")
    return {"type": dumped.pop("type"), "data": dumped}


def _coerce_thread_id(thread_id: ThreadId) -> int | None:
    try:
        return int(thread_id) if thread_id is not None else None
    except (TypeError, ValueError):
        return None


def find_owned_thread(db: Session, user_id: int, wanted_id: int) -> ChatThread | None:
    return (
        db.query(ChatThread)
        .filter(ChatThread.id == wanted_id, ChatThread.user_id == user_id)
        .first()
    )


def find_recent_thread(db: Session, user_id: int) -> ChatThread | None:
    return (
        db.query(ChatThread)
        .filter(ChatThread.user_id == user_id)
        .order_by(ChatThread.updated_at.desc(), ChatThread.id.desc())
        .first()
    )


def create_thread(db: Session, user_id: int) -> ChatThread:
    thread = ChatThread(user_id=user_id, title=DEFAULT_TITLE)
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def resolve_thread_id(db: Session, user_id: int, thread_id: ThreadId) -> int:
    """Get-or-create for the POST path. Always returns an owned thread id."""
    wanted = _coerce_thread_id(thread_id)
    if wanted is not None:
        owned = find_owned_thread(db, user_id, wanted)
        if owned:
            return owned.id
        # Unknown numeric ID: fork a new thread (back-compat). Logged so
        # client typos show up instead of silently growing orphan threads.
        logger.warning("chat unknown thread fork (user_id=%s wanted=%s)", user_id, wanted)
    else:
        recent = find_recent_thread(db, user_id)
        if recent:
            return recent.id
    return create_thread(db, user_id).id


def scoped_thread(db: Session, user_id: int, thread_id: ThreadId) -> ChatThread | None:
    """Strict owned lookup for GET/DELETE. Returns None if missing."""
    wanted = _coerce_thread_id(thread_id)
    if wanted is None:
        return None
    return find_owned_thread(db, user_id, wanted)


def thread_summary(db: Session, thread: ChatThread) -> dict[str, Any]:
    count = (
        db.query(func.count(ChatMessage.id))
        .filter(ChatMessage.thread_id == thread.id)
        .scalar()
    )
    return {
        "thread_id": thread.id,
        "title": thread.title,
        "provider": thread.provider,
        "model": thread.model,
        "message_count": count,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
    }


async def resolve_post_thread(user_id: int, thread_id: ThreadId) -> int:
    """Thread id for a new turn (creates when needed)."""
    return await asyncio.to_thread(resolve_post_thread_db, user_id, thread_id)


def resolve_post_thread_db(user_id: int, thread_id: ThreadId) -> int:
    with SessionLocal() as db:
        return resolve_thread_id(db, user_id, thread_id)


async def get_thread_summary(user_id: int, thread_id: int) -> dict | None:
    return await asyncio.to_thread(get_thread_summary_db, user_id, thread_id)


def get_thread_summary_db(user_id: int, thread_id: int) -> dict | None:
    with SessionLocal() as db:
        thread = scoped_thread(db, user_id, thread_id)
        return thread_summary(db, thread) if thread else None


async def list_threads(user_id: int) -> list[dict]:
    return await asyncio.to_thread(list_threads_db, user_id)


def list_threads_db(user_id: int) -> list[dict]:
    with SessionLocal() as db:
        threads = (
            db.query(ChatThread)
            .filter(ChatThread.user_id == user_id)
            .order_by(ChatThread.updated_at.desc(), ChatThread.id.desc())
            .all()
        )
        return [thread_summary(db, thread) for thread in threads]


async def get_history(user_id: int, thread_id: ThreadId) -> list:
    """Messages oldest-first, capped to the window. Unknown thread → []."""
    payloads = await get_history_payloads(user_id, thread_id)
    return messages_from_dict(payloads)


async def get_history_payloads(user_id: int, thread_id: ThreadId) -> list[dict]:
    """Raw row payloads oldest-first (for GET /history, no round-trip)."""
    return await asyncio.to_thread(get_history_payloads_db, user_id, thread_id)


def get_history_payloads_db(user_id: int, thread_id: ThreadId) -> list[dict]:
    with SessionLocal() as db:
        thread = scoped_thread(db, user_id, thread_id)
        if not thread:
            return []
        rows = (
            db.query(ChatMessage)
            .filter(ChatMessage.thread_id == thread.id)
            .order_by(ChatMessage.id.desc())
            .limit(config.HISTORY_LIMIT)
            .all()
        )
        return [row.payload for row in reversed(rows)]


async def append_turn(
    user_id: int,
    thread_id: ThreadId,
    new_messages: list,
    provider: str | None = None,
    model: str | None = None,
) -> int:
    """INSERT one turn's new messages ([user_message, *fresh]). Returns thread id."""
    return await asyncio.to_thread(
        append_turn_db, user_id, thread_id, new_messages, provider, model
    )


def append_turn_db(
    user_id: int,
    thread_id: ThreadId,
    new_messages: list,
    provider: str | None,
    model: str | None,
) -> int:
    with SessionLocal() as db:
        # The POST router already resolved the thread, so an owned int id
        # hits directly. Anything else keeps get-or-create for compat.
        thread = None
        if isinstance(thread_id, int):
            thread = scoped_thread(db, user_id, thread_id)
        if thread is None:
            resolved_id = resolve_thread_id(db, user_id, thread_id)
            thread = scoped_thread(db, user_id, resolved_id)
        assert thread is not None
        for message in new_messages:
            db.add(
                ChatMessage(
                    thread_id=thread.id,
                    role=message.type,
                    payload=message_to_payload(message),
                )
            )
        if thread.title == DEFAULT_TITLE:
            for message in new_messages:
                if message.type == "human" and message.content:
                    thread.title = str(message.content)[:60]
                    break
        thread.updated_at = utcnow_naive()
        if provider:
            thread.provider = provider
        if model:
            thread.model = model
        db.commit()
        return thread.id


async def clear_history(user_id: int, thread_id: int) -> bool:
    """Delete a thread's messages (thread row kept). False if missing."""
    return await asyncio.to_thread(clear_history_db, user_id, thread_id)


def clear_history_db(user_id: int, thread_id: int) -> bool:
    with SessionLocal() as db:
        thread = scoped_thread(db, user_id, thread_id)
        if not thread:
            return False
        db.query(ChatMessage).filter(ChatMessage.thread_id == thread.id).delete()
        db.commit()
        return True
