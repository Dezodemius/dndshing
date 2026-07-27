import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.campaigns.errors import (
    AlreadyJoinedError,
    CampaignCharacterNotFoundError,
    CampaignNotFoundError,
    InviteCodeInvalidError,
)
from app.campaigns.models import Campaign, CampaignCharacter
from app.campaigns.schemas import (
    CampaignCreate,
    CampaignDetailRead,
    CampaignJoinRequest,
    CampaignParticipantRead,
    CampaignPlayerRead,
    CampaignRead,
    CampaignsMineRead,
    CampaignUpdate,
)
from app.characters.service import CharacterService
from app.core.errors import AppError

_INVITE_CODE_MAX_ATTEMPTS = 5


class CampaignService:
    """CRUD for campaigns owned (as DM) by the current user, plus join/leave/kick.
    Ownership is checked in every method that takes a campaign_id — a campaign
    run by another user is reported as not found (IDOR, see security-review
    skill), never as forbidden."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, user_id: int, payload: CampaignCreate) -> CampaignRead:
        campaign = Campaign(
            dm_user_id=user_id,
            name=payload.name,
            description=payload.description,
            next_session_at=payload.next_session_at,
            next_session_place=payload.next_session_place,
            invite_code=await self._generate_unique_invite_code(),
        )
        self._db.add(campaign)
        await self._db.commit()
        await self._db.refresh(campaign)
        return CampaignRead.model_validate(campaign)

    async def list_mine(self, user_id: int) -> CampaignsMineRead:
        as_dm = (
            await self._db.scalars(
                select(Campaign).where(Campaign.dm_user_id == user_id).order_by(Campaign.id)
            )
        ).all()

        character_ids = [
            character.id for character in await CharacterService(self._db).list_for_user(user_id)
        ]
        as_player: list[Campaign] = []
        if character_ids:
            player_campaign_ids = (
                await self._db.scalars(
                    select(CampaignCharacter.campaign_id)
                    .where(CampaignCharacter.character_id.in_(character_ids))
                    .distinct()
                )
            ).all()
            if player_campaign_ids:
                as_player = (
                    await self._db.scalars(
                        select(Campaign)
                        .where(Campaign.id.in_(player_campaign_ids))
                        .order_by(Campaign.id)
                    )
                ).all()

        return CampaignsMineRead(
            as_dm=[CampaignRead.model_validate(campaign) for campaign in as_dm],
            as_player=[CampaignPlayerRead.model_validate(campaign) for campaign in as_player],
        )

    async def get_owned(self, campaign_id: int, user_id: int) -> Campaign:
        campaign = await self._db.get(Campaign, campaign_id)
        if campaign is None or campaign.dm_user_id != user_id:
            raise CampaignNotFoundError()
        return campaign

    async def get_detail(self, campaign_id: int, user_id: int) -> CampaignDetailRead:
        campaign = await self.get_owned(campaign_id, user_id)
        participants = (
            await self._db.scalars(
                select(CampaignCharacter)
                .where(CampaignCharacter.campaign_id == campaign.id)
                .order_by(CampaignCharacter.character_id)
            )
        ).all()
        return CampaignDetailRead(
            **CampaignRead.model_validate(campaign).model_dump(),
            participants=[
                CampaignParticipantRead.model_validate(row) for row in participants
            ],
        )

    async def update(
        self, campaign_id: int, user_id: int, payload: CampaignUpdate
    ) -> CampaignRead:
        campaign = await self.get_owned(campaign_id, user_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(campaign, field, value)
        await self._db.commit()
        await self._db.refresh(campaign)
        return CampaignRead.model_validate(campaign)

    async def delete(self, campaign_id: int, user_id: int) -> None:
        campaign = await self.get_owned(campaign_id, user_id)
        await self._db.delete(campaign)
        await self._db.commit()

    async def regenerate_invite(self, campaign_id: int, user_id: int) -> CampaignRead:
        campaign = await self.get_owned(campaign_id, user_id)
        campaign.invite_code = await self._generate_unique_invite_code()
        await self._db.commit()
        await self._db.refresh(campaign)
        return CampaignRead.model_validate(campaign)

    async def join(self, user_id: int, payload: CampaignJoinRequest) -> CampaignPlayerRead:
        character = await CharacterService(self._db).get_owned(payload.character_id, user_id)

        campaign = await self._db.scalar(
            select(Campaign).where(Campaign.invite_code == payload.invite_code)
        )
        if campaign is None:
            raise InviteCodeInvalidError()

        existing = await self._db.get(
            CampaignCharacter, {"campaign_id": campaign.id, "character_id": character.id}
        )
        if existing is not None:
            raise AlreadyJoinedError()

        self._db.add(CampaignCharacter(campaign_id=campaign.id, character_id=character.id))
        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            raise AlreadyJoinedError() from exc
        return CampaignPlayerRead.model_validate(campaign)

    async def remove_character(
        self, campaign_id: int, character_id: int, user_id: int
    ) -> None:
        campaign = await self._db.get(Campaign, campaign_id)
        if campaign is None:
            raise CampaignNotFoundError()

        is_dm = campaign.dm_user_id == user_id
        if not is_dm:
            try:
                await CharacterService(self._db).get_owned(character_id, user_id)
            except AppError as exc:
                raise CampaignNotFoundError() from exc

        membership = await self._db.get(
            CampaignCharacter, {"campaign_id": campaign_id, "character_id": character_id}
        )
        if membership is None:
            raise CampaignCharacterNotFoundError()

        await self._db.delete(membership)
        await self._db.commit()

    async def _generate_unique_invite_code(self) -> str:
        for _ in range(_INVITE_CODE_MAX_ATTEMPTS):
            code = secrets.token_urlsafe(6)
            exists = await self._db.scalar(select(Campaign).where(Campaign.invite_code == code))
            if exists is None:
                return code
        raise RuntimeError("could not generate a unique invite code")
