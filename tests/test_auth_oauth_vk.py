import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import vk_client
from app.auth.models import OAuthAccount, User
from app.core.config import get_settings

AUTHORIZE_URL = "/api/v1/auth/oauth/vk/authorize"
CALLBACK_URL = "/api/v1/auth/oauth/vk/callback"

_PROVIDER_USER_ID = "987654321"
_PROFILE_WITH_EMAIL = vk_client.VkProfile(
    provider_user_id=_PROVIDER_USER_ID, email="player@example.com", display_name="Игрок VK"
)
_PROFILE_NO_EMAIL = vk_client.VkProfile(
    provider_user_id=_PROVIDER_USER_ID, email=None, display_name="Игрок VK"
)

# What the last faked token exchange was called with, so a test can assert on
# the parameters the handler forwards rather than only on its redirect.
_LAST_EXCHANGE: dict[str, str] = {}


@pytest.fixture(autouse=True)
def _vk_config(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    # No vk_client_secret: VK ID authenticates this flow with PKCE instead.
    monkeypatch.setattr(settings, "vk_client_id", "client-id")
    monkeypatch.setattr(
        settings, "vk_redirect_uri", "http://testserver/api/v1/auth/oauth/vk/callback"
    )


def _mock_provider(monkeypatch: pytest.MonkeyPatch, profile: vk_client.VkProfile) -> None:
    _LAST_EXCHANGE.clear()

    async def _fake_exchange_code(
        code: str,
        client_id: str,
        redirect_uri: str,
        code_verifier: str,
        device_id: str,
        state: str,
    ) -> str:
        assert code == "auth-code"
        assert code_verifier
        _LAST_EXCHANGE.update(client_id=client_id, device_id=device_id, state=state)
        return "fake-access-token"

    async def _fake_fetch_profile(access_token: str, client_id: str) -> vk_client.VkProfile:
        assert access_token == "fake-access-token"
        assert client_id == "client-id"
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


async def _callback(client: AsyncClient, device_id: str = "vk-device-1") -> Response:
    # httpx.AsyncClient keeps its own cookie jar, so the state/code_verifier
    # cookies set by /authorize are sent back automatically on the next request.
    authorize_response = await client.get(AUTHORIZE_URL)
    assert authorize_response.status_code == 302

    state = authorize_response.cookies["oauth_state"]
    return await client.get(
        CALLBACK_URL,
        params={"code": "auth-code", "state": state, "device_id": device_id},
        follow_redirects=False,
    )


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


async def test_callback_forwards_device_id_and_state_to_token_exchange(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile
) -> None:
    # VK returns device_id as a query parameter on the callback and its token
    # endpoint rejects an exchange without it. The handler used to not declare
    # the parameter at all, so FastAPI dropped it and every real login failed
    # after the consent screen — a redirect alone would not have caught that.
    response = await _callback(client, device_id="vk-device-42")

    assert response.status_code == 302
    assert _LAST_EXCHANGE["device_id"] == "vk-device-42"
    assert _LAST_EXCHANGE["state"]


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
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session: AsyncSession
) -> None:
    response = await _callback(client)

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        f"{get_settings().frontend_base_url}/oauth/callback#access_token="
    )
    assert "refresh_token" in response.cookies

    user = await db_session.scalar(select(User).where(User.email == _PROFILE_WITH_EMAIL.email))
    assert user is not None
    assert user.email_verified is True

    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == user.id


async def test_callback_with_email_links_existing_account_by_email(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session: AsyncSession
) -> None:
    # An account row that pre-dates this VK login — e.g. created via a
    # different OAuth provider that returned the same email, unverified.
    existing_user = User(
        email=_PROFILE_WITH_EMAIL.email, display_name="Игрок", email_verified=False
    )
    db_session.add(existing_user)
    await db_session.commit()
    await db_session.refresh(existing_user)
    existing_user_id = existing_user.id

    response = await _callback(client)
    assert response.status_code == 302

    # The callback committed through the app's own session, not this one —
    # without expiring, db_session's identity map would just hand back the
    # existing_user object as it was before that commit (email_verified=False).
    db_session.expire_all()
    users = (
        await db_session.scalars(select(User).where(User.email == _PROFILE_WITH_EMAIL.email))
    ).all()
    assert len(users) == 1
    assert users[0].id == existing_user_id
    assert users[0].email_verified is True


async def test_callback_repeat_login_reuses_same_account(
    client: AsyncClient, mock_provider_with_email: vk_client.VkProfile, db_session: AsyncSession
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


async def test_callback_without_email_and_no_existing_link_is_unsupported(
    client: AsyncClient, mock_provider_no_email: vk_client.VkProfile, db_session: AsyncSession
) -> None:
    response = await _callback(client)

    assert response.status_code == 302
    # No access_token in the redirect: the frontend shows this as an
    # unsupported-login case (OAuthCallbackPage's missing-accessToken branch).
    assert response.headers["location"] == f"{get_settings().frontend_base_url}/oauth/callback"
    assert "refresh_token" not in response.cookies

    assert (await db_session.scalar(select(User))) is None
    assert (await db_session.scalars(select(OAuthAccount))).all() == []


async def test_repeat_login_without_email_still_succeeds_via_existing_link(
    client: AsyncClient, mock_provider_no_email: vk_client.VkProfile, db_session: AsyncSession
) -> None:
    # A VK account that got linked on an earlier login when VK did return an
    # email (see test_callback_with_email_creates_new_verified_user). A later
    # login where VK doesn't return one — e.g. the permission was revoked —
    # must still resolve via the existing oauth_accounts row, not fail.
    user = User(
        email="returning-vk-player@example.com", display_name="Игрок VK", email_verified=True
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        OAuthAccount(user_id=user.id, provider="vk", provider_user_id=_PROVIDER_USER_ID)
    )
    await db_session.commit()

    response = await _callback(client)

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        f"{get_settings().frontend_base_url}/oauth/callback#access_token="
    )
    assert "refresh_token" in response.cookies
