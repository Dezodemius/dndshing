import re
from email.message import EmailMessage

import pytest
from httpx import AsyncClient, Response

from app.auth.dependencies import get_verified_user
from app.auth.errors import EmailNotVerifiedError
from app.auth.models import User
from app.core.config import get_settings

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/me"
VERIFY_URL = "/api/v1/auth/verify-email"
RESEND_URL = "/api/v1/auth/verify-email/resend"

EMAIL = "player@example.com"
PASSWORD = "hunter22"

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


async def _register(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    response = await client.post(
        REGISTER_URL,
        json={"email": email, "password": password, "display_name": "Игрок"},
    )
    assert response.status_code == 201, response.text
    return response


async def _login(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> Response:
    response = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


async def test_register_creates_user_with_email_unverified(client: AsyncClient) -> None:
    response = await _register(client)

    body = response.json()
    assert body["email"] == EMAIL
    assert body["email_verified"] is False
    assert body["is_admin"] is False
    assert "password" not in body
    assert "password_hash" not in body


async def test_register_duplicate_email_is_rejected(client: AsyncClient) -> None:
    await _register(client)

    response = await client.post(
        REGISTER_URL,
        json={"email": EMAIL, "password": "anotherpass", "display_name": "Другой"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_already_registered"


async def test_login_with_wrong_password_is_rejected(client: AsyncClient) -> None:
    await _register(client)

    response = await client.post(LOGIN_URL, json={"email": EMAIL, "password": "wrongpass"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_login_with_unknown_email_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        LOGIN_URL, json={"email": "nobody@example.com", "password": PASSWORD}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_login_success_returns_access_token_and_sets_cookie(client: AsyncClient) -> None:
    await _register(client)

    response = await _login(client)

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert "refresh_token" in response.cookies


async def test_refresh_rotates_tokens(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)
    original_access_token = login_response.json()["access_token"]
    original_refresh_cookie = login_response.cookies["refresh_token"]

    refresh_response = await client.post(REFRESH_URL)

    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]
    assert new_access_token != original_access_token
    assert refresh_response.cookies["refresh_token"] != original_refresh_cookie


async def test_refresh_without_cookie_is_rejected(client: AsyncClient) -> None:
    response = await client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_token"


async def test_reusing_a_rotated_refresh_token_is_rejected(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)
    original_refresh_cookie = login_response.cookies["refresh_token"]

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
    client: AsyncClient,
) -> None:
    await _register(client)
    login_response = await _login(client)
    refresh_cookie = login_response.cookies["refresh_token"]

    logout_response = await client.post(LOGOUT_URL)
    assert logout_response.status_code == 204

    # The client jar no longer has the cookie (server cleared it), so set it
    # back manually to prove revocation happened server-side, not just that
    # the cookie was deleted client-side.
    client.cookies.set("refresh_token", refresh_cookie)
    replay_response = await client.post(REFRESH_URL)

    assert replay_response.status_code == 401
    assert replay_response.json()["error"]["code"] == "invalid_refresh_token"


async def test_me_with_valid_token_returns_current_user(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)
    access_token = login_response.json()["access_token"]

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


async def test_login_rate_limit_returns_429_after_threshold(client: AsyncClient) -> None:
    await _register(client)

    responses = [
        await client.post(LOGIN_URL, json={"email": EMAIL, "password": "wrongpass"})
        for _ in range(21)
    ]

    assert [r.status_code for r in responses[:20]] == [401] * 20
    assert responses[20].status_code == 429
    assert responses[20].json()["error"]["code"] == "rate_limited"


async def test_logout_clears_refresh_cookie(client: AsyncClient) -> None:
    await _register(client)
    await _login(client)

    logout_response = await client.post(LOGOUT_URL)
    assert logout_response.status_code == 204

    refresh_response = await client.post(REFRESH_URL)
    assert refresh_response.status_code == 401


async def test_register_sends_verification_email(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    await _register(client)

    assert len(sent_emails) == 1
    assert sent_emails[0]["To"] == EMAIL


async def test_register_succeeds_even_if_smtp_is_unreachable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _broken_smtp(host: str, port: int) -> None:
        raise OSError("connection refused")

    monkeypatch.setattr("app.core.mailer.smtplib.SMTP", _broken_smtp)

    await _register(client)


async def test_verify_email_happy_path(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    await _register(client)
    token = _extract_token(sent_emails[0])

    response = await client.get(VERIFY_URL, params={"token": token})
    assert response.status_code == 200

    login_response = await _login(client)
    access_token = login_response.json()["access_token"]
    me_response = await client.get(ME_URL, headers={"Authorization": f"Bearer {access_token}"})
    assert me_response.json()["email_verified"] is True


async def test_verify_email_twice_is_idempotent(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    await _register(client)
    token = _extract_token(sent_emails[0])
    await client.get(VERIFY_URL, params={"token": token})

    response = await client.get(VERIFY_URL, params={"token": token})

    assert response.status_code == 200


async def test_verify_email_with_garbage_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get(VERIFY_URL, params={"token": "not-a-real-token"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_verification_token"


async def test_verify_email_with_expired_token_is_rejected(
    client: AsyncClient, sent_emails: list[EmailMessage], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "email_verification_expire_hours", -1)

    await _register(client)
    token = _extract_token(sent_emails[0])

    response = await client.get(VERIFY_URL, params={"token": token})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_verification_token"


async def test_verify_email_with_access_token_is_rejected(client: AsyncClient) -> None:
    await _register(client)
    login_response = await _login(client)

    response = await client.get(
        VERIFY_URL, params={"token": login_response.json()["access_token"]}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_verification_token"


async def test_resend_verification_sends_new_working_token(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    await _register(client)
    assert len(sent_emails) == 1

    response = await client.post(RESEND_URL, json={"email": EMAIL})

    assert response.status_code == 200
    assert len(sent_emails) == 2
    new_token = _extract_token(sent_emails[1])

    verify_response = await client.get(VERIFY_URL, params={"token": new_token})
    assert verify_response.status_code == 200


async def test_resend_verification_for_unknown_email_does_not_leak(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    response = await client.post(RESEND_URL, json={"email": "ghost@example.com"})

    assert response.status_code == 200
    assert sent_emails == []


async def test_resend_verification_for_already_verified_email_sends_nothing(
    client: AsyncClient, sent_emails: list[EmailMessage]
) -> None:
    await _register(client)
    token = _extract_token(sent_emails[0])
    await client.get(VERIFY_URL, params={"token": token})
    sent_emails.clear()

    response = await client.post(RESEND_URL, json={"email": EMAIL})

    assert response.status_code == 200
    assert sent_emails == []


async def test_get_verified_user_rejects_unverified_user() -> None:
    user = User(email=EMAIL, display_name="Игрок", email_verified=False)

    with pytest.raises(EmailNotVerifiedError):
        await get_verified_user(user)


async def test_get_verified_user_allows_verified_user() -> None:
    user = User(email=EMAIL, display_name="Игрок", email_verified=True)

    result = await get_verified_user(user)

    assert result is user
