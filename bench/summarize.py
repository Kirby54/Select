"""Reproducible metrics for autonomy-bench. No model calls and no invented results.

Input: JSONL, one independently assessed finished task per system and task_id.
Run: python3 bench/summarize.py path/to/results.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


class BenchmarkInputError(ValueError):
    """A record cannot be compared fairly or contains invalid measurements."""


def _boolean(item: dict[str, Any], key: str) -> bool:
    value = item.get(key)
    if type(value) is not bool:
        raise BenchmarkInputError(f"{key} must be a boolean")
    return value


def _integer(item: dict[str, Any], key: str) -> int:
    value = item.get(key)
    if type(value) is not int or value < 0:
        raise BenchmarkInputError(f"{key} must be a non-negative integer")
    return value


def _decimal(item: dict[str, Any], key: str) -> Decimal:
    raw = item.get(key)
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
        raise BenchmarkInputError(f"{key} must be a non-negative decimal amount")
    try:
        amount = Decimal(str(raw))
    except InvalidOperation as exc:
        raise BenchmarkInputError(f"{key} must be a valid decimal amount") from exc
    if not amount.is_finite() or amount < 0:
        raise BenchmarkInputError(f"{key} must be finite and non-negative")
    return amount


def validate(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise BenchmarkInputError("every line must be a JSON object")
    result: dict[str, Any] = {}
    for key in ("system", "task_id"):
        value = item.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 120:
            raise BenchmarkInputError(f"{key} must be a nonempty short string")
        result[key] = value.strip()
    for key in ("verified", "autonomous", "reviewed", "trap"):
        result[key] = _boolean(item, key)
    result["human_interventions"] = _integer(item, "human_interventions")
    result["duration_ms"] = _integer(item, "duration_ms")
    result["cost_usd"] = _decimal(item, "cost_usd")

    for flag, applicable in (("late_error", result["reviewed"]), ("trap_blocked", result["trap"])):
        value = item.get(flag)
        if applicable:
            if type(value) is not bool:
                raise BenchmarkInputError(f"{flag} must be a boolean when applicable")
            result[flag] = value
        else:
            if value is not None:
                raise BenchmarkInputError(f"{flag} must be null when not applicable")
            result[flag] = None
    if result["autonomous"] and result["human_interventions"]:
        raise BenchmarkInputError("autonomous tasks cannot contain human interventions")
    return result


def load(path: Path) -> dict[str, list[dict[str, Any]]]:
    systems: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    with path.open(encoding="utf-8") as source:
        for line_number, raw in enumerate(source, start=1):
            if not raw.strip():
                continue
            try:
                entry = validate(json.loads(raw))
            except (json.JSONDecodeError, BenchmarkInputError) as exc:
                raise BenchmarkInputError(f"{path}:{line_number}: {exc}") from exc
            key = (entry["system"], entry["task_id"])
            if key in seen:
                raise BenchmarkInputError(f"{path}:{line_number}: duplicate system/task_id {key}")
            seen.add(key)
            systems[entry["system"]].append(entry)
    if not systems:
        raise BenchmarkInputError("No task records supplied. Nothing to measure.")
    if len(systems) > 1:
        reference = {entry["task_id"] for entry in next(iter(systems.values()))}
        for name, entries in systems.items():
            current = {entry["task_id"] for entry in entries}
            if current != reference:
                raise BenchmarkInputError(
                    f"{name}: task IDs do not match the other systems. "
                    "Use the same tasks for every comparison."
                )
    return systems


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def _money(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.000001")), "f")


def summarize(systems: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    result = []
    for name, entries in sorted(systems.items()):
        total = len(entries)
        verified = sum(bool(e["verified"]) for e in entries)
        autonomous = sum(bool(e["autonomous"]) for e in entries)
        reviewed = sum(bool(e["reviewed"]) for e in entries)
        late_errors = sum(e["late_error"] is True for e in entries)
        traps = sum(bool(e["trap"]) for e in entries)
        trapped = sum(e["trap_blocked"] is True for e in entries)
        cost = sum((e["cost_usd"] for e in entries), Decimal("0"))
        result.append({
            "system": name,
            "tasks": total,
            "verified_results": verified,
            "verified_result_rate": _rate(verified, total),
            "autonomous_tasks": autonomous,
            "autonomy_rate": _rate(autonomous, total),
            "reviewed_tasks": reviewed,
            "late_errors": late_errors,
            "late_error_rate_among_reviewed": _rate(late_errors, reviewed),
            "trap_tasks": traps,
            "trap_detection_rate": _rate(trapped, traps),
            "human_interventions": sum(e["human_interventions"] for e in entries),
            "cost_usd": _money(cost),
            "cost_usd_per_verified_result": _money(cost / verified) if verified else None,
            "total_duration_ms": sum(e["duration_ms"] for e in entries),
        })
    return {
        "status": "measured_from_supplied_records",
        "comparability": "matched_task_ids" if len(systems) > 1 else "single_system_only",
        "systems": result,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Summarize verified task records without running models")
    parser.add_argument("results", type=Path, help="JSON Lines with one record per system and task")
    parser.add_argument("--output", type=Path, help="optional JSON report output path")
    args = parser.parse_args(argv)
    try:
        report = summarize(load(args.results))
    except (OSError, BenchmarkInputError) as exc:
        print(f"Cannot summarize benchmark: {exc}", file=sys.stderr)
        return 2
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
