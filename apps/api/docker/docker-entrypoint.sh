#!/bin/sh
# Production entrypoint for the ContentHub API container.
# Runs migrations (if any), then starts the requested command.
set -e

log() { printf '[entrypoint] %s\n' "$1"; }

# ── Env-var sanity ──────────────────────────────────────────────────────────
# These have no safe default in production; fail fast if they are unset/short.
check_required() {
  eval val=\$$1
  if [ -z "$val" ]; then
    log "ERROR: $1 is not set. Aborting."
    exit 1
  fi
}

# JWT_SECRET and CREDENTIAL_ENCRYPTION_KEY are mandatory in production.
if [ "${NODE_ENV:-development}" = "production" ]; then
  check_required JWT_SECRET
  check_required JWT_REFRESH_SECRET
  check_required CREDENTIAL_ENCRYPTION_KEY
  log "Production secrets present."
fi

# ── Database ─────────────────────────────────────────────────────────────────
# Apply pending migrations when DATABASE_URL is reachable. Migrations are
# idempotent; safe to run on every boot. Skip entirely if the env is unset.
if [ -n "${DATABASE_URL:-}" ] && [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  log "Applying database migrations..."
  # prisma migrate deploy is a no-op when there are no migration files (the
  # codebase seeds the schema via Prisma Client; only run if migrations exist).
  if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
    npx prisma migrate deploy || log "WARNING: migrate deploy failed (continuing)"
  else
    log "No migration files present — skipping migrate deploy."
  fi
fi

# ── Launch ───────────────────────────────────────────────────────────────────
# Delegates to the Dockerfile CMD unless overridden (e.g. `worker`).
case "${1:-api}" in
  api)
    log "Starting API server..."
    exec node dist/main
    ;;
  worker)
    log "Starting background worker..."
    exec node dist/worker
    ;;
  *)
    exec "$@"
    ;;
esac
