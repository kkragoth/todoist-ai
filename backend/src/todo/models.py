from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from core.database import Base


class Todo(Base):
    __tablename__ = "todos"
    __table_args__ = (
        Index("ix_todos_user_date", "user_id", "todo_date"),
        Index("ix_todos_user_id", "user_id", "id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task = Column(String(500))
    completed = Column(Boolean, default=False)
    archived = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    todo_date = Column(Date, default=date.today, index=True)

    owner = relationship("User", back_populates="todos")
