#!/usr/bin/env bash
# Start Select with Docker in one command (macOS, Linux):  ./start.sh
#
# The first time, it writes .env with a random database password and encryption key.
# Then it builds and starts the containers, waits until Select answers and opens your browser.
# Run it again after `git pull` to update: your data stays in the Docker volumes.
set -euo pipefail
cd "$(dirname "$0")"

URL="http://localhost:3000"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop (macOS) or Docker Engine (Linux): https://docs.docker.com/get-docker/" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop (or the Docker service), wait until it is ready, then run ./start.sh again." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "The 'docker compose' command is missing: install Docker Compose v2." >&2
  exit 1
fi

if [ ! -f .env ]; then
  # 32 random bytes in URL-safe base64: the format of a Fernet key.
  secret=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '\n')
  # Read a fixed amount first: `tr < /dev/urandom | head` would end on SIGPIPE, which pipefail treats as a failure.
  password=$(head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-24)
  if [ "${#secret}" -ne 44 ] || [ "${#password}" -ne 24 ]; then
    echo "Could not generate random secrets for .env." >&2
    exit 1
  fi
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${password}|" \
      -e "s|^SELECT_SECRET_KEY=.*|SELECT_SECRET_KEY=${secret}|" \
      -e "s|select:change-me@|select:${password}@|" \
      .env.example > .env
  chmod 600 .env
  echo "Created .env with a random database password and encryption key."
  echo "Keep a copy of .env somewhere safe: without it, stored API keys and mailbox passwords cannot be read."
fi

docker compose up --build -d

printf "Waiting for Select"
for _ in $(seq 1 120); do
  if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
    echo
    echo "Select is running: ${URL}"
    echo "The first visit creates the owner account."
    # Opening the browser is a convenience: if it fails, say where to go instead.
    if [ "$(uname -s)" = "Darwin" ]; then
      open "${URL}" || echo "Open ${URL} in your browser."
    elif command -v xdg-open >/dev/null 2>&1 && xdg-open "${URL}" >/dev/null 2>&1; then
      echo "Opened ${URL} in your browser."
    else
      echo "Open ${URL} in your browser."
    fi
    exit 0
  fi
  printf "."
  sleep 2
done
echo
echo "Select did not answer within 4 minutes. See what happened with: docker compose logs --tail 50" >&2
exit 1
