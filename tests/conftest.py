import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from alembic.config import Config
from httpx import ASGITransport, AsyncClient

from alembic import command
from app.core.config import get_settings
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_database() -> None:
    os.environ["ALEMBIC_DATABASE_URL"] = get_settings().test_database_url
    command.upgrade(Config("alembic.ini"), "head")


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
