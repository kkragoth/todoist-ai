"""Database engine/session. Postgres by default, sqlite fallback for tests.

Reads DATABASE_URL from the environment (loaded from backend/.env when
present). Accepts both `postgres://` and `postgresql://` schemes and
normalizes to SQLAlchemy's `postgresql+psycopg://` dialect.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./todos.db")


def _normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


SQLALCHEMY_DATABASE_URL = _normalize_url(DATABASE_URL)
IS_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
        pool_timeout=int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "30")),
        connect_args={
            "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5")),
        },
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema():
    """Create missing tables/columns (dev convenience, not a full migration).

    `create_all` only creates missing tables, never adds columns, so the
    `archived` column added after the first release needs an explicit
    ALTER on pre-existing databases. Safe to run repeatedly on both
    sqlite and postgres; no-ops when the column already exists.
    """
    from todo import models as _todo_models  # noqa: F401
    from auth import models as _auth_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    try:
        cols = {c["name"] for c in inspect(engine).get_columns("todos")}
    except Exception:
        return
    if "archived" not in cols:
        alter = (
            "ALTER TABLE todos ADD COLUMN archived BOOLEAN DEFAULT 0"
            if IS_SQLITE
            else "ALTER TABLE todos ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE"
        )
        with engine.begin() as conn:
            conn.execute(text(alter))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
