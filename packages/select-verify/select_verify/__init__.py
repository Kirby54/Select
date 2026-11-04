"""select-verify: delivery contracts and verifiable receipts for AI agent work."""

from .engine import ContractError, deliverable_digest, load_contract, load_contract_dir, load_contract_file, verify
from .models import CatalogItem, CheckResult, Contract, Receipt, VerifyContext
from .money import MoneyError, fmt, round_money, to_decimal
from .rules import RULES

__all__ = [
    "RULES",
    "CatalogItem",
    "CheckResult",
    "Contract",
    "ContractError",
    "MoneyError",
    "Receipt",
    "VerifyContext",
    "deliverable_digest",
    "fmt",
    "load_contract",
    "load_contract_dir",
    "load_contract_file",
    "round_money",
    "to_decimal",
    "verify",
]

__version__ = "0.2.0"
