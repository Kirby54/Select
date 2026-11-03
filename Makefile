# Common tasks. Every target runs real commands; see docs/installation.md.
.PHONY: install lint typecheck test test-api test-web e2e build up down dev screenshots

install:
	uv sync --all-packages
	cd apps/web && npm ci

lint:
	uv run ruff check apps packages
	uv run ruff format --check apps packages
	cd apps/web && npm run lint

typecheck:
	cd apps/web && npm run typecheck

# Needs PostgreSQL; set SELECT_TEST_DATABASE_URL (default: postgresql+psycopg://select_user:select@127.0.0.1:5432/select_test).
test-api:
	uv run pytest packages/select-verify/tests apps/api/tests

test-web:
	cd apps/web && npm test

test: test-api test-web

# Needs a running stack (make up or make dev) and Chrome/Chromium.
e2e:
	cd apps/web && npx playwright test

build:
	cd apps/web && npm run build

up:
	docker compose up --build -d
	@echo "Select: http://localhost:3000"

down:
	docker compose down

dev:
	./scripts/dev-up.sh

screenshots:
	node scripts/screenshots.mjs http://localhost:3000 docs/screenshots
