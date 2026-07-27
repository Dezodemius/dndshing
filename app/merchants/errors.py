from app.core.errors import AppError


class MerchantNotFoundError(AppError):
    code = "merchant_not_found"
    message = "Торговец не найден"
    status_code = 404


class MerchantItemNotFoundError(AppError):
    code = "merchant_item_not_found"
    message = "Позиция торговца не найдена"
    status_code = 404


class MerchantInvalidReferenceError(AppError):
    code = "invalid_reference"
    message = "Некорректные данные позиции: нарушено ограничение целостности"
    status_code = 400
