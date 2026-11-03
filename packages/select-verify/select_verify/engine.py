from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from .models import CheckResult, Contract, Receipt, VerifyContext
from .paths import MISSING, iter_path, unwrap
from .rules import RULES, RuleConfigError


class ContractError(ValueError):
    """The contract file is invalid. Raised at load time, never during verification."""


def load_contract(text: str) -> Contract:
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ContractError(f"invalid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ContractError("a contract must be a YAML mapping")
    try:
        contract = Contract.model_validate({**raw, "source": text})
    except ValidationError as exc:
        raise ContractError(str(exc)) from exc
    unknown = sorted({c.rule for c in contract.checks if c.rule not in RULES})
    if unknown:
        raise ContractError(f"unknown rule(s): {', '.join(unknown)}; available: {', '.join(sorted(RULES))}")
    ids = [c.id for c in contract.checks]
    if len(ids) != len(set(ids)):
        raise ContractError("check ids must be unique")
    contract.sha256 = contract.fingerprint()
    return contract


def load_contract_file(path: str | Path) -> Contract:
    return load_contract(Path(path).read_text(encoding="utf-8"))


def load_contract_dir(directory: str | Path) -> dict[str, Contract]:
    contracts: dict[str, Contract] = {}
    for file in sorted(Path(directory).glob("*.yaml")):
        contract = load_contract_file(file)
        if contract.id in contracts:
            raise ContractError(f"duplicate contract id '{contract.id}' in {file.name}")
        contracts[contract.id] = contract
    return contracts


def deliverable_digest(deliverable: dict[str, Any]) -> str:
    canonical = json.dumps(deliverable, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify(contract: Contract, deliverable: dict[str, Any], context: VerifyContext, *, run_id: str) -> Receipt:
    """Run every check of the contract. Never raises for a bad deliverable: it reports."""
    missing = [
        concrete
        for path in contract.required
        for concrete, value in iter_path(deliverable, path)
        if value is MISSING or unwrap(value) in (None, "", [], {})
    ]
    results: list[CheckResult] = []
    errors: list[str] = []
    for spec in contract.checks:
        fn = RULES[spec.rule]
        try:
            outcome = fn(deliverable, spec.params, context)
            status = "passed" if outcome.passed else "failed"
            message, evidence = outcome.message, outcome.evidence
        except RuleConfigError as exc:
            status, message, evidence = "error", f"contract configuration error: {exc}", {}
            errors.append(f"{spec.id}: {exc}")
        except Exception as exc:  # noqa: BLE001 - a crashing rule is recorded as an error, so it can never pass
            status, message, evidence = "error", f"rule crashed: {type(exc).__name__}: {exc}", {}
            errors.append(f"{spec.id}: {type(exc).__name__}: {exc}")
        results.append(
            CheckResult(
                id=spec.id,
                rule=spec.rule,
                description=spec.description,
                blocking=spec.blocking,
                status=status,  # type: ignore[arg-type]
                message=message,
                evidence=evidence,
            )
        )
    if missing:
        final = "blocked"
    elif any(r.blocking and r.status != "passed" for r in results):
        final = "failed"
    else:
        final = "verified"
    return Receipt(
        run_id=run_id,
        contract_id=contract.id,
        contract_version=contract.version,
        contract_sha256=contract.sha256,
        status=final,  # type: ignore[arg-type]
        checks=results,
        missing=missing,
        errors=errors,
        deliverable_sha256=deliverable_digest(deliverable),
    )
