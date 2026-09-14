"""Server-side ReAct loop (ported from agentic-cli/main.py, I/O removed).

create_agent wires a graph with two nodes that alternate until done:
  model node -> AIMessage; plain text (FINAL answer, loop ends) or
                text + tool_calls (loop continues)
  tools node -> executes each tool_call, appends a ToolMessage per result,
                hands control back to the model node
That model->tools->model cycle IS the ReAct loop. `recursion_limit`
bounds it so a confused model spins at most N rounds instead of forever.

Streaming: agent.astream(stream_mode=["messages", "updates"]).
"messages" yields LLM chunks token-by-token; "updates" yields per-node
full messages so tool calls/results are announced live.

Yields event dicts (JSON-serializable, SSE-framed by router.py):
  {"type": "token", "content": "..."}
  {"type": "tool_call", "tool": ..., "args": {...}}
  {"type": "tool_result", "tool": ..., "output": "..."}
  {"type": "done"}
  {"type": "error", "message": "..."}
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from . import config, history
from .llm_factory import make_llm
from .prompt import system_prompt
from .tools import build_tools_for_user

logger = logging.getLogger(__name__)


def text_delta(content) -> str:
    """Extract printable text from an LLM chunk's content.

    Handles plain strings and content blocks like [{"type": "text", ...}].
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if isinstance(block.get("text"), str):
                    parts.append(block["text"])
        return "".join(parts)
    return ""


def safe_text(value) -> str:
    """Coerce anything to SSE-safe text. ToolMessage content is str today,
    but a future tool returning structured content must not kill the
    stream inside json.dumps in router.py."""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return str(value)


async def run_turn(
    *,
    user_id: int,
    user_text: str,
    thread_id: int | str | None = None,
    provider: str | None = None,
    model: str | None = None,
    is_disconnected=None,
) -> AsyncGenerator[dict, None]:
    """Run one full reason/act loop for this turn, yielding event dicts."""
    try:
        llm = make_llm(provider=provider, model=model)
        active_provider, active_model = config.resolve_provider_and_model(
            provider, model
        )
    except (ValueError, RuntimeError) as e:
        yield {"type": "error", "message": str(e)}
        return

    tools = build_tools_for_user(user_id)
    agent = create_agent(model=llm, tools=tools)

    stored = await history.get_history(user_id, thread_id)
    user_message = HumanMessage(content=user_text)
    messages = [
        system_prompt(datetime.now().strftime("%Y-%m-%d")),
        *stored,
        user_message,
    ]

    fresh: list = []
    seen_tool_ids: set = set()
    tool_names: dict[str, str] = {}  # tool_call id -> name (for tool_result)

    def announce_tool_call(tc) -> dict | None:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", None)
        call_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
        key = call_id or (name, str(args or ""))
        if key in seen_tool_ids:
            return None
        seen_tool_ids.add(key)
        if call_id and name:
            tool_names[call_id] = name
        return {"type": "tool_call", "tool": name, "args": args or {}}

    try:
        # asyncio.timeout (not an elapsed check inside the loop): fires even
        # when the provider hangs without yielding any chunk.
        async with asyncio.timeout(config.TURN_TIMEOUT_SECONDS):
            async for mode, data in agent.astream(
                {"messages": messages},
                config={"recursion_limit": config.RECURSION_LIMIT},
                stream_mode=["messages", "updates"],
            ):
                if is_disconnected is not None and await is_disconnected():
                    logger.info("chat client disconnected, stopping turn (user_id=%s)", user_id)
                    break

                if mode == "messages":
                    chunk, meta_ignored = data
                    # The "messages" stream yields chunks from every node,
                    # including the tools node (ToolMessage carrying the full
                    # tool output as content). Only the model node speaks for
                    # the answer — tool output has its own tool_result event
                    # from the "updates" branch below. Without this guard the
                    # tool output is emitted as answer tokens and then
                    # restated by the model, i.e. every answer appears twice.
                    if chunk.__class__.__name__ == "ToolMessage":
                        continue
                    delta = text_delta(getattr(chunk, "content", ""))
                    if delta:
                        yield {"type": "token", "content": delta}
                    for tc in getattr(chunk, "tool_calls", None) or []:
                        event = announce_tool_call(tc)
                        if event is not None:
                            yield event
                elif mode == "updates":
                    for node_ignored, update in (data or {}).items():
                        upd = update.get("messages") if isinstance(update, dict) else None
                        if not upd:
                            continue
                        msgs = upd if isinstance(upd, list) else [upd]
                        for m in msgs:
                            if m.__class__.__name__ == "ToolMessage":
                                yield {
                                    "type": "tool_result",
                                    "tool": tool_names.get(
                                        getattr(m, "tool_call_id", ""), getattr(m, "name", "")
                                    ),
                                    "output": safe_text(getattr(m, "content", "")),
                                }
                            for tc in getattr(m, "tool_calls", None) or []:
                                event = announce_tool_call(tc)
                                if event is not None:
                                    yield event
                        fresh.extend(msgs)

        if fresh:
            await history.append_turn(
                user_id,
                thread_id,
                [user_message, *fresh],
                provider=active_provider,
                model=active_model,
            )
        yield {"type": "done"}
    except TimeoutError:
        logger.warning("chat turn timed out (user_id=%s)", user_id)
        yield {
            "type": "error",
            "message": f"Turn timed out after {config.TURN_TIMEOUT_SECONDS:g}s. Try a smaller request.",
        }
    except Exception as e:
        logger.exception("chat turn failed (user_id=%s)", user_id)
        yield {"type": "error", "message": f"that turn failed ({e}). Try rephrasing."}
