# Architecture

```text
browser ──► web (Next.js) ──/api/*──► api (FastAPI) ──► PostgreSQL
                                         ▲                 ▲
                                         │ jobs table      │
                                       worker ─────────────┤
                                         │  every 15 s: routines, mailbox reads, half-sent e-mail
                                         ├──► model providers (Anthropic, OpenAI, Gemini, Ollama)
                                         └──► mail servers (IMAP in, SMTP out)
```

## Components

| Path | What it does |
| --- | --- |
| `packages/select-verify` | Standalone library: loads YAML contracts, runs deterministic rules, returns a receipt. No database, no network. Apache-2.0 |
| `apps/api/select_api/pipeline.py` | Output → receipt → blocked / correction / approval / done. Renders the outgoing e-mail. Writes audit events |
| `apps/api/select_api/autonomy.py` | Licences per agent and task type, risk caps, sampling, promotion, demotion, revocation, the counter |
| `apps/api/select_api/runner.py`, `guards.py` | Live run: prompt with sources fenced as untrusted, provider call, tokens and cost, budget and emergency-stop guards |
| `apps/api/select_api/automation.py` | Task creation, auto-run, choosing an agent, routing a verified triage, what happens when a task is done |
| `apps/api/select_api/mail.py`, `inbound.py` | IMAP reading (read-only, baseline, automatic-mail detection), parsing, storing messages, triage tasks |
| `apps/api/select_api/outbound.py`, `delivery.py` | The e-mail text (the same function for the approval preview and the sent message), SMTP sending with deferred / rejected / uncertain outcomes, hourly cap, held mail |
| `apps/api/select_api/routines.py` | Cron schedules in the company's time zone, firing, missed runs |
| `apps/api/select_api/auth.py`, `routes_auth.py`, `security.py` | Sign-in modes, sessions, anti-forgery header, throttling, invitations, Argon2id, encryption |
| `apps/api/select_api/company_profile.py`, `templates.py` | Country presets (VAT, currency, time zone, language), settings, team templates |
| `apps/api/select_api/quote_pack.py`, `demo.py` | Mail → quote pricing with exact decimals; the recorded demo week |
| `apps/api/select_api/jobs.py`, `worker.py` | Durable queue on PostgreSQL (`FOR UPDATE SKIP LOCKED`), retries, the scheduler tick |
| `apps/api/select_api/routes_*.py` | HTTP API. Every company route checks membership and role on the server |
| `apps/web` | Next.js 16 app router, React 19, TanStack Query, Radix primitives, Tailwind 4 |

## Data flow of one task

1. A task is created with a type (= a contract id), an assignee and its source material: by a person, from an e-mail, by a routine, or by another tool.
2. A result arrives, from a **live run** (worker → provider) or a **submission** (`POST /tasks/{id}/submit`, for any external agent runtime).
3. `select-verify` runs the contract against the result and a context built by the server (catalog, VAT rates, sources). A receipt is stored.
4. Missing required data → `blocked`, nothing guessed. Blocking check failed → the licence is demoted; a correction is queued (live) or awaited (submitted), up to the contract's `max_attempts`.
5. Verified → the autonomy engine decides: approval needed (supervised, sampled and picked, contract "always", risk cap, new recipient) or done.
6. Done → automation follows up: a verified triage is routed to the next task; an e-mail is created for delivery and sent by the worker.
7. Every step writes an audit event; the outcome feeds the counter.

## Decisions

- **PostgreSQL for the queue.** No Redis or broker: jobs are rows, claimed with `SKIP LOCKED`, so they survive restarts and can be inspected with SQL.
- **Money as `Decimal`, floats refused.** Amounts and VAT rates travel as strings in JSON.
- **Agents never hold a "send" permission.** The server sends, after the approval rules, and never resends an e-mail that may have left.
- **Same-origin proxy.** The browser only talks to the web server, which forwards `/api/*` (with the session cookie and the anti-forgery header) to `SELECT_API_URL`.
- **Hand-made charts and org chart.** Small SVG components instead of chart and graph libraries.

## Schema

Created by Alembic (`apps/api/select_api/migrations`). Main tables: `companies`, `users`, `memberships`, `sessions`, `login_attempts`, `invitations`, `api_tokens`, `agents`, `goals`, `projects`, `tasks`, `task_comments`, `runs`, `receipts`, `approvals`, `trust`, `trust_events`, `outcomes`, `cost_events`, `audit_events`, `provider_connections`, `mail_accounts`, `mail_messages`, `deliveries`, `routines`, `jobs`.
