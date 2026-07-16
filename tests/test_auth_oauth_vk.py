import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.auth import vk_client
from app.auth.models import OAuthAccount, User
from app.core.config import get_settings

AUTHORIZE_URL = "/api/v1/auth/oauth/vk/authorize"
CALLBACK_URL = "/api/v1/auth/oauth/vk/callback"
COMPLETE_URL = "/api/v1/auth/oauth/vk/complete"

_PROVIDER_USER_ID = "987654321"
_PROFILE_WITH_EMAIL = vk_client.VkProfile(
    provider_user_id=_PROVIDER_USER_ID, email="player@example.com", display_name="Игрок VK"
)
_PROFILE_NO_EMAIL = vk_client.VkProfile(
    provider_user_id=_PROVIDER_USER_ID, email=None, display_name="Игрок VK"
)


@pytest.fixture(autouse=True)
def _vk_config(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "vk_client_id", "client-id")
    monkeypatch.setattr(settings, "vk_client_secret", "client-secret")
    monkeypatch.setattr(
        settings, "vk_redirect_uri", "http://testserver/api/v1/auth/oauth/vk/callback"
    )


def _mock_provider(
    monkeypatch: pytest.MonkeyPatch, profile: vk_client.VkProfile
) -> None:
    async def _fake_exchange_code(
        code: str, client_id: str, client_secret: str, redirect_uri: str, code_verifier: str
    ) -> str:
        assert code == "auth-code"
        assert code_verifier
        return "fake-access-token"

    async def _fake_fetch_profile(access_token: str) -> vk_client.VkProfile:
        assert access_token == "fake-access-token"
        return profile

    monkeypatch.setattr(vk_client, "exchange_code", _fake_exchange_code)
    monkeypatch.setattr(vk_client, "fetch_profile", _fake_fetch_profile)


@pytest.fixture
def mock_provider_with_email(monkeypatch: pytest.MonkeyPatch) -> vk_client.VkProfile:
    _mock_provider(monkeypatch, _PROFILE_WITH_EMAIL)
    return _PROFILE_WITH_EMAIL


@pytest.fixture
def mock_provider_no_email(monkeypatch: pytest.MonkeyPatch) -> vk_client.VkProfile:
    _mock_provider(monkeypatch, _PROFILE_NO_EMAIL)
    return _PROFILE_NO_EMAIL


async def _callback(client: AsyncClient) -> Response:
    # httpx.AsyncClient keeps its own cookie jar, so the state/code_verifier
    # cookies set by /authorize are sent back automatically on the next request.
    authorize_response = await client.get(AUTHORIZE_URL)
    assert authorize_response.status_code == 302

    state = authorize_response.cookies["oauth_state"]
    return await client.get(
        CALLBACK_URL, params={"code": "auth-code", "state": state}, follow_redirects=False
    )


def _extract_fragment_params(location: str) -> dict[str, str]:
    fragment = location.split("#", 1)[1]
    return dict(pair.split("=", 1) for pair in fragment.split("&"))


async def test_authorize_redirects_to_vk_and_sets_state_and_verifier_cookies(
    client: AsyncClient,
) -> None:
    response = await client.get(AUTHORIZE_URL, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].startswith("https://id.vk.com/authorize?")
    assert "client-id" in response.headers["location"]
    assert "code_challenge=" in response.headers["location"]
    assert "oauth_state" in response.cookies
    assert "oauth_code_verifier" in response.cookies


async def test_authorize_is_disabled_without_config(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "vk_client_id", None)

    response = await client.get(AUTHORIZE_URL, follow_redirects=False)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "oauth_provider_disabled"


async def test_callback_with_mismatched_state_is_rejected(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile
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


async def test_callback_with_email_creates_new_verified_user(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session
) -> None:
    response = await _callback(client)

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        f"{get_settings().frontend_base_url}/oauth/callback#access_token="
    )
    assert "refresh_token" in response.cookies

    user = await db_session.scalar(
        select(User).where(User.email == _PROFILE_WITH_EMAIL.email)
    )
    assert user is not None
    assert user.email_verified is True
    assert user.password_hash is None

    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == user.id


async def test_callback_with_email_links_existing_account_by_email(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session
) -> None:
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": _PROFILE_WITH_EMAIL.email,
            "password": "hunter22",
            "display_name": "Игрок",
        },
    )
    assert register_response.status_code == 201
    existing_user_id = register_response.json()["id"]

    response = await _callback(client)
    assert response.status_code == 302

    users = (
        await db_session.scalars(select(User).where(User.email == _PROFILE_WITH_EMAIL.email))
    ).all()
    assert len(users) == 1
    assert users[0].id == existing_user_id
    assert users[0].email_verified is True


async def test_callback_repeat_login_reuses_same_account(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session
) -> None:
    first_response = await _callback(client)
    assert first_response.status_code == 302

    second_response = await _callback(client)
    assert second_response.status_code == 302

    users = (
        await db_session.scalars(select(User).where(User.email == _PROFILE_WITH_EMAIL.email))
    ).all()
    assert len(users) == 1

    accounts = (
        await db_session.scalars(
            select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
        )
    ).all()
    assert len(accounts) == 1


async def test_callback_without_email_redirects_with_pending_token_and_creates_no_user(
    client: AsyncClient, mock_provider_no_email: vk_client.VkProfile, db_session
) -> None:
    response = await _callback(client)

    assert response.status_code == 302
    params = _extract_fragment_params(response.headers["location"])
    assert params["provider"] == "vk"
    assert params["oauth_pending_token"]

    accounts = (await db_session.scalars(select(OAuthAccount))).all()
    assert accounts == []


async def test_complete_registration_creates_user_and_issues_tokens(
    client: AsyncClient, mock_provider_no_email: vk_client.VkProfile, db_session
) -> None:
    callback_response = await _callback(client)
    pending_token = _extract_fragment_params(callback_response.headers["location"])[
        "oauth_pending_token"
    ]

    response = await client.post(
        COMPLETE_URL, json={"pending_token": pending_token, "email": "new-vk-player@example.com"}
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    assert "refresh_token" in response.cookies

    user = await db_session.scalar(
        select(User).where(User.email == "new-vk-player@example.com")
    )
    assert user is not None
    assert user.email_verified is True

    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == user.id


async def test_complete_registration_with_invalid_token_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        COMPLETE_URL, json={"pending_token": "not-a-real-token", "email": "someone@example.com"}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "oauth_pending_token_invalid"


async def test_repeat_login_without_email_again_skips_extra_step(
    client: AsyncClient, mock_provider_no_email: vk_client.VkProfile, db_session
) -> None:
    first_callback = await _callback(client)
    pending_token = _extract_fragment_params(first_callback.headers["location"])[
        "oauth_pending_token"
    ]
    complete_response = await client.post(
        COMPLETE_URL,
        json={"pending_token": pending_token, "email": "returning-vk-player@example.com"},
    )
    assert complete_response.status_code == 200

    # Second login: VK still doesn't return an email, but the oauth_accounts
    # row already exists, so this must resolve to a normal login, not a
    # second "enter your email" step.
    second_callback = await _callback(client)
    assert second_callback.status_code == 302
    assert second_callback.headers["location"].startswith(
        f"{get_settings().frontend_base_url}/oauth/callback#access_token="
    )

    users = (
        await db_session.scalars(
            select(User).where(User.email == "returning-vk-player@example.com")
        )
    ).all()
    assert len(users) == 1
