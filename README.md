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

## Production deployment

```bash
# build and run the full stack behind Nginx
docker compose -f docker-compose.prod.yml up -d --build
```

The compose file starts PostgreSQL, Redis, the API (`:3000`), the Next.js web
frontend, and an Nginx reverse proxy exposed on `:80`. The API is reached at
`https://<host>/api/v1` and the Swagger UI at `https://<host>/api/docs`.

Required env vars (via a `.env` file next to the compose file):
`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`.

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
