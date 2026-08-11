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


class ShopClosedError(AppError):
    code = "shop_closed"
    message = "Лавка закрыта"
    status_code = 400


class OutOfStockError(AppError):
    code = "out_of_stock"
    message = "Не хватает товара на складе"
    status_code = 400


class NotYourCharacterError(AppError):
    code = "not_your_character"
    message = "Персонаж не найден"
    status_code = 404
