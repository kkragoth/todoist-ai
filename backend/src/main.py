from fastapi import FastAPI

import auth.models  # noqa: F401 - register tables before create_all
import chat.models  # noqa: F401
import todo.models  # noqa: F401
from auth.router import router as auth_router
from chat.router import router as chat_router
from core.database import ensure_schema
from todo.router import router as todo_router
from mcp_server import mcp, oauth_provider
from mcp_server.login_router import router as oauth_login_router

ensure_schema()

# Streamable HTTP (current MCP spec; SSE transport is deprecated).
# path="/" because the app is mounted at /mcp, so the endpoint is POST /mcp/.
# Stateless: every request carries its own Authorization header, no session resume needed.
# lifespan=mcp_app.lifespan: FastMCP's session manager only starts when the
# parent app runs its lifespan (required when mounting into FastAPI/Starlette).
mcp_app = mcp.http_app(path="/", transport="streamable-http", stateless_http=True)

app = FastAPI(title="Todoist AI", lifespan=mcp_app.lifespan)

# OAuth discovery + operational routes at the backend root.
#
# The provider advertises root URLs (base_url has no /mcp path, so metadata
# and authorize/token/register endpoints live at e.g. /authorize and
# /.well-known/oauth-authorization-server). The copies inside mcp_app sit
# under /mcp/* and are unused by clients; mirroring here is what makes
# `opencode mcp auth` discovery succeed (RFC 8414 / RFC 9728 require the
# well-known documents at the root).
for well_known_route in oauth_provider.get_well_known_routes(mcp_path="/"):
    app.routes.append(well_known_route)
for oauth_route in oauth_provider.get_routes(mcp_path="/"):
    if not oauth_route.path.startswith("/.well-known/"):
        app.routes.append(oauth_route)

app.mount("/mcp", mcp_app)
app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(chat_router)
app.include_router(oauth_login_router)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}
