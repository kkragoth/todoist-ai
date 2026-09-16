"""Browser login + consent page for the MCP OAuth flow.

opencode's ``mcp auth`` opens the provider's ``/authorize`` URL, which
redirects here. The user enters their todoist-ai username/password (the same
account created via ``POST /auth/register``), the pending authorization is
approved, and the browser bounces back to the MCP client's ``redirect_uri``
with an authorization code (PKCE is verified later at ``/token`` by the SDK).

Plain inline HTML on purpose: no frontend build step, no extra deps.
"""

import html

from fastapi import APIRouter, Form
from fastapi.responses import HTMLResponse, RedirectResponse

from auth.models import User
from auth.utils.security import verify_password
from core.database import SessionLocal

router = APIRouter(tags=["OAuth Login"])


def _login_page(
    request_id: str,
    client_id: str,
    scopes: list[str],
    error: str | None = None,
) -> str:
    safe_client = html.escape(client_id)
    safe_request = html.escape(request_id)
    safe_scopes = html.escape(" ".join(scopes) or "(default access)")
    safe_error = f"<p class=error>{html.escape(error)}</p>" if error else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize {safe_client} — Todoist AI</title>
<style>
body {{ font-family: system-ui, sans-serif; background: #111; color: #eee;
  display: flex; justify-content: center; padding: 48px 16px; margin: 0; }}
main {{ max-width: 380px; width: 100%; }}
.card {{ background: #1c1c1c; border: 1px solid #333; border-radius: 12px;
  padding: 24px; }}
h1 {{ font-size: 20px; margin: 0 0 4px; }}
p {{ color: #bbb; font-size: 14px; }}
label {{ display: block; font-size: 13px; margin: 12px 0 4px; color: #ccc; }}
input {{ width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px;
  border: 1px solid #444; background: #111; color: #eee; font-size: 15px; }}
button {{ width: 100%; margin-top: 18px; padding: 12px; border: 0;
  border-radius: 8px; background: #4f7cff; color: #fff; font-size: 15px;
  cursor: pointer; }}
button:hover {{ background: #3d68e0; }}
.error {{ color: #ff7b7b; }}
code {{ color: #9db8ff; }}
</style>
</head>
<body>
<main class="card">
<h1>Authorize <code>{safe_client}</code>?</h1>
<p>This MCP client requests access to your todos
(scopes: <code>{safe_scopes}</code>). Log in with your Todoist AI account to
approve — register first via <code>POST /auth/register</code> if needed.</p>
{safe_error}
<form method="post" action="/oauth/login">
<input type="hidden" name="request_id" value="{safe_request}">
<label for="username">Username</label>
<input id="username" name="username" autocomplete="username" required>
<label for="password">Password</label>
<input id="password" name="password" type="password"
  autocomplete="current-password" required>
<button type="submit">Log in &amp; authorize</button>
</form>
</main>
</body>
</html>"""


def _expired_page() -> HTMLResponse:
    return HTMLResponse(
        "<h1>Login request expired</h1>"
        "<p>Restart the flow: run <code>opencode mcp auth todoist-ai</code> "
        "again.</p>",
        status_code=400,
    )


@router.get("/oauth/login", response_class=HTMLResponse)
def login_form(request_id: str):
    from mcp_server.oauth import get_oauth_provider

    pending = get_oauth_provider().peek_pending_login(request_id)
    if pending is None:
        return _expired_page()
    params = pending["params"]
    return _login_page(request_id, pending["client_id"], list(params.scopes or []))


@router.post("/oauth/login")
async def login_submit(
    request_id: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
):
    from mcp_server.oauth import get_oauth_provider

    provider = get_oauth_provider()
    pending = provider.peek_pending_login(request_id)
    if pending is None:
        return _expired_page()

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if user is not None:
            db.expunge(user)

    params = pending["params"]
    if user is None or not verify_password(password, user.hashed_password):
        return HTMLResponse(
            _login_page(
                request_id,
                pending["client_id"],
                list(params.scopes or []),
                error="Incorrect username or password.",
            ),
            status_code=401,
        )

    redirect_url = await provider.approve_pending_login(request_id, user.username)
    return RedirectResponse(url=redirect_url, status_code=303)
