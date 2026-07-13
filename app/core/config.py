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

    # Phase 2 groundwork (BR §6): the AI endpoint is unused in the MVP, but the
    # config must already exist so the future integration is not blocked.
    ai_base_url: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
