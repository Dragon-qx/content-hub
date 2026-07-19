# ContentHub

Multi-platform content management & publishing platform.

A Turborepo monorepo:

- **`apps/api`** — NestJS backend (REST API, Prisma, PostgreSQL, Redis)
- **`apps/web`** — Next.js frontend (React + TypeScript + Tailwind)
- **`packages/shared-types`** — Shared TypeScript types
- **`packages/platform-sdk`** — Unified platform adapter SDK (WeChat Official,
  WeChat Video, Douyin, XiaoHongShu, Bilibili)

## Requirements

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16
- Redis 7

## Getting started

```bash
# install dependencies
pnpm install

# configure environment
cp .env.example .env

# generate prisma client & run migrations
pnpm --filter @content-hub/api prisma:generate
pnpm --filter @content-hub/api prisma:migrate

# run everything in dev mode
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

## One-command production startup

### Option A — one-click scripts (recommended)

Three scripts are committed at the project root; pick whichever matches your
shell. They build the images if needed and start the stack detached behind an
Nginx reverse proxy on <http://localhost>.

```bash
# macOS / Linux / Git Bash / WSL
./start.sh            # start
./start.sh --down     # stop
./start.sh --clean    # stop + wipe DB/Redis volumes

# Windows CMD
start.bat             # start
start.bat --down      # stop
start.bat --clean     # wipe data

# Windows PowerShell
.\start.ps1           # start
.\start.ps1 -Down     # stop
.\start.ps1 -Clean    # wipe data
```

Then open **http://localhost**. The frontend is served at `/`, the REST API at
`/api/v1`, and the Swagger UI at `/api/docs`.

### Option B — npm scripts

```bash
pnpm docker:up        # build & start detached
pnpm docker:down      # stop
pnpm docker:clean     # stop + wipe DB/Redis volumes
pnpm docker:logs      # tail container logs
```

### Option C — raw docker compose

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml down -v   # stop + wipe data
```

### What's in the stack

- `db` — PostgreSQL 16
- `redis` — Redis 7
- `api` — NestJS backend. Its entrypoint waits for the database, runs pending
  Prisma migrations (idempotent), then starts the server on port `3000`.
- `web` — Next.js frontend in standalone mode (port `3001`)
- `nginx` — reverse-proxies `/api/` → API and `/` → Web, exposed on `:80`

A `.env.prod` file with `JWT_SECRET`, `JWT_REFRESH_SECRET`, and
`CREDENTIAL_ENCRYPTION_KEY` is auto-generated the first time so the stack boots
with no manual setup. **For real deployments, replace these values with your
own `.env` or Docker secrets before launching.**

## API overview

All endpoints are mounted under `/api/v1` and most require a Bearer JWT
(`Authorization: Bearer <token>`).

| Module       | Key endpoints                                                            | Auth |
| ------------ | ------------------------------------------------------------------------ | ---- |
| Auth         | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`          | no   |
| Users        | `GET/PUT /users/me`, `GET /users`, `DELETE /users/:id`                  | yes  |
| Teams        | `CRUD /teams`, `GET/POST/DELETE /teams/:id/members`                     | yes  |
| Accounts     | `GET/POST /accounts`, `POST /accounts/:id/sync`, `PATCH/DELETE :id`     | yes  |
| Content      | `CRUD /contents`                                                         | yes  |
| Media        | `POST /media/upload`, `GET /media`, `DELETE /media/:id`                  | no   |
| Workflow     | `POST /workflow/approval`, `POST /:id/approve`, `POST /:id/reject`, `GET`| yes  |
| Scheduler    | `POST /scheduler`, `GET /scheduler`, `POST /:id/retry`, `DELETE :id`    | yes  |
| Analytics    | `GET /analytics/dashboard`, `overview`, `history`, `history/export`, `top-content`, `account/:id` | yes |
| Notifications| `POST/GET /notifications`, `PATCH /:id/read`, `read-all`                 | yes  |
| Audit        | `POST/GET /audit`, `GET /:resourceType/:resourceId`                     | yes  |
| Platform SDK | `POST /platform-sdk/publish`, `validate`                                 | yes  |

Usage details (curl examples, request/response shapes) are documented in
[`docs/API.md`](docs/API.md).

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
