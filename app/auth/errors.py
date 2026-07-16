from app.core.errors import AppError


class EmailAlreadyRegisteredError(AppError):
    code = "email_already_registered"
    message = "Пользователь с таким email уже зарегистрирован"
    status_code = 409


class InvalidCredentialsError(AppError):
    code = "invalid_credentials"
    message = "Неверный email или пароль"
    status_code = 401


class InvalidRefreshTokenError(AppError):
    code = "invalid_refresh_token"
    message = "Недействительный refresh-токен"
    status_code = 401


class NotAuthenticatedError(AppError):
    code = "not_authenticated"
    message = "Требуется авторизация"
    status_code = 401


class InvalidVerificationTokenError(AppError):
    code = "invalid_verification_token"
    message = "Ссылка для подтверждения email недействительна или устарела"
    status_code = 400


class EmailNotVerifiedError(AppError):
    code = "email_not_verified"
    message = "Подтвердите email, чтобы получить доступ"
    status_code = 403


class OAuthProviderDisabledError(AppError):
    code = "oauth_provider_disabled"
    message = "Этот способ входа сейчас недоступен"
    status_code = 404


class OAuthStateMismatchError(AppError):
    code = "oauth_state_mismatch"
    message = "Сессия входа устарела или недействительна, попробуйте снова"
    status_code = 400


class OAuthProviderError(AppError):
    code = "oauth_provider_error"
    message = "Не удалось войти через выбранный сервис, попробуйте позже"
    status_code = 502


class AdminRequiredError(AppError):
    code = "admin_required"
    message = "Требуются права администратора"
    status_code = 403
