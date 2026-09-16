"""Auth helper for MCP tools.

Primary identity is the OAuth access token FastMCP verified for this
request (see ``mcp_server/oauth.py``) — the model never sees or supplies
credentials. Legacy ``Authorization: Bearer`` JWTs from ``POST
/auth/token`` keep working as a fallback (same signing key), so the CLI
``--mcp-direct`` mode and old static-header configs are unaffected.

Every tool resolves the current user once per request and only touches
that user's rows.

Note on "once per request": the MCP server runs stateless
(`stateless_http=True`), so one HTTP request already equals one tool /
resource call — there is no cross-call request scope to hoist the DB
lookup into. A middleware that resolved eagerly would still hit the DB
once per call, and raising there would turn the model-visible
`"Error: ..."` strings into protocol errors, so resolution stays a
plain per-call helper. What is shared is the decode path itself
(`auth.utils.security.decode_access_token`), not a second copy of it.
"""

from auth.models import User
from auth.utils import security
from core.database import SessionLocal


def _bearer_token(headers: dict[str, str] | None) -> str | None:
    """Case-insensitive Authorization lookup (proxies may change case)."""
    if not headers:
        return None
    auth_header = ""
    for key, value in headers.items():
        if key.lower() == "authorization":
            auth_header = value or ""
            break
    if not auth_header.lower().startswith("bearer "):
        return None
    return auth_header[7:].strip() or None


def _load_user_by_subject(subject: object) -> User | None:
    """Load a user by token subject (new id tokens or legacy username)."""
    with SessionLocal() as db:
        user = security.resolve_user_from_token_payload(db, subject)
        # Detach before the session closes so callers can use scalar attrs.
        if user is not None:
            db.expunge(user)
        return user


def resolve_user_from_headers(headers: dict[str, str] | None) -> User:
    """Resolve the JWT user from request headers. Raises ValueError if bad."""
    token = _bearer_token(headers)
    if not token:
        raise ValueError("Missing Authorization header — log in first.")
    try:
        payload = security.decode_access_token(token)
        subject: object = payload.get("sub")
    except Exception:
        raise ValueError("Invalid or expired token — log in again.")
    user = _load_user_by_subject(subject)
    if not user:
        raise ValueError("Invalid token — log in again.")
    return user


def resolve_user(headers: dict | None = None) -> User:
    """Resolve the current user: OAuth token first, header JWT fallback."""
    try:
        from fastmcp.server.dependencies import get_access_token
    except Exception:
        return resolve_user_from_headers(headers or {})
    try:
        token = get_access_token()
    except Exception:
        token = None
    if token is not None:
        subject = token.subject or (token.claims or {}).get("sub")
        if subject:
            user = _load_user_by_subject(subject)
            if user:
                return user
    return resolve_user_from_headers(headers or {})
