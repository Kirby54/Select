# Autonomy

Select does not ask you to decide in advance what an agent may do alone. Each agent earns a **licence per task type** from results the system verified, and loses it the moment the evidence turns.

## Levels

| Level | What happens to a verified result |
| --- | --- |
| **Supervised** | A human approves every result. |
| **Sampled** | A share of results (`sample_rate`, default 20 %) goes to a human, picked deterministically from the task id; the rest finishes alone. |
| **Autonomous** | Results that pass their contract finish without review. A human can revoke at any time. |

The level belongs to the pair *(agent, task type)*: Lea can be autonomous on message triage and supervised on quotes.

## Promotion

A licence moves up one level after `promote_after[level]` verified successes **in a row** (defaults: 20 supervised → sampled, 50 sampled → autonomous). A success is a verified result a human approved, or one that finished without review and was not reported afterwards.

**These thresholds are starting hypotheses, not proven values.** Calibrate them on your own error rate. The demo uses 4 and 6 so that promotions happen within one simulated week.

## Demotion

Back to **supervised**, streak reset, with an explanation stored in `trust_events`, when:

- a blocking check fails on the agent's output,
- a human requests changes or rejects a verified result (counted as an undetected error),
- a human reports a problem on a finished task (also an undetected error).

## Limits that the score never overrides

- Every contract has a **risk class**: `low`, `medium`, `high`, `legal`.
- `max_level_by_risk` caps the level per class (defaults: low and medium → autonomous, high → supervised).
- **Legal-risk work is always supervised.** This is in code (`autonomy.LEGAL_RISK`), not in configuration; the API refuses a policy that tries to change it. Payments, contracts, taxes, hiring and dismissal belong here.
- A contract with `approval.mode: always` (for example the invoice draft) always goes to a human.
- An agent never holds a permission to send, pay or sign. Agents cannot change policies, budgets or licences: those endpoints require a human role.

A task does not become safe because it succeeded many times. The caps exist for that reason.

## Revocation

**Autonomy → Revoke** sets the licence to supervised immediately and **freezes** it: no automatic promotion until an admin clicks **Unfreeze**. Both actions are audited.

## The counter

The autonomy rate is always shown next to the **undetected-error rate**:

- *autonomy rate* = finished tasks that needed no human ÷ finished tasks,
- *undetected-error rate* = verified results that a human later found wrong ÷ verified results a human reviewed. It is shown only once at least 5 reviewed results exist; before that the interface says "not yet measurable".

Autonomy that lets errors through is not autonomy: never read one number without the other.

## API

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/companies/{id}/autonomy?days=7` | viewer |
| POST | `/api/companies/{id}/autonomy/{licence}/revoke` | member |
| POST | `/api/companies/{id}/autonomy/{licence}/unfreeze` | admin |
| PATCH | `/api/companies/{id}` with `{"policy": {...}}` | admin |
