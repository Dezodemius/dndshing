from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.errors import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
)
from app.auth.models import User
from app.auth.schemas import RegisterRequest
from app.auth.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(self, data: RegisterRequest) -> User:
        existing = await self._db.scalar(select(User).where(User.email == data.email))
        if existing is not None:
            raise EmailAlreadyRegisteredError()

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            display_name=data.display_name,
        )
        self._db.add(user)
        await self._db.commit()
        await self._db.refresh(user)
        return user

    async def authenticate(self, email: str, password: str) -> User:
        user = await self._db.scalar(select(User).where(User.email == email))
        if user is None or user.password_hash is None:
            raise InvalidCredentialsError()
        if not verify_password(user.password_hash, password):
            raise InvalidCredentialsError()
        return user

    def issue_tokens(self, user: User) -> tuple[str, str]:
        return create_access_token(user.id), create_refresh_token(user.id)

    async def refresh_tokens(self, refresh_token: str) -> tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except TokenError as exc:
            raise InvalidRefreshTokenError() from exc

        if payload.get("type") != "refresh":
            raise InvalidRefreshTokenError()

        user = await self._db.get(User, int(payload["sub"]))
        if user is None:
            raise InvalidRefreshTokenError()

        return self.issue_tokens(user)
