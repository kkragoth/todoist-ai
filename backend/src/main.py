from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

import auth.models  # noqa: F401 - register tables before create_all
import chat.models  # noqa: F401
import todo.models  # noqa: F401
from auth.router import router as auth_router
from auth.utils.security import ensure_secret_configured
from chat.router import router as chat_router
from core.database import ensure_schema
from core.settings import get_settings
from todo.router import router as todo_router
from mcp_server import mcp

# Streamable HTTP (current MCP spec; SSE transport is deprecated).
# path="/" because the app is mounted at /mcp, so the endpoint is POST /mcp/.
# Stateless: every request carries its own Authorization header, no session resume needed.
mcp_app = mcp.http_app(path="/", transport="streamable-http", stateless_http=True)


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    # Fail fast on default SECRET_KEY (dev may set ALLOW_DEFAULT_SECRET=1).
    ensure_secret_configured()
    # Dev convenience: create missing tables/columns. Production also runs
    # the migrator job (see justfile db-migrate); this is a no-op when done.
    if get_settings().database_url:
        ensure_schema()
    async with mcp_app.lifespan(app):
        yield


app = FastAPI(title="Todoist AI", lifespan=app_lifespan)

_settings = get_settings()
_origins = [origin.strip() for origin in _settings.frontend_origins.split(",") if origin.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

app.mount("/mcp", mcp_app)
app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(chat_router)


def health_status() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def health_check():
    return health_status()


@app.get("/health")
def health():
    return health_status()
