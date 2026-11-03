# Changelog

All notable changes are listed here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Changed
- New interface, **Graphite Edition**: design tokens (colour, type, radius, elevation, motion with CSS spring curves), a 48 px topbar holding each page's title and actions, a sectioned collapsible sidebar, a phone tab bar, and inspector panels instead of page jumps. Direction researched with the UI UX Pro Max skill; see [docs/design-system.md](docs/design-system.md).
- Overview: one hero figure (autonomy rate next to the error rate), a status strip, a "Needs you" list and `TaskWeek`, a unit chart where every square is a finished task.
- Autonomy: licence ladders showing where each licence stands, what the next level needs and where the risk cap stops it; per-agent breakdown; rules and limits panel.
- Approvals: a mail-like queue with a decision pane; each card says who asks, why a human is asked, which checks ran and what happens after approval. High- and legal-risk approvals require typing the task key.
- Tasks: Linear-style list grouped by status with keyboard navigation (J/K, Enter, O, C, /), priority and status glyphs, a preview panel, and a restyled board.
- Organization: rounded connectors, highlighted reporting chain, keyboard moves between posts, drag a post onto another to change its manager (the panel's select remains the keyboard path).
- Agents: list with an inspector; provider choice as cards showing which connections are ready.
- Verification: the result → contract → checks → receipt pipeline with real counts; checks written in plain language with a technical view.
- Costs, Settings (macOS-style sections), Inbox, Activity (grouped by day), Connections and the home screen restyled.
- New logo mark.

### Tests
- Frontend unit tests: 10 (adds the typed confirmation for legal-risk approvals). End-to-end: 7 (adds keyboard navigation in Tasks and the phone tab bar to Approvals).

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
