from fastmcp import FastMCP
from fastmcp.dependencies import CurrentHeaders
from fastapi.security import HTTPAuthorizationCredentials

mcp = FastMCP("Todoist AI MCP")

@mcp.tool()
def get_user_todos(headers: dict = CurrentHeaders()) -> list[str]:
    return ["hello"]
