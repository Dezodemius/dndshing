from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    next_session_at: datetime | None = None
    next_session_place: str | None = Field(default=None, max_length=200)


class CampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    next_session_at: datetime | None = None
    next_session_place: str | None = Field(default=None, max_length=200)


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dm_user_id: int
    name: str
    description: str | None
    next_session_at: datetime | None
    next_session_place: str | None
    invite_code: str


class CampaignParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    character_id: int
    joined_at: datetime


class CampaignDetailRead(CampaignRead):
    participants: list[CampaignParticipantRead]


class CampaignPlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dm_user_id: int
    name: str
    description: str | None
    next_session_at: datetime | None
    next_session_place: str | None


class CampaignsMineRead(BaseModel):
    as_dm: list[CampaignRead]
    as_player: list[CampaignPlayerRead]


class CampaignJoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invite_code: str = Field(min_length=1, max_length=32)
    character_id: int
