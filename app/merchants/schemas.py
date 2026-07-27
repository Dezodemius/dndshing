from pydantic import BaseModel, ConfigDict, Field


class MerchantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class MerchantUpdate(BaseModel):
    """Partial update. `share_code` is intentionally absent — it is the
    stable identifier for the player-facing shop link and is never patched."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_open: bool | None = None


class MerchantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int
    name: str
    description: str | None
    share_code: str
    is_open: bool


class MerchantItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: int
    price_g: int | None = Field(default=None, ge=0)
    price_s: int | None = Field(default=None, ge=0)
    price_c: int | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=0)


class MerchantItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_g: int | None = Field(default=None, ge=0)
    price_s: int | None = Field(default=None, ge=0)
    price_c: int | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=0)


class MerchantItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    merchant_id: int
    item_id: int
    price_g: int | None
    price_s: int | None
    price_c: int | None
    quantity: int | None


class MerchantDetailRead(MerchantRead):
    items: list[MerchantItemRead]
