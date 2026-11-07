"""Release readiness gate tests do not require PostgreSQL, Node or external services."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check-release-readiness.py"
spec = importlib.util.spec_from_file_location("select_release_gate", SCRIPT)
assert spec and spec.loader
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

GATES = [
    {
        "id": key, "issue": issue, "title": key,
        "status": "pending", "evidence": [], "acceptance": "Independent verification needed",
    }
    for key, issue in gate.EXPECTED_IDS.items()
]


class ReleaseGateTests(unittest.TestCase):
    def make_repo(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / "release").mkdir()
        (root / "release/readiness.json").write_text(json.dumps({
            "schema_version": 1, "target_version": "1.0.0", "gates": GATES,
        }), encoding="utf-8")
        for name in gate.VERSION_FILES:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('[project]\nversion = "1.0.0"\n', encoding="utf-8")
        (root / "apps/web").mkdir(parents=True)
        (root / "apps/web/package.json").write_text('{"version":"1.0.0"}', encoding="utf-8")
        (root / "apps/api/select_api").mkdir(parents=True)
        (root / "apps/api/select_api/__init__.py").write_text('__version__ = "1.0.0"\n', encoding="utf-8")
        (root / "CHANGELOG.md").write_text("## [1.0.0] — verified release\n", encoding="utf-8")
        return root

    def test_pending_manifest_is_valid_but_not_releasable(self):
        root = self.make_repo()
        self.assertEqual(gate.validate(root)[1], [])
        failures = gate.release_check(root)
        self.assertEqual(len([x for x in failures if x.startswith("BLOCKED")]), 8)

    def test_version_mismatch_fails_even_if_all_gates_are_verified(self):
        root = self.make_repo()
        source = root / "apps/web/package.json"
        source.write_text('{"version":"0.2.0"}', encoding="utf-8")
        problems = gate.release_check(root)
        self.assertTrue(any("version 0.2.0" in p for p in problems))

    def test_false_verification_without_evidence_is_rejected(self):
        root = self.make_repo()
        data = json.loads((root / "release/readiness.json").read_text(encoding="utf-8"))
        data["gates"][0]["status"] = "verified"
        (root / "release/readiness.json").write_text(json.dumps(data), encoding="utf-8")
        self.assertTrue(any("requires checked-in evidence" in p for p in gate.validate(root)[1]))

    def test_evidence_paths_cannot_escape_repo_or_link_to_unreviewed_remote(self):
        root = self.make_repo()
        data = json.loads((root / "release/readiness.json").read_text(encoding="utf-8"))
        data["gates"][0]["evidence"] = ["../../secrets.txt", "https://example.com/passed"]
        (root / "release/readiness.json").write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(len([p for p in gate.validate(root)[1] if "invalid evidence path" in p]), 2)

    def test_verified_manifest_with_actual_files_and_versions_passes(self):
        root = self.make_repo()
        data = json.loads((root / "release/readiness.json").read_text(encoding="utf-8"))
        (root / "release/evidence").mkdir()
        for entry in data["gates"]:
            entry["status"] = "verified"
            entry["evidence"] = [f"release/evidence/{entry['id']}.md"]
            entry["reviewed_by"] = "independent-reviewer"
            entry["reviewed_at"] = "2026-11-07"
            (root / entry["evidence"][0]).write_text(
                "Evidence linked to reproducible external test results.\n", encoding="utf-8"
            )
        (root / "release/readiness.json").write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(gate.release_check(root), [])

    def test_missing_gate_and_duplicate_gate_are_rejected(self):
        root = self.make_repo()
        data = json.loads((root / "release/readiness.json").read_text(encoding="utf-8"))
        data["gates"][-1] = data["gates"][0]
        (root / "release/readiness.json").write_text(json.dumps(data), encoding="utf-8")
        problems = gate.validate(root)[1]
        self.assertTrue(any("repeated" in p for p in problems))
        self.assertTrue(any("Missing gate IDs" in p for p in problems))


    def test_core_milestone_checks_versions_locks_and_honest_limitations(self):
        root = self.make_repo()
        (root / "uv.lock").write_text(
            'version = 1\n[[package]]\nname = "select-api"\nversion = "1.0.0"\n'
            '[[package]]\nname = "select-workspace"\nversion = "1.0.0"\n'
            '[[package]]\nname = "select-verify"\nversion = "1.0.0"\n',
            encoding="utf-8",
        )
        (root / "apps/web/package-lock.json").write_text(
            '{"version": "1.0.0", "packages": {"": {"version": "1.0.0"}}}', encoding="utf-8"
        )
        (root / "release/1.0.0-notes.md").write_text(
            "Not a certification. No native OAuth. No sandboxed coding.", encoding="utf-8"
        )
        self.assertEqual(gate.core_release_check(root), [])
        # Pending independent audit does not become verified by a core milestone.
        self.assertEqual(len([x for x in gate.release_check(root) if x.startswith("BLOCKED")]), 8)

        (root / "release/1.0.0-notes.md").write_text("Everything is certified!", encoding="utf-8")
        problems = gate.core_release_check(root)
        self.assertTrue(any("Release notes must disclose" in p for p in problems))

        (root / "apps/web/package-lock.json").write_text(
            '{"version": "0.2.0", "packages": {"": {"version": "0.2.0"}}}', encoding="utf-8"
        )
        problems = gate.core_release_check(root)
        self.assertTrue(any("package-lock.json" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
