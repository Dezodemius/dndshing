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


class LevelUpNotAvailableError(AppError):
    code = "level_up_not_available"
    message = "Недостаточно опыта для повышения уровня"
    status_code = 400


class AsiFeatConflictError(AppError):
    code = "asi_feat_conflict"
    message = "Нельзя выбрать одновременно улучшение характеристик и черту"
    status_code = 400


class SubclassWrongLevelError(AppError):
    code = "subclass_wrong_level"
    message = "Подкласс можно выбрать только на уровне, который его открывает"
    status_code = 400


class InvalidHpRollError(AppError):
    code = "invalid_hp_roll"
    message = "Результат броска хитов вне допустимого диапазона"
    status_code = 400


class InventoryPayloadInvalidError(AppError):
    code = "inventory_payload_invalid"
    message = "Нужно указать либо item_id, либо custom_name — но не оба сразу и не ни одного"
    status_code = 400


class InventoryEntryNotFoundError(AppError):
    code = "inventory_entry_not_found"
    message = "Запись инвентаря не найдена"
    status_code = 404


class SpellNotInClassListError(AppError):
    code = "spell_not_in_class_list"
    message = "Заклинание недоступно классу персонажа"
    status_code = 400


class RollbackEmptyError(AppError):
    code = "rollback_empty"
    message = "История уровней пуста — откатывать нечего"
    status_code = 400


class InsufficientFundsError(AppError):
    code = "insufficient_funds"
    message = "Недостаточно средств"
    status_code = 400


class CustomItemNotSellableError(AppError):
    code = "custom_item_not_sellable"
    message = "Предмет без ссылки на справочник нельзя продать торговцу"
    status_code = 400


class InsufficientInventoryQuantityError(AppError):
    code = "insufficient_inventory_quantity"
    message = "На складе персонажа недостаточно этого предмета"
    status_code = 400


class EffectNotFoundError(AppError):
    code = "effect_not_found"
    message = "Эффект не найден"
    status_code = 404


class EffectInvalidModifierError(AppError):
    code = "effect_invalid_modifier"
    message = "Некорректный модификатор эффекта"
    status_code = 400


class TooManyEffectsError(AppError):
    code = "too_many_effects"
    message = "Слишком много эффектов у персонажа — удалите ненужные"
    status_code = 400
