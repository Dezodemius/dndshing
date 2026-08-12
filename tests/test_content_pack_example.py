import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from app.content.schemas import ContentPackImport

IMPORT_URL = "/api/v1/admin/content/import"

ADMIN_EMAIL = "content-admin@example.com"

DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
SCHEMA_PATH = DOCS_DIR / "content-pack.schema.json"
EXAMPLE_PATH = DOCS_DIR / "examples" / "content-pack.example.json"


def _strip_annotations(node: Any) -> Any:
    """Drops human-facing "title"/"description" keys so the JSON Schema file can be
    compared against the Pydantic-generated schema on structure alone."""
    if isinstance(node, dict):
        return {
            key: _strip_annotations(value)
            for key, value in node.items()
            if key not in ("title", "description")
        }
    if isinstance(node, list):
        return [_strip_annotations(item) for item in node]
    return node


async def _register_admin(client: AsyncClient, db_session: AsyncSession) -> str:
    # Mirrors what an OAuth login creates (AuthService._link_or_create_vk_user):
    # a User row with no password, email already verified.
    user = User(
        email=ADMIN_EMAIL, display_name="Контент-админ", email_verified=True, is_admin=True
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


def test_schema_file_matches_pydantic_validation() -> None:
    schema_from_file = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema_from_file.pop("$schema") == "https://json-schema.org/draft/2020-12/schema"

    schema_from_model = ContentPackImport.model_json_schema()

    assert _strip_annotations(schema_from_file) == _strip_annotations(schema_from_model)


async def test_example_pack_imports_without_errors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_admin(client, db_session)
    pack = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))

    # Fails loudly (not as an import error report) if the example ever drifts
    # from the Pydantic schema it is meant to demonstrate.
    ContentPackImport.model_validate(pack)

    response = await client.post(
        IMPORT_URL, json=pack, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["created"] == 11
    assert body["updated"] == 0
