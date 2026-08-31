import base64
import hashlib
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

_AUTHORIZE_URL = "https://id.vk.com/authorize"
_TOKEN_URL = "https://id.vk.com/oauth2/auth"
_INFO_URL = "https://id.vk.com/oauth2/user_info"


class VkOAuthError(Exception):
    """Raised when the exchange with VK ID's OAuth API fails."""


@dataclass(frozen=True)
class VkProfile:
    provider_user_id: str
    email: str | None
    display_name: str


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge). VK ID is OAuth 2.1 and requires PKCE."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def build_authorize_url(
    client_id: str, redirect_uri: str, state: str, code_challenge: str
) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "scope": "email",
    }
    return f"{_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(
    code: str,
    client_id: str,
    redirect_uri: str,
    code_verifier: str,
    device_id: str,
    state: str,
) -> str:
    """Exchange an authorization code for an access token. Returns the access token.

    No client_secret: VK ID is OAuth 2.1 and this is the PKCE flow, where
    `code_verifier` takes its place — the "Защищённый ключ" from the VK ID
    cabinet does not participate here at all. `device_id` is not optional
    either: VK returns it as a query parameter on the callback and rejects the
    exchange without it.
    """
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        response = await http_client.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "client_id": client_id,
                "device_id": device_id,
                "redirect_uri": redirect_uri,
                "state": state,
            },
        )
    if response.status_code != httpx.codes.OK:
        raise VkOAuthError(f"token exchange failed: {response.status_code}")

    access_token = response.json().get("access_token")
    if not access_token:
        raise VkOAuthError("token exchange response missing access_token")
    return access_token


async def fetch_profile(access_token: str, client_id: str) -> VkProfile:
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        response = await http_client.post(
            _INFO_URL, data={"access_token": access_token, "client_id": client_id}
        )
    if response.status_code != httpx.codes.OK:
        raise VkOAuthError(f"profile request failed: {response.status_code}")

    data = response.json().get("user") or {}
    provider_user_id = data.get("user_id")
    if not provider_user_id:
        raise VkOAuthError("profile response missing user_id")

    # VK only returns email when the user has one bound to their account and
    # granted the email scope — the caller (AuthService) must handle its absence.
    email = data.get("email")

    display_name = " ".join(
        part for part in (data.get("first_name"), data.get("last_name")) if part
    ) or str(provider_user_id)

    return VkProfile(provider_user_id=str(provider_user_id), email=email, display_name=display_name)
