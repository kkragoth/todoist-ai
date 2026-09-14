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

app = FastAPI(title="Todoist AI")

app.mount("/mcp", mcp.http_app(transport="sse"))
app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(chat_router)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}

