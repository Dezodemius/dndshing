from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.campaigns.schemas import (
    CampaignCreate,
    CampaignDetailRead,
    CampaignJoinRequest,
    CampaignPlayerRead,
    CampaignRead,
    CampaignsMineRead,
    CampaignUpdate,
)
from app.campaigns.service import CampaignService
from app.characters.schemas import CharacterDetailRead, CharacterSheetRead
from app.core.db import get_db

router = APIRouter(tags=["campaigns"])


# _user stays untyped: typing it as app.auth.models.User would import a foreign
# module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.post("/campaigns", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignRead:
    return await CampaignService(db).create(_user.id, payload)


@router.get("/campaigns", response_model=CampaignsMineRead)
async def list_my_campaigns(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignsMineRead:
    return await CampaignService(db).list_mine(_user.id)


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetailRead)
async def get_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignDetailRead:
    return await CampaignService(db).get_detail(campaign_id, _user.id)


@router.patch("/campaigns/{campaign_id}", response_model=CampaignRead)
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignRead:
    return await CampaignService(db).update(campaign_id, _user.id, payload)


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await CampaignService(db).delete(campaign_id, _user.id)


@router.post("/campaigns/{campaign_id}/regenerate-invite", response_model=CampaignRead)
async def regenerate_invite(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignRead:
    return await CampaignService(db).regenerate_invite(campaign_id, _user.id)


@router.post("/campaigns/join", response_model=CampaignPlayerRead)
async def join_campaign(
    payload: CampaignJoinRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CampaignPlayerRead:
    return await CampaignService(db).join(_user.id, payload)


@router.get(
    "/campaigns/{campaign_id}/characters/{character_id}",
    response_model=CharacterDetailRead,
)
async def get_campaign_character(
    campaign_id: int,
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterDetailRead:
    return await CampaignService(db).get_character_for_dm(campaign_id, character_id, _user.id)


@router.get(
    "/campaigns/{campaign_id}/characters/{character_id}/sheet",
    response_model=CharacterSheetRead,
)
async def get_campaign_character_sheet(
    campaign_id: int,
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> CharacterSheetRead:
    return await CampaignService(db).get_character_sheet_for_dm(
        campaign_id, character_id, _user.id
    )


@router.delete(
    "/campaigns/{campaign_id}/characters/{character_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_character(
    campaign_id: int,
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await CampaignService(db).remove_character(campaign_id, character_id, _user.id)
