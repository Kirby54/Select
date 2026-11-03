#!/usr/bin/env bash
# Start the API, the worker and the built web app locally (without Docker).
# Requires: PostgreSQL reachable at SELECT_DATABASE_URL, `uv sync --all-packages`, `npm ci && npm run build` in apps/web.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SELECT_DATABASE_URL:=postgresql+psycopg://select:select@127.0.0.1:5432/select}"
: "${SELECT_DATA_DIR:=./data}"
export SELECT_DATABASE_URL SELECT_DATA_DIR
mkdir -p .run "$SELECT_DATA_DIR"
uv run select-api migrate
nohup uv run select-api serve --port 8000 > .run/api.log 2>&1 &
echo $! > .run/api.pid
nohup uv run select-api worker > .run/worker.log 2>&1 &
echo $! > .run/worker.pid
(cd apps/web && { SELECT_API_URL=http://127.0.0.1:8000 nohup npm run start > ../../.run/web.log 2>&1 & echo $! > ../../.run/web.pid; })
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "Select is running on http://localhost:3000 (logs in .run/)"
    exit 0
  fi
  sleep 1
done
echo "Select did not become healthy in 30 s; see .run/*.log" >&2
exit 1
