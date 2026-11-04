# Workflows

## Where work comes from

| Source | How |
| --- | --- |
| You | **New task** (sidebar or C): a title, details and an agent. Any agent may take free-form work; its result always goes to a person |
| Incoming e-mail | Each new message becomes a triage task; the verified triage is routed by code (see [mail.md](mail.md)) |
| Routines | A task created on a schedule, in the company's time zone (below) |
| Another tool | `POST /api/companies/{id}/tasks` with an API token, then `POST …/tasks/{task}/submit` for the result |

With **Start runs on their own** on (Settings → Automation), a task assigned to an agent whose provider is connected starts at once. Otherwise it waits with a comment saying why.

## Mail → quote

1. A customer writes; the triage agent classifies the message (category and priority from fixed lists).
2. Code routes a quote request to an agent allowed to write quotes.
3. The model returns only an **extraction**: customer name and e-mail, catalog references, quantities quoted from the e-mail, and what is missing.
4. `quote_pack.build_quote` prices each line from the catalog and computes line totals, net, VAT and gross with exact decimals. An unknown item keeps no price. Nothing missing is invented.
5. The `quote` contract checks catalog references, prices, totals to the cent, the VAT rate of each line against the company's rates, the provenance of every value (a quantity must appear in the e-mail) and the e-mail address.
6. Missing data → task blocked with the list of fields. Failed check → correction with the failures as feedback. Verified → approval or done, according to the agent's licence.
7. The approval shows the exact e-mail, in the company's language, with the VAT rate. After approval the server sends it once from the company mailbox, in the customer's thread.

## Contracts shipped

| Type | Risk | Highlights |
| --- | --- | --- |
| Free-form task | medium | a summary and a result; always reviewed by a person; any agent may take it |
| Message triage | low | category and priority from fixed lists |
| Quote | medium | catalog prices, exact totals, allowed VAT rates, provenance |
| Support reply | medium | recipient must be the sender; no refund, discount or guarantee wording |
| Social post | medium | no superlatives; every figure needs a source |
| Invoice draft | high | always approved by a person; not an e-invoice |
| Payment request | legal | always supervised; only the last 4 IBAN digits are stored |

## Routines

**Tasks → Routines → New routine**: a name, a schedule (daily, weekdays, weekly, monthly, or a cron expression), the task to create, its type and agent. The dialog shows the next runs on the company's clock.

- Schedules run in the company's time zone, whatever the viewer's time zone.
- At most one run every 15 minutes.
- A run missed while the worker was stopped happens once when it restarts, not once per missed slot.
- During an emergency stop no task is created (the skipped run is in the activity log).
- **Run now** creates the task without moving the schedule.
- Team templates bring their routines switched off: nothing runs until someone turns one on.

## Adding a task type

1. Write `contracts/<type>.yaml` (see [verification.md](verification.md)).
2. Add a test with one accepted and one rejected output in `packages/select-verify/tests`.
3. Optionally add an output format for live runs in `apps/api/select_api/runner.py` (`OUTPUT_FORMATS`) and a label in `apps/web/src/lib/format.ts`.
4. Allow the type on an agent.
