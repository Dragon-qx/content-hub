#!/usr/bin/env bash
# ContentHub — one-click Docker startup (production stack).
#
# Boots PostgreSQL + Redis + API + Web + Nginx behind a reverse proxy on
# http://localhost. No arguments: builds images if needed and starts detached.
#
# Usage:
#   ./start.sh            build & start detached
#   ./start.sh --build    force rebuild
#   ./start.sh --down     stop and remove containers
#   ./start.sh --clean    stop + wipe named volumes (pgdata, redisdata)
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"

case "${1:-}" in
  --down)
    echo "[contenthub] stopping stack ..."
    $COMPOSE down
    exit 0
    ;;
  --clean)
    echo "[contenthub] stopping stack and wiping volumes ..."
    $COMPOSE down -v
    exit 0
    ;;
  --build|"")
    echo "[contenthub] building & starting the stack (detached) ..."
    $COMPOSE up -d --build
    echo
    echo "==> ContentHub is up:  http://localhost"
    echo "    Frontend:          /"
    echo "    REST API:          /api/v1"
    echo "    Swagger UI:        /api/docs"
    echo "    Stop:              ./start.sh --down"
    echo "    Wipe data:         ./start.sh --clean"
    ;;
  *)
    echo "unknown flag: $1"
    echo "usage: ./start.sh [--build|--down|--clean]"
    exit 1
    ;;
esac
