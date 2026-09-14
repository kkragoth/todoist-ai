"""Thin HTTP layer over the chat service: auth, validation, SSE framing.

The ReAct loop lives in service.py, history in history.py (postgres) —
this module only resolves the JWT user, fail-fast validates
provider/model before headers are sent, and frames the service's event
dicts as SSE `data:` frames.

Use POST + fetch-reader from clients (web/TUI/CLI), NOT native
EventSource: EventSource is GET-only and can't send an Authorization
header. Errors mid-stream are `error` events, not HTTP 500s (headers
are already sent by then).

Threads: POST resolves (or creates) the thread up front and returns its
id in the X-Chat-Thread-Id response header, so clients that passed
nothing learn their thread. GET /history returns full messages for UI
restore; GET /threads lists threads for a sidebar.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from auth.models import User
from auth.utils.security import get_current_user

from . import config, history, service
from .schemas import ChatRequest, HistoryOut, ThreadSummary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])


def validate_provider(body: ChatRequest) -> tuple[str, str]:
    try:
        return config.resolve_provider_and_model(body.provider, body.model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("")
async def chat(
    body: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    provider, model = validate_provider(body)
    if provider == "openrouter" and not config.OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OpenRouter selected but OPENROUTER_API_KEY is not set.",
        )
    tid = await history.resolve_post_thread(current_user.id, body.thread_id)
    logger.info(
        "chat turn start (user_id=%s thread=%s provider=%s model=%s)",
        current_user.id,
        tid,
        provider,
        model,
    )

    async def gen():
        async for event in service.run_turn(
            user_id=current_user.id,
            user_text=body.message,
            thread_id=tid,
            provider=provider,
            model=model,
            is_disconnected=request.is_disconnected,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Chat-Thread-Id": str(tid),
        },
    )


@router.get("/threads", response_model=list[ThreadSummary])
async def list_threads(current_user: User = Depends(get_current_user)):
    rows = await history.list_threads(current_user.id)
    return [ThreadSummary(**r) for r in rows]


@router.get("/history", response_model=HistoryOut)
async def get_history(
    thread_id: int,
    current_user: User = Depends(get_current_user),
):
    """Full thread for UI restore. Thread id is required and user-scoped."""
    summary = await history.get_thread_summary(current_user.id, thread_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Thread not found.")
    payloads = await history.get_history_payloads(current_user.id, thread_id)
    return HistoryOut(messages=payloads, **summary)


@router.delete("/history")
async def delete_history(
    thread_id: int,
    current_user: User = Depends(get_current_user),
):
    cleared = await history.clear_history(current_user.id, thread_id)
    if not cleared:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return {"status": "cleared", "thread_id": thread_id}
