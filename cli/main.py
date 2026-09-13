"""Minimal ReAct Todo CLI — tutorial version (ported from todo-mcp-app).

Read top to bottom; each numbered section explains one idea. This file is
deliberately bare: model + MCP tools + ReAct loop, nothing else.

Run with:  uv run python main.py
Swap model: OLLAMA_MODEL env var (default "qwen3.8:27b") — one knob.
"""

import asyncio
import os
from datetime import datetime

import requests

# --- 1. Imports that matter -----------------------------------------------
# langchain.agents.create_agent builds the whole ReAct loop for us (section 5).
# langchain_ollama.ChatOllama talks to your local Ollama daemon.
# mcp.* connects to our backend tool server over SSE and speaks MCP.
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from mcp import ClientSession
from mcp.client.sse import sse_client

from auth import get_or_prompt_auth

# --- 2. Config: two knobs --------------------------------------------------
# MODEL: the only thing you change to trial a bigger brain. Everything else
# in this file stays identical, which is what makes model trials fair.
# API_BASE_URL: the FastAPI backend. The MCP server (section 4) lives inside
# it at /mcp/sse; this CLI never touches the REST API directly except for the
# connectivity check below.
MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.8:27b")
API_BASE_URL = os.environ.get("TODO_API_URL", "http://localhost:8000")
MCP_SSE_URL = f"{API_BASE_URL}/mcp/sse"


# --- 3. Connectivity check --------------------------------------------------
# Fail-SOFT: warn, never crash — a dead backend explains every mysterious
# "the tool did nothing" symptom.
def check_backend() -> tuple[bool, str]:
    try:
        r = requests.get(f"{API_BASE_URL}/", timeout=3)
        if r.status_code != 200:
            return False, f"Backend responded HTTP {r.status_code} — is it running?"
        return True, "Backend connected"
    except Exception as e:
        return False, f"Backend unreachable ({e}) — start it first."


# --- 4. MCP tools -> LangChain tools ---------------------------------------
# Our tools live in backend/src/mcp_server.py as MCP tools. The agent needs
# LangChain tools, so we translate each one. Two deliberate choices here:
#   a) Auth rides in the SSE `Authorization` header, so the model never sees
#      any credential — there is no `token`/`headers` field in the schema.
#   b) Explicit nulls are dropped. Small models send {"completed": None},
#      which crashes server-side validation; omitting the key lets the
#      server's default apply instead. Real False/0/"" are kept.
async def mcp_to_langchain(session: ClientSession, mcp_tool):
    from typing import Any, Optional

    from langchain_core.tools import StructuredTool
    from pydantic import Field, create_model

    def _base_type(info: dict):
        type_map = {"string": str, "integer": int, "boolean": bool, "number": float}
        if info.get("type") in type_map:
            return type_map[info["type"]]
        for variant in info.get("anyOf", []) or []:  # Optional[X] fields
            if isinstance(variant, dict) and variant.get("type") in type_map:
                return type_map[variant["type"]]
        return Any

    schema = (
        getattr(mcp_tool, "input_schema", None)
        or getattr(mcp_tool, "inputSchema", None)
        or {}
    )
    props = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required = schema.get("required", []) if isinstance(schema, dict) else []

    fields = {}
    for name, info in props.items():
        if name in ("token", "headers"):
            continue  # (a) above
        base = _base_type(info)
        if name in required:
            fields[name] = (base, Field(description=info.get("description")))
        else:
            fields[name] = (Optional[base], Field(default=None))

    Args = create_model(f"{mcp_tool.name}Args", **fields)

    async def run(**kwargs) -> str:
        kwargs = {k: v for k, v in kwargs.items() if v is not None}  # (b) above
        res = await session.call_tool(mcp_tool.name, kwargs)
        return "\n".join(c.text for c in res.content if hasattr(c, "text"))

    return StructuredTool.from_function(
        coroutine=run, name=mcp_tool.name,
        description=mcp_tool.description or "", args_schema=Args,
    )


# --- 5. The system prompt --------------------------------------------------
# Short on purpose: small models degrade past ~150 words and parrot any
# JSON/call-syntax examples back into answers. So: prose rules, no examples.
# `today_str` is injected per turn (section 6) so relative dates never go
# stale in a long session.
def system_prompt(today_str: str) -> SystemMessage:
    weekday = datetime.strptime(today_str, "%Y-%m-%d").strftime("%A")
    return SystemMessage(content=(
        f"You are a Todo assistant. Today is {today_str} ({weekday}).\n"
        "For questions about tasks, call list_todos first; never answer "
        "from memory. To create use add_todo, to rename/reschedule/complete "
        "use update_todo, to hide use archive_todo. "
        "Use IDs from listed results, never guess one. "
        "Echo result lines exactly with their ✅/❌ marks and IDs."
    ))


# --- 6. The loop -----------------------------------------------------------
# create_agent wires a graph with two nodes that alternate until done:
#   model node  -> emits AIMessage; either plain text (FINAL answer, loop
#                  ends) or text + tool_calls (loop continues)
#   tools node  -> executes each tool_call, appends a ToolMessage per result,
#                  hands control back to the model node
# That model->tools->model cycle IS the ReAct loop ("reason" = model step,
# "act" = tool step). `recursion_limit` bounds it so a confused model spins
# at most N rounds instead of forever. History is the native message list —
# HumanMessage / AIMessage(tool_calls) / ToolMessage — persisted across turns
# untouched, which is what lets follow-ups ("archive it") resolve.
async def main() -> None:
    token = get_or_prompt_auth()  # cached JWT; prompts login on first run

    # The MCP server lives inside the backend at /mcp/sse. Auth rides in the
    # HTTP header, so tools need no credential arguments at all.
    headers = {"Authorization": f"Bearer {token}"}
    async with sse_client(MCP_SSE_URL, headers=headers) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()  # MCP handshake: hello, capabilities
            mcp_tools = (await session.list_tools()).tools
            tools = [await mcp_to_langchain(session, t) for t in mcp_tools]

            llm = ChatOllama(model=MODEL, temperature=0)  # temp 0: tools, not prose
            agent = create_agent(model=llm, tools=tools)  # the ReAct graph
            history: list = []  # native messages, carried turn to turn

            print("Minimal ReAct CLI — type 'exit' to quit.\n")
            ok, msg = check_backend()
            print(("🔌 " if ok else "⚠️ ") + msg + "\n")

            while True:
                try:
                    user_text = input("You: ").strip()
                except EOFError:
                    break  # piped stdin ended — exit cleanly, no traceback
                if not user_text or user_text.lower() in ("exit", "quit"):
                    break

                # Fresh date every turn: a session open past midnight would
                # otherwise resolve "today" to yesterday.
                messages = [
                    system_prompt(datetime.now().strftime("%Y-%m-%d")),
                    *history,
                    HumanMessage(content=user_text),
                ]
                n_before = len(messages)
                try:
                    # One graph run = the full reason/act loop for this turn.
                    result = await agent.ainvoke(
                        {"messages": messages}, config={"recursion_limit": 25}
                    )
                except Exception as e:
                    print(f"Assistant: that turn failed ({e}). Try rephrasing.\n")
                    continue

                fresh = result["messages"][n_before:]  # only this turn's nodes
                for m in fresh:  # narrate what the loop did
                    for tc in getattr(m, "tool_calls", None) or []:
                        print(f"🔧 Calling {tc.get('name')} {tc.get('args') or ''}")
                text = (getattr(fresh[-1], "content", "") or "").strip()
                print(f"Assistant: {text or '…no reply…'}\n")
                history = result["messages"][1:]  # drop per-turn system prompt


if __name__ == "__main__":
    asyncio.run(main())
