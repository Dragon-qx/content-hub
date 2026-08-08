#!/bin/bash
export DATABASE_URL='postgresql://postgres:pass@localhost:5432/contenthub'
export NODE_ENV='production'
export PORT=3000
export JWT_SECRET='a-very-long-and-secure-jwt-secret-key-32-chars-min'
export JWT_REFRESH_SECRET='another-very-long-refresh-secret-key-32-chars'
export CREDENTIAL_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'
cd /home/ubuntu/.openclaw/workspace/content-hub/apps/api
exec node dist/apps/api/src/main.js
