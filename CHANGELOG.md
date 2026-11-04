# Changelog

All notable changes are listed here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [docs/versioning.md](docs/versioning.md).

## [Unreleased]

## [0.2.0] — 2026-11-04

The complete version: Select now runs a real company's work instead of a demo. Everything listed here runs and is covered by tests unless marked otherwise.

### Added
- **Accounts.** Password sign-in (Argon2id, server sessions in an HttpOnly cookie, anti-forgery header, sign-in throttling), the first visit creates the owner, invitation links with roles, API tokens per person, `select-api reset-password`.
- **Guided setup.** Country presets (currency, VAT rates, time zone, language) for France, Belgium, Luxembourg, Switzerland, Germany, Morocco and Algeria; team templates in French, German and English; AI model connection; mailbox; catalog import from a spreadsheet paste.
- **Mail.** IMAP reading (read-only, from the moment you connect), triage, routing by code, verified replies and quotes rendered once for the approval and the sending, SMTP sending in the customer's thread, hourly limit, held and uncertain states, new-recipient rule, AI disclosure line, signature.
- **Routines.** Tasks created on a schedule in the company's time zone; missed runs fire once; nothing runs during an emergency stop.
- **Automation.** Runs start on their own when an agent is connected; a verified triage creates the next task; free-form tasks for any agent, always reviewed by a person.
- `select-verify` 0.2: the `vat_rate` rule checks each quote line against the company's rates; a missing rate is a failure, never assumed. Quote contract v2, free-form task contract.
- One-command start: `start.sh` (macOS, Linux) and `start.ps1` (Windows) write `.env` with random secrets, start Docker Compose and open the browser.
- `scripts/dev-mail.py`: local IMAP and SMTP servers to try the mail loop without a real mailbox.

### Changed
- **Simpler interface.** Six places in the sidebar (Home, Approvals, Tasks, Messages once a mailbox exists, Team, Settings); other pages are tabs or links inside them. Agents are listed in the sidebar with an icon for their role and a pulse while they work; open projects with a colour dot that filters Tasks. Home shows four figures, the autonomy rate next to the errors found afterwards, what needs you and recent activity. "New task" asks for a title and an agent; the rest is under "More options".
- **Visual cues.** Agents show an icon for their role (crown for a CEO, chip for a CTO, angle brackets for a developer, headset for support…, read in English, French or German); projects get a colour dot; main actions have simple icons.
- **Typography.** Inter Bold for big titles and figures, SemiBold for card titles, Regular for descriptions, Medium for buttons and badges; small capitals for section labels; the system monospace for keys and ids.
- The logo at the top left is the white mark without a background.
- Quote e-mails show the VAT rate (on the total, or on each line when rates differ) and follow French typography in French.
- Docker Compose starts in password mode and passes `SELECT_PUBLIC_URL` and `SELECT_SESSION_DAYS`.
- Graphite Edition interface (design tokens, inspector panels, keyboard navigation, phone tab bar). Details:
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

### Fixed
- A routine's next run and an invitation's expiry showed "just now": future dates now read correctly, and next runs show the clock of the routine's time zone.
- Home, Costs and Settings were wider than a 360 px phone inside the scrolling area; the phone test now measures it and passes.
- Morocco's preset gains its 7 % rate, which still applies in 2026.

### Tests
- 79 Python tests (accounts, mail flow against real local IMAP and SMTP servers, SMTP failures, routines, templates, VAT rules), 20 frontend unit tests, 11 end-to-end scenarios including the complete loop on a password-mode stack and a routine seen from another time zone.

### Not yet verified
- Real calls to provider APIs (tested with a double replacing the network call only).
- `docker compose up --build` and `start.ps1` (no container registry access and no PowerShell in the development environment); `start.sh` was tested with a stand-in Docker CLI.
- Mailboxes at real providers (the loop is tested against local IMAP and SMTP servers).

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
