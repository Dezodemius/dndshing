import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.auth.errors import EmailNotVerifiedError
from app.auth.models import User
from app.auth.service import AuthService

REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/me"

EMAIL = "player@example.com"


async def _login(client: AsyncClient, db_session: AsyncSession, email: str = EMAIL) -> str:
    """Creates a user directly (mirrors what an OAuth login does) and sets up
    a session the same way a real login would: refresh cookie on the client's
    jar, access token returned."""
    user = User(email=email, display_name="Игрок", email_verified=True)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    access_token, refresh_token = await AuthService(db_session).issue_tokens(user)
    client.cookies.set("refresh_token", refresh_token)
    return access_token


async def test_refresh_rotates_tokens(client: AsyncClient, db_session: AsyncSession) -> None:
    original_access_token = await _login(client, db_session)
    original_refresh_cookie = client.cookies["refresh_token"]

    refresh_response = await client.post(REFRESH_URL)

    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]
    assert new_access_token != original_access_token
    assert refresh_response.cookies["refresh_token"] != original_refresh_cookie


async def test_refresh_without_cookie_is_rejected(client: AsyncClient) -> None:
    response = await client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_token"


async def test_reusing_a_rotated_refresh_token_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _login(client, db_session)
    original_refresh_cookie = client.cookies["refresh_token"]

    rotate_response = await client.post(REFRESH_URL)
    assert rotate_response.status_code == 200

    # Simulate an attacker replaying the intercepted pre-rotation cookie: the
    # JWT itself is still well-formed and unexpired, so only server-side
    # session tracking (not signature/exp checks) can catch this.
    client.cookies.set("refresh_token", original_refresh_cookie)
    replay_response = await client.post(REFRESH_URL)

    assert replay_response.status_code == 401
    assert replay_response.json()["error"]["code"] == "invalid_refresh_token"


async def test_logout_revokes_refresh_token_even_if_cookie_is_replayed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _login(client, db_session)
    refresh_cookie = client.cookies["refresh_token"]

    logout_response = await client.post(LOGOUT_URL)
    assert logout_response.status_code == 204

    # The client jar no longer has the cookie (server cleared it), so set it
    # back manually to prove revocation happened server-side, not just that
    # the cookie was deleted client-side.
    client.cookies.set("refresh_token", refresh_cookie)
    replay_response = await client.post(REFRESH_URL)

    assert replay_response.status_code == 401
    assert replay_response.json()["error"]["code"] == "invalid_refresh_token"


async def test_me_with_valid_token_returns_current_user(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    access_token = await _login(client, db_session)

    response = await client.get(ME_URL, headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


async def test_me_without_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get(ME_URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


async def test_me_with_garbage_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get(ME_URL, headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401


async def test_logout_clears_refresh_cookie(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _login(client, db_session)

    logout_response = await client.post(LOGOUT_URL)
    assert logout_response.status_code == 204

    refresh_response = await client.post(REFRESH_URL)
    assert refresh_response.status_code == 401


async def test_get_verified_user_rejects_unverified_user() -> None:
    user = User(email=EMAIL, display_name="Игрок", email_verified=False)

    with pytest.raises(EmailNotVerifiedError):
        await get_verified_user(user)


async def test_get_verified_user_allows_verified_user() -> None:
    user = User(email=EMAIL, display_name="Игрок", email_verified=True)

    result = await get_verified_user(user)

    assert result is user
