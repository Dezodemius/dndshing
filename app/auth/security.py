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


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise TokenError(str(exc)) from exc
