"""Standalone browser admin panel for content-pack import (owner-only tool).

Gated by a single fixed login pair from Settings (HTTP Basic), independent of
the User/is_admin/OAuth system: the owner uses this to import D&D 5e reference
data without needing a registered account. Not linked from the SPA and kept
out of the OpenAPI schema — reachable only by someone who already has the URL
and the credentials.
"""

import html
import json
import secrets

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.schemas import ContentPackImport, ImportReport
from app.content.service import ContentImportService
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rate_limit import rate_limit

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
</style>
</head>
<body>
<h1>Импорт контент-пака D&amp;D 5e</h1>
{report}
<form method="post" enctype="multipart/form-data">
  <input type="file" name="file" accept="application/json,.json" required>
  <button type="submit">Импортировать</button>
</form>
</body>
</html>
"""


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
        f"{report.created}, обновлено {report.updated}.</div>"
    )


def _render_page(*, report: ImportReport | None = None, error: str | None = None) -> str:
    return _PAGE_TEMPLATE.format(report=_render_report(report=report, error=error))


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
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return HTMLResponse(_render_page(error="Невалидный JSON. Проверьте формат файла."))

    try:
        pack = ContentPackImport.model_validate(data)
    except ValidationError:
        return HTMLResponse(_render_page(error="Пак не соответствует ожидаемой схеме."))

    report = await ContentImportService(db).import_pack(pack)
    return HTMLResponse(_render_page(report=report))
