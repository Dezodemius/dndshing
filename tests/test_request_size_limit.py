from collections.abc import AsyncIterator

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from app.core.body_limit import (
    DEFAULT_MAX_BODY_BYTES,
    IMPORT_PATH,
    RequestBodySizeLimitMiddleware,
)

IMPORT_URL = "/api/v1/admin/content/import"
REFRESH_URL = "/api/v1/auth/refresh"

ADMIN_EMAIL = "admin@example.com"


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


async def _register_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str,
    *,
    is_admin: bool = False,
) -> str:
    """Create a user directly (mirrors an OAuth login) and mint an access token."""
    user = User(email=email, display_name="Тест", email_verified=True, is_admin=is_admin)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_import_under_limit_is_accepted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A normal small valid content pack under the limit should be accepted."""
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)

    response = await client.post(IMPORT_URL, json=_full_pack(), headers=_auth_headers(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert "created" in body
    assert "updated" in body
    assert "errors" in body


async def test_import_rejects_body_over_limit_by_content_length(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A spoofed content-length header exceeding the import limit should be rejected with 413."""
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    pack = _full_pack()

    # Spoof a content-length header that exceeds the import limit (10 MiB)
    import_limit = 10 * 1024 * 1024
    response = await client.post(
        IMPORT_URL,
        json=pack,
        headers={
            **_auth_headers(token),
            "content-length": str(import_limit + 1),
        },
    )

    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_import_rejects_body_over_limit_without_auth(
    client: AsyncClient,
) -> None:
    """Size check runs BEFORE auth, so a spoofed oversized body is rejected
    with 413 even without authorization (not 401)."""
    pack = _full_pack()
    import_limit = 10 * 1024 * 1024

    response = await client.post(
        IMPORT_URL,
        json=pack,
        headers={"content-length": str(import_limit + 1)},
    )

    # 413 should come before 401 (size check runs before auth)
    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "request_too_large"


async def test_import_rejects_streamed_body_over_limit_without_content_length(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Slow path: a body streamed without a Content-Length header (chunked
    transfer) must be cut off once the streamed bytes exceed the limit."""
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)

    async def oversized_chunks() -> AsyncIterator[bytes]:
        chunk = b"a" * (1024 * 1024)
        for _ in range(11):
            yield chunk

    response = await client.post(
        IMPORT_URL,
        content=oversized_chunks(),
        headers=_auth_headers(token),
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

    # Import path should get the 10 MiB override
    assert middleware._limit_for(IMPORT_PATH) == 10 * 1024 * 1024

    # Other paths should get the 1 MiB default
    assert middleware._limit_for("/api/v1/auth/login") == DEFAULT_MAX_BODY_BYTES
    assert middleware._limit_for("/api/v1/characters/create") == DEFAULT_MAX_BODY_BYTES
