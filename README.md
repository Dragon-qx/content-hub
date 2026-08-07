# ContentHub

Multi-platform content management & publishing platform.

A Turborepo monorepo:

- **`apps/api`** — NestJS backend (REST API, Prisma, PostgreSQL, Redis)
- **`apps/web`** — Next.js frontend (React + TypeScript + Tailwind)
- **`packages/shared-types`** — Shared TypeScript types
- **`packages/platform-sdk`** — Unified platform adapter SDK (WeChat Official,
  WeChat Video, Douyin, XiaoHongShu, Bilibili)

## Project structure

```
.
├── apps/
│   ├── api/                       # NestJS REST API
│   └── web/                       # Next.js frontend
├── packages/
│   ├── shared-types/              # Shared TS types
│   └── platform-sdk/              # Platform adapter SDK
├── deploy/                        # Deployment orchestration
│   ├── docker-compose.yml         # Production stack (db + redis + api + web + nginx)
│   ├── docker-compose.dev.yml     # Local dev infra (db + redis only, for `pnpm dev`)
│   ├── nginx.conf                 # Reverse proxy config
│   ├── Dockerfile.api             # API image
│   ├── Dockerfile.web             # Web image
│   ├── entrypoint.sh              # API container entrypoint (waits for DB, runs migrations)
│   └── scripts/                   # One-click start scripts (sh / bat / ps1)
├── package.json                   # Workspace root scripts
├── turbo.json                     # Turborepo pipeline
└── tsconfig.base.json             # Shared TS config
```

## Requirements

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16
- Redis 7

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env

# 3. Start local infrastructure (PostgreSQL + Redis)
docker compose -f deploy/docker-compose.dev.yml up -d

# 4. Generate Prisma client & run migrations
pnpm --filter @content-hub/api prisma:generate
pnpm --filter @content-hub/api prisma:migrate

# 5. (Optional) Seed an admin user — admin@contenthub.local / changeme
pnpm --filter @content-hub/api prisma:seed

# 6. Run everything in dev mode
pnpm dev
```

- API: http://localhost:3000/api/v1
- API docs (Swagger UI): http://localhost:3000/api/docs
- Web: http://localhost:3001

## Build & test

```bash
pnpm build                 # build all workspaces
pnpm typecheck             # tsc --noEmit across all workspaces
pnpm test                  # run all tests (API + platform-sdk)
pnpm lint                  # eslint across all workspaces
```

Per-workspace:

```bash
pnpm --filter @content-hub/api test -- --coverage
pnpm --filter @content-hub/platform-sdk test
pnpm --filter @content-hub/web build
```

## Production deployment

The full stack is defined in `deploy/docker-compose.yml`: PostgreSQL + Redis +
API + Web behind an Nginx reverse proxy on <http://localhost>.

For local one-click runs the API entrypoint (`deploy/entrypoint.sh`) auto-generates
throwaway secrets if none are supplied, so the stack boots with no manual setup.
**For real deployments, supply your own `JWT_SECRET`, `JWT_REFRESH_SECRET`, and
`CREDENTIAL_ENCRYPTION_KEY` via `.env` or Docker secrets before launching.**

### Option A — one-click scripts (recommended)

```bash
# macOS / Linux / Git Bash / WSL
./deploy/scripts/start.sh            # start
./deploy/scripts/start.sh --down     # stop
./deploy/scripts/start.sh --clean    # stop + wipe DB/Redis volumes

# Windows CMD
deploy\scripts\start.bat             # start
deploy\scripts\start.bat --down      # stop
deploy\scripts\start.bat --clean     # wipe data

# Windows PowerShell
.\deploy\scripts\start.ps1           # start
.\deploy\scripts\start.ps1 -Down     # stop
.\deploy\scripts\start.ps1 -Clean    # wipe data
```

Then open **http://localhost**. Frontend at `/`, REST API at `/api/v1`, Swagger at
`/api/docs`.

### Option B — npm scripts

```bash
pnpm docker:up        # build & start detached
pnpm docker:down      # stop
pnpm docker:clean     # stop + wipe DB/Redis volumes
pnpm docker:logs      # tail container logs
```

### Option C — raw docker compose

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml down -v   # stop + wipe data
```

### Stack

- `db` — PostgreSQL 16
- `redis` — Redis 7
- `api` — NestJS backend. Its entrypoint waits for the database, runs pending
  Prisma migrations (idempotent), then starts the server on port `3000`.
- `web` — Next.js frontend in standalone mode (port `3001`)
- `nginx` — reverse-proxies `/api/` → API and `/` → Web, exposed on `:80`

## API overview

All endpoints are mounted under `/api/v1` and most require a Bearer JWT
(`Authorization: Bearer <token>`). The authoritative, always-up-to-date route list
is the Swagger UI at **http://localhost:3000/api/docs**.

Modules: Auth · Users · Teams · Accounts · Account Groups · OAuth · Content ·
Content Templates · Content Assistant · Adaptation · Media · Workflow ·
Scheduler · Analytics · Notifications · Audit · Engagement · Platform SDK ·
Receipts · Wallet · Health Monitor.

## Supported platforms

The `packages/platform-sdk` abstraction layer (`PlatformAdapterFactory`) returns
a `PlatformAdapter` for each platform that supports OAuth login, publish,
metrics fetch, and (where the platform exposes one) comment reads/replies:

| Platform        | Adapter                 | Auth flow        | Publish | Metrics | Comments |
| --------------- | ----------------------- | ---------------- | ------- | ------- | -------- |
| WeChat Official | `WechatOfficialAdapter` | client credential| drafts  | fans    | —        |
| WeChat Video    | `WechatVideoAdapter`    | OAuth2           | submit  | yes     | yes      |
| Douyin          | `DouyinAdapter`         | OAuth2           | yes     | yes     | —        |
| XiaoHongShu     | `XiaoHongShuAdapter`    | OAuth2 + HMAC    | yes     | yes     | —        |
| Bilibili        | `BilibiliAdapter`       | OAuth2           | yes     | yes     | yes      |

Register new platforms by adding a `BaseAdapter` subclass under
`packages/platform-sdk/src/adapters` and a case in
`PlatformAdapterFactory.create()`.

## License

MIT
