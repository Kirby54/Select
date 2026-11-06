"""Tests for fair benchmark reporting: input integrity is the primary safety property."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("select_benchmark_summary", Path(__file__).with_name("summarize.py"))
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def record(system: str, task: str, **changes):
    payload = {
        "system": system,
        "task_id": task,
        "verified": True,
        "autonomous": False,
        "reviewed": True,
        "late_error": False,
        "trap": False,
        "trap_blocked": None,
        "human_interventions": 1,
        "duration_ms": 100,
        "cost_usd": "0.20",
    }
    payload.update(changes)
    return payload


class BenchmarkSummaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "results.jsonl"

    def write(self, *rows):
        self.path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")

    def test_rates_only_from_supplied_tasks(self):
        self.write(
            record("select", "t1", autonomous=True, human_interventions=0, trap=True, trap_blocked=True),
            record("select", "t2", verified=False, reviewed=False, late_error=None),
        )
        data = module.summarize(module.load(self.path))
        self.assertEqual(data["status"], "measured_from_supplied_records")
        self.assertEqual(data["comparability"], "single_system_only")
        select = data["systems"][0]
        self.assertEqual(select["tasks"], 2)
        self.assertEqual(select["autonomy_rate"], 0.5)
        self.assertEqual(select["late_error_rate_among_reviewed"], 0.0)
        self.assertEqual(select["trap_detection_rate"], 1.0)
        self.assertEqual(select["cost_usd_per_verified_result"], "0.400000")

    def test_reviewed_zero_has_no_error_rate(self):
        self.write(record("select", "t1", reviewed=False, late_error=None))
        summary = module.summarize(module.load(self.path))["systems"][0]
        self.assertIsNone(summary["late_error_rate_among_reviewed"])
        self.assertIsNone(summary["trap_detection_rate"])

    def test_multiple_systems_require_matching_ids(self):
        self.write(record("select", "t1"), record("paperclip", "t2"))
        with self.assertRaisesRegex(module.BenchmarkInputError, "task IDs do not match"):
            module.load(self.path)

    def test_trap_labels_must_match_for_same_task(self):
        self.write(
            record("select", "t1", trap=True, trap_blocked=True),
            record("paperclip", "t1", trap=False, trap_blocked=None),
        )
        with self.assertRaisesRegex(module.BenchmarkInputError, "trap label disagrees"):
            module.load(self.path)

    def test_trap_results_may_differ_but_task_labels_match(self):
        self.write(
            record("select", "t1", trap=True, trap_blocked=True),
            record("paperclip", "t1", trap=True, trap_blocked=False),
        )
        report = module.summarize(module.load(self.path))
        rates = {row["system"]: row["trap_detection_rate"] for row in report["systems"]}
        self.assertEqual(rates, {"select": 1.0, "paperclip": 0.0})

    def test_multiple_systems_can_be_compared(self):
        self.write(record("select", "t1"), record("paperclip", "t1", verified=False))
        result = module.summarize(module.load(self.path))
        self.assertEqual(result["comparability"], "matched_task_ids")
        self.assertEqual([x["system"] for x in result["systems"]], ["paperclip", "select"])

    def test_duplicate_attempt_is_not_silently_counted(self):
        self.write(record("select", "t1"), record("select", "t1"))
        with self.assertRaisesRegex(module.BenchmarkInputError, "duplicate"):
            module.load(self.path)

    def test_nan_cost_is_rejected(self):
        for cost in ("NaN", "Infinity", "-1"):
            with self.subTest(cost=cost):
                with self.assertRaises(module.BenchmarkInputError):
                    module.validate(record("select", "t1", cost_usd=cost))

    def test_autonomous_with_human_is_not_valid(self):
        with self.assertRaisesRegex(module.BenchmarkInputError, "human interventions"):
            module.validate(record("select", "t1", autonomous=True))

    def test_missing_late_error_is_rejected(self):
        with self.assertRaisesRegex(module.BenchmarkInputError, "late_error"):
            module.validate(record("select", "t1", late_error=None))

    def test_cli_creates_no_unmeasured_results(self):
        self.assertEqual(module.main([str(self.path)]), 2)
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
