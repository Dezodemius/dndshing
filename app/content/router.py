from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_admin_user
from app.content.schemas import ContentPackImport, ImportReport
from app.content.service import ContentImportService
from app.core.db import get_db

router = APIRouter(tags=["content"])


# _admin stays untyped here: typing it as app.auth.models.User would import a
# foreign module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.post("/admin/content/import", response_model=ImportReport)
async def import_content_pack(
    pack: ContentPackImport,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
) -> ImportReport:
    return await ContentImportService(db).import_pack(pack)
