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
