# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

D&D 5e Character Generator for **longstoryshort** — a Next.js web app that receives Yandex Form submissions via webhook, uses an OpenAI-compatible AI API to generate D&D characters, and exports them in a custom "Long Story Short" (LSS) JSON format.

## Commands

```bash
npm run dev        # Start dev server (Next.js)
npm run build      # Production build
npm run lint       # ESLint (zero warnings policy)
npm run typecheck  # TypeScript type check (tsc --noEmit)
```

Supabase local development:
```bash
npx supabase start   # Start local Supabase (Docker)
npx supabase stop    # Stop local Supabase
npx supabase db push # Apply migrations
```

## Architecture

### Folder Structure

```
app/              – Next.js App Router (pages + API routes)
features/         – Domain logic organized by feature
shared/           – Cross-cutting utilities, Supabase client, UI components
supabase/         – Migrations and local Supabase config
```

### Feature Modules (`features/`)

Each feature is self-contained with domain models, repositories, and server actions:

- **`auth/`** — Google OAuth sign-in/sign-out actions
- **`folders/`** — Folder (game session) CRUD; domain schema and repository
- **`characters/`** — Character repository, domain schema, `AutoRefresh` polling component
- **`ai/`** — OpenAI-compatible client, prompt builders, AI settings repository/actions
- **`webhooks/`** — Webhook pipeline entry point + Yandex Form payload adapter
- **`lss/`** — Long Story Short format: schema, mapper, template builder, D&D heuristics

### Core Data Flow: Webhook → Character

```
POST /api/webhook/yandex-form
  → yandex-form.adapter.ts   (normalize raw form payload)
  → pipeline.ts              (orchestrate AI calls)
      → AI: extract form intake (structured answers from raw text)
      → AI: generate character data (D&D character JSON)
      → AI: generate LSS JSON (output format)
  → characters repository    (save with processing_steps tracking)
  → return LSS JSON download URL
```

Processing stages tracked in `characters.processing_steps` JSON column:
`received → generating → forming_lss → forming_pdf`

### Supabase Tables

- **`folders`** — Game sessions (owned by `user_id`)
- **`characters`** — Generated characters; includes `processing_steps` JSONB for stage tracking and `lss_json` for the generated output

### AI Integration (`features/ai/`)

- Settings (base URL, API key, model name) are stored per user in Supabase and loaded via `AiSettingsRepository`
- `openai-compatible-client.ts` — raw API client; supports JSON mode and temperature control
- `prompt-builder.ts` — three separate prompts: form intake extraction, character generation, LSS generation
- All AI responses are validated with Zod schemas before use

### Shared Utilities (`shared/`)

- **`config/env.ts`** — Zod-validated environment variables; `publicEnv` (client-safe) and `serverEnv` (server-only)
- **`supabase/server.ts`** — Two client factories: `createSupabaseServerClient` (user auth context) and `createSupabaseServiceClient` (service role for webhook)
- **`ui/`** — shadcn-style components (Button, Card, Input, Label, Textarea)
- **`utils/errors.ts`** — `AppError` class with HTTP status codes

### Auth & Middleware

- Google OAuth via Supabase Auth; callback at `/api/auth/callback`
- `middleware.ts` refreshes Supabase auth cookies on every request automatically

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
YANDEX_FORM_WEBHOOK_SECRET=
WEBHOOK_DEFAULT_FOLDER_ID=
WEBHOOK_DEFAULT_USER_ID=
AI_API_BASE_URL=
AI_API_KEY=
AI_MODEL_NAME=
```

## Key Conventions

- **Server-first**: prefer Server Components and Server Actions; client components only when state/interactivity is needed
- **Zod everywhere**: domain models, AI responses, and env vars are all validated with Zod schemas
- **Path alias**: `@/*` maps to the project root
- **UI language**: Russian throughout the interface
- **Imports**: use `@/features/...`, `@/shared/...` — never relative cross-feature imports
