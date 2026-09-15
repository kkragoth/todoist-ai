from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from core.database import get_db
from core.settings import get_settings

_settings = get_settings()

SECRET_KEY = _settings.secret_key
ALGORITHM = _settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = _settings.access_token_expire_minutes

pw_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def hash_password(password: str) -> str:
    return pw_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pw_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> dict:
    """Decode a JWT access token into its claims.

    Single decode path shared by the HTTP auth dependency and the MCP
    server, so both reject expired/forged tokens identically. Raises
    `jwt.PyJWTError` (or KeyError-free dict) on bad tokens; callers map
    failures to their own transport error shape.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from auth.models import User
    try:
        payload = decode_access_token(token)
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_query_user(token: str, db: Session = Depends(get_db)):
    """Same check as get_current_user, but the token comes from `?token=`.

    Needed for SSE/EventSource clients, which can't set an Authorization
    header. Reuses the header validation so both paths stay in sync.
    """
    return get_current_user(token=token, db=db)