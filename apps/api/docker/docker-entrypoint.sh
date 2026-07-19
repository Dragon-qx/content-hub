#!/bin/sh
# Production entrypoint for the ContentHub API container.
#
# Runs before the server boots:
#   1. Seed missing secrets so local "one-click" runs work without a .env.
#   2. Wait for the database (plain TCP probe — works on slim base images).
#   3. Apply pending Prisma migrations (idempotent — re-runs are a no-op).
#   4. Exec the requested command (api | worker | arbitrary argv).
set -e

log() { printf '[entrypoint] %s\n' "$1"; }

PRISMA_CLI="/app/apps/api/node_modules/.bin/prisma"
API_DIR="/app/apps/api"

# --- 1. Resolve / generate secrets ----------------------------------------
# In production these must be supplied externally (compose, secrets, .env). For
# local "one-click" runs where no secrets are furnished we mint throwaway ones
# so the container still boots — override them for real deployments.
#
# Important: use Node's crypto.randomBytes rather than shell tools (head,
# hexdump, /dev/urandom). The bookworm-slim base does not ship hexdump, so the
# old `$(... | hexdump ...)` substitution failed with `set -e` and reboot-looped
# the container. Node is guaranteed to be present on this image.
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64').replace(/[/+=]/g,'').slice(0,48))")-localauto"
  log "JWT_SECRET auto-generated (override for production)."
fi
if [ -z "$JWT_REFRESH_SECRET" ]; then
  export JWT_REFRESH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64').replace(/[/+=]/g,'').slice(0,48))")-localauto"
  log "JWT_REFRESH_SECRET auto-generated (override for production)."
fi
if [ -z "$CREDENTIAL_ENCRYPTION_KEY" ]; then
  # 32-byte hex key for AES-256-GCM (CryptoService).
  export CREDENTIAL_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  log "CREDENTIAL_ENCRYPTION_KEY auto-generated (override for production)."
fi

# --- 2. Wait for the database ----------------------------------------------
# `npx` is intentionally not used here — the runner stage prunes dev deps and
# the slim base may not keep npx. A raw Node TCP probe always works.
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

log "Waiting for ${DB_HOST}:${DB_PORT} ..."
retries=30
while [ "$retries" -gt 0 ]; do
  if node -e "
    const net = require('net');
    const s = net.connect(${DB_PORT}, '${DB_HOST}', () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
  " 2>/dev/null; then
    log "Database is accepting connections."
    break
  fi
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    log "ERROR: database not reachable after 30 attempts — giving up." >&2
    exit 1
  fi
  sleep 2
done

# --- 3. Run migrations ------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ] && [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  if [ -d "$API_DIR/prisma/migrations" ] && [ "$(ls -A "$API_DIR/prisma/migrations" 2>/dev/null)" ]; then
    log "Applying migrations from ${API_DIR}/prisma ..."
    cd "$API_DIR"
    DATABASE_URL="$DATABASE_URL" "$PRISMA_CLI" migrate deploy --schema=./prisma/schema.prisma
    log "Migrations applied."
  else
    log "No migration files present — skipping migrate deploy."
  fi
fi

# --- 4. Start the server ----------------------------------------------------
# nest build emits a nested layout (dist/apps/api/src/main.js) because the api
# is transcompiled together with the @content-hub/platform-sdk package mapped
# via tsconfig `paths`. Resolve main.js relative to the known api dir so the
# entrypoint keeps working regardless of that nesting; fall back to a flat
# layout should the build ever change.
API_MAIN="$API_DIR/dist/apps/api/src/main.js"
if [ ! -f "$API_MAIN" ]; then
  API_MAIN="$API_DIR/dist/main.js"
fi

case "${1:-api}" in
  api)
    log "Starting API server ($API_MAIN) ..."
    exec node "$API_MAIN"
    ;;
  worker)
    # Worker shares the same nested layout as the api build.
    WORKER_MAIN="$API_DIR/dist/apps/api/src/worker.js"
    if [ ! -f "$WORKER_MAIN" ]; then
      WORKER_MAIN="$API_DIR/dist/worker.js"
    fi
    log "Starting background worker ($WORKER_MAIN) ..."
    exec node "$WORKER_MAIN"
    ;;
  *)
    exec "$@"
    ;;
esac
