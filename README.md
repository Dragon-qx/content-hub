# ContentHub

Multi-platform content management & publishing platform.

A Turborepo monorepo:

- **`apps/api`** — NestJS backend (REST API, Prisma, PostgreSQL, Redis)
- **`apps/web`** — Next.js frontend (React + TypeScript + Tailwind)
- **`packages/shared-types`** — Shared TypeScript types
- **`packages/platform-sdk`** — Unified platform adapter SDK

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
- Web: http://localhost:3001

## Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Development milestones

| Stage | Content                         | ETA |
| ----- | ------------------------------- | --- |
| M0    | Scaffold + CI/CD                | 1d  |
| M1    | Users, teams, account binding   | 3d  |
| M2    | Content creation & media        | 3d  |
| M3    | Publishing & platform adapters  | 5d  |
| M4    | Analytics dashboard             | 4d  |
| M5    | Workflows & audit logs          | 2d  |
| M6    | Integration tests & bug fixes   | 3d  |

## License

MIT
