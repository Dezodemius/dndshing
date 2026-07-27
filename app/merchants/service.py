import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.merchants.errors import (
    MerchantInvalidReferenceError,
    MerchantItemNotFoundError,
    MerchantNotFoundError,
)
from app.merchants.models import Merchant, MerchantItem
from app.merchants.schemas import (
    MerchantCreate,
    MerchantDetailRead,
    MerchantItemCreate,
    MerchantItemRead,
    MerchantItemUpdate,
    MerchantRead,
    MerchantUpdate,
)

_SHARE_CODE_ATTEMPTS = 5


class MerchantService:
    """CRUD for the owner's own merchants and their item positions. Ownership
    is checked on every method that takes a merchant_id — a merchant owned by
    another user is reported as not found (IDOR, see security-review skill),
    never as forbidden."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(self, user_id: int) -> list[MerchantRead]:
        rows = (
            await self._db.scalars(
                select(Merchant).where(Merchant.owner_user_id == user_id).order_by(Merchant.id)
            )
        ).all()
        return [MerchantRead.model_validate(row) for row in rows]

    async def create(self, user_id: int, payload: MerchantCreate) -> MerchantDetailRead:
        for _ in range(_SHARE_CODE_ATTEMPTS):
            merchant = Merchant(
                owner_user_id=user_id,
                name=payload.name,
                description=payload.description,
                share_code=secrets.token_urlsafe(8),
            )
            self._db.add(merchant)
            try:
                await self._db.flush()
            except IntegrityError:
                await self._db.rollback()
                continue
            await self._db.commit()
            await self._db.refresh(merchant)
            return await self._to_detail(merchant)
        raise RuntimeError("could not generate a unique share_code")

    async def get_owned(self, merchant_id: int, user_id: int) -> Merchant:
        merchant = await self._db.get(Merchant, merchant_id)
        if merchant is None or merchant.owner_user_id != user_id:
            raise MerchantNotFoundError()
        return merchant

    async def get_detail(self, merchant_id: int, user_id: int) -> MerchantDetailRead:
        merchant = await self.get_owned(merchant_id, user_id)
        return await self._to_detail(merchant)

    async def update(
        self, merchant_id: int, user_id: int, payload: MerchantUpdate
    ) -> MerchantDetailRead:
        merchant = await self.get_owned(merchant_id, user_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(merchant, field, value)
        await self._db.commit()
        await self._db.refresh(merchant)
        return await self._to_detail(merchant)

    async def delete(self, merchant_id: int, user_id: int) -> None:
        merchant = await self.get_owned(merchant_id, user_id)
        await self._db.delete(merchant)
        await self._db.commit()

    async def add_item(
        self, merchant_id: int, user_id: int, payload: MerchantItemCreate
    ) -> MerchantItemRead:
        merchant = await self.get_owned(merchant_id, user_id)
        item = MerchantItem(
            merchant_id=merchant.id,
            item_id=payload.item_id,
            price_g=payload.price_g,
            price_s=payload.price_s,
            price_c=payload.price_c,
            quantity=payload.quantity,
        )
        self._db.add(item)
        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise MerchantInvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(item)
        return MerchantItemRead.model_validate(item)

    async def _get_owned_item(
        self, merchant_id: int, item_entry_id: int, user_id: int
    ) -> MerchantItem:
        await self.get_owned(merchant_id, user_id)
        item = await self._db.get(MerchantItem, item_entry_id)
        if item is None or item.merchant_id != merchant_id:
            raise MerchantItemNotFoundError()
        return item

    async def update_item(
        self, merchant_id: int, item_entry_id: int, user_id: int, payload: MerchantItemUpdate
    ) -> MerchantItemRead:
        item = await self._get_owned_item(merchant_id, item_entry_id, user_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        await self._db.commit()
        await self._db.refresh(item)
        return MerchantItemRead.model_validate(item)

    async def delete_item(self, merchant_id: int, item_entry_id: int, user_id: int) -> None:
        item = await self._get_owned_item(merchant_id, item_entry_id, user_id)
        await self._db.delete(item)
        await self._db.commit()

    async def _to_detail(self, merchant: Merchant) -> MerchantDetailRead:
        items = (
            await self._db.scalars(
                select(MerchantItem)
                .where(MerchantItem.merchant_id == merchant.id)
                .order_by(MerchantItem.id)
            )
        ).all()
        return MerchantDetailRead(
            **MerchantRead.model_validate(merchant).model_dump(),
            items=[MerchantItemRead.model_validate(item) for item in items],
        )
