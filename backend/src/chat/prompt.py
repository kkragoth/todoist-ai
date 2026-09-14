"""System prompt. Cache-friendly by construction: the static instruction
block is byte-stable across turns, and the dynamic date line goes LAST
so provider-side prefix caching (Anthropic/OpenAI/OpenRouter, and any
Ollama prefix reuse) keeps hitting on the long static prefix.

Rule of thumb applied here: static instructions first, dynamic values
(`today_str`) appended at the end, never interpolated mid-prompt.
`today_str` is still injected per turn so relative dates never go stale
in a long session — it just lives in the final line, after a separator."""

from datetime import datetime

from langchain_core.messages import SystemMessage

STATIC_INSTRUCTIONS = (
    "You are a Todo assistant.\n"
    "For questions about tasks, call list_todos first; never answer "
    "from memory. To create use add_todo, to rename/reschedule/complete "
    "use update_todo, to hide use archive_todo. "
    "Use IDs from listed results, never guess one. "
    "Echo result lines exactly with their ✅/❌ marks and IDs."
)


def DYNAMIC_INSTRUCTIONS(today_str: str) -> str:
    """Dynamic prompt suffix. Takes the date, returns the closing lines.

    Kept as a separate callable (and rendered LAST) so the static block
    above stays byte-stable for prefix caching.
    """
    weekday = datetime.strptime(today_str, "%Y-%m-%d").strftime("%A")
    return f"---\nToday is {today_str} ({weekday})."


def system_prompt(today_str: str) -> SystemMessage:
    return SystemMessage(
        content=f"{STATIC_INSTRUCTIONS}\n{DYNAMIC_INSTRUCTIONS(today_str)}"
    )
