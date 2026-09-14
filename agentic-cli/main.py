"""Minimal ReAct Todo CLI — tutorial version (ported from todo-mcp-app).

Read top to bottom; each numbered section explains one idea. This file is
deliberately bare: model + MCP tools + ReAct loop, nothing else.

Run with:  uv run python main.py
Swap model: OLLAMA_MODEL env var (default "local-qwen") — one knob.
Use llama.cpp: LLM_BACKEND=llamacpp LLAMACPP_URL=http://localhost:8080/v1
  LLAMACPP_MODEL=<served-model-name> uv run python main.py
Output streams token-by-token via agent.astream (no silent waits).
"""

import asyncio
import os
import sys
from datetime import datetime

import requests

# --- 1. Imports that matter -----------------------------------------------
# langchain.agents.create_agent builds the whole ReAct loop for us (section 5).
# The chat model is built lazily in make_llm (section 2): ChatOllama for
# Ollama, ChatOpenAI pointed at llama.cpp's OpenAI-compatible /v1 endpoint.
# mcp.* connects to our backend tool server over SSE and speaks MCP.
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, SystemMessage
from mcp import ClientSession
from mcp.client.sse import sse_client

from auth import clear_stored_token, fetch_me, get_or_prompt_auth
from utils import TurnSpinner, text_delta

# --- 2. Config: three knobs -------------------------------------------------
# MODEL: the only thing you change to trial a bigger brain (Ollama path).
# LLM_BACKEND: "ollama" (default) or "llamacpp" (OpenAI-compatible server).
#   llama.cpp exposes OpenAI API at <host>:<port>/v1, so we talk to it with
#   ChatOpenAI pointed at LLAMACPP_URL. Model name is whatever you served
#   with `llama serve -m <file.gguf>` (server mostly ignores it, but the
#   client still has to send something).
# API_BASE_URL: the FastAPI backend. The MCP server (section 4) lives inside
# it at /mcp/sse; this CLI never touches the REST API directly except for the
# connectivity check below.
# MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.8:27b")
MODEL = os.environ.get("OLLAMA_MODEL", "local-qwen")
LLM_BACKEND = os.environ.get("LLM_BACKEND", "ollama").lower()
LLAMACPP_URL = os.environ.get("LLAMACPP_URL", "http://localhost:8080/v1")
LLAMACPP_MODEL = os.environ.get("LLAMACPP_MODEL", "local-model")
API_BASE_URL = os.environ.get("TODO_API_URL", "http://localhost:8000")
MCP_SSE_URL = f"{API_BASE_URL}/mcp/sse"


def make_llm():
    """Build the chat model for the selected backend. Streaming is enabled
    so agent.astream yields tokens live instead of blocking on ainvoke."""
    if LLM_BACKEND == "llamacpp":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url=LLAMACPP_URL,
            api_key=os.environ.get("LLAMACPP_API_KEY", "sk-no-key"),
            model=LLAMACPP_MODEL,
            temperature=0,
            streaming=True,
        )
    from langchain_ollama import ChatOllama

    return ChatOllama(model=MODEL, temperature=0)


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
# That model->tools->model cycle IS the ReAct loop. `recursion_limit`
# bounds it so a confused model spins at most N rounds instead of forever.
# History is the native message list, persisted across turns untouched,
# which is what lets follow-ups ("archive it") resolve.
#
# Streaming: agent.astream(stream_mode=["messages", "updates"]).
# "messages" yields LLM chunks token-by-token; "updates" yields per-node
# full messages so tool calls are announced live. Display helpers
# (spinner, text_delta) live in utils/ — see utils/spinner.py and
# utils/formatting.py.


async def main() -> None:
    # Auth first: reuse the saved JWT only if GET /auth/me accepts it,
    # otherwise loop back to the login/register prompt.
    token = get_or_prompt_auth()
    profile = fetch_me(token)
    while not profile:
        print("\n⚠️  Session rejected by /auth/me — please log in again.")
        clear_stored_token()
        token = get_or_prompt_auth()
        profile = fetch_me(token)
    print(f"👤 Signed in as {profile.get('username')}\n")

    # The MCP server lives inside the backend at /mcp/sse. Auth rides in the
    # HTTP header, so tools need no credential arguments at all.
    headers = {"Authorization": f"Bearer {token}"}
    async with sse_client(MCP_SSE_URL, headers=headers) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()  # MCP handshake: hello, capabilities
            mcp_tools = (await session.list_tools()).tools
            tools = [await mcp_to_langchain(session, t) for t in mcp_tools]

            llm = make_llm()  # temp 0 inside: tools, not prose
            agent = create_agent(model=llm, tools=tools)  # the ReAct graph
            history: list = []  # native messages, carried turn to turn

            backend_label = (
                f"{LLM_BACKEND}:{LLAMACPP_MODEL} @ {LLAMACPP_URL}"
                if LLM_BACKEND == "llamacpp"
                else f"ollama:{MODEL}"
            )
            print(f"Minimal ReAct CLI [{backend_label}] — type 'exit' to quit.\n")
            ok, msg = check_backend()
            print(("🔌 " if ok else "⚠️ ") + msg + "\n")

            while True:
                try:
                    user_text = input("You: ").strip()
                except EOFError:
                    break  # piped stdin ended / Ctrl-D — exit cleanly
                except KeyboardInterrupt:
                    print("", flush=True)
                    continue
                if not user_text or user_text.lower() in ("exit", "quit"):
                    break

                # Fresh date every turn: a session open past midnight would
                # otherwise resolve "today" to yesterday.
                messages = [
                    system_prompt(datetime.now().strftime("%Y-%m-%d")),
                    *history,
                    HumanMessage(content=user_text),
                ]
                try:
                    # One graph run = the full reason/act loop for this turn,
                    # streamed: tokens print as they arrive, tool calls are
                    # announced the moment the model requests them. The
                    # spinner runs until the turn finishes, hiding whenever
                    # real output prints and reappearing during idle gaps
                    # (thinking, tool execution).
                    fresh: list = []
                    seen_tool_ids: set = set()
                    started = False
                    spinner = TurnSpinner(enabled=sys.stdout.isatty())
                    spinner.start()

                    async def begin_output() -> None:
                        """Clear the spinner (if visible) and print the prefix once."""
                        nonlocal started
                        await spinner.clear_for_output()
                        if started:
                            return
                        started = True
                        print("Assistant: ", end="", flush=True)

                    async def announce(tc) -> None:
                        key = tc.get("id") or (
                            tc.get("name"), str(tc.get("args") or "")
                        )
                        if key in seen_tool_ids:
                            return
                        seen_tool_ids.add(key)
                        await spinner.clear_for_output()
                        if not started:
                            await begin_output()
                        else:
                            print("", flush=True)
                        print(
                            f"🔧 Calling {tc.get('name')} "
                            f"{tc.get('args') or ''}",
                            flush=True,
                        )
                        spinner.set_label(f"Running {tc.get('name')}…")

                    async for mode, data in agent.astream(
                        {"messages": messages},
                        config={"recursion_limit": 25},
                        stream_mode=["messages", "updates"],
                    ):
                        if mode == "messages":
                            chunk, _meta = data
                            delta = text_delta(getattr(chunk, "content", ""))
                            if delta:
                                await begin_output()
                                print(delta, end="", flush=True)
                                spinner.set_label("Thinking…")
                            for tc in getattr(chunk, "tool_calls", None) or []:
                                await announce(tc)
                        elif mode == "updates":
                            for _node, update in (data or {}).items():
                                upd = update.get("messages") if isinstance(
                                    update, dict
                                ) else None
                                if not upd:
                                    continue
                                msgs = upd if isinstance(upd, list) else [upd]
                                for m in msgs:
                                    # Tool finished -> back to thinking.
                                    if m.__class__.__name__ == "ToolMessage":
                                        spinner.set_label("Thinking…")
                                    for tc in getattr(m, "tool_calls", None) or []:
                                        await announce(tc)
                                fresh.extend(msgs)
                    # Turn done: stop the spinner before the final newline so
                    # no spinner frame leaks into the transcript.
                    await spinner.stop()
                    if not started:
                        print("Assistant: ", end="", flush=True)
                    print("", flush=True)  # end the streamed line
                except Exception as e:
                    try:
                        await spinner.stop()
                    except Exception:
                        pass
                    print(f"\nthat turn failed ({e}). Try rephrasing.\n")
                    continue

                if not fresh:
                    print("(no reply — empty turn)\n")
                    continue
                history = [*messages, *fresh][1:]  # drop per-turn system prompt
                print("", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
