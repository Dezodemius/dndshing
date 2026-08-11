import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters.service import CharacterService
from app.content.service import ContentQueryService
from app.core.errors import AppError
from app.merchants.errors import (
    MerchantInvalidReferenceError,
    MerchantItemNotFoundError,
    MerchantNotFoundError,
    NotYourCharacterError,
    OutOfStockError,
    ShopClosedError,
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
    ShopBuyRequest,
    ShopBuyResult,
    ShopItemRead,
    ShopRead,
    ShopSellRequest,
    ShopSellResult,
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

    async def get_shop(self, share_code: str) -> ShopRead:
        """Public shop view (AR §4.5) — no ownership check, callable without
        auth."""
        merchant = await self._get_by_share_code(share_code)
        rows = (
            await self._db.scalars(
                select(MerchantItem)
                .where(MerchantItem.merchant_id == merchant.id)
                .order_by(MerchantItem.id)
            )
        ).all()
        content = ContentQueryService(self._db)
        items = []
        for row in rows:
            item = await content.get_item_by_id(row.item_id)
            if item is None:
                continue
            items.append(
                ShopItemRead(
                    id=row.id,
                    item_id=item.id,
                    name=item.name,
                    price_g=row.price_g if row.price_g is not None else item.price_g,
                    price_s=row.price_s if row.price_s is not None else item.price_s,
                    price_c=row.price_c if row.price_c is not None else item.price_c,
                    quantity=row.quantity,
                )
            )
        return ShopRead(
            name=merchant.name,
            description=merchant.description,
            is_open=merchant.is_open,
            items=items,
        )

    async def buy(self, share_code: str, user_id: int, payload: ShopBuyRequest) -> ShopBuyResult:
        """One transaction (BR §4.5 / security-review): `SELECT ... FOR
        UPDATE` on the merchant item and on the character, checks in order
        is_open -> stock -> ownership -> funds, then debits the wallet,
        decrements stock and credits the inventory together."""
        merchant = await self._get_by_share_code(share_code)
        if not merchant.is_open:
            raise ShopClosedError()

        merchant_item = await self._db.scalar(
            select(MerchantItem)
            .where(
                MerchantItem.id == payload.merchant_item_id,
                MerchantItem.merchant_id == merchant.id,
            )
            .with_for_update()
        )
        if merchant_item is None:
            raise MerchantItemNotFoundError()
        if merchant_item.quantity is not None and merchant_item.quantity < payload.quantity:
            raise OutOfStockError()

        item = await ContentQueryService(self._db).get_item_by_id(merchant_item.item_id)
        if item is None:
            raise MerchantInvalidReferenceError()

        characters = CharacterService(self._db)
        try:
            character = await characters.get_owned(payload.character_id, user_id, for_update=True)
        except AppError as exc:
            raise NotYourCharacterError() from exc

        price_g = merchant_item.price_g if merchant_item.price_g is not None else item.price_g
        price_s = merchant_item.price_s if merchant_item.price_s is not None else item.price_s
        price_c = merchant_item.price_c if merchant_item.price_c is not None else item.price_c

        entry = await characters.apply_purchase(
            character.id,
            user_id,
            item_id=item.id,
            quantity=payload.quantity,
            gold=price_g * payload.quantity,
            silver=price_s * payload.quantity,
            copper=price_c * payload.quantity,
        )

        if merchant_item.quantity is not None:
            merchant_item.quantity -= payload.quantity

        await self._db.commit()
        await self._db.refresh(character)
        await self._db.refresh(entry)
        await self._db.refresh(merchant_item)

        return ShopBuyResult(
            inventory_entry_id=entry.id,
            quantity_bought=payload.quantity,
            character_gold=character.gold,
            character_silver=character.silver,
            character_copper=character.copper,
            merchant_item_remaining_quantity=merchant_item.quantity,
        )

    async def sell(self, share_code: str, user_id: int, payload: ShopSellRequest) -> ShopSellResult:
        """One transaction (BR §4.5 / security-review): lock the character
        and the inventory entry, credit 50% of the card price per currency
        (rounded down, no auto-conversion), and remove the sold quantity from
        inventory. Sold items never restock the merchant (BR §6, out of MVP
        scope)."""
        merchant = await self._get_by_share_code(share_code)
        if not merchant.is_open:
            raise ShopClosedError()

        characters = CharacterService(self._db)
        try:
            character = await characters.get_owned(payload.character_id, user_id, for_update=True)
        except AppError as exc:
            raise NotYourCharacterError() from exc

        refund_gold, refund_silver, refund_copper, remaining = await characters.apply_sale(
            character.id,
            user_id,
            entry_id=payload.inventory_entry_id,
            quantity=payload.quantity,
        )

        await self._db.commit()
        await self._db.refresh(character)

        return ShopSellResult(
            quantity_sold=payload.quantity,
            character_gold=character.gold,
            character_silver=character.silver,
            character_copper=character.copper,
            refund_gold=refund_gold,
            refund_silver=refund_silver,
            refund_copper=refund_copper,
            inventory_entry_remaining_quantity=remaining,
        )

    async def _get_by_share_code(self, share_code: str) -> Merchant:
        merchant = await self._db.scalar(select(Merchant).where(Merchant.share_code == share_code))
        if merchant is None:
            raise MerchantNotFoundError()
        return merchant
