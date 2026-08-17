from httpx import AsyncClient


async def test_healthz_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_healthz_head_returns_ok(client: AsyncClient) -> None:
    # Uptime monitors commonly probe with HEAD rather than GET.
    response = await client.head("/healthz")

    assert response.status_code == 200
