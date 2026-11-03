# Installation

## Docker (recommended)

Requirements: Docker Engine 24+ with Compose v2.

```bash
cp .env.example .env        # optional: set POSTGRES_PASSWORD and SELECT_SECRET_KEY
docker compose up --build
```

| Service | Port | Role |
| --- | --- | --- |
| `web` | 127.0.0.1:3000 | Next.js interface and same-origin API proxy |
| `api` | 127.0.0.1:8000 | FastAPI; applies database migrations at start (`--migrate`) |
| `worker` | — | Runs queued jobs: live runs and the demo week |
| `db` | — | PostgreSQL 16 |

Data lives in two named volumes (`db-data`, `api-data`) and survives `docker compose down` / `up`. `docker compose down -v` deletes it.

**Update:** `git pull && docker compose up --build -d`. Migrations run automatically when the API starts.

**Status of this setup:** the compose file validates (`docker compose config`), but at the time of the 0.1 release it had not been built end to end, because the build environment could not reach the container registries. The application inside it — API, worker, web — was run and tested without Docker (below). Please report any build problem.

## Without Docker (development)

Requirements: Python 3.12, uv 0.11+, Node.js 22, PostgreSQL 16.

```bash
uv sync --all-packages
cd apps/web && npm ci && npm run build && cd ../..
createdb select
export SELECT_DATABASE_URL=postgresql+psycopg://$USER@127.0.0.1:5432/select
./scripts/dev-up.sh          # migrate, then API :8000, worker, web :3000; logs in .run/
./scripts/dev-down.sh
```

For frontend work, run `npm run dev` in `apps/web` instead of the built server; it proxies `/api` to `SELECT_API_URL` (default `http://127.0.0.1:8000`).

## System dependencies

- PostgreSQL 16 (tests drop and recreate the `public` schema of the test database: use a dedicated one).
- Chrome or Chromium for the end-to-end tests: `npx playwright install chromium`, or set `CHROME_PATH`.

## Verify an installation

```bash
curl http://localhost:3000/api/health      # {"status":"ok", ... "contracts":[...]}
make test                                  # backend + frontend unit tests
make e2e                                   # end-to-end, against the running stack
```
