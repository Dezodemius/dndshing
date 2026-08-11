# frontend

React 18 + TypeScript + Vite. Часть D&D Campaign Platform — см. корневой [README](../README.md) и [`.claude/docs/ARCHITECTURE.md`](../.claude/docs/ARCHITECTURE.md) §7.

```bash
npm install
npm run dev             # http://localhost:5173
npm run build            # tsc -b && vite build
```

`.env` не нужен: фронт ходит на свой же origin (`/api/v1`), а dev-сервер проксирует `/api`
на `http://localhost:8000`. Если backend поднят на другом порту или dev-сервер запущен в
контейнере — `cp .env.example .env` и задать `VITE_DEV_API_PROXY`.
