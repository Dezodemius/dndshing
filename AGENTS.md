# AGENTS.md

Инструкции для Codex и других инженерных агентов, работающих в этом репозитории.
Если документ расходится с кодом, миграциями или CI, источником истины является
актуальный код. При обнаружении расхождения обновить этот файл в рамках задачи.

## Роль и подход

- Работать как senior/staff инженер, отвечающий за долгосрочное качество системы.
- Анализировать не только локальный код, но и архитектурные границы, контракты,
  миграции, безопасность, отказоустойчивость, observability и эксплуатацию.
- Не соглашаться с предлагаемым решением автоматически. Явно указывать smells,
  риски, trade-offs и более простые альтернативы.
- Предпочитать production-grade решения с минимальной операционной сложностью.
- Сохранять существующие паттерны проекта и не выполнять несвязанные рефакторинги.
- Не откатывать и не включать в коммит чужие изменения.

## Среда разработки

- Основная среда пользователя: Windows.
- Рабочая папка: `F:\dnd project`.
- Пользователь предпочитает `cmd` вместо PowerShell, когда команда одинаково
  удобно выражается в обоих shell.
- Кодировка текстовых файлов: UTF-8 без BOM.
- Окончания строк: CRLF. Это закреплено в `.editorconfig` и `.gitattributes`.
- После любых изменений обязательно проверить:

```cmd
git diff --check
git ls-files --eol -- <changed-files>
```

- В изменённых текстовых файлах должно быть `w/crlf`, без bare LF и без BOM.
- TypeScript использует строгий режим и alias `@/*` от корня репозитория.

## Git и коммиты

- После завершения каждой задачи обязательно создать коммит, если пользователь
  явно не запретил коммит или задача не завершена из-за блокера.
- Сообщение каждого коммита Codex начинается с `codex:`.
- Основной автор и committer:
  `Гладков Егор <gladkovyegor@gmail.com>`.
- Codex указывается соавтором в trailer:
  `Co-authored-by: OpenAI Codex <codex@openai.com>`.
- Пример:

```text
codex: refine character sheet controls

Co-authored-by: OpenAI Codex <codex@openai.com>
```

- Перед коммитом проверить staged diff и включать только файлы текущей задачи.
- Не менять глобальный или repository-level `user.name`/`user.email` ради
  коммита. При необходимости задавать author/committer только для команды.
- Не добавлять `.claude/settings.local.json` и другие локальные пользовательские
  файлы, если пользователь явно не попросил.
- Не переписывать опубликованную историю и не использовать destructive Git
  commands без прямого запроса пользователя.

## Назначение проекта

Приложение генерирует персонажей D&D 5e для Long Story Short (LSS):

1. Принимает ответ Яндекс.Формы через webhook.
2. Создаёт draft персонажа в Supabase.
3. Вызывает OpenAI-compatible API с пользовательскими AI-настройками.
4. Валидирует результат через Zod.
5. Строит внутреннюю модель персонажа и LSS JSON.
6. Сохраняет JSON в Postgres и приватный Supabase Storage.
7. Позволяет просматривать, редактировать, печатать и скачивать лист персонажа.

UI и пользовательские сообщения в основном русскоязычные.

## Технологии

- Next.js 15 App Router.
- React 19 и TypeScript 5 в strict mode.
- Tailwind CSS 3 и небольшие shadcn-style компоненты.
- Supabase Auth, Postgres, Storage и RLS.
- Zod для env, доменных моделей, webhook и AI-ответов.
- Vitest для unit-тестов.
- Playwright для E2E и визуальных проверок.
- Sharp для сравнения PNG.
- GitHub Actions и Vercel.

## Структура

```text
app/                Next.js pages и route handlers
features/           feature modules и доменная логика
shared/             общие UI, env, Supabase и utilities
supabase/           config и SQL migrations
tests/unit/         Vitest
tests/e2e/          Playwright
tests/fixtures/     тестовые данные
tests/references/   PDF-эталоны листа в PNG
mockup/             старые/вспомогательные HTML-макеты
```

### Feature modules

- `features/auth`: OAuth и auth actions.
- `features/folders`: игровые папки, CRUD, repository и формы.
- `features/characters`: доменная модель, repository, storage, server actions,
  карточки персонажей и интерактивный лист.
- `features/ai`: пользовательские настройки AI, prompt builder и
  OpenAI-compatible client.
- `features/webhooks`: адаптер Яндекс.Формы и generation pipeline.
- `features/lss`: Zod schema LSS, template, mapper, rich text и D&D heuristics.

Cross-feature imports выполнять через `@/features/...` и `@/shared/...`.
Не создавать циклические зависимости между features.

## Основные потоки

### Webhook

```text
POST /api/webhook/yandex-form
  -> yandex-form.adapter
  -> receiveWebhookPayload
  -> createDraftCharacter
  -> generateCharacterFromDraft (по server action/UI)
  -> AI generation
  -> InternalCharacter
  -> internalToLssJson
  -> Postgres + Supabase Storage
```

- Webhook работает через service-role client.
- `userId` обязателен.
- Если передан `folderId`, pipeline проверяет ownership.
- Иначе папка может быть найдена/создана по `gameDate`.
- Ошибки generation должны отражаться в `processing_steps`.

### Auth

- Supabase Google OAuth.
- Callback: `/api/auth/callback`.
- Middleware обновляет auth cookies.
- `/api/webhook` исключён из auth middleware.
- `/test-sheet` исключён из middleware и предназначен только для тестов.

## Данные и безопасность

- Основные таблицы: `folders`, `characters`, `user_ai_settings`.
- Для пользовательских таблиц включён RLS по `auth.uid() = user_id`.
- Generated JSON хранится в `characters.generated_json` и в приватном bucket
  `character-json`.
- Storage path должен сохранять ownership первым сегментом пути.
- Service role key никогда не передавать клиенту и не логировать.
- AI API key хранится на сервере; UI показывает только факт его наличия.
- Не логировать секреты, полный webhook payload или приватные данные без
  необходимости.
- Любые изменения схемы выполнять новой идемпотентной migration. Не редактировать
  уже применённые migration-файлы без отдельного migration plan.

## Character Sheet и LSS

Ключевые файлы:

- `features/characters/components/character-sheet.tsx`: интерактивный
  четырёхстраничный лист A4.
- `features/characters/lib/sheet-data.ts`: bidirectional mapping между LSS и
  editable `SheetState`.
- `features/lss/schema.ts`: runtime schema входного LSS.
- `tests/fixtures/keilin.ts`: эталон Кейлина.
- `tests/references/etalon/page1.png` ... `page4.png`: PDF-эталоны.

Правила:

- Не мутировать исходный LSS object. `applySheetState` использует clone и должен
  сохранять неизвестные поля.
- Новые UI-only данные можно хранить в passthrough-полях LSS, если они
  backward-compatible. Пример: `sheetAttacks`, `sheetSpellSlotsUsed`.
- Для нового editable поля нужны parse, apply и round-trip unit test.
- Автоматически вычисляемые значения не должны иметь ложные ручные controls.
- Пассивное восприятие: `10 + perception skill bonus`.
- Модификатор характеристики: `floor((score - 10) / 2)`.
- Визуальные изменения листа проверять и на экране, и в print CSS.
- Лист фиксированного размера: экран `794x1122`, печать `210x297mm`.
- Служебные controls имеют класс `no-print`.

## Тестовая страница листа

- `/test-sheet` рендерит `CharacterSheet` с `KEILIN_LSS_DATA`.
- Она не требует auth в development/test.
- В production возвращает 404.
- Не делать её доступной как production feature.

## Команды

Использовать `npm.cmd` в Windows automation, если обычный `npm` не запускается.

```cmd
npm.cmd install
npm.cmd run dev
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run test:e2e:visual
npm.cmd run build
```

Supabase:

```cmd
npx supabase start
npx supabase stop
npx supabase db push
```

### Обязательная проверка изменений

Для узкой задачи:

1. `npm.cmd run lint`
2. `npm.cmd run typecheck`
3. `npm.cmd run test`
4. Релевантный E2E или полный `npm.cmd run test:e2e`
5. Для UI листа: `npm.cmd run test:e2e:visual`
6. Для production-impact: `npm.cmd run build`
7. `git diff --check` и проверка CRLF

Не запускать `test:e2e` и `test:e2e:visual` параллельно. Они используют общий
`localhost:3000` и каталог `test-results`; параллельный запуск может остановить
dev server другого процесса и дать ложные `ERR_CONNECTION_REFUSED`.

## Visual tests

- `tests/e2e/visual.spec.ts` сравнивает HTML с PNG из PDF.
- PDF и Chromium имеют разную rasterization, поэтому default threshold равен
  `0.12`, а не нулю.
- Structural E2E являются gating; visual job в CI сейчас `continue-on-error`.
- При изменении layout не повышать threshold, чтобы скрыть regression.
  Сначала проверить actual/diff images и исправить геометрию.
- Sticky toolbar скрывается в visual test через `.no-print`.

## CI/CD

GitHub Actions запускает:

1. lint + typecheck;
2. unit tests;
3. production build;
4. Playwright E2E;
5. non-gating visual comparison.

Deploy выполняется только при push в `develop` после gating jobs:

1. `supabase db push`;
2. remote production deploy в Vercel.

`NEXT_PUBLIC_*` значения встраиваются в client bundle во время build.
Placeholder env разрешён только в check jobs и не должен попадать в deploy job.

## Environment variables

Список задаётся в `.env.example` и валидируется в `shared/config/env.ts`:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `YANDEX_FORM_WEBHOOK_SECRET`
- `WEBHOOK_DEFAULT_FOLDER_ID`
- `WEBHOOK_DEFAULT_USER_ID`
- `AI_API_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL_NAME`

Не коммитить `.env.local` и реальные значения секретов.

## Инженерные критерии

### Backend

- Server Components и Server Actions предпочитать по умолчанию.
- Client Components использовать только для реальной интерактивности.
- Все внешние данные валидировать на runtime boundary.
- Для repository calls проверять user ownership, cardinality и обработку ошибок.
- Не создавать N+1 queries и не загружать ненужные JSONB/blob данные.
- Async I/O не блокировать; ошибки не проглатывать.
- Для background/generation stages сохранять диагностируемый статус и message.

### Frontend

- Сохранять separation of concerns между page, feature component и mapper.
- Не дублировать derived state.
- Контролы должны иметь accessible name и корректное состояние.
- Layout листа не должен зависеть от случайной высоты текста или toolbar.
- Изменения состояния, которые пользователь ожидает сохранить, должны
  round-trip через `SheetState` и LSS JSON.

### Observability

- Логи должны включать безопасные correlation identifiers:
  `characterId`, `folderId`, stage.
- Не логировать API keys, auth tokens и полный private payload.
- Ошибка generation должна оставлять actionable processing status.

## Известные особенности

- Рабочее дерево может содержать локальный `.claude/settings.local.json`; не
  трогать его без запроса.
- Git иногда пишет warning о недоступном глобальном
  `C:\Users\gladk\.config\git\ignore`; это не ошибка проекта.
- Playwright Chromium на Windows может требовать запуск вне sandbox.
- Visual etalons имеют размер `1656x2339`, сравнение нормализует render к этому
  размеру.
- `CLAUDE.md` также содержит обзор проекта, но `AGENTS.md` является основной
  инструкцией для Codex и должен обновляться при изменении устойчивых правил.
