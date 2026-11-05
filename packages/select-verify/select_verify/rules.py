"""Deterministic rules. Each rule is plain Python run by the system, never by a model.

A rule receives the deliverable, its params from the contract and the system-built context,
and returns an Outcome. Raising ``RuleConfigError`` means the contract itself is wrong.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from .models import VerifyContext
from .money import MoneyError, fmt, round_money, to_decimal
from .paths import MISSING, get_one, iter_path, unwrap


@dataclass
class Outcome:
    passed: bool
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)


class RuleConfigError(ValueError):
    pass


Rule = Callable[[dict[str, Any], dict[str, Any], VerifyContext], Outcome]
RULES: dict[str, Rule] = {}


def rule(name: str) -> Callable[[Rule], Rule]:
    def register(fn: Rule) -> Rule:
        RULES[name] = fn
        return fn

    return register


def _param(params: dict[str, Any], key: str) -> Any:
    if key not in params:
        raise RuleConfigError(f"missing parameter '{key}'")
    return params[key]


def _is_blank(value: Any) -> bool:
    value = unwrap(value)
    return value is MISSING or value is None or (isinstance(value, (str, list, dict)) and len(value) == 0)


@rule("required_fields")
def required_fields(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    missing: list[str] = []
    for path in _param(params, "fields"):
        for concrete, value in iter_path(data, path):
            if _is_blank(value):
                missing.append(concrete)
    if missing:
        return Outcome(False, f"{len(missing)} required field(s) empty or missing", {"missing": missing})
    return Outcome(True, "all required fields present")


@rule("allowed_values")
def allowed_values(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    allowed = [str(v) for v in _param(params, "values")]
    bad = []
    for concrete, value in iter_path(data, _param(params, "field")):
        raw = unwrap(value)
        if raw is MISSING or str(raw) not in allowed:
            bad.append({"field": concrete, "value": None if raw is MISSING else str(raw)})
    if bad:
        return Outcome(False, f"value not allowed (allowed: {', '.join(allowed)})", {"invalid": bad})
    return Outcome(True, "all values allowed")


@rule("max_length")
def max_length(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    limit = int(_param(params, "max"))
    raw = unwrap(get_one(data, _param(params, "field")))
    if raw is MISSING or not isinstance(raw, str):
        return Outcome(False, "field missing or not text")
    if len(raw) > limit:
        return Outcome(False, f"{len(raw)} characters, limit is {limit}", {"length": len(raw)})
    return Outcome(True, f"{len(raw)} characters (limit {limit})")


@rule("pattern")
def pattern(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    regex = re.compile(_param(params, "regex"))
    bad = []
    for concrete, value in iter_path(data, _param(params, "field")):
        raw = unwrap(value)
        if raw is MISSING or not isinstance(raw, str) or not regex.fullmatch(raw):
            bad.append(concrete)
    if bad:
        return Outcome(False, "value does not match the expected format", {"invalid": bad})
    return Outcome(True, "format valid")


@rule("unified_diff_shape")
def unified_diff_shape(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    """Only basic patch shape and path safety, NOT whether a diff applies or tests pass.

    This rule never executes code. Every proposal still requires human approval.
    """
    raw = unwrap(get_one(data, _param(params, "field")))
    limit = int(params.get("max_bytes", 100_000))
    max_files = int(params.get("max_files", 20))
    if not isinstance(raw, str) or not raw.strip():
        return Outcome(False, "patch missing or not text")
    if len(raw.encode("utf-8")) > limit:
        return Outcome(False, "patch exceeds size limit")
    if "\x00" in raw or "\r" in raw or "GIT binary patch" in raw or "Binary files " in raw:
        return Outcome(False, "binary or non-text patch is not supported")
    lines = raw.splitlines()
    heads = [i for i, line in enumerate(lines) if line.startswith("diff --git ")]
    if not heads or len(heads) > max_files or heads[0] != 0:
        return Outcome(False, "patch must contain 1 to {0} git file sections".format(max_files))
    paths: list[str] = []
    for start, end in zip(heads, heads[1:] + [len(lines)], strict=True):
        section = lines[start:end]
        matched = re.fullmatch(r"diff --git a/([A-Za-z0-9._/-]+) b/([A-Za-z0-9._/-]+)", section[0])
        if not matched or matched.group(1) != matched.group(2):
            return Outcome(False, "unsupported or mismatched file paths")
        path = matched.group(1)
        parts = path.split("/")
        if any(piece in ("", ".", "..", ".git") for piece in parts) or "\\" in path:
            return Outcome(False, "unsafe file path")
        if any(line.startswith(("old mode ", "new mode ", "new file mode 120000", "deleted file mode")) for line in section):
            return Outcome(False, "file mode or deletion change requires an external diff review")
        if f"+++ b/{path}" not in section or not (
            f"--- a/{path}" in section or "--- /dev/null" in section
        ):
            return Outcome(False, "patch file markers do not match the path")
        if not any(line.startswith("@@ ") and " @@" in line for line in section):
            return Outcome(False, "patch has no unified hunk")
        if not any(line.startswith(("+", "-")) and not line.startswith(("+++", "---")) for line in section):
            return Outcome(False, "patch has no changed lines")
        paths.append(path)
    if len(paths) != len(set(paths)):
        return Outcome(False, "file appears more than once")
    return Outcome(True, "patch has a plausible text diff shape; not applied or tested", {"paths": paths})


@rule("forbidden_phrases")
def forbidden_phrases(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    raw = unwrap(get_one(data, _param(params, "field")))
    if raw is MISSING or not isinstance(raw, str):
        return Outcome(False, "field missing or not text")
    text = raw.lower()
    hits = [p for p in _param(params, "phrases") if str(p).lower() in text]
    if hits:
        return Outcome(False, "contains phrases this task type may not use", {"found": hits})
    return Outcome(True, "no forbidden phrase")


@rule("catalog_reference")
def catalog_reference(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    items_path = _param(params, "items")
    unknown, checked = [], 0
    for concrete, item in iter_path(data, items_path):
        if not isinstance(item, dict):
            unknown.append({"line": concrete, "ref": None})
            continue
        checked += 1
        ref = item.get("catalog_ref")
        if not isinstance(ref, str) or ref not in ctx.catalog:
            unknown.append({"line": concrete, "ref": ref})
    if checked == 0:
        return Outcome(False, "no line to check")
    if unknown:
        return Outcome(False, f"{len(unknown)} line(s) not found in the catalog", {"unknown": unknown})
    return Outcome(True, f"{checked} line(s) found in the catalog")


@rule("catalog_price")
def catalog_price(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    mismatches = []
    for concrete, item in iter_path(data, _param(params, "items")):
        if not isinstance(item, dict):
            continue
        ref = item.get("catalog_ref")
        catalog_item = ctx.catalog.get(ref) if isinstance(ref, str) else None
        if catalog_item is None:
            mismatches.append({"line": concrete, "reason": "unknown catalog reference"})
            continue
        try:
            price = to_decimal(unwrap(item.get("unit_price")), field=f"{concrete}.unit_price")
        except MoneyError as exc:
            mismatches.append({"line": concrete, "reason": str(exc)})
            continue
        if price != catalog_item.unit_price:
            mismatches.append(
                {"line": concrete, "catalog_ref": ref, "found": str(price), "catalog": str(catalog_item.unit_price)}
            )
    if mismatches:
        return Outcome(False, f"{len(mismatches)} price(s) differ from the catalog", {"mismatches": mismatches})
    return Outcome(True, "every unit price matches the catalog")


@rule("quote_totals")
def quote_totals(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    """Recompute every line total, the net, VAT and gross totals with exact decimals."""
    lines = get_one(data, params.get("items_field", "lines"))
    totals = get_one(data, params.get("totals_field", "totals"))
    if not isinstance(lines, list) or not lines or not isinstance(totals, dict):
        return Outcome(False, "lines or totals missing")
    problems: list[dict[str, str]] = []
    net = Decimal("0")
    vat = Decimal("0")
    try:
        for index, line in enumerate(lines):
            qty = to_decimal(unwrap(line.get("quantity")), field=f"lines[{index}].quantity")
            price = to_decimal(unwrap(line.get("unit_price")), field=f"lines[{index}].unit_price")
            if "vat_rate" not in line:
                problems.append({"field": f"lines[{index}].vat_rate", "found": "missing", "expected": "a VAT rate"})
                continue
            rate = to_decimal(unwrap(line.get("vat_rate")), field=f"lines[{index}].vat_rate")
            if rate not in ctx.allowed_vat_rates:
                problems.append({"field": f"lines[{index}].vat_rate", "found": str(rate), "expected": "allowed rate"})
            expected = round_money(qty * price)
            stated = to_decimal(unwrap(line.get("line_total")), field=f"lines[{index}].line_total")
            if stated != expected:
                problems.append(
                    {"field": f"lines[{index}].line_total", "found": str(stated), "expected": fmt(expected)}
                )
            net += expected
            vat += expected * rate
        expected_totals = {"net": round_money(net), "vat": round_money(vat)}
        expected_totals["gross"] = expected_totals["net"] + expected_totals["vat"]
        for key, expected_value in expected_totals.items():
            stated = to_decimal(unwrap(totals.get(key)), field=f"totals.{key}")
            if stated != expected_value:
                problems.append({"field": f"totals.{key}", "found": str(stated), "expected": fmt(expected_value)})
    except (MoneyError, AttributeError) as exc:
        return Outcome(False, f"cannot compute totals: {exc}")
    evidence = {"net": fmt(net), "vat": fmt(vat), "gross": fmt(round_money(net) + round_money(vat))}
    if problems:
        return Outcome(
            False, f"{len(problems)} amount(s) do not add up", {"problems": problems, "recomputed": evidence}
        )
    return Outcome(True, "every line and total recomputed exactly", {"recomputed": evidence})


@rule("vat_rate")
def vat_rate(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    """Every rate at ``field`` is one of the company's VAT rates (from the system-built context)."""
    bad: list[dict[str, Any]] = []
    checked = 0
    for concrete, value in iter_path(data, _param(params, "field")):
        raw = unwrap(value)
        checked += 1
        try:
            rate = to_decimal(None if raw is MISSING else raw, field=concrete)
        except MoneyError:
            bad.append({"field": concrete, "value": None if raw is MISSING else str(raw)})
            continue
        if rate not in ctx.allowed_vat_rates:
            bad.append({"field": concrete, "value": str(raw)})
    allowed = ", ".join(fmt_rate(r) for r in ctx.allowed_vat_rates)
    if checked == 0:
        return Outcome(False, "no VAT rate to check")
    if bad:
        return Outcome(False, f"VAT rate not used by this company (allowed: {allowed})", {"invalid": bad})
    return Outcome(True, f"every VAT rate is one of the company's rates ({allowed})")


def fmt_rate(rate: Decimal) -> str:
    """0.055 -> "5.5 %"."""
    percent = (rate * 100).normalize()
    return f"{format(percent, 'f')} %"


_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _number_variants(value: Any) -> set[str]:
    text = str(value)
    variants = {text, text.replace(".", ",")}
    try:
        normalized = format(to_decimal(text).normalize(), "f")
        variants |= {normalized, normalized.replace(".", ",")}
    except MoneyError:
        pass
    return variants


@rule("provenance")
def provenance(data: dict[str, Any], params: dict[str, Any], ctx: VerifyContext) -> Outcome:
    """Every listed field must carry a resolvable ``source_ref``.

    ``catalog:<ref>`` must exist in the catalog; ``source:<id>`` must be a known source and,
    when ``quote_check`` is on, the value must literally appear in that source text;
    ``calc:<formula>`` is accepted only for fields listed in ``computed``.
    """
    computed = set(params.get("computed", []))
    quote_check = bool(params.get("quote_check", True))
    problems: list[dict[str, Any]] = []
    checked = 0
    for path in _param(params, "fields"):
        for concrete, value in iter_path(data, path):
            if value is MISSING:
                continue
            checked += 1
            if not isinstance(value, dict) or "source_ref" not in value or "value" not in value:
                problems.append({"field": concrete, "reason": "no source_ref"})
                continue
            ref = str(value["source_ref"])
            kind, _, target = ref.partition(":")
            if kind == "catalog":
                if target not in ctx.catalog:
                    problems.append({"field": concrete, "source_ref": ref, "reason": "unknown catalog item"})
            elif kind == "source":
                source_id = target.split("#", 1)[0]
                text = ctx.sources.get(source_id)
                if text is None:
                    problems.append({"field": concrete, "source_ref": ref, "reason": "unknown source"})
                elif quote_check and isinstance(value["value"], (str, int)) and not isinstance(value["value"], bool):
                    raw = str(value["value"])
                    haystack = text.lower()
                    found = raw.lower() in haystack
                    if not found and _NUMBER_RE.fullmatch(raw.replace(" ", "")):
                        found = any(v in haystack for v in _number_variants(raw))
                    if not found:
                        problems.append({"field": concrete, "source_ref": ref, "reason": "value not found in source"})
            elif kind == "calc":
                if path not in computed:
                    problems.append({"field": concrete, "source_ref": ref, "reason": "calc not allowed here"})
            else:
                problems.append({"field": concrete, "source_ref": ref, "reason": "unknown source kind"})
    if checked == 0:
        if params.get("allow_empty", False):
            return Outcome(True, "no figure stated, nothing to trace")
        return Outcome(False, "no sourced field to check")
    if problems:
        return Outcome(False, f"{len(problems)} value(s) without valid provenance", {"problems": problems})
    return Outcome(True, f"{checked} value(s) traced to a source")
