# select-verify

Delivery contracts and verifiable receipts for AI agent work. Part of [Select](../../README.md), usable on its own.

A **contract** (YAML) says what a correct deliverable looks like for one task type. `verify()` runs every check
with plain Python and returns a **receipt**: which checks ran, what each found, the evidence, and a final status.
A model never decides whether a deterministic check passed.

```python
from select_verify import load_contract_file, verify, VerifyContext

contract = load_contract_file("contracts/quote.yaml")
receipt = verify(contract, deliverable, VerifyContext(catalog=catalog, sources={"msg-1": email_text}), run_id="run-42")
print(receipt.status)  # "verified" | "failed" | "blocked"
for check in receipt.checks:
    print(check.id, check.status, check.message)
```

## Rules available in 0.1

| Rule | What it checks |
| --- | --- |
| `required_fields` | Listed paths are present and non-empty |
| `allowed_values` | Values belong to a fixed list |
| `max_length` | Text length limit |
| `pattern` | Full-match regular expression |
| `forbidden_phrases` | Text contains none of the listed phrases |
| `catalog_reference` | Each line references an existing catalog item |
| `catalog_price` | Each unit price equals the catalog price |
| `quote_totals` | Line totals, net, VAT and gross recomputed with exact decimals |
| `provenance` | Each value carries a resolvable `source_ref` (`catalog:`, `source:`, `calc:`); quoted values must appear in the source text |

Amounts are `Decimal`; floats are refused. An unknown rule makes the contract fail to load.

Not yet available: model-based review checks, XRechnung / ZUGFeRD validation.

License: Apache-2.0.
