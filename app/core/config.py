from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    database_url: str = "postgresql+asyncpg://dndshing:dndshing@localhost:5432/dndshing"
    test_database_url: str = "postgresql+asyncpg://dndshing:dndshing@localhost:5432/dndshing_test"

    # Задел фазы 2 (BR §6): AI-эндпоинт не используется в MVP, но конфиг
    # должен существовать заранее и не блокировать будущую интеграцию.
    ai_base_url: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
