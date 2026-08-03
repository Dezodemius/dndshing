"""Caps request body size before FastAPI reads/parses it (a Depends-based or
Pydantic-level check only fires after the full body is already buffered in
memory and parsed by FastAPI's routing — too late for the DoS this guards
against). Limit calibration: docs/examples/content-pack.example.json is
~7.7KB for a minimal 11-entity example pack; a full D&D 5e reference pack
(hundreds of spells/items, full class level tables) is estimated at
~1.4-4MB, so 10 MiB gives comfortable headroom on the one endpoint that
legitimately accepts a large body. Every other endpoint gets a 1 MiB
default, well above the largest legitimate body in this API (free-text
character fields).
"""

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import AppError, app_error_response

DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MiB
IMPORT_PATH = "/api/v1/admin/content/import"
MAX_BODY_BYTES_BY_PATH: dict[str, int] = {IMPORT_PATH: 10 * 1024 * 1024}  # 10 MiB


class RequestBodyTooLargeError(AppError):
    code = "request_too_large"
    message = "Тело запроса слишком большое"
    status_code = 413


class _BodyTooLarge(Exception):
    def __init__(self, limit: int) -> None:
        self.limit = limit


class RequestBodySizeLimitMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware — that gives no hook on `receive`,
    which the streaming/no-Content-Length enforcement path needs)."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        default_max_bytes: int = DEFAULT_MAX_BODY_BYTES,
        max_bytes_by_path: dict[str, int] | None = None,
    ) -> None:
        self.app = app
        self.default_max_bytes = default_max_bytes
        self.max_bytes_by_path = max_bytes_by_path or MAX_BODY_BYTES_BY_PATH

    def _limit_for(self, path: str) -> int:
        return self.max_bytes_by_path.get(path, self.default_max_bytes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for(scope["path"])

        # Fast path: declared Content-Length. Rejects before a single body
        # byte is read.
        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await self._reject(limit, scope, receive, send)
            return

        # Slow path: chunked / absent Content-Length. Count as the body
        # streams and cut off at the limit.
        received = 0
        response_started = False

        async def counting_receive() -> dict:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _BodyTooLarge(limit)
            return message

        async def watching_send(message: dict) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, watching_send)
        except _BodyTooLarge:
            if response_started:
                raise
            await self._reject(limit, scope, receive, send)

    async def _reject(self, limit: int, scope: Scope, receive: Receive, send: Send) -> None:
        # This middleware sits OUTSIDE Starlette's ExceptionMiddleware, so
        # raising AppError here would not reach register_exception_handlers'
        # handler — render the same envelope directly.
        mb = limit // (1024 * 1024)
        error = RequestBodyTooLargeError(f"Тело запроса больше допустимых {mb} МБ")
        response = app_error_response(error)
        await response(scope, receive, send)
