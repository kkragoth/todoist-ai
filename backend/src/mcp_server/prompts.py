"""Todo MCP prompts (reusable workflow starters).

Small, opinionated starting points MCP clients can fetch via
`prompts/list` + `prompts/get` and hand to their model. They carry no
credentials and touch no data — the model still calls tools/resources
to do the work.
"""

from mcp_server.server import mcp


@mcp.prompt(
    name="triage_todos",
    description="Review the todo list: flag overdue items and suggest what to do first.",
)
def triage_todos() -> str:
    """Prompt that starts a triage pass over the user's todos."""
    return (
        "Triage my todos. First read the todo://todos resource (or call "
        "list_todos_structured for filtered views). Then: 1) flag overdue "
        "open tasks, 2) suggest which 3 tasks to do first and why, "
        "3) ask before archiving or deleting anything."
    )


@mcp.prompt(
    name="plan_day",
    description="Plan a day: list that day's todos and propose an order.",
)
def plan_day(target_date: str = "today") -> str:
    """Prompt that starts a day-planning pass for one date.

    Args:
        target_date: One day as YYYY-MM-DD, or 'today'.
    """
    return (
        f"Plan my day for {target_date}. List the todos for that day "
        "(list_todos_structured with target_date, or the todo://todos "
        "resource filtered by date). Then propose an order to do them in, "
        "keeping it to one short sentence per task. Ask before changing anything."
    )
