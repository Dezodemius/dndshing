import asyncio
import smtplib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.errors import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    InvalidVerificationTokenError,
)
from app.auth.models import User
from app.auth.schemas import RegisterRequest
from app.auth.security import (
    TokenError,
    create_access_token,
    create_email_verification_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.config import get_settings
from app.core.mailer import send_email


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
        await self._send_verification_email(user)
        return user

    async def verify_email(self, token: str) -> None:
        try:
            payload = decode_token(token)
        except TokenError as exc:
            raise InvalidVerificationTokenError() from exc

        if payload.get("type") != "email_verification":
            raise InvalidVerificationTokenError()

        user = await self._db.get(User, int(payload["sub"]))
        if user is None:
            raise InvalidVerificationTokenError()

        if not user.email_verified:
            user.email_verified = True
            await self._db.commit()

    async def resend_verification(self, email: str) -> None:
        user = await self._db.scalar(select(User).where(User.email == email))
        if user is None or user.email_verified:
            return
        await self._send_verification_email(user)

    async def _send_verification_email(self, user: User) -> None:
        settings = get_settings()
        token = create_email_verification_token(user.id)
        verify_url = f"{settings.frontend_base_url}/verify?token={token}"
        body = (
            f"Здравствуйте, {user.display_name}!\n\n"
            f"Подтвердите email, перейдя по ссылке: {verify_url}\n\n"
            f"Ссылка действительна {settings.email_verification_expire_hours} ч."
        )
        try:
            await asyncio.to_thread(
                send_email, user.email, "Подтверждение email — D&D Campaign Platform", body
            )
        except (OSError, smtplib.SMTPException):
            # SMTP is an external boundary: a delivery failure must not roll back
            # or fail the request that triggered it (registration already
            # committed the user) — the resend endpoint is the recovery path.
            pass

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
