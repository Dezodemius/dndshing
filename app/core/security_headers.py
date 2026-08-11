"""Security response headers (CSP, HSTS, etc. — CLAUDE.md DND-084 audit scope).

The API only ever returns JSON to a separate SPA frontend, so the CSP is
locked down to `default-src 'none'` rather than tuned for any HTML page the
API itself renders — this also blocks the bundled Swagger UI (`/docs`) from
loading its scripts, which is an accepted trade-off, not a gap."""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.core.config import get_settings

_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
_PERMISSIONS_POLICY = "geolocation=(), microphone=(), camera=()"
_HSTS = "max-age=63072000; includeSubDomains"


def add_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def _set_security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = _CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = _PERMISSIONS_POLICY
        # HSTS asserts HTTPS-only for the browser going forward — only true in
        # a deployed environment (local dev is plain HTTP), same app_env gate
        # already used for the refresh-cookie `secure` flag in app/auth/router.py.
        if get_settings().app_env != "local":
            response.headers["Strict-Transport-Security"] = _HSTS
        return response
