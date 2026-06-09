#!/usr/bin/env bash
# scripts/entrypoint.sh
# Docker entrypoint: wait for dependencies, run migrations, start the app.
set -euo pipefail

echo "──────────────────────────────────────────"
echo "  Tender Bid Orchestrator — Starting Up"
echo "──────────────────────────────────────────"

# ── Wait for PostgreSQL ──────────────────────────────────────────────────
echo "[entrypoint] Waiting for PostgreSQL at ${DATABASE_URL:-db:5432} ..."
MAX_RETRIES=30
RETRY=0
until python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.environ.get('DATABASE_URL', 'postgresql+psycopg2://postgres:postgres@db:5432/pipelinedemo'), future=True)
with engine.connect() as conn:
    conn.execute(text('SELECT 1'))
print('PostgreSQL is ready')
" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "[entrypoint] ERROR: PostgreSQL did not become ready in time."
        exit 1
    fi
    echo "[entrypoint]   ...waiting (attempt $RETRY/$MAX_RETRIES)"
    sleep 2
done

# ── Wait for Redis ───────────────────────────────────────────────────────
echo "[entrypoint] Waiting for Redis at ${REDIS_URL:-redis:6379} ..."
RETRY=0
until python -c "
import redis, os
r = redis.from_url(os.environ.get('REDIS_URL', 'redis://redis:6379/0'))
r.ping()
print('Redis is ready')
" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "[entrypoint] WARNING: Redis not available — continuing without cache."
        break
    fi
    echo "[entrypoint]   ...waiting (attempt $RETRY/$MAX_RETRIES)"
    sleep 2
done

# ── Run database migrations ─────────────────────────────────────────────
echo "[entrypoint] Running database migrations ..."
python scripts/run_migrations.py
echo "[entrypoint] Migrations applied."

# ── Start the application ───────────────────────────────────────────────
echo "[entrypoint] Launching application ..."
exec "$@"
