"""FastMCP instance. Tools/resources/prompts live in their own modules
and register themselves on this instance via decorators. Imported (not
defined) here by those modules, so this file stays dependency-free and
import-cycle safe."""

from fastmcp import FastMCP

from mcp_server.oauth import get_oauth_provider

oauth_provider = get_oauth_provider()
mcp = FastMCP("Todoist AI MCP", auth=oauth_provider)
