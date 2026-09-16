"""Database engine/session. Postgres by default, sqlite fallback for tests.

Reads DATABASE_URL from the environment (loaded from backend/.env when
present). Accepts both `postgres://` and `postgresql://` schemes and
normalizes to SQLAlchemy's `postgresql+psycopg://` dialect.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from core.settings import get_settings

_settings = get_settings()

DATABASE_URL = _settings.database_url


def _normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
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
        pool_size=_settings.db_pool_size,
        max_overflow=_settings.db_max_overflow,
        pool_timeout=_settings.db_pool_timeout_seconds,
        pool_recycle=1800,
        connect_args={
            "connect_timeout": _settings.db_connect_timeout_seconds,
        },
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema() -> None:
    """Create missing tables/columns (dev convenience, not a full migration).

    `create_all` only creates missing tables, never adds columns, so the
    `archived` column added after the first release needs an explicit
    ALTER on pre-existing databases. Safe to run repeatedly on both
    sqlite and postgres; no-ops when the column already exists.
    """
    from auth import models as auth_models  # noqa: F401 - register tables
    from todo import models as todo_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    try:
        cols = {col["name"] for col in inspect(engine).get_columns("todos")}
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
    else:
        # Backfill legacy NULLs from before the column had a default.
        with engine.begin() as conn:
            conn.execute(text("UPDATE todos SET archived = FALSE WHERE archived IS NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
