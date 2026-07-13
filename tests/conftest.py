import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from alembic import command
from app.core.config import get_settings
from app.core.db import Base, async_session_factory, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_database() -> None:
    test_database_url = get_settings().test_database_url
    if not test_database_url:
        pytest.fail("TEST_DATABASE_URL is not set: copy .env.example to .env and fill it in")

    os.environ["ALEMBIC_DATABASE_URL"] = test_database_url
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
    async with async_session_factory() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'))
        await session.commit()
    await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
