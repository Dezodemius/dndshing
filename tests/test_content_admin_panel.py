import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import Item, Race
from app.core.config import get_settings

PANEL_URL = "/internal/admin/content-import"

USERNAME = "owner"
PASSWORD = "hunter22"


@pytest.fixture(autouse=True)
def _panel_config(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_panel_username", USERNAME)
    monkeypatch.setattr(settings, "admin_panel_password", PASSWORD)


def _minimal_pack() -> dict:
    return {
        "races": [{"slug": "elf", "name": "Эльф"}],
        "items": [
            {
                "slug": "longsword",
                "name": "Длинный меч",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Простое оружие.",
            }
        ],
    }


def _pack_file(pack: dict) -> dict:
    return {"file": ("pack.json", json.dumps(pack).encode("utf-8"), "application/json")}


async def test_panel_disabled_without_config(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "admin_panel_username", None)

    response = await client.get(PANEL_URL)

    assert response.status_code == 404


async def test_form_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(PANEL_URL)

    assert response.status_code == 401
    assert "Basic" in response.headers["www-authenticate"]


async def test_form_rejects_wrong_credentials(client: AsyncClient) -> None:
    response = await client.get(PANEL_URL, auth=(USERNAME, "wrong-password"))

    assert response.status_code == 401


async def test_form_renders_with_valid_credentials(client: AsyncClient) -> None:
    response = await client.get(PANEL_URL, auth=(USERNAME, PASSWORD))

    assert response.status_code == 200
    assert 'type="file"' in response.text


async def test_import_creates_entities(client: AsyncClient, db_session: AsyncSession) -> None:
    response = await client.post(
        PANEL_URL, auth=(USERNAME, PASSWORD), files=_pack_file(_minimal_pack())
    )

    assert response.status_code == 200, response.text
    assert "создано 2" in response.text
    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is not None
    assert (await db_session.scalar(select(Item).where(Item.slug == "longsword"))) is not None


async def test_import_with_error_rolls_back_and_shows_message(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    pack = _minimal_pack()
    pack["items"][0]["type"] = "not-a-real-type"

    response = await client.post(
        PANEL_URL, auth=(USERNAME, PASSWORD), files=_pack_file(pack)
    )

    assert response.status_code == 200, response.text
    assert "не применён" in response.text
    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is None


async def test_import_rejects_invalid_json(client: AsyncClient) -> None:
    response = await client.post(
        PANEL_URL,
        auth=(USERNAME, PASSWORD),
        files={"file": ("pack.json", b"not json", "application/json")},
    )

    assert response.status_code == 200
    assert "Невалидный JSON" in response.text


async def test_import_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(PANEL_URL, files=_pack_file(_minimal_pack()))

    assert response.status_code == 401


async def test_import_rejects_cross_origin_submission(client: AsyncClient) -> None:
    response = await client.post(
        PANEL_URL,
        auth=(USERNAME, PASSWORD),
        files=_pack_file(_minimal_pack()),
        headers={"origin": "https://evil.example"},
    )

    assert response.status_code == 403
