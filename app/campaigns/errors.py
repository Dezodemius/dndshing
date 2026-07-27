from app.core.errors import AppError


class CampaignNotFoundError(AppError):
    code = "campaign_not_found"
    message = "Кампания не найдена"
    status_code = 404


class InviteCodeInvalidError(AppError):
    code = "invite_code_invalid"
    message = "Инвайт-код недействителен"
    status_code = 404


class AlreadyJoinedError(AppError):
    code = "already_joined"
    message = "Персонаж уже состоит в этой кампании"
    status_code = 400


class CampaignCharacterNotFoundError(AppError):
    code = "campaign_character_not_found"
    message = "Персонаж не состоит в этой кампании"
    status_code = 404
