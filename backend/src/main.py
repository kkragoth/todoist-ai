from fastapi import FastAPI

from auth.router import router as auth_router
from core.database import Base, engine, ensure_schema
from todo.router import router as todo_router
from mcp_server import mcp

Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(title="Todoist AI")

app.mount("/mcp", mcp.http_app(transport="sse"))
app.include_router(auth_router)
app.include_router(todo_router)


@app.get("/")
def health_check():
    return {"status": "ok"}

