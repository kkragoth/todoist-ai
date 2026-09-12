from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./todos.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def ensure_schema():
    """Lightweight migration for existing sqlite DBs: create_all only creates
    missing tables, it never adds columns. Add any missing columns here."""
    existing = {c["name"] for c in inspect(engine).get_columns("todos")}
    if "archived" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE todos ADD COLUMN archived BOOLEAN DEFAULT 0"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()