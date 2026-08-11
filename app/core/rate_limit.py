"""In-process fixed-window rate limiting (AR §9: a single uvicorn instance,
no Redis in the stack) — a multi-worker/multi-instance deployment would need
a shared store instead; tracked as a follow-up if AR §9 ever changes."""

import time

from fastapi import Depends, Request

from app.core.errors import AppError


class RateLimitExceededError(AppError):
    code = "rate_limited"
    message = "Слишком много запросов, попробуйте позже"
    status_code = 429


class _FixedWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, tuple[int, float]] = {}

    def check(self, key: str, *, limit: int, window_seconds: float) -> None:
        now = time.monotonic()
        count, window_start = self._hits.get(key, (0, now))
        if now - window_start >= window_seconds:
            count, window_start = 0, now
        count += 1
        self._hits[key] = (count, window_start)
        if count > limit:
            raise RateLimitExceededError()

    def reset(self) -> None:
        self._hits.clear()


_limiter = _FixedWindowLimiter()


def reset_rate_limits() -> None:
    """Test-only hook (see tests/conftest.py) — the limiter is a module-level
    singleton shared by every request, so state must not leak between tests."""
    _limiter.reset()


def rate_limit(scope: str, *, limit: int, window_seconds: float = 60.0) -> Depends:
    """FastAPI dependency factory: `limit` requests per `window_seconds` per
    client IP within `scope`. Client IP is `request.client.host` — correct
    behind Cloudflare only if the deployment terminates TLS and forwards the
    real client IP via the proxy's own trusted mechanism (CD concern, DND-004);
    trusting an arbitrary X-Forwarded-For here would let a client spoof its
    own rate-limit key."""

    def _dependency(request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        _limiter.check(f"{scope}:{client_host}", limit=limit, window_seconds=window_seconds)

    return Depends(_dependency)
