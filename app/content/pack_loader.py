"""Файл контент-пака — единственный источник справочного контента.

БД здесь производная: при старте приложение читает файл и апсертит его в базу
(`sync_pack_on_startup`), а браузерная админка (`app/content/admin_panel.py`)
принимает новый файл, применяет его и перезаписывает файл на диске. Публичного
HTTP-эндпоинта импорта нет — обычный пользователь контент не загружает.

Ошибка чтения пака не валит загрузку приложения: API продолжает отдавать то,
что уже лежит в БД от прошлого успешного импорта, а причина уходит в лог. Падать
на старте здесь опаснее, чем работать со слегка устаревшим справочником — иначе
одна опечатка в JSON кладёт весь сайт.
"""

import json
import logging
import os
import tempfile
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.content.schemas import ContentPackImport, ImportReport
from app.content.service import ContentImportService
from app.core.config import get_settings
from app.core.db import async_session_factory

logger = logging.getLogger(__name__)


class PackFileError(Exception):
    """Пак не удалось прочитать: битый JSON или несоответствие схеме.

    Сообщение — уже готовый для показа владельцу русский текст (админка рендерит
    его как есть).
    """


def pack_path() -> Path:
    return Path(get_settings().content_pack_path)


def parse_pack(raw: bytes) -> ContentPackImport:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise PackFileError("Невалидный JSON. Проверьте формат файла.") from exc

    try:
        return ContentPackImport.model_validate(data)
    except ValidationError as exc:
        raise PackFileError("Пак не соответствует ожидаемой схеме.") from exc


def read_pack_file(path: Path | None = None) -> ContentPackImport | None:
    """Читает пак с диска. None — файла нет (свежая установка), это не ошибка."""
    target = path or pack_path()
    try:
        raw = target.read_bytes()
    except FileNotFoundError:
        return None
    return parse_pack(raw)


def write_pack_file(raw: bytes, path: Path | None = None) -> None:
    """Перезаписывает файл пака целиком.

    Через временный файл рядом с целевым и os.replace: обрыв записи не должен
    оставить на диске половину пака, из которой приложение потом не поднимется.
    Каталог рядом (не системный tmp) — os.replace атомарен только в пределах
    одной файловой системы.
    """
    target = path or pack_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        dir=target.parent, prefix=f".{target.name}.", suffix=".tmp", delete=False
    )
    try:
        with handle as tmp:
            tmp.write(raw)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(handle.name, target)
    except BaseException:
        # Временный файл не должен пережить неудачную запись.
        Path(handle.name).unlink(missing_ok=True)
        raise


async def apply_pack(db: AsyncSession, pack: ContentPackImport) -> ImportReport:
    return await ContentImportService(db).import_pack(pack)


async def sync_pack_on_startup(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> ImportReport | None:
    """Подтягивает контент из файла в БД при загрузке приложения.

    session_factory параметризован ради тестов: приложение ходит в боевой
    движок (app.core.db), а тесты подставляют свой.
    """
    target = pack_path()
    try:
        pack = read_pack_file(target)
    except PackFileError as exc:
        logger.error("Контент-пак %s не прочитан: %s", target, exc)
        return None

    if pack is None:
        logger.warning("Контент-пак %s не найден — справочник не обновлён", target)
        return None

    async with (session_factory or async_session_factory)() as session:
        report = await apply_pack(session, pack)

    if report.errors:
        logger.error(
            "Контент-пак %s не применён, ошибок: %d (%s)",
            target,
            len(report.errors),
            "; ".join(f"{item.entity} {item.slug or ''}: {item.message}" for item in report.errors),
        )
    else:
        logger.info(
            "Контент-пак %s применён: создано %d, обновлено %d",
            target,
            report.created,
            report.updated,
        )
    return report
