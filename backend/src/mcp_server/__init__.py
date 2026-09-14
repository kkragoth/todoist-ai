"""Authenticated Todo MCP server.

Importing this package creates the FastMCP instance and registers the
tools (side-effect import below). `main.py` mounts it with
`app.mount("/mcp", mcp.http_app(transport="sse"))`.
"""

from mcp_server.server import mcp
from mcp_server import tools  # noqa: F401 - registration side effect

__all__ = ["mcp"]
