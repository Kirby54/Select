# Workflows

## Mail → quote (first business pack)

1. Create a task of type **Quote**, assigned to an agent allowed to do quotes, and paste the customer's e-mail as source material (`source:msg-1`).
2. The model receives the e-mail as untrusted data and the catalog references, and must return only an **extraction**: customer name and e-mail, catalog references, quantities quoted from the e-mail, and what is missing.
3. `quote_pack.build_quote` prices each line from the catalog and computes line totals, net, VAT and gross with exact decimals. An unknown item keeps no price. Nothing missing is invented.
4. The `quote` contract checks catalog references, prices, totals to the cent, VAT rates, provenance of every value (a quantity must appear in the e-mail) and the e-mail format.
5. Missing data → task blocked with the list of fields. Failed check → correction (up to 2) with the failures as feedback. Verified → approval or done, according to the agent's licence.
6. The approval card shows the exact quote that would leave Select. In 0.1 nothing is sent: approving records the decision and marks the e-mail ready to send.

## Other contracts shipped

| Type | Risk | Highlights |
| --- | --- | --- |
| Message triage | low | category and priority from fixed lists |
| Support reply | medium | recipient must be the sender; no refund, discount or guarantee wording |
| Social post | medium | no superlatives; every figure needs a source |
| Invoice draft | high | always approved by a human; not an e-invoice |
| Payment request | legal | always supervised; only the last 4 IBAN digits are stored |

## Adding a task type

1. Write `contracts/<type>.yaml` (see [verification.md](verification.md)).
2. Add a test with one accepted and one rejected output in `packages/select-verify/tests`.
3. Optionally add an output format for live runs in `apps/api/select_api/runner.py` (`OUTPUT_FORMATS`) and a label in `apps/web/src/lib/format.ts`.
4. Allow the type on an agent.
