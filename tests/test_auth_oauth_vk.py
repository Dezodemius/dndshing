import re
from email.message import EmailMessage

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.auth import vk_client
from app.auth.models import OAuthAccount, User
from app.core.config import get_settings

AUTHORIZE_URL = "/api/v1/auth/oauth/vk/authorize"
CALLBACK_URL = "/api/v1/auth/oauth/vk/callback"
COMPLETE_URL = "/api/v1/auth/oauth/vk/complete"
CONFIRM_URL = "/api/v1/auth/oauth/vk/confirm"

_TOKEN_RE = re.compile(r"token=([\w.\-]+)")


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[EmailMessage]:
    messages: list[EmailMessage] = []

    class _FakeSMTP:
        def __init__(self, host: str, port: int) -> None:
            pass

        def __enter__(self) -> "_FakeSMTP":
            return self

        def __exit__(self, *exc_info: object) -> bool:
            return False

        def starttls(self) -> None:
            pass

        def login(self, user: str, password: str) -> None:
            pass

        def send_message(self, message: EmailMessage) -> None:
            messages.append(message)

    monkeypatch.setattr("app.core.mailer.smtplib.SMTP", _FakeSMTP)
    return messages


def _extract_token(message: EmailMessage) -> str:
    match = _TOKEN_RE.search(message.get_content())
    assert match, message.get_content()
    return match.group(1)

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


async def _request_confirmation(
    client: AsyncClient, pending_token: str, email: str
) -> Response:
    return await client.post(COMPLETE_URL, json={"pending_token": pending_token, "email": email})


async def test_complete_registration_sends_confirmation_email_and_creates_no_user(
    client: AsyncClient,
    mock_provider_no_email: vk_client.VkProfile,
    db_session,
    sent_emails: list[EmailMessage],
) -> None:
    callback_response = await _callback(client)
    pending_token = _extract_fragment_params(callback_response.headers["location"])[
        "oauth_pending_token"
    ]

    response = await _request_confirmation(client, pending_token, "new-vk-player@example.com")

    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.cookies

    # The email is unverified at this point: no account may exist yet, and
    # nothing must have been linked to any pre-existing account either.
    assert (await db_session.scalar(select(User))) is None
    assert (await db_session.scalars(select(OAuthAccount))).all() == []

    assert len(sent_emails) == 1
    assert sent_emails[0]["To"] == "new-vk-player@example.com"


async def test_confirming_email_link_creates_user_and_issues_tokens(
    client: AsyncClient,
    mock_provider_no_email: vk_client.VkProfile,
    db_session,
    sent_emails: list[EmailMessage],
) -> None:
    callback_response = await _callback(client)
    pending_token = _extract_fragment_params(callback_response.headers["location"])[
        "oauth_pending_token"
    ]
    await _request_confirmation(client, pending_token, "new-vk-player@example.com")
    confirmation_token = _extract_token(sent_emails[0])

    response = await client.post(CONFIRM_URL, json={"token": confirmation_token})

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


async def test_confirm_with_invalid_token_is_rejected(client: AsyncClient) -> None:
    response = await client.post(CONFIRM_URL, json={"token": "not-a-real-token"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "oauth_link_confirmation_invalid"


async def test_completing_with_existing_users_email_requires_confirmation_before_linking(
    client: AsyncClient,
    mock_provider_no_email: vk_client.VkProfile,
    db_session,
    sent_emails: list[EmailMessage],
) -> None:
    # Attacker: a VK account with no email attached, targeting a victim's
    # existing, unrelated account by typing the victim's email on the
    # "enter your email" step. Regression for PR #63 review finding #1
    # (account takeover via unverified email in /complete).
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": "victim@example.com", "password": "hunter22", "display_name": "Жертва"},
    )
    assert register_response.status_code == 201
    victim_id = register_response.json()["id"]
    sent_emails.clear()

    callback_response = await _callback(client)
    pending_token = _extract_fragment_params(callback_response.headers["location"])[
        "oauth_pending_token"
    ]

    complete_response = await _request_confirmation(client, pending_token, "victim@example.com")
    assert complete_response.status_code == 200
    # No tokens are handed out on this step, and the victim's account is
    # untouched — the attacker cannot log in as the victim without also
    # controlling victim@example.com's inbox to read the confirmation link.
    assert "access_token" not in complete_response.json()
    assert "refresh_token" not in complete_response.cookies
    assert (await db_session.scalars(select(OAuthAccount))).all() == []

    confirmation_token = _extract_token(sent_emails[0])
    confirm_response = await client.post(CONFIRM_URL, json={"token": confirmation_token})

    # Only the party that received the email (i.e. the real victim) can reach
    # this point — but even then, confirming legitimately links the VK
    # identity to the victim's own account, exactly like the Yandex flow
    # when the provider itself attests the email.
    assert confirm_response.status_code == 200
    account = await db_session.scalar(
        select(OAuthAccount).where(OAuthAccount.provider_user_id == _PROVIDER_USER_ID)
    )
    assert account is not None
    assert account.user_id == victim_id


async def test_repeat_login_without_email_again_skips_extra_step(
    client: AsyncClient,
    mock_provider_no_email: vk_client.VkProfile,
    db_session,
    sent_emails: list[EmailMessage],
) -> None:
    first_callback = await _callback(client)
    pending_token = _extract_fragment_params(first_callback.headers["location"])[
        "oauth_pending_token"
    ]
    await _request_confirmation(client, pending_token, "returning-vk-player@example.com")
    confirmation_token = _extract_token(sent_emails[0])
    confirm_response = await client.post(CONFIRM_URL, json={"token": confirmation_token})
    assert confirm_response.status_code == 200

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
