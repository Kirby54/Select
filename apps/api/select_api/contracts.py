from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from typing import Any

from select_verify import CatalogItem, Contract, VerifyContext, load_contract_dir

from .config import get_settings
from .models import Company, Task


@lru_cache
def registry() -> dict[str, Contract]:
    return load_contract_dir(get_settings().contracts_dir)


def get_contract(task_type: str) -> Contract | None:
    return registry().get(task_type)


def catalog_items(company: Company) -> dict[str, CatalogItem]:
    items: dict[str, CatalogItem] = {}
    for row in company.catalog or []:
        item = CatalogItem(
            ref=str(row["ref"]),
            label=str(row["label"]),
            unit=str(row.get("unit", "pc")),
            unit_price=Decimal(str(row["unit_price"])),
            vat_rate=Decimal(str(row.get("vat_rate", "0.19"))),
        )
        items[item.ref] = item
    return items


def company_vat_rates(company: Company) -> list[Decimal]:
    return [Decimal(str(r)) for r in (company.vat_rates or [])]


def build_context(company: Company, task: Task) -> VerifyContext:
    """Built by the system from stored data. Nothing here comes from the agent's output."""
    sources: dict[str, str] = {}
    for source in (task.inputs or {}).get("sources", []):
        if isinstance(source, dict) and "id" in source and "text" in source:
            sources[str(source["id"])] = str(source["text"])
    return VerifyContext(catalog=catalog_items(company), sources=sources, allowed_vat_rates=company_vat_rates(company))


def contract_summary(contract: Contract) -> dict[str, Any]:
    return {
        "id": contract.id,
        "version": contract.version,
        "title": contract.title,
        "description": contract.description,
        "risk": contract.risk,
        "required": contract.required,
        "checks": [c.model_dump() for c in contract.checks],
        "correction": contract.correction.model_dump(),
        "approval": contract.approval.model_dump(),
        "sha256": contract.sha256,
        "source": contract.source,
    }
