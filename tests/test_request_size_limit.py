import json
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient

from app.core.body_limit import (
    ADMIN_PANEL_IMPORT_PATH,
    DEFAULT_MAX_BODY_BYTES,
    RequestBodySizeLimitMiddleware,
)
from app.core.config import get_settings

# Единственный путь с поднятым лимитом — браузерная админка импорта: только через
# неё контент-пак попадает в приложение по HTTP (API-эндпоинта импорта нет).
IMPORT_URL = ADMIN_PANEL_IMPORT_PATH
REFRESH_URL = "/api/v1/auth/refresh"

IMPORT_LIMIT = 10 * 1024 * 1024

USERNAME = "owner"
PASSWORD = "hunter22"


@pytest.fixture(autouse=True)
def _panel_config(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_panel_username", USERNAME)
    monkeypatch.setattr(settings, "admin_panel_password", PASSWORD)


def _full_pack() -> dict:
    """Minimal content pack for testing."""
    return {
        "races": [{"slug": "elf", "name": "Эльф"}],
        "classes": [
            {
                "slug": "fighter",
                "name": "Воин",
                "hit_die": 10,
                "primary_ability": "strength",
                "levels": [{"level": 1, "features": {"note": "первый уровень"}}],
                "subclasses": [{"slug": "champion", "name": "Чемпион", "unlock_level": 3}],
            }
        ],
        "spells": [],
        "items": [],
        "backgrounds": [],
    }


def _pack_file(pack: dict) -> dict:
    return {"file": ("pack.json", json.dumps(pack).encode("utf-8"), "application/json")}


async def test_import_under_limit_is_accepted(client: AsyncClient) -> None:
    """A normal small valid content pack under the limit should be accepted."""
    response = await client.post(
        IMPORT_URL, auth=(USERNAME, PASSWORD), files=_pack_file(_full_pack())
    )

    assert response.status_code == 200, response.text
    assert "Готово" in response.text


async def test_import_rejects_body_over_limit_by_content_length(client: AsyncClient) -> None:
    """A spoofed content-length header exceeding the import limit should be rejected with 413."""
    response = await client.post(
        IMPORT_URL,
        auth=(USERNAME, PASSWORD),
        files=_pack_file(_full_pack()),
        headers={"content-length": str(IMPORT_LIMIT + 1)},
    )

    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_import_rejects_body_over_limit_without_auth(client: AsyncClient) -> None:
    """Size check runs BEFORE auth, so a spoofed oversized body is rejected
    with 413 even without credentials (not 401)."""
    response = await client.post(
        IMPORT_URL,
        files=_pack_file(_full_pack()),
        headers={"content-length": str(IMPORT_LIMIT + 1)},
    )

    # 413 should come before 401 (size check runs before auth)
    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_import_rejects_streamed_body_over_limit_without_content_length(
    client: AsyncClient,
) -> None:
    """Slow path: a body streamed without a Content-Length header (chunked
    transfer) must be cut off once the streamed bytes exceed the limit."""

    async def oversized_chunks() -> AsyncIterator[bytes]:
        chunk = b"a" * (1024 * 1024)
        for _ in range(11):
            yield chunk

    response = await client.post(
        IMPORT_URL,
        auth=(USERNAME, PASSWORD),
        content=oversized_chunks(),
    )

    # No Content-Length means the fast path can't have rejected this — confirms
    # the streaming counter (the slow path) is what caught it.
    assert "content-length" not in response.request.headers
    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_other_endpoint_rejects_body_over_default_limit(
    client: AsyncClient,
) -> None:
    """Other endpoints should enforce the 1 MiB default limit."""
    default_limit = 1 * 1024 * 1024

    response = await client.post(
        REFRESH_URL,
        headers={"content-length": str(default_limit + 1)},
    )

    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_normal_request_is_unaffected(client: AsyncClient) -> None:
    """A normal request with a real small body and no spoofed headers should
    reach the route handler instead of being blocked by the size-limit
    middleware (regression guard)."""
    response = await client.post(REFRESH_URL, json={})

    # No refresh cookie: rejected by the route itself, not the size-limit
    # middleware — proves a normal small body passes through untouched.
    assert response.status_code == 401, response.text


def test_limit_for_path_prefers_the_import_override() -> None:
    """Unit test: _limit_for should return the import path override
    and default for other paths."""
    middleware = RequestBodySizeLimitMiddleware(
        app=None,  # type: ignore
    )

    # The admin panel upload path should get the 10 MiB override
    assert middleware._limit_for(ADMIN_PANEL_IMPORT_PATH) == IMPORT_LIMIT

    # Other paths should get the 1 MiB default
    assert middleware._limit_for("/api/v1/auth/login") == DEFAULT_MAX_BODY_BYTES
    assert middleware._limit_for("/api/v1/characters/create") == DEFAULT_MAX_BODY_BYTES
