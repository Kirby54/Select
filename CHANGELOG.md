# Changelog

All notable changes are listed here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [docs/versioning.md](docs/versioning.md).

## [Unreleased]

## [0.1.0] — 2026-11-03

First public foundation. Everything listed here runs and is covered by tests unless marked otherwise.

### Added
- `select-verify` 0.1: YAML delivery contracts, nine deterministic rules, exact-decimal money, provenance checks, verification receipts with contract version and SHA-256.
- Six contracts: quote, support reply, message triage, social post, invoice draft (not an e-invoice), payment request (legal risk).
- Autonomy licence per agent and task type: supervised → sampled → autonomous on verified streaks, immediate demotion on a blocking failure or a human correction, human revocation with freeze, risk caps, legal-risk work always supervised.
- Autonomy counter shown next to the undetected-error rate (only once 5 reviewed results exist).
- Approval queue showing the exact outgoing content, the reason a human is asked and the receipt.
- Organization chart with persisted reporting lines and ordering, agents, tasks (list and board), goals, projects, costs with budgets and hard stop, activity log with CSV export, provider connections (Anthropic, OpenAI, Gemini, Ollama) with encrypted keys and connection tests.
- Mail → quote pack: the model extracts, code prices and totals from the catalog.
- Demo company and reproducible "Run demo week" without any API key.
- Durable PostgreSQL job queue and worker; emergency stop.
- Docker Compose setup, CI workflow, Playwright end-to-end tests.

### Not yet verified
- Real calls to provider APIs (tested with a test double replacing the network call only).
- `docker compose up --build` (registries were unreachable from the build environment).
