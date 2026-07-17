from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

_AUTHORIZE_URL = "https://oauth.mail.ru/login"
_TOKEN_URL = "https://oauth.mail.ru/token"
_INFO_URL = "https://oauth.mail.ru/userinfo"


class MailRuOAuthError(Exception):
    """Raised when the exchange with Mail.ru's OAuth API fails."""


@dataclass(frozen=True)
class MailRuProfile:
    provider_user_id: str
    email: str
    display_name: str


def build_authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(
    code: str, client_id: str, client_secret: str, redirect_uri: str
) -> str:
    """Exchange an authorization code for an access token. Returns the access token."""
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        response = await http_client.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
        )
    if response.status_code != httpx.codes.OK:
        raise MailRuOAuthError(f"token exchange failed: {response.status_code}")

    access_token = response.json().get("access_token")
    if not access_token:
        raise MailRuOAuthError("token exchange response missing access_token")
    return access_token


async def fetch_profile(access_token: str) -> MailRuProfile:
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        response = await http_client.get(_INFO_URL, params={"access_token": access_token})
    if response.status_code != httpx.codes.OK:
        raise MailRuOAuthError(f"profile request failed: {response.status_code}")

    data = response.json()
    provider_user_id = data.get("id")
    email = data.get("email")
    if not provider_user_id or not email:
        raise MailRuOAuthError("profile response missing id or email")

    display_name = data.get("name") or data.get("nickname") or email
    return MailRuProfile(
        provider_user_id=str(provider_user_id), email=email, display_name=display_name
    )
