# Architecture

```text
browser ──► web (Next.js) ──/api/*──► api (FastAPI) ──► PostgreSQL
                                         ▲                 ▲
                                         │ jobs table      │
                                       worker ─────────────┘
                                         │
                                         ▼
                            model providers (Anthropic, OpenAI, Gemini, Ollama)
```

## Components

| Path | What it does |
| --- | --- |
| `packages/select-verify` | Standalone library: loads YAML contracts, runs deterministic rules, returns a receipt. No database, no network. Apache-2.0. |
| `apps/api/select_api/pipeline.py` | Output → receipt → blocked / correction / approval / done. Writes audit events. |
| `apps/api/select_api/autonomy.py` | Licences per agent and task type, risk caps, sampling, promotion, demotion, revocation, the counter. |
| `apps/api/select_api/runner.py` | Live run: builds the prompt (sources fenced as untrusted), calls the provider, records tokens and cost, hands the output to the pipeline. |
| `apps/api/select_api/quote_pack.py` | Mail → quote: turns a model extraction into a priced quote with exact decimals. |
| `apps/api/select_api/demo.py` | Recorded demo week through the real pipeline. |
| `apps/api/select_api/jobs.py`, `worker.py` | Durable queue on PostgreSQL (`FOR UPDATE SKIP LOCKED`), stale-job recovery, retries. |
| `apps/api/select_api/routes_*.py` | HTTP API. Every company route checks membership and role on the server. |
| `apps/web` | Next.js 16 app router, React 19, TanStack Query, Radix primitives, Tailwind 4. |

## Data flow of one task

1. A task is created with a type (= a contract id), an assignee and its source material (`inputs.sources`).
2. A result arrives, either from a **live run** (worker → provider) or a **submission** (`POST /tasks/{id}/submit`, for any external agent runtime).
3. `select-verify` runs the contract against the result and a context built by the server (catalog, sources). A receipt is stored.
4. Missing required data → `blocked`, nothing guessed. Blocking check failed → the licence is demoted; a correction run is queued (live) or awaited (submitted), up to the contract's `max_attempts`.
5. Verified → the autonomy engine decides: approval needed (supervised, sampled and picked, contract "always", risk cap) or done.
6. A human decision (approve / request changes / reject) is recorded; a correction or rejection counts as an undetected error and demotes the licence.
7. Every step writes an audit event; the outcome feeds the counter.

## Decisions

- **PostgreSQL for the queue.** No Redis or broker: jobs are rows, claimed with `SKIP LOCKED`, so they survive restarts and can be inspected with SQL.
- **Money as `Decimal`, floats refused.** Amounts travel as strings in JSON.
- **Agents never hold a "send" permission.** External effects are performed by the server after the approval rules. In 0.1 no outbound connector exists, so approved actions are recorded as ready to send.
- **Hand-made charts and org chart.** Two small SVG components instead of a chart and a graph library.
- **Same-origin proxy.** The browser only talks to the web server, which forwards `/api/*` to `SELECT_API_URL` at request time.

## Schema

Created by Alembic (`apps/api/select_api/migrations`). Main tables: `companies`, `users`, `memberships`, `api_tokens`, `agents`, `goals`, `projects`, `tasks`, `task_comments`, `runs`, `receipts`, `approvals`, `trust`, `trust_events`, `outcomes`, `cost_events`, `audit_events`, `provider_connections`, `jobs`.
