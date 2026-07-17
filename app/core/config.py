from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"

    # No defaults: credentials must never be readable from the source tree, and a
    # missing DATABASE_URL has to abort the boot instead of silently connecting
    # somewhere with fallback credentials. TEST_DATABASE_URL is only needed by the
    # test run, so it stays optional and is enforced by the pytest fixture.
    database_url: str
    test_database_url: str | None = None

    # No default: a missing secret must abort the boot, not sign tokens with a
    # guessable fallback.
    jwt_secret_key: str
    jwt_access_expire_minutes: int = 15
    jwt_refresh_expire_days: int = 30
    email_verification_expire_hours: int = 24

    # smtp_host has no default: a silently defaulted "localhost" would let a prod
    # deploy that forgot to set it boot successfully while silently failing to
    # ever deliver mail (rule 12). smtp_user/password stay optional — `None`
    # means "no auth", not a guessable fallback credential.
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "noreply@dndshing.local"
    smtp_use_tls: bool = False

    # No default: used to build links in emails (e.g. email verification) that
    # must open the SPA. A defaulted "localhost:5173" would let a prod deploy
    # that forgot to set it silently mail out dev links (rule 12).
    frontend_base_url: str

    # Phase 2 groundwork (BR §6): the AI endpoint is unused in the MVP, but the
    # config must already exist so the future integration is not blocked.
    ai_base_url: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = None

    # OAuth: Яндекс. All three optional and default to None on purpose — the
    # provider is only active when all of them are configured (rule 12: no
    # partial/guessable fallback), so a deploy that never set up Yandex OAuth
    # simply has the endpoints respond "provider disabled" instead of crashing.
    yandex_client_id: str | None = None
    yandex_client_secret: str | None = None
    yandex_redirect_uri: str | None = None

    # OAuth: VK ID. Same all-or-nothing gating as Yandex above.
    vk_client_id: str | None = None
    vk_client_secret: str | None = None
    vk_redirect_uri: str | None = None

    # OAuth: Mail.ru. Same all-or-nothing rule as Yandex above.
    mailru_client_id: str | None = None
    mailru_client_secret: str | None = None
    mailru_redirect_uri: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
