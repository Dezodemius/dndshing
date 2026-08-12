# D&D Campaign Platform — Архитектурный проект

Версия 1.0 · Июль 2026 · Статус: утверждается заказчиком

---

## 1. Резюме зафиксированных решений

Результат дискавери. Каждое решение здесь — согласовано, изменения только через правку этого документа.

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Команда | Один разработчик + ИИ-агенты (Claude Code) |
| 2 | Аудитория | Публичный сервис, цель ~1000 пользователей. Не опенсорс |
| 3 | Монетизация | Отложена. Архитектура не должна ей мешать (роли/тарифы добавляемы) |
| 4 | Стек backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic |
| 5 | БД | PostgreSQL 16 сразу (конкурентные покупки, привычный прод-паттерн) |
| 6 | Frontend | React + TypeScript + Vite, SPA поверх REST. Mobile-first у игрока |
| 7 | Auth | Email+пароль (с верификацией почты) + OAuth: Яндекс, VK ID, Mail.ru |
| 8 | Real-time | Нет. WebSocket/SignalR исключены — сайт «до и после игры» |
| 9 | Игровая система | Только D&D 5e. Механики зашиты в код, контент — данные в БД |
| 10 | Контент | Загружает админ импортом JSON через защищённый эндпоинт. Хоумбрю мастеров — фаза 2 |
| 11 | Лист персонажа | Полуручной: базовые расчёты автоматом (модификаторы, проф-бонус), фичи/описания текстом. Система бафов/эффектов — не в MVP |
| 12 | Источник истины | Игрок сам редактирует свой лист, включая XP и деньги. Защиты от читерства нет, кроме UX-барьеров на странице торговца |
| 13 | Прокачка | Level-up хранится дельтами; откат уровня обязателен |
| 14 | Мультикласс | Нет в MVP. Схема данных не должна его блокировать |
| 15 | Валюта | Три независимых числа: gold / silver / copper. Автоконвертация — фаза 2 |
| 16 | Торговец | Не привязан к кампании. Доступ по ссылке/коду. Просмотр — без логина, покупка — с логином и выбором персонажа |
| 17 | Продажа торговцу | Есть, по 50% от цены карточки. Коэффициент на торговце — фаза 2 |
| 18 | Лог транзакций | Не в MVP (покупка атомарна на уровне БД, но журнал для мастера не строим) |
| 19 | Кампания в MVP | Название, дата и место следующей игры, список игроков со ссылками на листы. Всё |
| 20 | Персонаж ↔ кампания | Many-to-many: один персонаж может состоять в нескольких кампаниях |
| 21 | AI | Не в MVP. В конфиге заранее: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` (OpenAI-compatible, покрывает и Ollama, и облака) |
| 22 | Языки | UI и контент — русский. Архитектура i18n-ready: строки UI через словарь, контент версионируется по locale |
| 23 | Хостинг | Текущий сервер (рядом с резюмирую.рф), Docker Compose, Cloudflare, CI/CD по обкатанной схеме |

---

## 2. Границы MVP

**Входит:** регистрация/вход, CRUD персонажа с полуавтоматическим листом, прокачка с откатом, инвентарь, книга заклинаний, кошелёк, кампании-визитки с инвайтом, торговцы с покупкой/продажей, импорт контента, мобильная вёрстка листа.

**Не входит (фаза 2+):** AI-генераторы, лог транзакций и CRM-аналитика, хоумбрю-контент мастеров, система эффектов/бафов, мультикласс, автоконвертация валют, коэффициенты скупки, мультиязычность, квесты/сессии/карты мира, монетизация.

Критерий готовности MVP: заказчик ведёт одну реальную кампанию (5 игроков) полностью в системе — игроки создали персонажей по загруженному контенту, прокачались после сессии, закупились у торговца.

---

## 3. Архитектура backend

Модульный монолит. Не Clean Architecture с CQRS/MediatR — для одного разработчика это налог без выгоды. Слои простые:

```
app/
  core/          # конфиг, безопасность, БД, i18n-заготовка
  auth/          # OAuth-провайдеры (Яндекс, VK; код Mail.ru есть, но не подключён)
  content/       # расы, классы, заклинания, предметы + импорт
  characters/    # лист, прокачка, инвентарь, заклинания, кошелёк
  campaigns/     # кампании, инвайты, участники
  merchants/     # торговцы, витрина, покупка/продажа
```

Каждый модуль: `router.py` (эндпоинты) → `service.py` (бизнес-логика) → `models.py` (SQLAlchemy) + `schemas.py` (Pydantic). Прямых обращений роутера к моделям нет. Между модулями — только через сервисы.

Правила 5e, которые зашиты в код (`characters/rules_5e.py`):

- модификатор характеристики: `(score - 10) // 2`
- бонус мастерства от уровня: таблица 5e
- таблица XP-порогов уровней
- пассивная внимательность, инициатива, базовый КД (10 + Dex, если нет брони)
- слоты заклинаний по классу/уровню — берутся из контента класса (данные), формулы применения — код

Всё остальное (что даёт раса, фичи класса по уровням, описания) — данные из БД, движок их не интерпретирует, а показывает.

---

## 4. Доменная модель

### 4.1 Пользователи и доступ

- **User**: id, email, display_name, is_admin, email_verified, locale, created_at. Регистрации по паролю нет — пользователь создаётся первым OAuth-логином, `email_verified` выставляется провайдером сразу (Яндекс/VK подтвердили владение адресом).
- **OAuthAccount**: user_id, provider (`yandex` | `vk` | `mailru`), provider_user_id. Уникальность по (provider, provider_user_id). Один User — несколько провайдеров.

Роли не таблица: `is_admin` — флаг. «Мастер» и «игрок» — не роли аккаунта, а отношения: любой пользователь становится мастером, создав кампанию или торговца.

### 4.2 Контент (справочники)

Общий паттерн: индексируемые колонки для фильтров + `data JSONB` для всего остального. Это даёт расширяемость без миграций на каждое поле 5e.

- **Race**: id, slug, name, data (скорость, тёмное зрение, черты, бонусы характеристик — как описания и структурные поля).
- **CharacterClass**: id, slug, name, hit_die, primary_ability, data.
- **ClassLevel**: class_id, level (1–20), features JSONB (список фич уровня: name, description), spell_slots JSONB (nullable). Отдельная таблица, чтобы level-up мог показать «что нового на уровне N».
- **Subclass**: class_id, slug, name, unlock_level, data (фичи по уровням внутри data).
- **Spell**: id, slug, name, level (0–9), school, casting_time, range, components, duration, description, classes (m2m через SpellClass), data.
- **Item**: id, slug, name, type (`weapon`|`armor`|`potion`|`scroll`|`magic`|`quest`|`gear`), rarity, price_gold/silver/copper, weight, description, data.
- **Background**: id, slug, name, data.

Импорт: `POST /api/admin/content/import` (только is_admin), принимает JSON-пак `{races:[], classes:[], spells:[], items:[], ...}`, режим upsert по slug. Валидация Pydantic-схемами, отчёт: создано/обновлено/ошибки. Slug — стабильный ключ между импортами.

i18n-задел: у контентных таблиц поле locale (default `ru`); уникальность по (slug, locale). Сейчас всё в `ru`, потом рядом лягут переводы.

### 4.3 Персонаж

- **Character**: id, user_id, name, race_id, class_id, subclass_id (nullable), background_id (nullable), alignment, level, xp, ability_scores JSONB (`{str,dex,con,int,wis,cha}`), hp_max, hp_current, hp_temp, ac_override (nullable — иначе расчёт), speed, proficiencies JSONB (навыки, спасброски, языки, инструменты), notes/appearance/backstory TEXT, gold, silver, copper, created_at, updated_at.
- **CharacterSpell**: character_id, spell_id, prepared BOOL.
- **InventoryEntry**: character_id, item_id (nullable), custom_name (nullable), quantity, equipped BOOL. `item_id` null + custom_name — «просто строка в инвентаре», выданная мастером на словах. Это дёшево и закрывает реальный кейс.
- **LevelUpRecord** — ключевая сущность отката: character_id, from_level, to_level, delta JSONB, created_at.

Delta фиксирует всё, что изменил level-up:

```json
{
  "hp_gained": 7,
  "hp_method": "average",
  "asi": {"str": 1, "con": 1},
  "feat": null,
  "subclass_chosen": "oath-of-vengeance",
  "features_unlocked": ["extra-attack"],
  "spells_learned": ["fireball"],
  "spells_forgotten": []
}
```

Откат = снять верхнюю запись стека и применить дельту в обратную сторону. Инвариант: откатывать можно только последний уровень (LIFO), редактирование дельт задним числом запрещено. Прямое редактирование поля level в обход механизма недоступно из UI (но XP игрок пишет любой — это осознанно).

### 4.4 Кампания

- **Campaign**: id, dm_user_id, name, description, next_session_at (nullable), next_session_place (nullable), invite_code (короткий, уникальный, пересоздаваемый).
- **CampaignCharacter**: campaign_id, character_id, joined_at. M2M — персонаж может жить в нескольких кампаниях.

Вступление: игрок вводит инвайт-код → выбирает своего персонажа → персонаж появляется в списке у мастера. Мастер видит листы персонажей кампании read-only и может исключить персонажа.

### 4.5 Торговец

- **Merchant**: id, owner_user_id, name, description, share_code (уникальный, для ссылки `/shop/{code}`), is_open BOOL.
- **MerchantItem**: merchant_id, item_id, price_gold/silver/copper (override; null → цена карточки предмета), quantity (null = бесконечно).

Покупка (одна транзакция БД, `SELECT ... FOR UPDATE` на кошелёк и позицию):

1. проверить is_open, quantity > 0;
2. проверить, что персонаж принадлежит текущему пользователю;
3. проверить достаточность средств **без** автоконвертации: списание по валютам как указано в цене;
4. списать деньги, уменьшить quantity, создать/увеличить InventoryEntry.

Продажа: игрок выбирает предмет из инвентаря персонажа (только с item_id, кастомные строки продавать нельзя) → получает 50% цены карточки (округление вниз по каждой валюте) → предмет уходит из инвентаря, в сток торговца **не** добавляется (MVP-упрощение).

UX-барьер против читерства: страница `/shop/{code}` не содержит ни одной ссылки на редактирование листа; кошелёк на ней read-only; при уходе со страницы корзина/сессия торговли сбрасывается с предупреждением.

---

## 5. Схема БД (сводно)

```
users(id PK, email UQ, display_name, is_admin, email_verified, locale, created_at)
oauth_accounts(id PK, user_id FK, provider, provider_user_id, UQ(provider, provider_user_id))

races(id PK, slug, locale, name, data JSONB, UQ(slug, locale))
classes(id PK, slug, locale, name, hit_die, primary_ability, data JSONB, UQ(slug, locale))
class_levels(id PK, class_id FK, level, features JSONB, spell_slots JSONB?, UQ(class_id, level))
subclasses(id PK, class_id FK, slug, locale, name, unlock_level, data JSONB, UQ(slug, locale))
spells(id PK, slug, locale, name, level, school, casting_time, range, components, duration, description, data JSONB, UQ(slug, locale))
spell_classes(spell_id FK, class_id FK, PK(spell_id, class_id))
items(id PK, slug, locale, name, type, rarity, price_g, price_s, price_c, weight, description, data JSONB, UQ(slug, locale))
backgrounds(id PK, slug, locale, name, data JSONB, UQ(slug, locale))

characters(id PK, user_id FK, name, race_id FK, class_id FK, subclass_id FK?, background_id FK?,
           alignment, level, xp, ability_scores JSONB, hp_max, hp_current, hp_temp,
           ac_override?, speed, proficiencies JSONB, appearance TEXT, backstory TEXT, notes TEXT,
           gold, silver, copper, created_at, updated_at)
character_spells(character_id FK, spell_id FK, prepared, PK(character_id, spell_id))
inventory_entries(id PK, character_id FK, item_id FK?, custom_name?, quantity, equipped)
level_up_records(id PK, character_id FK, from_level, to_level, delta JSONB, created_at)

campaigns(id PK, dm_user_id FK, name, description, next_session_at?, next_session_place?, invite_code UQ)
campaign_characters(campaign_id FK, character_id FK, joined_at, PK(campaign_id, character_id))

merchants(id PK, owner_user_id FK, name, description, share_code UQ, is_open)
merchant_items(id PK, merchant_id FK, item_id FK, price_g?, price_s?, price_c?, quantity?)
```

Миграции — Alembic с первого дня. Денормализации нет; на 1000 пользователей индексов по FK и UQ достаточно.

---

## 6. API-контракт (REST, `/api/v1`)

### Auth
```
POST /auth/refresh                         → JWT (access 15m + refresh cookie httponly)
POST /auth/logout
GET  /auth/oauth/providers                 список настроенных провайдеров
GET  /auth/oauth/{provider}/authorize      provider: yandex|vk|mailru
GET  /auth/oauth/{provider}/callback       регистрация и вход — одно и то же действие
GET  /me
```

### Content (чтение — любой залогиненный)
```
GET /content/races | /classes | /classes/{slug} | /spells?class=&level= | /items?type= | /backgrounds
POST /admin/content/import     (is_admin) — JSON-пак, upsert по slug
```

Отдельно — `GET|POST /internal/admin/content-import` (вне `/api/v1`, HTTP Basic по паре `ADMIN_PANEL_USERNAME`/`ADMIN_PANEL_PASSWORD` из конфига, не привязан к `User`/`is_admin`): минимальная HTML-форма загрузки того же контент-пака файлом, вызывает тот же `ContentImportService`. Роуты выключены (404), пока обе переменные не заданы. См. `app/content/admin_panel.py`.

### Characters (владелец)
```
GET    /characters                       свои
POST   /characters                       создание (мастер создания — по шагам на фронте, бэку приходит итог)
GET    /characters/{id}                  полный лист + вычисленные поля (модификаторы, проф-бонус, КД, пассивки)
PATCH  /characters/{id}                  частичное редактирование (включая xp, деньги, hp)
DELETE /characters/{id}
POST   /characters/{id}/level-up         {hp_method, hp_rolled?, asi?|feat?, subclass?, spells_learned[]} → LevelUpRecord
POST   /characters/{id}/level-rollback   откат последней записи
GET    /characters/{id}/level-history
PUT    /characters/{id}/spells           список известных/подготовленных
POST   /characters/{id}/inventory        добавить (item_id | custom_name)
PATCH  /characters/{id}/inventory/{entry_id}   qty/equipped
DELETE /characters/{id}/inventory/{entry_id}
```

Ответ GET-листа содержит блок `computed` — фронт не дублирует правила 5e:

```json
{"computed": {"prof_bonus": 3, "modifiers": {"str": 2}, "ac": 16,
  "initiative": 1, "passive_perception": 13, "xp_to_next": 14000,
  "level_up_available": false, "spell_slots": {"1": 4, "2": 3}}}
```

### Campaigns
```
POST /campaigns · GET /campaigns (мои: как DM и как игрок) · GET/PATCH/DELETE /campaigns/{id}
POST /campaigns/{id}/regenerate-invite
POST /campaigns/join            {invite_code, character_id}
DELETE /campaigns/{id}/characters/{character_id}    (DM исключает | игрок уходит)
GET  /campaigns/{id}/characters/{character_id}      лист read-only для DM
```

### Merchants / Shop
```
POST /merchants · GET /merchants (мои) · GET/PATCH/DELETE /merchants/{id}
POST /merchants/{id}/items · PATCH|DELETE /merchants/{id}/items/{mi_id}

GET  /shop/{share_code}                 витрина; без логина — просмотр
POST /shop/{share_code}/buy             {character_id, merchant_item_id, quantity}
POST /shop/{share_code}/sell            {character_id, inventory_entry_id, quantity}
```

Ошибки — единый формат `{error: {code, message}}`; коды бизнес-ошибок: `insufficient_funds`, `out_of_stock`, `not_your_character`, `shop_closed`, `level_up_not_available`, `rollback_empty`.

---

## 7. Frontend

React 18 + TypeScript + Vite. Состояние сервера — TanStack Query; формы — react-hook-form + zod (zod-схемы генерятся из OpenAPI или пишутся зеркально Pydantic). Роутер — React Router. UI-кит — на выбор исполнителя задач, но тёмная тема по умолчанию (стилистика фэнтези, dark-mode-first).

### Карта экранов

```
/                       Лендинг (единственная публичная страница кроме витрины)
/login                  Вход через OAuth (Яндекс/VK) — регистрация тем же действием; /register и /verify редиректят сюда
/app                    Дашборд: мои персонажи, мои кампании, мои торговцы
/app/characters/new     Мастер создания: раса → класс → характеристики (point buy /
                        standard array / броски / вручную) → фон → детали
/app/characters/{id}    Лист персонажа (главный экран, mobile-first):
                        табы: Лист · Заклинания · Инвентарь · Кошелёк · История уровней
/app/characters/{id}/level-up    Пошаговый визард (стиль BG3: «что нового на уровне N»)
/app/campaigns/{id}     DM: игра (дата, место), список персонажей → read-only листы
/app/campaigns/join     Ввод инвайт-кода + выбор персонажа
/app/merchants/{id}     Конструктор торговца: карточка + позиции + ссылка для игроков
/shop/{code}            Витрина. Гость: смотрит. Игрок: выбор персонажа → покупка/продажа.
                        Никаких ссылок на редактирование листа. Кошелёк read-only.
/admin/import           Форма загрузки JSON-пака (is_admin)
```

Мобильный приоритет: лист персонажа и витрина (игроки за столом с телефонами). Конструкторы мастера — desktop-first.

i18n: все строки через словарь (i18next), в MVP один locale `ru`.

---

## 8. Ключевые user flows

**Создание персонажа.** Регистрация → мастер создания по шагам → на каждом шаге фронт тянет контент (расы/классы) → финальный POST собирает персонажа → редирект на лист. Черновики не храним (MVP): не дошёл до конца — начал заново.

**Прокачка.** Игрок вписал XP после сессии → `computed.level_up_available: true` → баннер на листе → визард: хиты (среднее/бросок) → ASI или фит (текстом из контента) → выбор подклассa (если уровень открывает) → заклинания (если кастер) → подтверждение → создаётся LevelUpRecord. Откат — кнопка в «Истории уровней», только верхняя запись.

**Торговля.** Мастер собрал торговца → кинул ссылку в чат партии → игрок открыл с телефона → залогинен? выбор персонажа : сначала логин → купил зелье → у персонажа −50 gold, +1 предмет; у торговца −1 сток. Продажа: выбрал предмет из инвентаря → система показала «50% = 25 gold» → подтвердил.

**Кампания.** Мастер создал кампанию, указал «суббота, 19:00, у Егора» → разослал код → игроки присоединили персонажей → перед игрой мастер открыл кампанию и просмотрел листы.

---

## 9. Нефункциональные требования и деплой

- **Auth:** JWT access (15 мин) + refresh в httpOnly cookie; регистрация и вход только через OAuth (Яндекс, VK) — паролей и SMTP в системе нет; провайдеры включаются наличием ключей в env.
- **Авторизация доступа:** владение ресурсом проверяется в сервисах (характерные IDOR-точки: чужой персонаж в /buy, чужой лист по прямому id). Обязательный security-чеклист перед релизом.
- **Производительность:** цель 1000 зарегистрированных / ~50 конкурентных — один инстанс FastAPI (uvicorn workers=2–4) + Postgres на том же сервере. Кэширование не требуется, кроме контентных справочников (in-process TTL-кэш).
- **Деплой:** Docker Compose (api, postgres, frontend/nginx) на выделенном сервере timeweb.cloud (app01, dndshing.ru). GitHub Actions: hosted-раннер собирает образы api/frontend и пушит в GHCR (`ghcr.io/dezodemius/dndshing-{api,frontend}`, тег — sha коммита и `main`), затем по SSH разворачивает на сервере — pull, `alembic upgrade head`, `docker compose up -d`, healthz-гейт валит деплой при неудаче. Публичный HTTPS (nginx/caddy + Cloudflare перед сервером) настраивается на сервере отдельно от CD. Бэкап Postgres — pg_dump по крону + выгрузка (аналог backup-db скилла).
- **Тесты:** pytest, обязательное покрытие: rules_5e (чистые функции — юнит), покупка/продажа (конкурентность, недостаток средств), level-up/rollback (инварианты стека), права доступа.
- **Наблюдаемость:** структурные логи (JSON), healthz-эндпоинт.

Риски масштабирования (фиксируем, не решаем): JSONB-контент без версионирования правок — при обновлении пака персонажи «переезжают» на новые описания молча; отсутствие лога транзакций сделает будущую CRM-аналитику ретроактивно невозможной (лог начнётся с момента внедрения).

---

## 10. Roadmap

**Фаза 0 — Каркас.** Репозиторий, Docker Compose, FastAPI-скелет с модульной структурой, Alembic, CI/CD, healthz. Фронт-скелет с роутингом и авторизационным shell.

**Фаза 1 — MVP (порядок = зависимости):**
1. Auth: OAuth-логин (Яндекс, VK) + JWT.
2. Контент: модели, импорт-эндпоинт, read-API. Параллельно заказчик готовит JSON-паки.
3. Персонаж: модель, CRUD, rules_5e, computed-блок.
4. Мастер создания персонажа (фронт).
5. Лист персонажа (фронт, mobile-first) + инвентарь + заклинания + кошелёк.
6. Level-up: дельты, визард, откат, история.
7. Кампании: CRUD, инвайт, read-only листы.
8. Торговцы: конструктор, витрина, покупка/продажа.
9. Лендинг, полировка, security-аудит, прод-деплой.

**Фаза 2 (после обкатки на живой кампании):** лог транзакций + CRM мастера, автоконвертация валют, коэффициент скупки, хоумбрю-контент, AI-генераторы (NPC, персонажи) через конфигурируемый endpoint, система эффектов equipped-предметов, мультиязычность.

---

## 11. Нарезка на задачи для генерации промтов

Каждая задача — самодостаточный промт для агента (Claude Code / Sonnet): контекст из этого документа, вход, выход, критерии приёмки. Матрица зависимостей:

| ID | Задача | Зависит от | Параллелится с |
|----|--------|------------|----------------|
| T0 | Каркас репозитория, Compose, CI/CD | — | — |
| T1 | Модели БД + миграции (все таблицы разом) | T0 | T2 |
| T2 | Фронт-скелет: Vite, роутинг, тема, API-клиент | T0 | T1 |
| T3 | Auth backend (email + JWT + верификация) | T1 | T4 |
| T4 | Контент: импорт + read-API | T1 | T3 |
| T5 | OAuth-провайдеры (3 шт., по одному промту) | T3 | T6+ |
| T6 | rules_5e + Character API + computed | T1, T4 | T7 |
| T7 | Auth-фронт + дашборд | T2, T3 | T6 |
| T8 | Мастер создания персонажа (фронт) | T6, T7 | T9 |
| T9 | Лист персонажа + инвентарь/заклинания/кошелёк (фронт) | T6, T7 | T8 |
| T10 | Level-up: backend (дельты, откат) | T6 | T8, T9 |
| T11 | Level-up: визард + история (фронт) | T9, T10 | T12 |
| T12 | Кампании: backend + фронт | T6, T7 | T11, T13 |
| T13 | Торговцы: backend (атомарная покупка/продажа) | T6 | T12 |
| T14 | Витрина + конструктор торговца (фронт) | T9, T13 | — |
| T15 | Лендинг | T2 | любые |
| T16 | Security-аудит + тесты приёмки + прод-деплой | всё | — |

Формат промта на задачу: (1) выжимка контекста из разделов 3–6 этого документа, относящаяся к задаче; (2) точная спецификация входа/выхода (схемы, эндпоинты); (3) критерии приёмки в виде проверяемых утверждений; (4) явные запреты (не трогать чужие модули, не добавлять фич вне скоупа).