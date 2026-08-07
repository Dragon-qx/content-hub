#!/bin/bash
export DATABASE_URL='postgresql://postgres:pass@localhost:5432/contenthub'
export NODE_ENV='production'
cd /home/ubuntu/.openclaw/workspace/content-hub/apps/api
exec node dist/apps/api/src/worker.js
