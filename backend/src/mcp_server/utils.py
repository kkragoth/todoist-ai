"""Auth helper for MCP tools.

Auth comes from the HTTP Authorization header (Bearer JWT) — the model
never sees or supplies credentials. Every tool resolves the current
user with resolve_user_from_headers and only touches that user's rows.
"""

import jwt

from auth.models import User
from auth.utils.security import ALGORITHM, SECRET_KEY
from core.database import SessionLocal


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
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
    finally:
        db.close()
    if not user:
        raise ValueError("User not found — register first.")
    return user
