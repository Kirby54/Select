#!/usr/bin/env bash
# Stop what scripts/dev-up.sh started.
set -euo pipefail
cd "$(dirname "$0")/.."
for name in web worker api; do
  if [[ -f ".run/$name.pid" ]]; then
    pid=$(cat ".run/$name.pid")
    # Stop the process group so child processes (uvicorn, next-server) stop too.
    kill -- "-$(ps -o pgid= "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f ".run/$name.pid"
  fi
done
echo "Stopped."
