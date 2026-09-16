from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from core.database import get_db
from core.settings import get_settings

_settings = get_settings()

DEFAULT_SECRET_KEY = "SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION"
SECRET_KEY = _settings.secret_key
ALGORITHM = _settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = _settings.access_token_expire_minutes

# bcrypt truncates past 72 bytes — reject long passwords instead of
# silently weakening them.
MAX_PASSWORD_BYTES = 72


def ensure_secret_configured() -> None:
    """Crash at startup when SECRET_KEY is still the shipped default.

    Dev/bare-metal runs may opt out with ALLOW_DEFAULT_SECRET=1; every
    other env must set SECRET_KEY.
    """
    import os

    if SECRET_KEY == DEFAULT_SECRET_KEY and os.getenv("ALLOW_DEFAULT_SECRET") != "1":
        raise RuntimeError(
            "SECRET_KEY is the default value. Set SECRET_KEY in the environment."
        )

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Backward-compat alias.
pw_context = password_context
oauth2_bearer_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")
# Backward-compat alias.
oauth2_scheme = oauth2_bearer_scheme


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode a JWT access token into its claims.

    Single decode path shared by the HTTP auth dependency and the MCP
    server, so both reject expired/forged tokens identically. Raises
    `jwt.PyJWTError` on bad tokens; callers map failures to their own
    transport error shape.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def resolve_user_from_token_payload(db: Session, subject: object):
    """Stable lookup for `sub`: new tokens carry user id, old carry username."""
    from auth.models import User

    if subject is None or subject == "":
        return None
    try:
        wanted_id = int(str(subject))
    except (TypeError, ValueError):
        wanted_id = None
    if wanted_id is not None:
        user = db.query(User).filter(User.id == wanted_id).first()
        if user is not None:
            return user
    if isinstance(subject, str):
        return db.query(User).filter(User.username == subject).first()
    return None


def get_current_user(
    token: str = Depends(oauth2_bearer_scheme), db: Session = Depends(get_db)
):
    try:
        payload = decode_access_token(token)
        subject: object = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = resolve_user_from_token_payload(db, subject)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def get_query_user(token: str = Query(...), db: Session = Depends(get_db)):
    """Same check as get_current_user, but the token comes from `?token=`.

    Needed for SSE/EventSource clients, which can't set an Authorization
    header. Reuses the header validation so both paths stay in sync.
    """
    return get_current_user(token=token, db=db)
