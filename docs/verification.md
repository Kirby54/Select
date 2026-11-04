# Verification

A **delivery contract** describes what a correct result is for one task type. The system runs its checks with plain Python and stores a **receipt**. A model never decides whether a deterministic check passed.

## Contract format

```yaml
id: quote                 # task type
version: 1
title: Customer quote
risk: medium              # low | medium | high | legal
required:                 # missing → task blocked, nothing guessed
  - customer.email
  - lines
checks:
  - id: prices_match_catalog
    rule: catalog_price
    params: { items: "lines[]" }
  - id: totals_add_up
    rule: quote_totals
  - id: every_number_sourced
    rule: provenance
    params:
      fields: ["lines[].quantity", "lines[].unit_price", totals.gross]
      computed: [totals.gross]
correction:
  max_attempts: 2         # correction runs after the first attempt
approval:
  mode: by_autonomy       # or "always"
  external_action: send_quote_email
```

Paths: `a.b` for a field, `lines[].quantity` for every item of a list. Contracts live in `contracts/`; `select-api check-contracts` loads and lists them. An unknown rule or a duplicate check id makes loading fail.

## Rules (select-verify 0.2)

| Rule | Params | Checks |
| --- | --- | --- |
| `required_fields` | `fields` | present and non-empty |
| `allowed_values` | `field`, `values` | value in a fixed list |
| `max_length` | `field`, `max` | text length |
| `pattern` | `field`, `regex` | full-match regular expression |
| `forbidden_phrases` | `field`, `phrases` | none of the phrases (case-insensitive) |
| `catalog_reference` | `items` | each line's `catalog_ref` exists |
| `catalog_price` | `items` | unit price equals the catalog price |
| `quote_totals` | `items_field`, `totals_field` | line totals, net, VAT, gross recomputed exactly |
| `vat_rate` | `field` (e.g. `lines[].vat_rate`) | every rate is one of the company's VAT rates; a missing rate fails |
| `provenance` | `fields`, `computed`, `quote_check`, `allow_empty` | each value carries a resolvable `source_ref` |

## Provenance

Values taken from somewhere are sent as `{"value": "...", "source_ref": "..."}`:

- `catalog:<ref>` — must exist in the company catalog,
- `source:<id>` — must be a source attached to the task; with `quote_check` (default on) the value must literally appear in that text, so an invented quantity fails,
- `calc:<formula>` — accepted only for fields listed in `computed`.

## Receipts

Each receipt stores the run id, contract id, version and SHA-256 of the contract file, every check with its status, message and evidence, missing fields, rule errors, the SHA-256 of the output, the verifier version and the time. Status: `verified`, `failed` (a blocking check failed or a rule errored) or `blocked` (required data missing). A crashing or misconfigured rule is recorded as an `error` and never counts as passed.

## Not available yet

- Model-based review checks (planned, non-blocking by design).
- E-invoice validation. The `invoice_draft` contract checks lines and totals but produces **no** XRechnung or ZUGFeRD file; Select never presents it as a compliant e-invoice.
