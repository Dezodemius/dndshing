from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.content.errors import ClassNotFoundError
from app.content.schemas import (
    BackgroundRead,
    ClassDetailRead,
    ItemRead,
    RaceRead,
    SpellRead,
)
from app.content.service import ContentQueryService
from app.core.db import get_db

# Только чтение: загрузка контента живёт вне API — пак приезжает из файла на
# старте и через браузерную админку (app/content/pack_loader.py). HTTP-эндпоинта
# импорта нет намеренно, обычному пользователю он не должен быть виден вообще.
router = APIRouter(tags=["content"])


# _user stays untyped here: typing it as app.auth.models.User would import a
# foreign module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.get("/content/races", response_model=list[RaceRead])
async def list_races(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[RaceRead]:
    return await ContentQueryService(db).list_races()


@router.get("/content/classes", response_model=list[ClassDetailRead])
async def list_classes(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[ClassDetailRead]:
    return await ContentQueryService(db).list_classes()


@router.get("/content/classes/{slug}", response_model=ClassDetailRead)
async def get_class(
    slug: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> ClassDetailRead:
    klass = await ContentQueryService(db).get_class(slug)
    if klass is None:
        raise ClassNotFoundError()
    return klass


@router.get("/content/spells", response_model=list[SpellRead])
async def list_spells(
    class_slug: str | None = Query(default=None, alias="class"),
    level: int | None = Query(default=None, ge=0, le=9),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[SpellRead]:
    return await ContentQueryService(db).list_spells(class_slug=class_slug, level=level)


@router.get("/content/items", response_model=list[ItemRead])
async def list_items(
    type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[ItemRead]:
    return await ContentQueryService(db).list_items(item_type=type)


@router.get("/content/backgrounds", response_model=list[BackgroundRead])
async def list_backgrounds(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[BackgroundRead]:
    return await ContentQueryService(db).list_backgrounds()
