from app.core.config import Settings


def list_active_providers(settings: Settings) -> list[str]:
    """Providers rendered as OAuth buttons on /login and /register.

    A provider is active only when all three of its config fields are set
    (same all-or-nothing gate as `_require_*_config` in router.py)."""
    providers = []
    if settings.yandex_client_id and settings.yandex_client_secret and settings.yandex_redirect_uri:
        providers.append("yandex")
    if settings.vk_client_id and settings.vk_client_secret and settings.vk_redirect_uri:
        providers.append("vk")
    if settings.mailru_client_id and settings.mailru_client_secret and settings.mailru_redirect_uri:
        providers.append("mailru")
    return providers
