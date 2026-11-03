"""Mail -> quote pack.

The model only extracts: who wrote, which catalog items, which quantities (quoted from the e-mail).
Prices, VAT and totals are computed here with exact decimals. Nothing absent is invented:
an unknown item keeps no price and fails verification; a missing e-mail stays empty and blocks.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from select_verify import CatalogItem, MoneyError, fmt, round_money, to_decimal

EXTRACTION_FORMAT = """Return one JSON object:
{
  "customer": {
    "name":  {"value": "<as written in the message>", "source_ref": "source:<message id>"},
    "email": {"value": "<as written in the message>", "source_ref": "source:<message id>"}
  },
  "items": [
    {"catalog_ref": "<ref from the catalog below>",
     "quantity": {"value": "<number exactly as written in the message>", "source_ref": "source:<message id>"}}
  ],
  "missing": ["<information the customer did not give, e.g. 'length of the worktop'>"]
}
Never compute prices or totals.
If a quantity or the e-mail address is not in the message, use "" and list it in "missing".
"""


def _sourced(value: str, ref: str) -> dict[str, str]:
    return {"value": value, "source_ref": ref}


def build_quote(extraction: dict[str, Any], catalog: dict[str, CatalogItem]) -> dict[str, Any]:
    customer = extraction.get("customer") or {}
    lines: list[dict[str, Any]] = []
    net = Decimal("0")
    vat = Decimal("0")
    computable = True
    for item in extraction.get("items") or []:
        if not isinstance(item, dict):
            continue
        ref = str(item.get("catalog_ref", ""))
        quantity = item.get("quantity") or {"value": "", "source_ref": ""}
        catalog_item = catalog.get(ref)
        line: dict[str, Any] = {"catalog_ref": ref, "quantity": quantity}
        if catalog_item is None:
            line["label"] = "(not in catalog)"
            computable = False
            lines.append(line)
            continue
        line["label"] = catalog_item.label
        line["unit"] = catalog_item.unit
        line["unit_price"] = _sourced(fmt(catalog_item.unit_price), f"catalog:{ref}")
        line["vat_rate"] = _sourced(str(catalog_item.vat_rate), f"catalog:{ref}")
        try:
            qty = to_decimal(quantity.get("value") if isinstance(quantity, dict) else quantity)
        except MoneyError:
            computable = False
            lines.append(line)
            continue
        total = round_money(qty * catalog_item.unit_price)
        line["line_total"] = _sourced(fmt(total), "calc:quantity*unit_price")
        net += total
        vat += total * catalog_item.vat_rate
        lines.append(line)
    quote: dict[str, Any] = {
        "customer": {"name": customer.get("name", ""), "email": customer.get("email", "")},
        "lines": lines,
        "currency": "EUR",
        "missing": list(extraction.get("missing") or []),
    }
    if computable and lines:
        net_r, vat_r = round_money(net), round_money(vat)
        quote["totals"] = {
            "net": _sourced(fmt(net_r), "calc:sum(line_total)"),
            "vat": _sourced(fmt(vat_r), "calc:sum(line_total*vat_rate)"),
            "gross": _sourced(fmt(net_r + vat_r), "calc:net+vat"),
        }
    else:
        quote["totals"] = {}
    return quote
