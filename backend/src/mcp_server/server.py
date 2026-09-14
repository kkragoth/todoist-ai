"""FastMCP instance. Tools live in tools.py and register themselves on
this instance via @mcp.tool(). Imported (not defined) here by tools.py,
so this module stays dependency-free and import-cycle safe."""

from fastmcp import FastMCP

mcp = FastMCP("Todoist AI MCP")
