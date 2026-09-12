from fastapi import FastAPI

from auth.router import router as auth_router
from core.database import Base, engine, ensure_schema
from todo.router import router as todo_router

app = FastAPI(title="Todoist AI")

Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(title="Modular Todo App with MCP")

app.include_router(auth_router)
app.include_router(todo_router)

@app.get("/")
def health_check():
    return {"status": "ok"}