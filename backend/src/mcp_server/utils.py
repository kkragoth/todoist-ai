"""Auth helper for MCP tools.

Auth comes from the HTTP Authorization header (Bearer JWT) — the model
never sees or supplies credentials. Every tool resolves the current
user once per request with resolve_user_from_headers and only touches
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


def resolve_user_from_headers(headers: dict) -> User:
    """Resolve the JWT user from request headers. Raises ValueError if bad."""
    auth = (headers or {}).get("authorization", "")
    if not auth.startswith("Bearer "):
        raise ValueError("Missing Authorization header — log in first.")
    token = auth[len("Bearer ") :].strip()
    try:
        payload = security.decode_access_token(token)
        username: str | None = payload.get("sub")
    except Exception:
        raise ValueError("Invalid or expired token — log in again.")
    if not username:
        raise ValueError("Invalid token — log in again.")
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
    if not user:
        raise ValueError("User not found — register first.")
    return user
