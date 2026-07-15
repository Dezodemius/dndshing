import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.auth import yandex_client
from app.auth.models import OAuthAccount, User
from app.core.config import get_settings

AUTHORIZE_URL = "/api/v1/auth/oauth/yandex/authorize"
CALLBACK_URL = "/api/v1/auth/oauth/yandex/callback"

_PROVIDER_USER_ID = "123456789"
_PROFILE = yandex_client.YandexProfile(
    provider_user_id=_PROVIDER_USER_ID, email="player@example.com", display_name="Игрок Яндекс"
)


@pytest.fixture(autouse=True)
def _yandex_config(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "yandex_client_id", "client-id")
    monkeypatch.setattr(settings, "yandex_client_secret", "client-secret")
    monkeypatch.setattr(
        settings, "yandex_redirect_uri", "http://testserver/api/v1/auth/oauth/yandex/callback"
    )


@pytest.fixture
def mock_provider(monkeypatch: pytest.MonkeyPatch) -> yandex_client.YandexProfile:
    async def _fake_exchange_code(
        code: str, client_id: str, client_secret: str, redirect_uri: str
    ) -> str:
        assert code == "auth-code"
        return "fake-access-token"

    async def _fake_fetch_profile(access_token: str) -> yandex_client.YandexProfile:
        assert access_token == "fake-access-token"
        return _PROFILE

    monkeypatch.setattr(yandex_client, "exchange_code", _fake_exchange_code)
    monkeypatch.setattr(yandex_client, "fetch_profile", _fake_fetch_profile)
    return _PROFILE


async def _callback(client: AsyncClient) -> Response:
    # httpx.AsyncClient keeps its own cookie jar, so the state cookie set by
    # /authorize is sent back automatically on the next request on this client.
    authorize_response = await client.get(AUTHORIZE_URL)
    assert authorize_response.status_code == 302

    state = authorize_response.cookies["oauth_state"]
    return await client.get(
        CALLBACK_URL, params={"code": "auth-code", "state": state}, follow_redirects=False
    )


async def test_authorize_redirects_to_yandex_and_sets_state_cookie(client: AsyncClient) -> None:
    response = await client.get(AUTHORIZE_URL, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].startswith("https://oauth.yandex.ru/authorize?")
    assert "client-id" in response.headers["location"]
    assert "oauth_state" in response.cookies


async def test_authorize_is_disabled_without_config(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "yandex_client_id", None)

    response = await client.get(AUTHORIZE_URL, follow_redirects=False)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "oauth_provider_disabled"


async def test_callback_with_mismatched_state_is_rejected(
    client: AsyncClient, mock_provider: yandex_client.YandexProfile
) -> None:
    await client.get(AUTHORIZE_URL, follow_redirects=False)

    response = await client.get(
        CALLBACK_URL,
        params={"code": "auth-code", "state": "wrong-state"},
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "oauth_state_mismatch"


async def test_callback_without_state_cookie_is_rejected(client: AsyncClient) -> None:
    response = await client.get(
        CALLBACK_URL, params={"code": "auth-code", "state": "some-state"}, follow_redirects=False
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "oauth_state_mismatch"


async def test_callback_creates_new_verified_user(
    client: AsyncClient, mock_provider: yandex_client.YandexProfile, db_session
) -> None:
    response = await _callback(client)

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        f"{get_settings().frontend_base_url}/oauth/callback#access_token="
    )
    assert "refresh_token" in response.cookies

    user = await db_session.scalar(select(User).where(User.email == _PROFILE.email))
    assert user is not None
    assert user.email_verified is True
    assert user.password_hash is None

    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == user.id


async def test_callback_links_existing_account_by_email(
    client: AsyncClient, mock_provider: yandex_client.YandexProfile, db_session
) -> None:
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": _PROFILE.email, "password": "hunter22", "display_name": "Игрок"},
    )
    assert register_response.status_code == 201
    existing_user_id = register_response.json()["id"]

    response = await _callback(client)
    assert response.status_code == 302

    users = (await db_session.scalars(select(User).where(User.email == _PROFILE.email))).all()
    assert len(users) == 1
    assert users[0].id == existing_user_id
    assert users[0].email_verified is True

    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == existing_user_id


async def test_callback_repeat_login_reuses_same_account(
    client: AsyncClient, mock_provider: yandex_client.YandexProfile, db_session
) -> None:
    first_response = await _callback(client)
    assert first_response.status_code == 302

    second_response = await _callback(client)
    assert second_response.status_code == 302

    users = (await db_session.scalars(select(User).where(User.email == _PROFILE.email))).all()
    assert len(users) == 1

    accounts = (
        await db_session.scalars(
            select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
        )
    ).all()
    assert len(accounts) == 1
