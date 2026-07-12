## Что сделано

DND-001 — каркас backend и окружение по AR §3.

- `app/{core,auth,content,characters,campaigns,merchants}` — модульная структура пакетов. Бизнес-модули (`auth/content/characters/campaigns/merchants`) — пустые `__init__.py`-заглушки: их `router.py`/`service.py`/`models.py` — скоуп следующих задач.
- `app/core` — конфиг (`pydantic-settings`, `.env`), async SQLAlchemy engine/session (`app/core/db.py`), роутер с `GET /healthz`. В конфиг заранее заведены пустые поля `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` — обязательный задел фазы 2 по BR §6.
- `app/main.py` — FastAPI-приложение, подключает core-роутер.
- Alembic инициализирован в async-режиме (`alembic.ini`, `alembic/env.py` читает URL из `Settings`), одна пустая базовая миграция `0001_initial` (no-op upgrade/downgrade) — фиксирует начало цепочки миграций без бизнес-моделей.
- `docker-compose.yml` + `Dockerfile`: сервисы `api` (FastAPI/uvicorn) и `db` (postgres:16); `docker/postgres/init-test-db.sh` создаёт вторую БД `<POSTGRES_DB>_test` при первом старте контейнера — под тестовый прогон.
- `requirements.txt` / `requirements-dev.txt` / `pyproject.toml` (`[tool.pytest.ini_options]`, `[tool.ruff]`) / `.env.example`.
- `tests/conftest.py` — фикстура применяет alembic-миграции к тестовой БД (через отдельный `ALEMBIC_DATABASE_URL`, не трогая закэшированный `Settings` приложения) + httpx `AsyncClient` поверх ASGI-приложения; `tests/test_healthz.py` — smoke-тест `/healthz`.
- Секция «Команды» заполнена реальными командами в `.claude/docs/CLAUDE.md` и в корневом `README.md`.
- Попутные инфраструктурные фиксы (см. «Решения и допущения»): `.gitignore` пропускал `.env.example` под правилом `.env.*`; `.gitattributes` заставлял checkout переводить shell-скрипты в CRLF, что ломает shebang.

## Как проверял

Тесты:
```bash
pytest -v   # tests/test_healthz.py::test_healthz_returns_ok PASSED
ruff check .   # All checks passed!
```

Ручные шаги (выполнены в этой сессии, каждый — с нуля):
1. `docker compose up -d --build` → `db` становится healthy, `api` стартует; `curl http://localhost:8000/healthz` → `200 {"status":"ok"}`.
2. `psql \l` внутри контейнера `db` подтверждает наличие обеих БД: `dndshing` и `dndshing_test` (создана init-скриптом).
3. `alembic upgrade head` на пустой БД `dndshing` → «Running upgrade -> 0001, initial», без ошибок.
4. `pytest` (фикстура сама поднимает alembic-миграции на `dndshing_test`) → зелёный.
5. Проверил CRLF-риск: `git rm` + `git checkout --` файла `docker/postgres/init-test-db.sh` до фикса `.gitattributes` показывал, что при чистом чекауте shebang превращается в `#!/bin/sh\r\n` (сломало бы `docker-entrypoint-initdb.d`, т.к. скрипт исполняемый); после добавления `*.sh text eol=lf` — тем же способом подтвердил, что скрипт остаётся LF.
6. `docker compose down -v` в конце — контейнеры и тестовые данные не оставлены висеть.

## Решения и допущения

- `/healthz` — без префикса `/api/v1` и без похода в БД (инфраструктурный liveness-чек, не бизнес-эндпоинт).
- Тестовая БД — отдельная база `<POSTGRES_DB>_test` в том же postgres-контейнере (создаётся init-скриптом), а не отдельный сервис compose.
- Миграции в тестах используют собственную переменную `ALEMBIC_DATABASE_URL` (задаётся фикстурой `conftest.py`), а не общий закэшированный `Settings.database_url` — так `alembic upgrade head` в проде и в тестах используют один и тот же `env.py` без риска гонки кэша `lru_cache`.
- Версии в `requirements*.txt` — нижней границей (`>=`, с потолком по мажору), без строгого пиннинга: лок-файла в проекте пока нет, а вводить его — за рамками скоупа задачи.
- Модули `auth/content/characters/campaigns/merchants` — только `__init__.py`, без заглушек `router.py`/`service.py`, чтобы не плодить мёртвый код вне скоупа задачи.
- Найдены и исправлены две ловушки в существующих `.gitignore`/`.gitattributes` (не относятся напрямую к скоупу DND-001, но без фикса ломали именно то, что просит добавить эта задача): `.gitignore` игнорировал `.env.example` под маской `.env.*` — добавил `!.env.example`; `.gitattributes` (`eol=crlf`, унаследовано от старого Windows/Next.js-окружения) на чистом чекауте превращал shebang shell-скрипта в CRLF — добавил override `*.sh text eol=lf`.

## Что не вошло и почему

- Любые бизнес-модели и эндпоинты (auth, content, characters, campaigns, merchants) — прямо вне скоупа DND-001, будут в DND-010/DND-020/DND-030+.
- CI (ruff + pytest на PR) — это DND-002, отдельная зависимая задача.
- Фронтенд-каркас — DND-003.
