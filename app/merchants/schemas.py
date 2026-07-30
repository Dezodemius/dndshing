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


class ShopItemRead(BaseModel):
    """Public shop listing row: the item card merged with the merchant's
    override price (null falls back to the card price — AR §4.5)."""

    id: int
    item_id: int
    name: str
    price_g: int
    price_s: int
    price_c: int
    quantity: int | None


class ShopRead(BaseModel):
    name: str
    description: str | None
    is_open: bool
    items: list[ShopItemRead]


class ShopBuyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    character_id: int
    merchant_item_id: int
    quantity: int = Field(default=1, ge=1)


class ShopBuyResult(BaseModel):
    inventory_entry_id: int
    quantity_bought: int
    character_gold: int
    character_silver: int
    character_copper: int
    merchant_item_remaining_quantity: int | None
