from fastapi import FastAPI

import auth.models  # noqa: F401 - register tables before create_all
import chat.models  # noqa: F401
import todo.models  # noqa: F401
from auth.router import router as auth_router
from chat.router import router as chat_router
from core.database import ensure_schema
from todo.router import router as todo_router
from mcp_server import mcp

ensure_schema()

# Streamable HTTP (current MCP spec; SSE transport is deprecated).
# path="/" because the app is mounted at /mcp, so the endpoint is POST /mcp/.
# Stateless: every request carries its own Authorization header, no session resume needed.
# lifespan=mcp_app.lifespan: FastMCP's session manager only starts when the
# parent app runs its lifespan (required when mounting into FastAPI/Starlette).
mcp_app = mcp.http_app(path="/", transport="streamable-http", stateless_http=True)

app = FastAPI(title="Todoist AI", lifespan=mcp_app.lifespan)

app.mount("/mcp", mcp_app)
app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(chat_router)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}

