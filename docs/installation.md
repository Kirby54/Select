# Installation

## Docker (recommended)

Requirements: Docker Engine 24+ with Compose v2, or Docker Desktop (Windows, macOS). About 4 GB of free memory for the first build.

```bash
./start.sh                  # macOS, Linux: .env with random secrets, then docker compose up --build -d
.\start.ps1                 # Windows PowerShell, same steps
docker compose up --build   # or by hand, after: cp .env.example .env (and set the secrets)
```

| Service | Port | Role |
| --- | --- | --- |
| `web` | 127.0.0.1:3000 | Next.js interface and same-origin API proxy |
| `api` | 127.0.0.1:8000 | FastAPI; applies database migrations at start |
| `worker` | — | Runs agents, reads mailboxes, sends approved e-mail, fires routines |
| `db` | — | PostgreSQL 16 |

Compose starts in **password** mode: the first visit creates the owner account. Data lives in two named volumes (`db-data`, `api-data`) and survives `docker compose down` and `up`; `docker compose down -v` deletes it.

**Update:** `git pull`, then `./start.sh` (or `docker compose up --build -d`). Migrations run when the API starts.

**Keep `.env`.** It holds the database password and the key that encrypts provider keys and mailbox passwords. A new `.env` with a different `POSTGRES_PASSWORD` cannot open the existing database volume.

**Status of this setup:** `docker compose config` validates, and `start.sh` was tested with a stand-in for the `docker` command (it writes a valid `.env`, keeps it on the second run, waits for the health check). The images themselves have not been built in the development environment, which cannot reach container registries, and `start.ps1` has not been run (no PowerShell there). The application inside — API, worker, web — was run and tested without Docker. Please report any build problem.

## Windows

1. Install Docker Desktop with the WSL 2 backend (the installer proposes it) and start it.
2. Get the code: `git clone …` in PowerShell, or download the archive and unzip it.
3. In the folder, run `.\start.ps1`. If Windows blocks scripts: `powershell -ExecutionPolicy Bypass -File .\start.ps1`.
4. Open <http://localhost:3000>.

For development on Windows, use WSL 2 and clone **inside** the Linux file system (`~/select`, not `C:\…`): shell scripts with Windows line endings do not run, and file watching is much faster there.

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

Without Docker the default auth mode is `local` (no sign-in, one implicit owner); set `SELECT_AUTH_MODE=password` to try accounts. For frontend work, run `npm run dev` in `apps/web`; it proxies `/api` to `SELECT_API_URL` (default `http://127.0.0.1:8000`).

To try the mail loop without a real mailbox: `uv run python scripts/dev-mail.py serve` (see [mail.md](mail.md)).

## System dependencies

- PostgreSQL 16 (tests drop and recreate the `public` schema of the test database: use a dedicated one).
- Chrome or Chromium for the end-to-end tests: `npx playwright install chromium`, or set `CHROME_PATH`.

## Verify an installation

```bash
curl http://localhost:3000/api/health      # {"status":"ok", ... "contracts":[...]}
make test                                  # backend and frontend unit tests
make e2e                                   # end-to-end, against a running stack
```
