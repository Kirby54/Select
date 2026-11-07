#!/usr/bin/env python3
"""Fail-closed 1.0 release evidence gate (standard library, no network or secrets).

The --validate mode checks policy syntax without blocking regular development.
--release 1.0.0 requires explicit independently reviewed evidence and synchronized
package versions; it is intended to run on an immutable release tag.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_IDS = {
    "live-providers": 11,
    "mail-oauth": 12,
    "sandbox-coding": 13,
    "security": 14,
    "clean-install": 15,
    "benchmark": 16,
    "release-validation": 17,
    "ux-accessibility": 18,
}
VERSION_FILES = (
    "pyproject.toml",
    "apps/api/pyproject.toml",
    "packages/select-verify/pyproject.toml",
)


def read_version(path: Path) -> str:
    if path.suffix == ".toml":
        return str(tomllib.loads(path.read_text(encoding="utf-8"))["project"]["version"])
    if path.suffix == ".json":
        return str(json.loads(path.read_text(encoding="utf-8"))["version"])
    if path.name == "__init__.py":
        match = re.search(r'^__version__\s*=\s*"([^"]+)"', path.read_text(encoding="utf-8"), re.MULTILINE)
        if match:
            return match.group(1)
    raise ValueError(f"Unsupported version source: {path}")


def validate(root: Path) -> tuple[dict, list[str]]:
    errors: list[str] = []
    try:
        manifest = json.loads((root / "release/readiness.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {}, [f"Cannot read release manifest: {exc}"]
    if manifest.get("schema_version") != 1 or manifest.get("target_version") != "1.0.0":
        errors.append("Manifest schema must be 1 and target_version must be 1.0.0.")
    gates = manifest.get("gates")
    if not isinstance(gates, list):
        return manifest, [*errors, "gates must be an array."]
    if len(gates) != len(EXPECTED_IDS):
        errors.append(f"Expected exactly {len(EXPECTED_IDS)} release gates.")
    seen: set[str] = set()
    for gate in gates:
        if not isinstance(gate, dict):
            errors.append("Every gate must be an object.")
            continue
        key = gate.get("id")
        if not isinstance(key, str) or key not in EXPECTED_IDS or key in seen:
            errors.append(f"Unknown or repeated gate: {key!r}.")
            continue
        seen.add(key)
        if gate.get("issue") != EXPECTED_IDS[key]:
            errors.append(f"{key}: wrong tracking issue.")
        if gate.get("status") not in ("pending", "verified"):
            errors.append(f"{key}: status must be pending or verified.")
        if not isinstance(gate.get("title"), str) or not gate["title"].strip():
            errors.append(f"{key}: missing title.")
        if not isinstance(gate.get("acceptance"), str) or not gate["acceptance"].strip():
            errors.append(f"{key}: missing acceptance criteria.")
        evidence = gate.get("evidence")
        if not isinstance(evidence, list) or any(not isinstance(x, str) for x in evidence):
            errors.append(f"{key}: evidence must be a list of strings.")
            continue
        for entry in evidence:
            # Only checked-in Markdown reports count. No arbitrary links, URL-only claims,
            # absolute paths or paths that escape the repository.
            if not re.fullmatch(r"release/evidence/[a-z0-9-]+\.md", entry):
                errors.append(f"{key}: invalid evidence path {entry!r}.")
            elif not (root / entry).is_file():
                errors.append(f"{key}: missing evidence file {entry}.")
        if gate.get("status") == "verified":
            if not evidence:
                errors.append(f"{key}: verified status requires checked-in evidence.")
            if not gate.get("reviewed_by") or not gate.get("reviewed_at"):
                errors.append(f"{key}: verified status requires reviewed_by and reviewed_at.")
    if seen != set(EXPECTED_IDS):
        errors.append(f"Missing gate IDs: {sorted(set(EXPECTED_IDS) - seen)}.")
    return manifest, errors


def release_check(root: Path, target: str = "1.0.0") -> list[str]:
    manifest, errors = validate(root)
    if not manifest:
        return errors
    if target != "1.0.0" or manifest["target_version"] != target:
        errors.append("This release gate is defined for 1.0.0 only.")
    for gate in manifest.get("gates", []):
        if isinstance(gate, dict) and gate.get("status") != "verified":
            errors.append(f"BLOCKED {gate.get('id')}: {gate.get('acceptance')}")
    sources = (*VERSION_FILES, "apps/web/package.json", "apps/api/select_api/__init__.py")
    for source in sources:
        try:
            actual = read_version(root / source)
        except (OSError, ValueError, KeyError) as exc:
            errors.append(f"{source}: cannot read version: {exc}")
            continue
        if actual != target:
            errors.append(f"{source}: version {actual}, expected {target}.")
    try:
        changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
        if not re.search(r"(?m)^## \[1\.0\.0\](?:\s|$)", changelog):
            errors.append("CHANGELOG.md needs a reviewed ## [1.0.0] entry.")
    except OSError as exc:
        errors.append(f"Cannot read changelog: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--validate", action="store_true", help="Validate manifest syntax; safe in regular CI")
    mode.add_argument("--report", action="store_true", help="Print v1 requirements without asserting readiness")
    mode.add_argument("--release", metavar="VERSION", help="Strictly require evidence and synchronized versions")
    args = parser.parse_args()
    manifest, errors = validate(ROOT)
    if args.report:
        for gate in manifest.get("gates", []):
            print(f"{gate['status'].upper():8} {gate['id']}: issue #{gate['issue']} — {gate['title']}")
    if args.release:
        errors = release_check(ROOT, args.release)
    if errors:
        for error in errors:
            print(f"RELEASE GATE: {error}", file=sys.stderr)
        return 1
    print("Manifest valid." if not args.release else f"Release {args.release} preflight passed; review CI and provenance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
