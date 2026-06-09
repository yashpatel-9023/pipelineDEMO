# src/db/base.py
"""SQLAlchemy engine, session factory, and dependency injection helper.

Import ``get_db`` as a FastAPI dependency to obtain a scoped session that is
automatically closed after the request.
"""

from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from src.core.config import get_settings

# Re-export the declarative base so that migration tooling can do a single import.
from src.db.models import Base  # noqa: F401

_settings = get_settings()

engine: Engine = create_engine(
    _settings.DATABASE_URL,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and guarantee cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
