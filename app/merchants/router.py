from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_verified_user
from app.core.db import get_db
from app.core.rate_limit import rate_limit
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
    ShopRead,
    ShopSellRequest,
    ShopSellResult,
)
from app.merchants.service import MerchantService

router = APIRouter(tags=["merchants"])


# _user stays untyped: typing it as app.auth.models.User would import a foreign
# module's model, which the module boundary (CLAUDE.md rule 2) forbids.
@router.get("/merchants", response_model=list[MerchantRead])
async def list_merchants(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> list[MerchantRead]:
    return await MerchantService(db).list_for_user(_user.id)


@router.post("/merchants", response_model=MerchantDetailRead, status_code=status.HTTP_201_CREATED)
async def create_merchant(
    payload: MerchantCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> MerchantDetailRead:
    return await MerchantService(db).create(_user.id, payload)


@router.get("/merchants/{merchant_id}", response_model=MerchantDetailRead)
async def get_merchant(
    merchant_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> MerchantDetailRead:
    return await MerchantService(db).get_detail(merchant_id, _user.id)


@router.patch("/merchants/{merchant_id}", response_model=MerchantDetailRead)
async def update_merchant(
    merchant_id: int,
    payload: MerchantUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> MerchantDetailRead:
    return await MerchantService(db).update(merchant_id, _user.id, payload)


@router.delete("/merchants/{merchant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_merchant(
    merchant_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await MerchantService(db).delete(merchant_id, _user.id)


@router.post(
    "/merchants/{merchant_id}/items",
    response_model=MerchantItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_merchant_item(
    merchant_id: int,
    payload: MerchantItemCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> MerchantItemRead:
    return await MerchantService(db).add_item(merchant_id, _user.id, payload)


@router.patch("/merchants/{merchant_id}/items/{mi_id}", response_model=MerchantItemRead)
async def update_merchant_item(
    merchant_id: int,
    mi_id: int,
    payload: MerchantItemUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> MerchantItemRead:
    return await MerchantService(db).update_item(merchant_id, mi_id, _user.id, payload)


@router.delete("/merchants/{merchant_id}/items/{mi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_merchant_item(
    merchant_id: int,
    mi_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> None:
    await MerchantService(db).delete_item(merchant_id, mi_id, _user.id)


@router.get("/shop/{share_code}", response_model=ShopRead)
async def get_shop(share_code: str, db: AsyncSession = Depends(get_db)) -> ShopRead:
    return await MerchantService(db).get_shop(share_code)


@router.post(
    "/shop/{share_code}/buy",
    response_model=ShopBuyResult,
    dependencies=[rate_limit("shop-buy", limit=20, window_seconds=60)],
)
async def buy_from_shop(
    share_code: str,
    payload: ShopBuyRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> ShopBuyResult:
    return await MerchantService(db).buy(share_code, _user.id, payload)


@router.post("/shop/{share_code}/sell", response_model=ShopSellResult)
async def sell_to_shop(
    share_code: str,
    payload: ShopSellRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_verified_user),
) -> ShopSellResult:
    return await MerchantService(db).sell(share_code, _user.id, payload)
