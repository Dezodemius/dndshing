import pytest
from httpx import AsyncClient

from app.core.config import get_settings

PROVIDERS_URL = "/api/v1/auth/oauth/providers"


async def test_no_providers_configured_returns_empty_list(client: AsyncClient) -> None:
    response = await client.get(PROVIDERS_URL)

    assert response.status_code == 200
    assert response.json() == {"providers": []}


async def test_configured_providers_are_listed_in_fixed_order(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "mailru_client_id", "mailru-id")
    monkeypatch.setattr(settings, "mailru_client_secret", "mailru-secret")
    monkeypatch.setattr(settings, "mailru_redirect_uri", "http://testserver/mailru/callback")
    monkeypatch.setattr(settings, "yandex_client_id", "yandex-id")
    monkeypatch.setattr(settings, "yandex_client_secret", "yandex-secret")
    monkeypatch.setattr(settings, "yandex_redirect_uri", "http://testserver/yandex/callback")

    response = await client.get(PROVIDERS_URL)

    assert response.status_code == 200
    assert response.json() == {"providers": ["yandex", "mailru"]}


async def test_provider_with_partial_config_is_not_listed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "vk_client_id", "vk-id")

    response = await client.get(PROVIDERS_URL)

    assert response.status_code == 200
    assert response.json() == {"providers": []}


async def test_vk_is_listed_without_a_client_secret(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # VK ID runs the PKCE flow and issues no secret usable here. Gating it on
    # one kept the provider disabled on a fully configured deployment.
    settings = get_settings()
    monkeypatch.setattr(settings, "vk_client_id", "vk-id")
    monkeypatch.setattr(settings, "vk_redirect_uri", "http://testserver/vk/callback")

    response = await client.get(PROVIDERS_URL)

    assert response.status_code == 200
    assert response.json() == {"providers": ["vk"]}
