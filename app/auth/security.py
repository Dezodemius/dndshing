import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import get_settings

_ALGORITHM = "HS256"


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or has the wrong signature."""


def _create_token(
    user_id: int, token_type: str, expires_delta: timedelta, *, jti: str | None = None
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": jti or str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(user_id, "access", timedelta(minutes=settings.jwt_access_expire_minutes))


def create_refresh_token(user_id: int) -> tuple[str, str]:
    """Returns (token, jti) — the caller persists a RefreshSession keyed by
    jti (see AuthService.issue_tokens) so the token can be individually
    revoked on rotation/logout without invalidating every other JWT type."""
    settings = get_settings()
    jti = str(uuid.uuid4())
    token = _create_token(
        user_id, "refresh", timedelta(days=settings.jwt_refresh_expire_days), jti=jti
    )
    return token, jti


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise TokenError(str(exc)) from exc
