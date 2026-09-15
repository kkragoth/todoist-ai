"""Todo MCP resources (user-scoped reads).

URI-addressable counterparts to the tools in tools.py: mutations stay
tools, reads are also exposed as resources so MCP clients can
`resources/list` + `resources/read` without calling a tool:

- `todo://todos` — the authenticated user's todo list as JSON
  (same shape as the `list_todos_structured` tool result).
- `todo://todos/{todo_id}` — one todo as JSON, or an error object
  when the id is unknown (or belongs to another user).

Auth is the same Bearer JWT as the tools: the model never sees
credentials, every read resolves the user from request headers.
"""

from fastmcp.dependencies import CurrentHeaders

from mcp_server.server import mcp
from mcp_server.utils import resolve_user_from_headers
from todo import service as todo_service


@mcp.resource(
    "todo://todos",
    name="todos",
    description="Authenticated user's todo list as JSON ({open, done, todos}).",
    mime_type="application/json",
)
def read_todos(headers: dict = CurrentHeaders()) -> dict:
    """Read the full todo list for the authenticated user."""
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return {"error": str(e), "open": 0, "done": 0, "todos": []}
    todos = todo_service.query_todos(user.id)
    return todo_service.to_todo_list_out(todos).model_dump(mode="json")


@mcp.resource(
    "todo://todos/{todo_id}",
    name="todo",
    description="One todo as JSON by id ({id, task, completed, ...}).",
    mime_type="application/json",
)
def read_todo(todo_id: int, headers: dict = CurrentHeaders()) -> dict:
    """Read a single todo by id for the authenticated user."""
    try:
        user = resolve_user_from_headers(headers)
    except ValueError as e:
        return {"error": str(e)}
    todo = todo_service.get_todo(user.id, todo_id)
    if todo is None:
        return {"error": f"Todo #{todo_id} not found."}
    return todo_service.to_todo_list_out([todo]).todos[0].model_dump(mode="json")
