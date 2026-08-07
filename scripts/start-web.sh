#!/bin/bash
export DATABASE_URL='postgresql://postgres:pass@localhost:5432/contenthub'
export NODE_ENV='production'
export PORT=3001
cd /home/ubuntu/.openclaw/workspace/content-hub/apps/web
exec npx next start
