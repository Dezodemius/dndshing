from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.characters.schemas import (
    CharacterCreate,
    CharacterDetailRead,
    CharacterRead,
    CharacterUpdate,
    LevelUpRecordRead,
    LevelUpRequest,
)
from app.characters.service import CharacterService
from app.core.db import get_db

router = APIRouter(tags=["characters"])


# _user stays untyped: typing it as app.auth.models.User would import a foreign
# module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.get("/characters", response_model=list[CharacterRead])
async def list_characters(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[CharacterRead]:
    return await CharacterService(db).list_for_user(_user.id)


@router.post("/characters", response_model=CharacterDetailRead, status_code=status.HTTP_201_CREATED)
async def create_character(
    payload: CharacterCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterDetailRead:
    return await CharacterService(db).create(_user.id, payload)


@router.get("/characters/{character_id}", response_model=CharacterDetailRead)
async def get_character(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterDetailRead:
    return await CharacterService(db).get_detail(character_id, _user.id)


@router.patch("/characters/{character_id}", response_model=CharacterDetailRead)
async def update_character(
    character_id: int,
    payload: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterDetailRead:
    return await CharacterService(db).update(character_id, _user.id, payload)


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await CharacterService(db).delete(character_id, _user.id)


@router.post("/characters/{character_id}/level-up", response_model=LevelUpRecordRead)
async def level_up_character(
    character_id: int,
    payload: LevelUpRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> LevelUpRecordRead:
    return await CharacterService(db).level_up(character_id, _user.id, payload)
