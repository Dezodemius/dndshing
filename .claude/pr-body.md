## Что сделано

Удалён весь код старого Next.js-прототипа (генератор персонажей LSS) через `git rm`, закрывая DND-000 перед началом DND-001 (новый backend-каркас).

Удалено:
- Каталоги: `app/`, `features/`, `shared/`, `mockup/`, `tests/`, `supabase/`
- Конфиги: `middleware.ts`, `next.config.mjs`, `next-env.d.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `vercel.json`, `AGENTS.md`, `dndshing.code-workspace`, `.env.example`
- Старый CI: `.github/workflows/ci.yml`

Почищен `.gitignore` — убраны правила под старый стек (Next.js `.next/out`, Vercel, Playwright, Supabase temp), оставлены общие (node_modules, build/dist, env, IDE, логи, `.DS_Store`).

Сохранены без изменений: `.github/workflows/agent.yml`, `.github/workflows/review.yml`, `.claude/`, корневой `CLAUDE.md`, `.git*`-файлы, `.editorconfig`.

## Как проверял

- `git status` — чисто после каждого коммита.
- `ls -la` в корне — остались только `.claude/`, `.editorconfig`, `.git*`, `.github/`, `CLAUDE.md`, `.gitignore`.
- `git diff --stat develop..feat/dnd-000` — только удаления файлов и правка `.gitignore` (14 строк), никакого нового кода.
- Явно сверил, что `.github/workflows/agent.yml`, `review.yml` и `.claude/` не затронуты (`git diff --stat` по ним пустой).
- Тесты/линт не запускал — в дереве не осталось runtime-кода, тестировать нечего; сам это чисто удаляющая задача.

## Решения и допущения

- `test-results/` и `tsconfig.tsbuildinfo` физически отсутствовали в репозитории (были только записями в `.gitignore`) — удалять было нечего.
- `.gitignore` не расширял новыми правилами под будущий backend/frontend-стек — это не входит в скоуп DND-000, будет сделано в DND-001/003 по мере необходимости.
- `.claude/docs/BACKLOG.md` не редактировал: файл не содержит механизма трекинга статуса задач (статус задачи живёт в лейблах issue), добавлять новый формат — вне скоупа чисто удаляющей задачи.

## Что НЕ вошло и почему

- Новый backend/frontend-каркас — явно вне скоупа DND-000 (будет DND-001, DND-003).
- Правка `.claude/docs/BACKLOG.md` — нет установленного формата для отметки статуса; трекинг идёт через лейблы issue.
