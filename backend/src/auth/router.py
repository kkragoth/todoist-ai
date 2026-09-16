import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from core.database import get_db

from . import schemas
from .models import User
from .utils import security
from .utils.security import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

# Tiny in-memory brute-force guard (per-process). Production behind
# multiple workers needs Redis, but this stops single-process hammering
# without a new dependency.
_LOGIN_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
_RATE_LIMIT = 20
_RATE_WINDOW_SECONDS = 60.0


def _check_login_rate_limit(key: str) -> None:
    now = time.monotonic()
    attempts = _LOGIN_ATTEMPTS[key]
    while attempts and now - attempts[0] > _RATE_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    attempts.append(now)


@router.post("/register", status_code=201)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    if len(user_data.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    existing = db.query(User).filter(User.username == user_data.username).first()

    if existing:
        raise HTTPException(status_code=409, detail="Username taken")

    try:
        hashed = security.hash_password(user_data.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    user = User(
        username=user_data.username,
        hashed_password=hashed,
    )

    db.add(user)
    db.commit()

    return {"message": "User registered successfully"}


@router.post("/token")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    client_key = request.client.host if request.client else "unknown"
    _check_login_rate_limit(f"login:{client_key}:{form_data.username}")
    user = db.query(User).filter(User.username == form_data.username).first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect credentials")

    token = security.create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
