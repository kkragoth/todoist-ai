"""Auth helper for MCP tools.

Primary identity is the OAuth access token FastMCP verified for this
request (see ``mcp_server/oauth.py``) — the model never sees or supplies
credentials. Legacy ``Authorization: Bearer`` JWTs from ``POST
/auth/token`` keep working as a fallback (same signing key), so the CLI
``--mcp-direct`` mode and old static-header configs are unaffected.

Every tool resolves the current user with resolve_user and only touches
that user's rows.
"""

import jwt

from auth.models import User
from auth.utils.security import ALGORITHM, SECRET_KEY
from core.database import SessionLocal


def _load_user(username: str) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
    finally:
        db.close()
    if not user:
        raise ValueError("User not found — register first.")
    return user


def resolve_user_from_headers(headers: dict) -> User:
    """Resolve the JWT user from request headers. Raises ValueError if bad."""
    auth = (headers or {}).get("authorization", "")
    if not auth.startswith("Bearer "):
        raise ValueError("Missing Authorization header — log in first.")
    token = auth[len("Bearer ") :].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
    except Exception:
        raise ValueError("Invalid or expired token — log in again.")
    if not username:
        raise ValueError("Invalid token — log in again.")
    return _load_user(username)


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
        username = token.subject or (token.claims or {}).get("sub")
        if username:
            return _load_user(username)
    return resolve_user_from_headers(headers or {})
