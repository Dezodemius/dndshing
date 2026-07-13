from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.errors import InvalidRefreshTokenError
from app.auth.models import User
from app.auth.schemas import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendVerificationRequest,
    TokenResponse,
    UserResponse,
)
from app.auth.service import AuthService
from app.core.config import get_settings
from app.core.db import get_db

router = APIRouter(tags=["auth"])

_REFRESH_COOKIE_NAME = "refresh_token"
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=_REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.app_env != "local",
        samesite="lax",
        max_age=settings.jwt_refresh_expire_days * 24 * 60 * 60,
        path=_REFRESH_COOKIE_PATH,
    )


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    return await AuthService(db).register(data)


@router.post("/auth/login", response_model=TokenResponse)
async def login(
    data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    service = AuthService(db)
    user = await service.authenticate(data.email, data.password)
    access_token, refresh_token = service.issue_tokens(user)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    refresh_token = request.cookies.get(_REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise InvalidRefreshTokenError()

    access_token, new_refresh_token = await AuthService(db).refresh_tokens(refresh_token)
    _set_refresh_cookie(response, new_refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(_REFRESH_COOKIE_NAME, path=_REFRESH_COOKIE_PATH)


@router.get("/auth/verify-email", response_model=MessageResponse)
async def verify_email(token: str, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    await AuthService(db).verify_email(token)
    return MessageResponse(message="Email подтверждён")


@router.post("/auth/verify-email/resend", response_model=MessageResponse)
async def resend_verification(
    data: ResendVerificationRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    await AuthService(db).resend_verification(data.email)
    return MessageResponse(message="Если email зарегистрирован и не подтверждён, письмо отправлено")


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
