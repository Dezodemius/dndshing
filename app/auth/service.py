from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mailru_client, vk_client, yandex_client
from app.auth.errors import InvalidRefreshTokenError, OAuthProviderError
from app.auth.models import OAuthAccount, RefreshSession, User
from app.auth.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import get_settings


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def issue_tokens(self, user: User) -> tuple[str, str]:
        """Mints a fresh access+refresh pair and records the refresh token's
        jti as the user's only valid RefreshSession — the previous session
        row, if any, must already have been deleted by the caller (rotation
        in refresh_tokens) or never existed (first login)."""
        access_token = create_access_token(user.id)
        refresh_token, jti = create_refresh_token(user.id)
        settings = get_settings()
        now = datetime.now(UTC)

        # Opportunistic cleanup: a naturally-expired session row is harmless
        # (decode_token already rejects an expired JWT before the row is ever
        # looked up) but there's no cron to reap it, so sweep it here instead.
        await self._db.execute(
            delete(RefreshSession).where(
                RefreshSession.user_id == user.id, RefreshSession.expires_at < now
            )
        )
        self._db.add(
            RefreshSession(
                user_id=user.id,
                jti=jti,
                expires_at=now + timedelta(days=settings.jwt_refresh_expire_days),
            )
        )
        await self._db.commit()
        return access_token, refresh_token

    async def refresh_tokens(self, refresh_token: str) -> tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except TokenError as exc:
            raise InvalidRefreshTokenError() from exc

        if payload.get("type") != "refresh":
            raise InvalidRefreshTokenError()

        user_id = int(payload["sub"])
        user = await self._db.get(User, user_id)
        if user is None:
            raise InvalidRefreshTokenError()

        # Reject a refresh token that isn't (or is no longer) an active
        # session: already rotated away by a previous refresh, revoked by
        # logout, or simply never issued. This is what makes rotation an
        # actual security control rather than just "hand out new tokens" —
        # without it, an intercepted refresh token stays usable for its full
        # lifetime (CLAUDE.md rule 7's ownership-check principle applied to
        # the token itself).
        session = await self._db.scalar(
            select(RefreshSession).where(
                RefreshSession.jti == payload.get("jti"), RefreshSession.user_id == user_id
            )
        )
        if session is None:
            raise InvalidRefreshTokenError()
        await self._db.delete(session)

        return await self.issue_tokens(user)

    async def revoke_refresh_token(self, refresh_token: str) -> None:
        """Best-effort server-side logout: an already-expired or malformed
        token is simply ignored — the client-side cookie deletion in the
        router still happens regardless."""
        try:
            payload = decode_token(refresh_token)
        except TokenError:
            return
        if payload.get("type") != "refresh":
            return

        await self._db.execute(
            delete(RefreshSession).where(
                RefreshSession.jti == payload.get("jti"),
                RefreshSession.user_id == int(payload["sub"]),
            )
        )
        await self._db.commit()

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
    ) -> User | None:
        """Returns None when VK didn't return an email and no linked
        oauth_accounts row exists yet to resolve one from — the caller
        surfaces this to the user as an unsupported-login case."""
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

    async def _login_via_vk_profile(self, profile: vk_client.VkProfile) -> User | None:
        # A repeat login is resolved by the existing oauth_accounts row alone —
        # VK not returning an email this time must not force the user through
        # an "enter your email" step again.
        existing_user = await self._find_vk_account_user(profile.provider_user_id)
        if existing_user is not None:
            return existing_user

        if profile.email is None:
            return None

        return await self._link_or_create_vk_user(
            profile.provider_user_id, profile.email, profile.display_name
        )

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
