from collections.abc import AsyncGenerator

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for all domain models."""


_sync_engine: Engine | None = None
_async_engine: AsyncEngine | None = None


def get_sync_engine() -> Engine:
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(
            get_settings().DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
        )
    return _sync_engine


def get_sync_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_sync_engine(), autoflush=False, expire_on_commit=False)


def get_async_engine() -> AsyncEngine:
    global _async_engine
    if _async_engine is None:
        _async_engine = create_async_engine(
            get_settings().DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
        )
    return _async_engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_async_engine(),
        class_=AsyncSession,
        autoflush=False,
        expire_on_commit=False,
    )


async def dispose_engines() -> None:
    global _sync_engine, _async_engine
    if _async_engine is not None:
        await _async_engine.dispose()
        _async_engine = None
    if _sync_engine is not None:
        _sync_engine.dispose()
        _sync_engine = None


async def get_db() -> AsyncGenerator[AsyncSession]:
    """Yield an AsyncSession per HTTP request."""
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        yield session
