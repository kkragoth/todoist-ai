"""Formatting helpers for streamed LLM output."""


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
