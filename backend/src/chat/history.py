"""Server-owned conversation history, persisted in postgres.

Canonical history is the native LangChain message list (Human/AI/Tool),
which is what makes follow-ups ("archive it") resolve. Rows store one
{"type": ..., "data": {...}} payload each (see message_to_payload);
reads deserialize with langchain's public messages_from_dict, so
tool_call IDs survive the round-trip losslessly.

Thread IDs are integer PKs scoped by user_id on every access — a user
can never read or append to another user's thread. Clients may still
send thread_id as string (or omit it): unknown IDs fork a new thread,
omitted IDs resolve to the most recently used one.

Clients never supply history — they only send the new message.
"""

import asyncio
from datetime import datetime

from langchain_core.messages.utils import messages_from_dict
from sqlalchemy import func

from core.database import SessionLocal
from . import config
from .models import ChatMessage, ChatThread

DEFAULT_TITLE = "New chat"


def message_to_payload(message) -> dict:
    """Serialize one LangChain message to a JSON-safe row payload.

    Uses only public API: model_dump(mode="json") for JSON-safe
    primitives, split into the {"type", "data"} shape that the public
    messages_from_dict understands on the way back.
    """
    dumped = message.model_dump(mode="json")
    return {"type": dumped.pop("type"), "data": dumped}


def resolve_thread_id(db, user_id: int, thread_id) -> int:
    """Get-or-create for the POST path. Always returns an owned thread id.

    Numeric IDs verify ownership; unknown or non-numeric IDs and omitted
    IDs fall back to the most recent thread, creating one if needed.
    """
    owned = None
    try:
        wanted = int(thread_id) if thread_id is not None else None
    except (TypeError, ValueError):
        wanted = None
    if wanted is not None:
        owned = (
            db.query(ChatThread)
            .filter(ChatThread.id == wanted, ChatThread.user_id == user_id)
            .first()
        )
        if owned:
            return owned.id
        # Unknown numeric ID: fork a new thread below (back-compat).
    else:
        recent = (
            db.query(ChatThread)
            .filter(ChatThread.user_id == user_id)
            .order_by(ChatThread.updated_at.desc(), ChatThread.id.desc())
            .first()
        )
        if recent:
            return recent.id
    thread = ChatThread(user_id=user_id, title=DEFAULT_TITLE)
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread.id


def scoped_thread(db, user_id: int, thread_id: int):
    """Strict owned lookup for GET/DELETE. Returns None if missing."""
    try:
        wanted = int(thread_id)
    except (TypeError, ValueError):
        return None
    return (
        db.query(ChatThread)
        .filter(ChatThread.id == wanted, ChatThread.user_id == user_id)
        .first()
    )


def thread_summary(db, thread) -> dict:
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


async def resolve_post_thread(user_id: int, thread_id) -> int:
    """Thread id for a new turn (creates when needed)."""
    return await asyncio.to_thread(resolve_post_thread_db, user_id, thread_id)


def resolve_post_thread_db(user_id: int, thread_id) -> int:
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
        return [thread_summary(db, t) for t in threads]


async def get_history(user_id: int, thread_id) -> list:
    """Messages oldest-first, capped to the window. Unknown thread → []."""
    payloads = await get_history_payloads(user_id, thread_id)
    return messages_from_dict(payloads)


async def get_history_payloads(user_id: int, thread_id) -> list[dict]:
    """Raw row payloads oldest-first (for GET /history, no round-trip)."""
    return await asyncio.to_thread(get_history_payloads_db, user_id, thread_id)


def get_history_payloads_db(user_id: int, thread_id) -> list[dict]:
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
        return [r.payload for r in reversed(rows)]


async def append_turn(
    user_id: int,
    thread_id,
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
    thread_id,
    new_messages: list,
    provider: str | None,
    model: str | None,
) -> int:
    with SessionLocal() as db:
        # The POST router already resolved (or created) the thread, so an
        # owned integer id is used directly. Anything else keeps the
        # get-or-create fallback for unknown/omitted ids.
        thread = None
        if isinstance(thread_id, int):
            thread = scoped_thread(db, user_id, thread_id)
        if thread is None:
            tid = resolve_thread_id(db, user_id, thread_id)
            thread = scoped_thread(db, user_id, tid)
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
        thread.updated_at = datetime.utcnow()
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
