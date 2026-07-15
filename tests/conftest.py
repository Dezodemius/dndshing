import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.core.config import get_settings
from app.core.db import Base, get_db
from app.main import app


def _test_database_url() -> str:
    url = get_settings().test_database_url
    if not url:
        raise RuntimeError(
            "TEST_DATABASE_URL is not set: copy .env.example to .env and fill it in"
        )
    return url


# app.core.db держит движок на DATABASE_URL — это боевая база, и тесты в неё
# ходить не должны. Поэтому у тестов свой движок на TEST_DATABASE_URL, а get_db
# подменяется на него: без подмены миграции накатывались в одну базу, а запросы
# приложения уходили в другую, и всё падало с UndefinedTableError.
TEST_DATABASE_URL = _test_database_url()
test_engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)
test_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


async def _get_test_db() -> AsyncIterator[AsyncSession]:
    async with test_session_factory() as session:
        yield session


app.dependency_overrides[get_db] = _get_test_db


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_database() -> None:
    os.environ["ALEMBIC_DATABASE_URL"] = TEST_DATABASE_URL
    command.upgrade(Config("alembic.ini"), "head")


@pytest_asyncio.fixture(autouse=True)
async def _reset_database() -> AsyncIterator[None]:
    # Each test gets its own event loop (pytest-asyncio default), but the async
    # engine is a module-level singleton whose pooled asyncpg connections stay
    # bound to the loop that created them. Disposing the pool after every test
    # forces fresh connections bound to the next test's loop. Truncating first
    # keeps tests independent without wrapping each one in a rolled-back
    # transaction (services commit internally, e.g. AuthService.register).
    yield
    async with test_session_factory() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'))
        await session.commit()
    await test_engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with test_session_factory() as session:
        yield session
