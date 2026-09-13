"""In-process pub/sub for todo changes (SSE fan-out).

How it works: each open browser tab gets its own asyncio.Queue, registered
under its user id. Any code that mutates todos (REST router, MCP tools) calls
broadcast(user_id, event); every listening tab picks the event up from its
own queue and refetches. Single-process only — a multi-worker deploy would
need Redis pub/sub instead.
"""

import asyncio
from collections import defaultdict

_subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)


def subscribe(user_id: int) -> asyncio.Queue:
    """Register one SSE connection; returns its private queue."""
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[user_id].add(q)
    return q


def unsubscribe(user_id: int, q: asyncio.Queue) -> None:
    """Remove a closed SSE connection."""
    queues = _subscribers.get(user_id)
    if queues is not None:
        queues.discard(q)
        if not queues:
            _subscribers.pop(user_id, None)


def broadcast(user_id: int, event: dict) -> None:
    """Fan out one JSON-serializable event to all of this user's tabs."""
    for q in list(_subscribers.get(user_id, ())):
        q.put_nowait(event)


def subscriber_count(user_id: int) -> int:
    return len(_subscribers.get(user_id, ()))
