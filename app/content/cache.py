import time
from typing import Any

_TTL_SECONDS = 60.0


class ContentCache:
    """In-process TTL cache for content read endpoints (AR §9: no external cache
    needed for the reference tables). Cleared explicitly on import so a fresh
    pack is visible immediately instead of waiting out the TTL."""

    def __init__(self, ttl_seconds: float = _TTL_SECONDS) -> None:
        self._ttl_seconds = ttl_seconds
        self._store: dict[tuple[Any, ...], tuple[float, Any]] = {}

    def get(self, key: tuple[Any, ...]) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: tuple[Any, ...], value: Any) -> None:
        self._store[key] = (time.monotonic() + self._ttl_seconds, value)

    def clear(self) -> None:
        self._store.clear()


content_cache = ContentCache()
