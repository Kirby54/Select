"""The code runner: does `code_change` tasks for one agent on one repository, each in a disposable workspace.

Run it on a machine you choose, ideally a container or a virtual machine you can throw away, never inside the
Select server: the coding agent and the project's tests run code from the repository. For each task assigned to its
agent and scoped to its repository, the runner:

1. claims the task (status "in_progress" with the task's version, so two runners never take the same task);
2. clones the repository into a new temporary folder and removes every remote, so nothing can be pushed from it;
3. runs the coding agent there: Claude Code (`claude --bare -p`) or Codex (`codex exec --sandbox workspace-write`) in
   their non-interactive modes, or any command. Its environment is clean: PATH, a temporary HOME and only the model
   key that CLI needs. No repository credential exists anywhere in the workspace;
4. records the exact diff, then runs the project's test command on it, with no key in the environment;
5. hands in the summary, the diff, the base commit and the test report through the submission API.

Select verifies the result against the `code_change` contract (patch shape, protected files, a test report bound to
this exact diff) and a person reviews the exact diff. The runner never applies, commits or pushes anything.
"""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol

import httpx

AgentCli = Literal["claude", "codex", "command"]
# The only secret each CLI receives: its own model key, read from the runner's environment.
KEYS: dict[str, tuple[str, ...]] = {"claude": ("ANTHROPIC_API_KEY",), "codex": ("OPENAI_API_KEY",), "command": ()}
SUMMARY_MAX = 600
OUTPUT_TAIL = 4000
TIMED_OUT = 124  # the exit code `timeout(1)` uses


class Http(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response: ...


class RunnerError(RuntimeError):
    pass


@dataclass(frozen=True)
class RunnerConfig:
    company_id: str
    agent_id: str
    repository: Path  # a local git checkout to clone from; the runner never writes to it
    scope: str  # repo:owner/name, as on the tasks and the agent's grant
    test_command: list[str]
    agent_cli: AgentCli
    name: str
    agent_command: list[str] = field(default_factory=list)  # for agent_cli == "command"
    pass_env: tuple[str, ...] = ()  # extra variables for the "command" agent, by name
    model: str | None = None  # passed to Claude Code or Codex as --model
    max_budget_usd: str | None = None  # Claude Code only
    agent_timeout: int = 900
    test_timeout: int = 600
    keep_workspace: bool = False


@dataclass
class Report:
    task_key: str
    outcome: str  # "handed_in", "failed" or "skipped"
    detail: str = ""


class CodeRunner:
    def __init__(self, config: RunnerConfig, http: Http) -> None:
        if config.agent_cli == "command" and not config.agent_command:
            raise RunnerError("the 'command' agent needs a command to run")
        if not config.test_command:
            raise RunnerError("a test command is required: it is the evidence a reviewer relies on")
        if not (config.repository / ".git").exists():
            raise RunnerError(f"{config.repository} is not a git checkout")
        self.config = config
        self.http = http
        self.base = f"/api/companies/{config.company_id}"

    # --- Select API -------------------------------------------------------------------------------------------

    def _call(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.http.request(method, self.base + path, headers={"x-select-csrf": "1"}, **kwargs)
        if response.status_code >= 400:
            raise RunnerError(f"{method} {path} -> {response.status_code}: {response.text[:300]}")
        return response.json() if response.content else None

    def waiting_tasks(self) -> list[dict[str, Any]]:
        page = self._call(
            "GET",
            "/tasks",
            params={"task_type": "code_change", "assignee": self.config.agent_id, "status": "todo", "limit": 20},
        )
        return [t for t in page["items"] if t.get("resource_scope") == self.config.scope]

    def claim(self, task: dict[str, Any]) -> bool:
        response = self.http.request(
            "PATCH",
            f"{self.base}/tasks/{task['id']}",
            headers={"x-select-csrf": "1"},
            json={"version": task["version"], "status": "in_progress"},
        )
        if response.status_code == 409:
            return False  # another runner or a person changed it first
        if response.status_code >= 400:
            raise RunnerError(f"claim {task['key']} -> {response.status_code}: {response.text[:300]}")
        return True

    def give_up(self, task: dict[str, Any], reason: str) -> None:
        """Say why on the task and block it, so a person sees it; nothing is handed in."""
        self._call("POST", f"/tasks/{task['id']}/comments", json={"body": f"Code runner {self.config.name}: {reason}"})
        current = self._call("GET", f"/tasks/{task['id']}")
        self._call("PATCH", f"/tasks/{task['id']}", json={"version": current["version"], "status": "blocked"})

    # --- One task -----------------------------------------------------------------------------------------------

    def run_once(self) -> list[Report]:
        reports = []
        for task in self.waiting_tasks():
            if not self.claim(task):
                reports.append(Report(task["key"], "skipped", "taken by someone else"))
                continue
            reports.append(self.work_on(task))
        return reports

    def work_on(self, task: dict[str, Any]) -> Report:
        root = Path(tempfile.mkdtemp(prefix="select-runner-"))
        try:
            output = self.produce(task, root)
        except RunnerError as exc:
            self.give_up(task, str(exc))
            return Report(task["key"], "failed", str(exc))
        finally:
            if not self.config.keep_workspace:
                shutil.rmtree(root, ignore_errors=False)
        result = self._call("POST", f"/tasks/{task['id']}/submit", json={"output": output})
        return Report(task["key"], "handed_in", result["status"])

    def produce(self, task: dict[str, Any], root: Path) -> dict[str, Any]:
        workspace, home = root / "workspace", root / "home"
        home.mkdir()
        git(root, "clone", "--quiet", "--no-hardlinks", str(self.config.repository.resolve()), str(workspace))
        for remote in git(workspace, "remote").split():
            git(workspace, "remote", "remove", remote)
        base = git(workspace, "rev-parse", "HEAD").strip()

        summary = self.run_agent(task, workspace, home, root)
        git(workspace, "add", "--all")
        diff = git(
            workspace, "diff", "--cached", "--no-color", "--no-ext-diff", "--no-renames", "--src-prefix=a/",
            "--dst-prefix=b/", base,
        )  # fmt: skip
        if not diff.strip():
            raise RunnerError("the agent changed nothing, so there is no patch to review")
        return {
            "summary": summary,
            "diff": diff,
            "base_commit": base,
            "tests": self.run_tests(workspace, home, diff, base),
        }

    def run_agent(self, task: dict[str, Any], workspace: Path, home: Path, root: Path) -> str:
        cfg = self.config
        prompt = task_prompt(task)
        last_message = root / "last-message.txt"
        if cfg.agent_cli == "claude":
            argv = ["claude", "--bare", "-p", prompt, "--output-format", "json", "--permission-mode", "acceptEdits"]
            argv += ["--model", cfg.model] if cfg.model else []
            argv += ["--max-budget-usd", cfg.max_budget_usd] if cfg.max_budget_usd else []
        elif cfg.agent_cli == "codex":
            argv = ["codex", "exec", "--sandbox", "workspace-write", "--ephemeral", "-o", str(last_message)]
            argv += ["--model", cfg.model] if cfg.model else []
            argv.append(prompt)
        else:
            argv = list(cfg.agent_command)
        env = clean_env(home, KEYS[cfg.agent_cli] + (cfg.pass_env if cfg.agent_cli == "command" else ()))
        env["SELECT_TASK_PROMPT"] = prompt
        try:
            done = subprocess.run(  # noqa: S603 - argv is built here, never by a shell
                argv,
                cwd=workspace,
                env=env,
                input=prompt if cfg.agent_cli == "command" else None,
                capture_output=True,
                text=True,
                timeout=cfg.agent_timeout,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RunnerError(f"the agent program is not installed: {argv[0]}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RunnerError(f"the agent did not finish within {cfg.agent_timeout} s") from exc
        if done.returncode != 0:
            said = tail(done.stderr or done.stdout)
            if cfg.agent_cli == "claude":  # its JSON result says why, e.g. "Invalid API key"
                try:
                    said = str(json.loads(done.stdout).get("result") or said)
                except (json.JSONDecodeError, AttributeError):
                    pass  # not JSON: keep the raw tail, which is already in the message
            raise RunnerError(f"the agent stopped with exit code {done.returncode}: {said}")
        return agent_summary(cfg.agent_cli, done.stdout, last_message)

    def run_tests(self, workspace: Path, home: Path, diff: str, base: str) -> dict[str, Any]:
        cfg = self.config
        started = time.monotonic()
        try:
            done = subprocess.run(  # noqa: S603 - argv comes from the runner's own configuration
                cfg.test_command,
                cwd=workspace,
                env=clean_env(home, ()),
                capture_output=True,
                text=True,
                timeout=cfg.test_timeout,
                check=False,
            )
            code, output = done.returncode, (done.stdout or "") + (done.stderr or "")
        except FileNotFoundError as exc:
            raise RunnerError(f"the test command is not installed: {cfg.test_command[0]}") from exc
        except subprocess.TimeoutExpired:
            code, output = TIMED_OUT, f"the tests did not finish within {cfg.test_timeout} s"
        return {
            "command": shlex.join(cfg.test_command),
            "exit_code": code,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "output_sha256": hashlib.sha256(output.encode("utf-8")).hexdigest(),
            "output_tail": output[-OUTPUT_TAIL:],
            "diff_sha256": hashlib.sha256(diff.encode("utf-8")).hexdigest(),
            "base_commit": base,
            "runner": cfg.name,
        }


# --- Helpers ----------------------------------------------------------------------------------------------------


def git(cwd: Path, *args: str) -> str:
    done = subprocess.run(  # noqa: S603 - fixed git arguments
        ["git", "-c", "core.quotepath=off", *args],  # noqa: S607 - git from PATH, like the developer's own
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if done.returncode != 0:
        raise RunnerError(f"git {args[0]} failed: {tail(done.stderr)}")
    return done.stdout


def clean_env(home: Path, keep: tuple[str, ...]) -> dict[str, str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "NO_COLOR": "1",
        "CI": "1",
        "GIT_TERMINAL_PROMPT": "0",
    }
    for name in keep:
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


def task_prompt(task: dict[str, Any]) -> str:
    parts = [f"Task {task['key']}: {task['title']}"]
    if task.get("description"):
        parts.append(str(task["description"]))
    parts.append(
        "Make the change in this repository. Keep it as small as the task allows. Do not commit, do not push, "
        "and do not touch CI configuration, secrets or keys. The project's tests run after you, and a person "
        "reviews the exact diff. End with one or two sentences saying what you changed."
    )
    return "\n\n".join(parts)


def agent_summary(cli: AgentCli, stdout: str, last_message: Path) -> str:
    text = stdout
    if cli == "claude":
        try:
            result = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RunnerError("Claude Code did not return its JSON result") from exc
        if not isinstance(result, dict) or result.get("is_error"):
            said = result.get("result") if isinstance(result, dict) else result
            raise RunnerError(f"Claude Code reported an error: {tail(str(said))}")
        text = str(result.get("result") or "")
    elif cli == "codex" and last_message.exists():
        text = last_message.read_text(encoding="utf-8")
    text = " ".join(text.split())
    return (text[: SUMMARY_MAX - 1] + "…") if len(text) > SUMMARY_MAX else (text or "The agent gave no summary.")


def tail(text: str, size: int = 300) -> str:
    text = (text or "").strip()
    return text[-size:] if len(text) > size else text


# --- Command line -----------------------------------------------------------------------------------------------


def main(args: Any) -> None:
    token = os.environ.get("SELECT_RUNNER_TOKEN", "")
    headers = {"authorization": f"Bearer {token}"} if token else {}
    config = RunnerConfig(
        company_id=args.company,
        agent_id=args.agent,
        repository=Path(args.repository),
        scope=args.scope,
        test_command=shlex.split(args.test),
        agent_cli=args.cli,
        agent_command=shlex.split(args.agent_command) if args.agent_command else [],
        pass_env=tuple(args.pass_env or ()),
        name=args.name,
        model=args.model,
        max_budget_usd=args.max_budget_usd,
        agent_timeout=args.agent_timeout,
        test_timeout=args.test_timeout,
        keep_workspace=args.keep_workspace,
    )
    print(
        "Select code runner. The agent and the project's tests run code from the repository: run this in a "
        "container or a virtual machine you can throw away."
    )
    with httpx.Client(base_url=args.api.rstrip("/"), headers=headers, timeout=60) as http:
        runner = CodeRunner(config, http)
        while True:
            for report in runner.run_once():
                print(f"{report.task_key}: {report.outcome} {report.detail}".rstrip())
            if args.once:
                return
            time.sleep(args.interval)
