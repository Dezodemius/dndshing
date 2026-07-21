from app.core.errors import AppError


class CharacterNotFoundError(AppError):
    code = "character_not_found"
    message = "Персонаж не найден"
    status_code = 404


class LevelDirectEditForbiddenError(AppError):
    code = "level_direct_edit_forbidden"
    message = "Уровень нельзя изменить напрямую — только через level-up"
    status_code = 400


class InvalidReferenceError(AppError):
    code = "invalid_reference"
    message = "Некорректные данные персонажа: нарушено ограничение целостности"
    status_code = 400
