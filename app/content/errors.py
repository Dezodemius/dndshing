from app.core.errors import AppError


class ClassNotFoundError(AppError):
    code = "class_not_found"
    message = "Класс не найден"
    status_code = 404
