"""The code runner end to end: a real git repository, a real test command and the real Select API.

Only the coding agent is a stand-in: a small script that edits a file the way an agent CLI would (the "command"
agent). Claude Code and Codex themselves are not run here; their real runs need the CLIs and a model key.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from helpers import ok
from select_api.code_runner import CodeRunner, RunnerConfig, RunnerError
from test_capability_boundaries import REPO_A, coding_agent, grant

CHECK = "import sys\nsys.exit(0 if open('greeting.py').read() == \"print('Hello')\\n\" else 1)\n"
AGENT = (
    "import sys\n"
    "prompt = sys.stdin.read()\n"
    "open('greeting.py', 'w').write(\"print('Hello')\\n\" if 'Capitalise' in prompt else \"print('hi')\\n\")\n"
    "print('Capitalised the greeting.')\n"
)


def run(cwd: Path, *args: str) -> str:
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout  # noqa: S603 - test git calls


@pytest.fixture()
def repository(tmp_path: Path) -> Path:
    repo = tmp_path / "project"
    repo.mkdir()
    (repo / "greeting.py").write_text("print('hello')\n")
    (repo / "check.py").write_text(CHECK)
    run(repo, "git", "init", "--quiet", "--initial-branch=main")
    run(repo, "git", "add", ".")
    run(repo, "git", "-c", "user.name=Dev", "-c", "user.email=dev@example.org", "commit", "--quiet", "-m", "start")
    return repo


def runner_for(client, repository: Path, tmp_path: Path) -> tuple[CodeRunner, str, str]:
    cid, aid = coding_agent(client)
    grant(client, cid, aid)
    agent = tmp_path / "agent.py"
    agent.write_text(AGENT)
    config = RunnerConfig(
        company_id=cid,
        agent_id=aid,
        repository=repository,
        scope=REPO_A,
        test_command=[sys.executable, "check.py"],
        agent_cli="command",
        agent_command=[sys.executable, str(agent)],
        name="test-runner",
    )
    return CodeRunner(config, client), cid, aid


def code_task(client, cid: str, aid: str, title: str) -> dict:
    body = {"title": title, "task_type": "code_change", "assignee_id": aid, "resource_scope": REPO_A}
    return ok(client.post(f"/api/companies/{cid}/tasks", json=body), 201)


def test_runner_hands_in_a_tested_diff_for_review(client, repository: Path, tmp_path: Path) -> None:
    runner, cid, aid = runner_for(client, repository, tmp_path)
    task = code_task(client, cid, aid, "Capitalise the greeting")
    head = run(repository, "git", "rev-parse", "HEAD").strip()

    [report] = runner.run_once()
    assert (report.outcome, report.detail) == ("handed_in", "awaiting_approval")

    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["status"] == "awaiting_approval"
    output = detail["runs"][-1]["output"]
    assert "+print('Hello')" in output["diff"] and "-print('hello')" in output["diff"]
    assert output["base_commit"] == head
    assert (output["tests"]["exit_code"], output["tests"]["runner"]) == (0, "test-runner")
    checks = {c["id"]: c["status"] for c in detail["receipts"][-1]["body"]["checks"]}
    assert checks == {
        "summary_bounded": "passed",
        "patch_structure": "passed",
        "protected_paths": "passed",
        "tests_match_patch": "passed",
        "tested": "passed",
    }
    [approval] = [a for a in detail["approvals"] if a["status"] == "pending"]
    assert approval["reason"] == "contract_always"
    assert any(line.startswith("Tests: passed") for line in approval["payload"]["preview"])
    # The source repository is untouched: nothing was committed, applied or pushed.
    assert run(repository, "git", "rev-parse", "HEAD").strip() == head
    assert run(repository, "git", "status", "--porcelain") == ""
    assert not list(tmp_path.glob("select-runner-*"))


def test_failing_tests_block_the_patch_before_anyone_is_asked(client, repository: Path, tmp_path: Path) -> None:
    runner, cid, aid = runner_for(client, repository, tmp_path)
    task = code_task(client, cid, aid, "Shorten the greeting")  # the stand-in agent writes print('hi')

    [report] = runner.run_once()
    assert report.outcome == "handed_in"
    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["status"] == "blocked"
    assert not [a for a in detail["approvals"] if a["status"] == "pending"]
    failed = [c for c in detail["receipts"][-1]["body"]["checks"] if c["status"] == "failed"]
    assert [(c["id"], c["message"]) for c in failed] == [
        ("tests_match_patch", "the project's tests failed (exit code 1)")
    ]


def test_runner_only_takes_tasks_for_its_repository(client, repository: Path, tmp_path: Path) -> None:
    runner, cid, aid = runner_for(client, repository, tmp_path)
    grant(client, cid, aid, scope="repo:OtherOrg/Production")
    body = {
        "title": "Elsewhere",
        "task_type": "code_change",
        "assignee_id": aid,
        "resource_scope": "repo:OtherOrg/Production",
    }
    other = ok(client.post(f"/api/companies/{cid}/tasks", json=body), 201)
    assert runner.run_once() == []
    assert ok(client.get(f"/api/companies/{cid}/tasks/{other['id']}"))["status"] == "todo"


def test_an_agent_that_changes_nothing_blocks_the_task_with_a_reason(client, repository: Path, tmp_path: Path) -> None:
    runner, cid, aid = runner_for(client, repository, tmp_path)
    lazy = tmp_path / "lazy.py"
    lazy.write_text("print('Nothing to do.')\n")
    runner.config = RunnerConfig(**{**runner.config.__dict__, "agent_command": [sys.executable, str(lazy)]})
    task = code_task(client, cid, aid, "Capitalise the greeting")

    [report] = runner.run_once()
    assert report.outcome == "failed" and "changed nothing" in report.detail
    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["status"] == "blocked"
    assert "changed nothing" in detail["comments"][-1]["body"]


def test_runner_refuses_a_folder_that_is_not_a_repository(client, tmp_path: Path) -> None:
    config = RunnerConfig(
        company_id="c",
        agent_id="a",
        repository=tmp_path,
        scope=REPO_A,
        test_command=["true"],
        agent_cli="claude",
        name="r",
    )
    with pytest.raises(RunnerError, match="not a git checkout"):
        CodeRunner(config, client)


@pytest.mark.skipif(
    not (os.environ.get("SELECT_REAL_CLAUDE_CODE") and os.environ.get("ANTHROPIC_API_KEY")),
    reason="opt-in: set SELECT_REAL_CLAUDE_CODE=1 and ANTHROPIC_API_KEY to run the real Claude Code CLI (costs money)",
)
def test_real_claude_code_capitalises_the_greeting(client, repository: Path, tmp_path: Path) -> None:
    runner, cid, aid = runner_for(client, repository, tmp_path)
    runner.config = RunnerConfig(**{**runner.config.__dict__, "agent_cli": "claude", "max_budget_usd": "0.50"})
    task = code_task(client, cid, aid, "Capitalise the greeting printed by greeting.py (print 'Hello')")

    [report] = runner.run_once()
    assert report.outcome == "handed_in", report.detail
    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["runs"][-1]["output"]["tests"]["exit_code"] == 0
    assert detail["status"] == "awaiting_approval"
