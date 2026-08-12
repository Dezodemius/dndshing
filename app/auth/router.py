import secrets

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mailru_client, vk_client, yandex_client
from app.auth.dependencies import get_current_user
from app.auth.errors import (
    InvalidRefreshTokenError,
    OAuthProviderDisabledError,
    OAuthStateMismatchError,
)
from app.auth.models import User
from app.auth.oauth import list_active_providers
from app.auth.schemas import OAuthProvidersResponse, TokenResponse, UserResponse
from app.auth.service import AuthService
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rate_limit import rate_limit

router = APIRouter(tags=["auth"], dependencies=[rate_limit("auth", limit=60, window_seconds=60)])

_REFRESH_COOKIE_NAME = "refresh_token"
_REFRESH_COOKIE_PATH = "/api/v1/auth"
_OAUTH_STATE_COOKIE_NAME = "oauth_state"
_OAUTH_STATE_COOKIE_PATH = "/api/v1/auth/oauth/yandex"
_VK_OAUTH_PATH = "/api/v1/auth/oauth/vk"
_VK_CODE_VERIFIER_COOKIE_NAME = "oauth_code_verifier"
_MAILRU_OAUTH_STATE_COOKIE_PATH = "/api/v1/auth/oauth/mailru"


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
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> None:
    refresh_token = request.cookies.get(_REFRESH_COOKIE_NAME)
    if refresh_token:
        await AuthService(db).revoke_refresh_token(refresh_token)
    response.delete_cookie(_REFRESH_COOKIE_NAME, path=_REFRESH_COOKIE_PATH)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/auth/oauth/providers", response_model=OAuthProvidersResponse)
async def oauth_providers() -> OAuthProvidersResponse:
    return OAuthProvidersResponse(providers=list_active_providers(get_settings()))


def _require_yandex_config() -> tuple[str, str, str]:
    settings = get_settings()
    client_id = settings.yandex_client_id
    client_secret = settings.yandex_client_secret
    redirect_uri = settings.yandex_redirect_uri
    if not (client_id and client_secret and redirect_uri):
        raise OAuthProviderDisabledError()
    return client_id, client_secret, redirect_uri


@router.get("/auth/oauth/yandex/authorize")
async def yandex_authorize() -> RedirectResponse:
    client_id, _client_secret, redirect_uri = _require_yandex_config()

    state = secrets.token_urlsafe(24)
    authorize_url = yandex_client.build_authorize_url(client_id, redirect_uri, state)
    redirect = RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)
    redirect.set_cookie(
        key=_OAUTH_STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        secure=get_settings().app_env != "local",
        samesite="lax",
        max_age=600,
        path=_OAUTH_STATE_COOKIE_PATH,
    )
    return redirect


@router.get("/auth/oauth/yandex/callback")
async def yandex_callback(
    request: Request, code: str, state: str, db: AsyncSession = Depends(get_db)
) -> RedirectResponse:
    client_id, client_secret, redirect_uri = _require_yandex_config()

    # CSRF protection: the state minted at /authorize must round-trip in an
    # httponly cookie set on the same browser, since there is no server-side
    # session to compare against (security-review: "OAuth state обязателен").
    cookie_state = request.cookies.get(_OAUTH_STATE_COOKIE_NAME)
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        raise OAuthStateMismatchError()

    service = AuthService(db)
    user = await service.login_via_yandex_code(code, client_id, client_secret, redirect_uri)
    jwt_access_token, refresh_token = await service.issue_tokens(user)

    settings = get_settings()
    callback_url = (
        f"{settings.frontend_base_url}/oauth/callback"
        f"#access_token={jwt_access_token}&token_type=bearer"
    )
    redirect = RedirectResponse(callback_url, status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(redirect, refresh_token)
    redirect.delete_cookie(_OAUTH_STATE_COOKIE_NAME, path=_OAUTH_STATE_COOKIE_PATH)
    return redirect


def _require_vk_config() -> tuple[str, str, str]:
    settings = get_settings()
    client_id = settings.vk_client_id
    client_secret = settings.vk_client_secret
    redirect_uri = settings.vk_redirect_uri
    if not (client_id and client_secret and redirect_uri):
        raise OAuthProviderDisabledError()
    return client_id, client_secret, redirect_uri


def _require_mailru_config() -> tuple[str, str, str]:
    settings = get_settings()
    client_id = settings.mailru_client_id
    client_secret = settings.mailru_client_secret
    redirect_uri = settings.mailru_redirect_uri
    if not (client_id and client_secret and redirect_uri):
        raise OAuthProviderDisabledError()
    return client_id, client_secret, redirect_uri


@router.get("/auth/oauth/vk/authorize")
async def vk_authorize() -> RedirectResponse:
    client_id, _client_secret, redirect_uri = _require_vk_config()

    state = secrets.token_urlsafe(24)
    code_verifier, code_challenge = vk_client.generate_pkce_pair()
    authorize_url = vk_client.build_authorize_url(client_id, redirect_uri, state, code_challenge)

    redirect = RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)
    is_secure = get_settings().app_env != "local"
    redirect.set_cookie(
        key=_OAUTH_STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=600,
        path=_VK_OAUTH_PATH,
    )
    redirect.set_cookie(
        key=_VK_CODE_VERIFIER_COOKIE_NAME,
        value=code_verifier,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=600,
        path=_VK_OAUTH_PATH,
    )
    return redirect


@router.get("/auth/oauth/mailru/authorize")
async def mailru_authorize() -> RedirectResponse:
    client_id, _client_secret, redirect_uri = _require_mailru_config()

    state = secrets.token_urlsafe(24)
    authorize_url = mailru_client.build_authorize_url(client_id, redirect_uri, state)
    redirect = RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)
    redirect.set_cookie(
        key=_OAUTH_STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        secure=get_settings().app_env != "local",
        samesite="lax",
        max_age=600,
        path=_MAILRU_OAUTH_STATE_COOKIE_PATH,
    )
    return redirect


@router.get("/auth/oauth/vk/callback")
async def vk_callback(
    request: Request, code: str, state: str, db: AsyncSession = Depends(get_db)
) -> RedirectResponse:
    client_id, client_secret, redirect_uri = _require_vk_config()

    # Same CSRF protection as Yandex, plus the PKCE code_verifier minted at
    # /authorize — VK ID (OAuth 2.1) requires it for the token exchange.
    cookie_state = request.cookies.get(_OAUTH_STATE_COOKIE_NAME)
    code_verifier = request.cookies.get(_VK_CODE_VERIFIER_COOKIE_NAME)
    if not cookie_state or not code_verifier or not secrets.compare_digest(cookie_state, state):
        raise OAuthStateMismatchError()

    service = AuthService(db)
    user = await service.login_via_vk_code(
        code, client_id, client_secret, redirect_uri, code_verifier
    )

    settings = get_settings()
    if user is not None:
        jwt_access_token, refresh_token = await service.issue_tokens(user)
        callback_url = (
            f"{settings.frontend_base_url}/oauth/callback"
            f"#access_token={jwt_access_token}&token_type=bearer"
        )
        redirect = RedirectResponse(callback_url, status_code=status.HTTP_302_FOUND)
        _set_refresh_cookie(redirect, refresh_token)
    else:
        # VK didn't return an email and there's no way to collect one — the
        # frontend shows this as an unsupported-login case (no access_token
        # in the fragment).
        redirect = RedirectResponse(
            f"{settings.frontend_base_url}/oauth/callback", status_code=status.HTTP_302_FOUND
        )

    redirect.delete_cookie(_OAUTH_STATE_COOKIE_NAME, path=_VK_OAUTH_PATH)
    redirect.delete_cookie(_VK_CODE_VERIFIER_COOKIE_NAME, path=_VK_OAUTH_PATH)
    return redirect


@router.get("/auth/oauth/mailru/callback")
async def mailru_callback(
    request: Request, code: str, state: str, db: AsyncSession = Depends(get_db)
) -> RedirectResponse:
    client_id, client_secret, redirect_uri = _require_mailru_config()

    # CSRF protection: same rationale as the Yandex callback above.
    cookie_state = request.cookies.get(_OAUTH_STATE_COOKIE_NAME)
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        raise OAuthStateMismatchError()

    service = AuthService(db)
    user = await service.login_via_mailru_code(code, client_id, client_secret, redirect_uri)
    jwt_access_token, refresh_token = await service.issue_tokens(user)

    settings = get_settings()
    callback_url = (
        f"{settings.frontend_base_url}/oauth/callback"
        f"#access_token={jwt_access_token}&token_type=bearer"
    )
    redirect = RedirectResponse(callback_url, status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(redirect, refresh_token)
    redirect.delete_cookie(_OAUTH_STATE_COOKIE_NAME, path=_MAILRU_OAUTH_STATE_COOKIE_PATH)
    return redirect
