"""Pub/sub for todo changes (SSE fan-out).

Single process: in-memory asyncio queues (as before).
Multi-process / docker: each `broadcast` also PUBLISHes to Redis channel
`todos:{user_id}`; each SSE connection additionally subscribes to that
channel and forwards messages into its local queue.

Falls back to in-process only when REDIS_URL is unset or Redis is
unreachable, so unit tests and `--no-redis` local runs keep working.
"""

import asyncio
import json
import logging
import os
from collections import defaultdict

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "")

_subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)

_sync_redis = None
_async_redis = None


def channel(user_id: int) -> str:
    return f"todos:{user_id}"


def _sync_client():
    global _sync_redis
    if _sync_redis is None and REDIS_URL:
        try:
            import redis

            _sync_redis = redis.Redis.from_url(REDIS_URL, socket_timeout=2)
        except Exception as e:
            logger.warning("redis unavailable (sync): %s", e)
            _sync_redis = None
    return _sync_redis


async def _async_client():
    global _async_redis
    if _async_redis is None and REDIS_URL:
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(REDIS_URL)
            await client.ping()
            _async_redis = client
        except Exception as e:
            logger.warning("redis unavailable (async): %s", e)
            _async_redis = None
    return _async_redis


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
    client = _sync_client()
    if client is not None:
        try:
            client.publish(channel(user_id), json.dumps(event))
        except Exception as e:
            logger.warning("redis publish failed: %s", e)


async def redis_forward_loop(user_id: int, q: asyncio.Queue) -> None:
    """Bridge Redis channel -> local queue. Ends when cancelled."""
    client = await _async_client()
    if client is None:
        return
    pubsub = client.pubsub()
    await pubsub.subscribe(channel(user_id))
    try:
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue
            try:
                q.put_nowait(json.loads(msg["data"]))
            except Exception:
                pass
    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe(channel(user_id))
            await pubsub.close()
        except Exception:
            pass


def subscriber_count(user_id: int) -> int:
    return len(_subscribers.get(user_id, ()))
