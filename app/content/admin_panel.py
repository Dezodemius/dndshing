"""Standalone browser admin panel for content-pack import (owner-only tool).

The ONLY way content enters the system over HTTP: the public API is read-only
(app/content/router.py), so nothing about content import is visible to a normal
user. Gated by a single fixed login pair from Settings (HTTP Basic), independent
of the User/is_admin/OAuth system: the owner uses this to import D&D 5e reference
data without needing a registered account. Not linked from the SPA and kept
out of the OpenAPI schema — reachable only by someone who already has the URL
and the credentials.

An upload updates two places: the database (so the API serves it immediately)
and the pack file on disk (so the next boot loads the same content — the file is
the source of truth, see app/content/pack_loader.py).
"""

import html
import logging
import secrets

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.pack_loader import (
    PackJSONError,
    PackSchemaError,
    apply_pack,
    pack_path,
    parse_pack,
    write_pack_file,
)
from app.content.schemas import ImportReport
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rate_limit import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["content-admin-panel"],
    include_in_schema=False,
    # Same per-IP order of magnitude as auth/router.py's login limit — this
    # panel is a Basic Auth credential-guessing target just like /auth/login.
    dependencies=[rate_limit("admin-panel", limit=20, window_seconds=60)],
)

# auto_error=False: a missing pair must fall through to the "disabled" 404 below
# instead of HTTPBasic itself pre-empting with a 401 prompt, which would leak
# that the panel exists even when it's not configured.
_basic = HTTPBasic(auto_error=False)


def _require_panel_credentials(
    credentials: HTTPBasicCredentials | None = Depends(_basic),
) -> None:
    settings = get_settings()
    username = settings.admin_panel_username
    password = settings.admin_panel_password
    if username is None or password is None:
        raise HTTPException(status_code=404)

    unauthorized = HTTPException(
        status_code=401,
        detail="Неверный логин или пароль",
        headers={"WWW-Authenticate": 'Basic realm="dndshing-admin"'},
    )
    if credentials is None:
        raise unauthorized

    # Both comparisons always run (no short-circuit on username) so a wrong
    # username doesn't skip the password compare and leak timing information.
    valid_username = secrets.compare_digest(credentials.username, username)
    valid_password = secrets.compare_digest(credentials.password, password)
    if not (valid_username and valid_password):
        raise unauthorized


def _require_same_origin(request: Request) -> None:
    """Basic Auth credentials are cached by the browser and auto-attached to
    matching-origin requests, including a cross-site page's auto-submitting
    <form>. Reject any POST whose Origin host doesn't match our own Host
    header (browsers set Origin on POST; same-origin requests are unaffected).
    Compared by host only, not full scheme+host: behind Cloudflare TLS
    termination, request.url.scheme reflects the origin-facing hop and would
    mismatch a browser's https:// Origin even for a legitimate same-site
    request, while Host is passed through unchanged."""
    origin = request.headers.get("origin")
    if origin is None:
        return
    origin_host = origin.split("://", 1)[-1]
    if origin_host != request.headers.get("host"):
        raise HTTPException(status_code=403, detail="Недопустимый Origin")


_PAGE_TEMPLATE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Импорт контента</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto;
    padding: 0 16px; color: #222; }}
  h1 {{ font-size: 1.25rem; }}
  form {{ margin: 24px 0; }}
  input[type=file] {{ display: block; margin: 12px 0; }}
  button {{ padding: 8px 16px; cursor: pointer; }}
  .report {{ padding: 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid; }}
  .report.ok {{ background: #e6f4ea; border-color: #34a853; }}
  .report.error {{ background: #fce8e6; border-color: #d93025; }}
  ul {{ margin: 8px 0; padding-left: 20px; }}
  .hint {{ color: #555; font-size: 0.9rem; }}
</style>
</head>
<body>
<h1>Импорт контент-пака D&amp;D 5e</h1>
<p class="hint">Файл пака — источник правды: загруженный JSON заменяет
<code>{pack_path}</code> целиком и сразу применяется к базе.</p>
{report}
<form method="post" enctype="multipart/form-data">
  <input type="file" name="file" accept="application/json,.json" required>
  <button type="submit">Импортировать</button>
</form>
</body>
</html>
"""


_INVALID_JSON_MESSAGE = "Невалидный JSON. Проверьте формат файла."
_INVALID_SCHEMA_MESSAGE = "Пак не соответствует ожидаемой схеме."


def _render_report(*, report: ImportReport | None, error: str | None) -> str:
    if error is not None:
        return f'<div class="report error"><strong>Ошибка:</strong> {html.escape(error)}</div>'

    if report is None:
        return ""

    if report.errors:
        items = "".join(
            f"<li>{html.escape(item.entity)} "
            f"{html.escape(item.slug) if item.slug else ''}: {html.escape(item.message)}</li>"
            for item in report.errors
        )
        return (
            '<div class="report error"><strong>Пак не применён, есть ошибки:</strong>'
            f"<ul>{items}</ul></div>"
        )

    return (
        '<div class="report ok">Готово: создано '
        f"{report.created}, обновлено {report.updated}. Файл пака перезаписан.</div>"
    )


def _render_page(*, report: ImportReport | None = None, error: str | None = None) -> str:
    return _PAGE_TEMPLATE.format(
        pack_path=html.escape(str(pack_path())),
        report=_render_report(report=report, error=error),
    )


@router.get("/internal/admin/content-import")
async def import_panel_form(_: None = Depends(_require_panel_credentials)) -> HTMLResponse:
    return HTMLResponse(_render_page())


@router.post("/internal/admin/content-import")
async def import_panel_submit(
    request: Request,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_panel_credentials),
) -> HTMLResponse:
    _require_same_origin(request)

    raw = await file.read()
    # Причина различается по подклассу, а текст берётся из констант: детали
    # разбора (позиция в JSON, поля Pydantic) остаются в логе и в ответ не
    # попадают.
    try:
        pack = parse_pack(raw)
    except PackJSONError:
        logger.exception("Загруженный контент-пак не разобран как JSON")
        return HTMLResponse(_render_page(error=_INVALID_JSON_MESSAGE))
    except PackSchemaError:
        logger.exception("Загруженный контент-пак не соответствует схеме")
        return HTMLResponse(_render_page(error=_INVALID_SCHEMA_MESSAGE))

    report = await apply_pack(db, pack)
    if report.errors:
        return HTMLResponse(_render_page(report=report))

    # Файл перезаписывается только после успешного импорта: иначе на диске
    # остался бы пак, который приложение не сможет применить на следующем старте.
    # Байты пишутся ровно те, что прислали, — файл остаётся читаемым исходником,
    # а не результатом round-trip через Pydantic.
    try:
        write_pack_file(raw)
    except OSError:
        logger.exception("Не удалось записать контент-пак в %s", pack_path())
        return HTMLResponse(
            _render_page(
                error=(
                    "Пак применён к базе, но файл на диске перезаписать не удалось — "
                    "после перезапуска изменения потеряются. Проверьте права на "
                    f"{pack_path()}."
                )
            )
        )

    return HTMLResponse(_render_page(report=report))
