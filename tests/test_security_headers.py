import pytest
from httpx import AsyncClient

from app.core.config import get_settings


async def test_security_headers_present_on_json_response(client: AsyncClient) -> None:
    response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == "geolocation=(), microphone=(), camera=()"


async def test_security_headers_present_on_error_response(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh", json={})

    assert response.status_code == 401
    assert "content-security-policy" in response.headers


async def test_hsts_absent_when_app_env_is_local(client: AsyncClient) -> None:
    assert get_settings().app_env == "local"

    response = await client.get("/healthz")

    assert "strict-transport-security" not in response.headers


async def test_hsts_present_when_app_env_is_not_local(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "app_env", "production")

    response = await client.get("/healthz")

    assert response.headers["strict-transport-security"] == "max-age=63072000; includeSubDomains"
