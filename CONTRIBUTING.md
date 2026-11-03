# Contributing to Select

Thanks for helping. Select's promise is that autonomy is earned from evidence, so contributions are judged the same way: show that the change works.

## Set up

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/) 0.11+, Node.js 22, PostgreSQL 16.

```bash
make install                      # uv sync --all-packages + npm ci
createdb select_test               # or point SELECT_TEST_DATABASE_URL at any empty database
make test                          # 52 backend tests + frontend unit tests
```

Run the app without Docker:

```bash
cp .env.example .env               # set SELECT_DATABASE_URL
cd apps/web && npm run build && cd ../..
make dev                           # API :8000, worker, web :3000 — logs in .run/
make e2e                           # Playwright against the running stack
```

## What makes a good pull request

- **One concern per PR.** A new check, a bug fix, a screen — not all three.
- **Tests first for logic.** A new contract rule needs a deliverable it accepts and one it rejects. Autonomy changes need a test showing the level that results.
- **Fail closed.** If something cannot be verified, the result goes to a human. Never the other way round.
- **No silent fallbacks.** No `except: pass`, no `|| true` in scripts, no fake provider in application code.
- **UI:** use the components in `apps/web/src/components`, the tokens in `globals.css`, and check 1440 px and 390 px.
- **Docs:** if behaviour changes, the docs change in the same PR. Never document something that does not run.

Maintainers aim to give a first review within 72 hours.

## Good first contributions

- A new **task type**: a YAML contract in `contracts/`, a test in `packages/select-verify/tests`, and its label in `apps/web/src/lib/format.ts`.
- A new **rule** in `packages/select-verify/select_verify/rules.py` with tests.
- Translations of the docs.

See issues labelled `good first issue` and `.github/labels.md`.

## Commit and release conventions

- Conventional-style messages are welcome (`feat:`, `fix:`, `docs:`) but not required.
- Versioning follows [docs/versioning.md](docs/versioning.md). Every user-visible change gets a line in `CHANGELOG.md`.

## Licences

By contributing you agree that your contribution is licensed under the licence of the part you change: AGPL-3.0-only for the application (`apps/`), Apache-2.0 for `packages/select-verify`.
