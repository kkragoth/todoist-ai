from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import relationship

from core.database import Base


class ChatThread(Base):
    __tablename__ = "chat_threads"
    __table_args__ = (Index("ix_chat_threads_user_updated", "user_id", "updated_at"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String, default="New chat")
    provider = Column(String, default="ollama")
    model = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship(
        "ChatMessage", back_populates="thread", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    # Named differently from the auto `ix_chat_messages_thread_id` on
    # thread_id (index=True): duplicate index names crash create_all on
    # fresh databases.
    __table_args__ = (Index("ix_chat_messages_thread_ordered", "thread_id", "id"),)

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("chat_threads.id"), index=True)
    role = Column(String, index=True)  # human | ai | tool | system
    payload = Column(JSON)  # one {"type": ..., "data": {...}} dict per row

    created_at = Column(DateTime, default=datetime.utcnow)

    thread = relationship("ChatThread", back_populates="messages")
