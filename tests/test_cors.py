from httpx import AsyncClient

from app.core.config import get_settings


async def test_cors_preflight_allows_frontend_origin(client: AsyncClient) -> None:
    origin = get_settings().frontend_base_url

    response = await client.options(
        "/api/v1/auth/refresh",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_cors_preflight_rejects_unknown_origin(client: AsyncClient) -> None:
    response = await client.options(
        "/api/v1/auth/refresh",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
