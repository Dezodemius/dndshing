# CLAUDE.md

Гайд для Claude Code по этому репозиторию. Автозагружается в контекст каждой задачи.

## Что это за проект

**D&D Campaign Platform** — веб-платформа для игроков и мастеров D&D 5e: живой лист персонажа с прокачкой в духе BG3, кампании, торговцы с экономикой. Работает до/после сессии, не VTT. Язык продукта — русский.

> Проект переписывается с нуля: прежний прототип (Next.js-генератор персонажей) выводится из эксплуатации. Стек ниже зафиксирован — старый код не ориентир.

## Канонические документы — читать перед любой задачей

- `.claude/docs/CLAUDE.md` — правила работы агента и Definition of Done (главный свод).
- `.claude/docs/REQUIREMENTS.md` — бизнес-требования (BR): роли, сценарии US-1…US-12, границы MVP, критерии приёмки.
- `.claude/docs/ARCHITECTURE.md` — архитектура (AR): стек, доменная модель, схема БД, API-контракт, нарезка задач.
- `.claude/docs/BACKLOG.md` — задачи DND-NNN, их метки и зависимости (источник для GitHub-ишью).
- `.claude/skills/` — конвенции проекта (`code-style`, `security-review`, `ux-convention`); применять по их описаниям.

## Ветки

База — **develop**. Ветки задач: `feat/dnd-NNN` от develop, PR в develop. В `main` попадают только релизные мержи (прод деплоится отдельным CD-воркфлоу).

## Стек (зафиксирован, альтернатив не предлагать)

- Backend: Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, pytest
- БД: PostgreSQL 16
- Frontend: React 18 + TypeScript + Vite, TanStack Query, react-hook-form + zod, React Router, i18next (locale: ru)
- Инфра: Docker Compose, GitHub Actions, Cloudflare

Полные правила работы, команды и Definition of Done — в `.claude/docs/CLAUDE.md`.
