# Select — notes for Claude Code

Select runs a company with AI agents that earn their autonomy: every result is checked by code against a YAML delivery
contract, and an agent stops needing approval per task type only once its verified record shows it can. Version 0.2.0.
The owner writes in French: answer him in French. Code, comments, commit messages, docs and the interface stay in English.

## Layout

| Path | What |
| --- | --- |
| `apps/api` | FastAPI API and worker (`select_api/`), Alembic migrations, tests (`tests/`, need PostgreSQL) |
| `apps/web` | Next.js 16 + React 19 + TanStack Query + Tailwind 4 interface, Vitest unit tests, Playwright e2e (`e2e/`) |
| `packages/select-verify` | The verification library: contracts, deterministic rules, receipts (no database, no network) |
| `contracts/` | One YAML contract per task type |
| `packs/` | Demo company and team templates (fr/de/en) |
| `scripts/` | `dev-up.sh` / `dev-down.sh` (run without Docker), `dev-mail.py` (local IMAP + SMTP servers), `screenshots.mjs` |
| `docs/` | User and developer documentation; `docs/fr/README.md` is the French guide |

## Commands

```bash
uv sync --all-packages && (cd apps/web && npm ci)        # install
uv run ruff check apps packages && uv run ruff format --check apps packages
(cd apps/web && npm run lint && npm run typecheck && npm test && npm run build)
SELECT_TEST_DATABASE_URL=postgresql+psycopg://user:pw@127.0.0.1:5432/select_test uv run pytest   # 79 tests; recreates that database's schema
uv run select-api check-contracts
./scripts/dev-up.sh                                       # API :8000, worker, web :3000 (local auth mode)
(cd apps/web && E2E_BASE_URL=http://localhost:3000 npx playwright test scenario)
```

The complete end-to-end loop (`e2e/complete.spec.ts`) needs a stack in password mode and the local mail servers:
`uv run python scripts/dev-mail.py serve`, start the stack with `SELECT_AUTH_MODE=password`, then
`E2E_PASSWORD_BASE_URL=http://localhost:3000 E2E_SENT_DIR=data/dev-mail/sent npx playwright test complete`.

## Rules that are not negotiable

- Never commit secrets (`.env`, keys, tokens). Provider keys and mailbox passwords are stored encrypted with `SELECT_SECRET_KEY`.
- Never say that tests, CI, Docker or an installation passed unless you ran them and saw them pass. Say what was not verified.
- A model never declares that a check passed: checks run in `select-verify`, in code. No fake adapters; a test double may only replace the network call.
- Payments, signatures, hiring, firing and tax filings always need a person, whatever the autonomy score. Agents cannot change their own limits, policies or budgets.
- Money and VAT rates are `Decimal`, carried as strings in JSON; floats are refused.
- Demo data is always labelled as demo; never present a simulation as a real run.
- No silent exception swallowing and no commands that ignore failures; a broad `except` needs a reason in a comment.
- Pin versions (no floating ranges in production images or lockfiles).
- Do not copy Paperclip's code, assets or brand; take inspiration from principles only. No claim of superiority without a measurement.
- Do not delete existing user code without a reason stated in the commit.

## Interface conventions

- Six places in the sidebar (Home, Approvals, Tasks, Messages, Team, Settings), defined in `apps/web/src/components/shell/nav.ts`; other pages are tabs or links inside a place.
- Design tokens live only in `apps/web/src/app/globals.css`. Inter: Bold 700 for big titles and figures, SemiBold 600 for card titles, Regular 400 for descriptions, Medium 500 for buttons and badges; system monospace for keys and ids.
- Show the real state of a feature; nothing fake in production mode. Every page must fit a 360 px phone (the e2e test measures it).

## After each batch of work

Report, in French: Fichiers créés · Fichiers modifiés · Fonctionnalités réellement opérationnelles · Tests exécutés ·
Résultats des tests · Problèmes restants · Prochaine priorité.

## Not verified yet / next

Real model calls (needs a key), `start.ps1` on Windows, full installs on Windows/macOS, and real mail providers.
The Docker images and complete Compose stack have been built and started in Ubuntu CI, with web-to-API health verified.
Next features: coding-agent runtimes (Claude Code, Codex) verified by the project's tests; quote PDFs; OAuth
mailboxes; VAT-exempt businesses.
