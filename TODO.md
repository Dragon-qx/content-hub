# TODO

Verified against the current codebase. Priorities: P0 = must fix, P1 = next,
P2 = soon.

## P0 — Security

- **Roll out TeamAccessGuard to all modules.** Currently only `content`,
  `platform-sdk`, and `wallet` enforce team membership. These still rely on
  `JwtAuthGuard` alone and trust caller-supplied `teamId`: `account`,
  `account-group`, `scheduler`, `media`, `receipt`, `analytics`, `engagement`,
  `workflow`, `health`, `audit`. Add `TeamAccessGuard` + service-layer
  `assertUserInTeam` / `assertResourceInTeam` to each.
- **SSRF hardening in `BaseAdapter`.** Currently allows `http:` and only checks
  the hostname string (no post-resolution IP check → DNS rebinding bypass). Block
  non-https schemes, resolve the hostname, and reject private/link-local/metadata
  IPs before issuing the request.
- **Production secrets enforcement.** `deploy/entrypoint.sh` still mints throwaway
  secrets unconditionally — it should refuse (not silently generate) when
  `NODE_ENV=production` and secrets are missing. `deploy/docker-compose.yml` now
  treats secrets as optional for local use; make production deployments fail fast.

## P1 — Reliability

- **Restore CI lint job and add a database to the test job.** The lint job was
  removed from `.github/workflows/ci.yml`; the `test` job has no PostgreSQL
  service, so `apps/api/test/security.integration-spec.ts` (real-Prisma
  tenant-isolation tests) cannot run in CI.
- **Enable `noEmitOnError` in `apps/api/tsconfig.build.json`.** Currently
  `noEmitOnError: false`, so `pnpm build` succeeds despite type errors.
- **Idempotency & recoverability for the publish pipeline.** `SchedulerService`
  has lease/heartbeat/recovery but no idempotency key, no dead-letter queue, and
  `POST /scheduler/:id/execute` is still an open external endpoint.

## P2 — Storage & operations

- **Media storage abstraction.** `MediaService` currently writes to local disk
  behind `app.useStaticAssets('/uploads')` with no object-storage backend and no
  authenticated download / signed URL. Introduce an S3/OSS/MinIO abstraction.
- **Structured logging & tracing.** `main.ts` emits request IDs but logs are not
  structured JSON and lack `userId`/`teamId`/`jobId`. Add JSON logging and
  propagate a trace context.
