import asyncio
import smtplib
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mailru_client, vk_client, yandex_client
from app.auth.errors import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    InvalidVerificationTokenError,
    OAuthLinkConfirmationInvalidError,
    OAuthPendingTokenInvalidError,
    OAuthProviderError,
)
from app.auth.models import OAuthAccount, User
from app.auth.schemas import RegisterRequest
from app.auth.security import (
    TokenError,
    create_access_token,
    create_email_verification_token,
    create_oauth_link_confirmation_token,
    create_oauth_pending_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.config import get_settings
from app.core.mailer import send_email


@dataclass(frozen=True)
class VkLoginOutcome:
    """Either a resolved user, or a pending_token when VK didn't return an email
    and no linked oauth_accounts row exists yet to resolve one from."""

    user: User | None
    pending_token: str | None


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

    async def login_via_yandex_code(
        self, code: str, client_id: str, client_secret: str, redirect_uri: str
    ) -> User:
        try:
            access_token = await yandex_client.exchange_code(
                code, client_id, client_secret, redirect_uri
            )
            profile = await yandex_client.fetch_profile(access_token)
        except yandex_client.YandexOAuthError as exc:
            raise OAuthProviderError() from exc

        return await self._login_via_yandex_profile(profile)

    async def _login_via_yandex_profile(self, profile: yandex_client.YandexProfile) -> User:
        account = await self._db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "yandex",
                OAuthAccount.provider_user_id == profile.provider_user_id,
            )
        )
        if account is not None:
            user = await self._db.get(User, account.user_id)
            assert user is not None
            return user

        user = await self._db.scalar(select(User).where(User.email == profile.email))
        if user is None:
            user = User(
                email=profile.email,
                display_name=profile.display_name,
                email_verified=True,
            )
            self._db.add(user)
            await self._db.flush()
        elif not user.email_verified:
            # Yandex just proved ownership of this email, so linking an existing
            # unverified account may as well clear the email_not_verified gate.
            user.email_verified = True

        self._db.add(
            OAuthAccount(
                user_id=user.id, provider="yandex", provider_user_id=profile.provider_user_id
            )
        )
        await self._db.commit()
        await self._db.refresh(user)
        return user

    async def login_via_vk_code(
        self, code: str, client_id: str, client_secret: str, redirect_uri: str, code_verifier: str
    ) -> VkLoginOutcome:
        try:
            access_token = await vk_client.exchange_code(
                code, client_id, client_secret, redirect_uri, code_verifier
            )
            profile = await vk_client.fetch_profile(access_token)
        except vk_client.VkOAuthError as exc:
            raise OAuthProviderError() from exc

        return await self._login_via_vk_profile(profile)

    async def _find_vk_account_user(self, provider_user_id: str) -> User | None:
        account = await self._db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "vk",
                OAuthAccount.provider_user_id == provider_user_id,
            )
        )
        if account is None:
            return None
        user = await self._db.get(User, account.user_id)
        assert user is not None
        return user

    async def _login_via_vk_profile(self, profile: vk_client.VkProfile) -> VkLoginOutcome:
        # A repeat login is resolved by the existing oauth_accounts row alone —
        # VK not returning an email this time must not force the user through
        # the "enter your email" step again.
        existing_user = await self._find_vk_account_user(profile.provider_user_id)
        if existing_user is not None:
            return VkLoginOutcome(user=existing_user, pending_token=None)

        if profile.email is None:
            pending_token = create_oauth_pending_token(
                "vk", profile.provider_user_id, profile.display_name
            )
            return VkLoginOutcome(user=None, pending_token=pending_token)

        user = await self._link_or_create_vk_user(
            profile.provider_user_id, profile.email, profile.display_name
        )
        return VkLoginOutcome(user=user, pending_token=None)

    async def request_vk_email_confirmation(self, pending_token: str, email: str) -> None:
        # The email on this step is typed by hand, unlike the VK-provided one
        # in _login_via_vk_profile, so it is NOT proof of ownership yet — VK
        # never attested it. Linking or creating an account on it directly
        # would let an attacker take over any account by re-typing its email
        # (see PR #63 review). Instead we mail a confirmation link and only
        # act on the email once its owner proves control of the inbox by
        # opening it — mirrors the registration email_verification flow.
        try:
            payload = decode_token(pending_token)
        except TokenError as exc:
            raise OAuthPendingTokenInvalidError() from exc

        if payload.get("type") != "oauth_pending" or payload.get("provider") != "vk":
            raise OAuthPendingTokenInvalidError()

        provider_user_id = payload["provider_user_id"]
        display_name = payload.get("display_name") or email

        confirmation_token = create_oauth_link_confirmation_token(
            "vk", provider_user_id, display_name, email
        )
        await self._send_vk_link_confirmation_email(email, display_name, confirmation_token)

    async def confirm_vk_email_link(self, confirmation_token: str) -> User:
        try:
            payload = decode_token(confirmation_token)
        except TokenError as exc:
            raise OAuthLinkConfirmationInvalidError() from exc

        if payload.get("type") != "oauth_link_confirmation" or payload.get("provider") != "vk":
            raise OAuthLinkConfirmationInvalidError()

        provider_user_id = payload["provider_user_id"]
        email = payload["email"]
        display_name = payload.get("display_name") or email

        existing_user = await self._find_vk_account_user(provider_user_id)
        if existing_user is not None:
            return existing_user

        return await self._link_or_create_vk_user(provider_user_id, email, display_name)

    async def _send_vk_link_confirmation_email(
        self, email: str, display_name: str, token: str
    ) -> None:
        settings = get_settings()
        confirm_url = f"{settings.frontend_base_url}/oauth/vk/confirm?token={token}"
        body = (
            f"Здравствуйте, {display_name}!\n\n"
            f"Подтвердите этот email, чтобы завершить вход через VK: {confirm_url}\n\n"
            f"Если вы не пытались войти через VK, проигнорируйте это письмо.\n\n"
            f"Ссылка действительна {settings.email_verification_expire_hours} ч."
        )
        try:
            await asyncio.to_thread(
                send_email, email, "Подтверждение входа через VK — D&D Campaign Platform", body
            )
        except (OSError, smtplib.SMTPException):
            # Same boundary reasoning as _send_verification_email.
            pass

    async def _link_or_create_vk_user(
        self, provider_user_id: str, email: str, display_name: str
    ) -> User:
        user = await self._db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, display_name=display_name, email_verified=True)
            self._db.add(user)
            await self._db.flush()
        elif not user.email_verified:
            # VK just proved ownership of this email, same reasoning as Yandex.
            user.email_verified = True

        self._db.add(
            OAuthAccount(user_id=user.id, provider="vk", provider_user_id=provider_user_id)
        )
        await self._db.commit()
        await self._db.refresh(user)
        return user

    async def login_via_mailru_code(
        self, code: str, client_id: str, client_secret: str, redirect_uri: str
    ) -> User:
        try:
            access_token = await mailru_client.exchange_code(
                code, client_id, client_secret, redirect_uri
            )
            profile = await mailru_client.fetch_profile(access_token)
        except mailru_client.MailRuOAuthError as exc:
            raise OAuthProviderError() from exc

        return await self._login_via_mailru_profile(profile)

    async def _login_via_mailru_profile(self, profile: mailru_client.MailRuProfile) -> User:
        account = await self._db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "mailru",
                OAuthAccount.provider_user_id == profile.provider_user_id,
            )
        )
        if account is not None:
            user = await self._db.get(User, account.user_id)
            assert user is not None
            return user

        user = await self._db.scalar(select(User).where(User.email == profile.email))
        if user is None:
            user = User(
                email=profile.email,
                display_name=profile.display_name,
                email_verified=True,
            )
            self._db.add(user)
            await self._db.flush()
        elif not user.email_verified:
            # Mail.ru just proved ownership of this email, so linking an existing
            # unverified account may as well clear the email_not_verified gate.
            user.email_verified = True

        self._db.add(
            OAuthAccount(
                user_id=user.id, provider="mailru", provider_user_id=profile.provider_user_id
            )
        )
        await self._db.commit()
        await self._db.refresh(user)
        return user
