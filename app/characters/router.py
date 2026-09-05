from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.characters.schemas import (
    CharacterCreate,
    CharacterDetailRead,
    CharacterEffectCreate,
    CharacterEffectRead,
    CharacterEffectUpdate,
    CharacterListRead,
    CharacterSheetRead,
    CharacterSpellRead,
    CharacterUpdate,
    InventoryEntryCreate,
    InventoryEntryRead,
    InventoryEntryUpdate,
    LevelUpRecordRead,
    LevelUpRequest,
    SpellsUpdate,
)
from app.characters.service import CharacterService
from app.core.db import get_db

router = APIRouter(tags=["characters"])


# _user stays untyped: typing it as app.auth.models.User would import a foreign
# module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.get("/characters", response_model=list[CharacterListRead])
async def list_characters(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[CharacterListRead]:
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


@router.get("/characters/{character_id}/sheet", response_model=CharacterSheetRead)
async def get_character_sheet(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterSheetRead:
    return await CharacterService(db).get_sheet(character_id, _user.id)


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


@router.post("/characters/{character_id}/level-rollback", response_model=CharacterDetailRead)
async def rollback_level(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterDetailRead:
    return await CharacterService(db).rollback_level(character_id, _user.id)


@router.get(
    "/characters/{character_id}/level-history", response_model=list[LevelUpRecordRead]
)
async def get_level_history(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[LevelUpRecordRead]:
    return await CharacterService(db).get_level_history(character_id, _user.id)


@router.post(
    "/characters/{character_id}/inventory",
    response_model=InventoryEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_inventory_item(
    character_id: int,
    payload: InventoryEntryCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> InventoryEntryRead:
    return await CharacterService(db).add_inventory_item(character_id, _user.id, payload)


@router.patch(
    "/characters/{character_id}/inventory/{entry_id}", response_model=InventoryEntryRead
)
async def update_inventory_item(
    character_id: int,
    entry_id: int,
    payload: InventoryEntryUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> InventoryEntryRead:
    return await CharacterService(db).update_inventory_item(
        character_id, entry_id, _user.id, payload
    )


@router.delete(
    "/characters/{character_id}/inventory/{entry_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_inventory_item(
    character_id: int,
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await CharacterService(db).delete_inventory_item(character_id, entry_id, _user.id)


@router.put("/characters/{character_id}/spells", response_model=list[CharacterSpellRead])
async def update_spells(
    character_id: int,
    payload: SpellsUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[CharacterSpellRead]:
    return await CharacterService(db).update_spells(character_id, _user.id, payload)


@router.get("/characters/{character_id}/effects", response_model=list[CharacterEffectRead])
async def list_effects(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[CharacterEffectRead]:
    return await CharacterService(db).list_effects(character_id, _user.id)


@router.post(
    "/characters/{character_id}/effects",
    response_model=CharacterEffectRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_effect(
    character_id: int,
    payload: CharacterEffectCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterEffectRead:
    return await CharacterService(db).create_effect(character_id, _user.id, payload)


@router.patch(
    "/characters/{character_id}/effects/{effect_id}", response_model=CharacterEffectRead
)
async def update_effect(
    character_id: int,
    effect_id: int,
    payload: CharacterEffectUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterEffectRead:
    return await CharacterService(db).update_effect(character_id, effect_id, _user.id, payload)


@router.delete(
    "/characters/{character_id}/effects/{effect_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_effect(
    character_id: int,
    effect_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await CharacterService(db).delete_effect(character_id, effect_id, _user.id)
