import json
from pathlib import Path
from typing import Any

from app.content.schemas import ContentPackImport
from tests.conftest import seed_content

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


def test_schema_file_matches_pydantic_validation() -> None:
    schema_from_file = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema_from_file.pop("$schema") == "https://json-schema.org/draft/2020-12/schema"

    schema_from_model = ContentPackImport.model_json_schema()

    assert _strip_annotations(schema_from_file) == _strip_annotations(schema_from_model)


async def test_example_pack_imports_without_errors() -> None:
    pack = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))

    # Fails loudly (not as an import error report) if the example ever drifts
    # from the Pydantic schema it is meant to demonstrate.
    ContentPackImport.model_validate(pack)

    report = await seed_content(pack)

    assert report.errors == []
    assert report.created == 11
    assert report.updated == 0
