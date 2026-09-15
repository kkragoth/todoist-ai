"""Authenticated Todo MCP server.

Importing this package creates the FastMCP instance and registers the
tools, resources, and prompts (side-effect imports below). `main.py`
mounts it with `app.mount("/mcp", mcp.http_app(path="/",
transport="streamable-http", stateless_http=True))` so the Streamable
HTTP endpoint lives at `POST /mcp/`.

Note on scope: the chat agent calls `todo.service` in-process (same
domain service, not LLM-over-MCP). This MCP server is a parallel
interface to that service for external MCP clients.
"""

from mcp_server.server import mcp
from mcp_server import prompts, resources, tools  # noqa: F401 - registration side effects

__all__ = ["mcp"]
