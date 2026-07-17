import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerifyMismatchError

from app.core.config import get_settings

_ALGORITHM = "HS256"
_password_hasher = PasswordHasher()


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or has the wrong signature."""


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHash):
        return False


def _create_token(user_id: int, token_type: str, expires_delta: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(user_id, "access", timedelta(minutes=settings.jwt_access_expire_minutes))


def create_refresh_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(user_id, "refresh", timedelta(days=settings.jwt_refresh_expire_days))


def create_email_verification_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(
        user_id, "email_verification", timedelta(hours=settings.email_verification_expire_hours)
    )


def create_oauth_pending_token(provider: str, provider_user_id: str, display_name: str) -> str:
    """For providers that may not return an email (e.g. VK): carries the OAuth
    profile across the "enter your email" step without persisting a user yet."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "type": "oauth_pending",
        "provider": provider,
        "provider_user_id": provider_user_id,
        "display_name": display_name,
        "iat": now,
        "exp": now + timedelta(minutes=10),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, get_settings().jwt_secret_key, algorithm=_ALGORITHM)


def create_oauth_link_confirmation_token(
    provider: str, provider_user_id: str, display_name: str, email: str
) -> str:
    """The email entered manually on the "enter your email" step is unverified,
    so it must not be linked/created until its owner proves control of the
    inbox by clicking the link this token is embedded in."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "type": "oauth_link_confirmation",
        "provider": provider,
        "provider_user_id": provider_user_id,
        "display_name": display_name,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=settings.email_verification_expire_hours),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise TokenError(str(exc)) from exc
