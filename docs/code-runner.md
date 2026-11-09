# The code runner — Claude Code and Codex in disposable workspaces

The code runner lets a coding agent change a real repository while Select keeps the guarantees it has everywhere
else: the result is checked by code, a person reviews the exact diff, and nothing leaves without that decision.

```text
code_change task ──► runner claims it ──► fresh clone, no remotes ──► Claude Code / Codex edits files
                                                                            │
person approves the exact diff ◄── Select verifies ◄── diff + test report ◄─┴─► project's tests run on it
```

The runner is a separate process: `select-api code-runner`. **Run it on a machine you can throw away**, such as a
container or a virtual machine, never inside the Select server. The coding agent and the project's tests run code
from the repository.

## What it does for each task

1. Finds the `code_change` tasks that are assigned to its agent, scoped to its repository and still to do. It claims
   one by moving it to *in progress* with the task's version, so two runners never take the same task.
2. Clones the repository into a new temporary folder and **removes every remote**: nothing can be pushed from the
   workspace, and no repository credential exists in it.
3. Runs the coding agent in that folder with a clean environment: `PATH`, a temporary `HOME`, and only the model key
   that CLI needs.
   - **Claude Code**: `claude --bare -p <task> --output-format json --permission-mode acceptEdits`. `--bare` ignores
     the repository's own hooks, MCP servers and settings. It can edit files; shell commands and web access are not
     pre-approved, so a non-interactive run denies them.
   - **Codex**: `codex exec --sandbox workspace-write --ephemeral -o <file> <task>`, using Codex's own sandbox.
   - **Any command** (`--cli command`): the task arrives on standard input and in `SELECT_TASK_PROMPT`.
4. Records the exact diff (`git add --all`, then `git diff` against the base commit), then runs the project's test
   command on that tree, with **no key** in its environment.
5. Hands in the summary, the diff, the base commit and the test report through the submission API, then deletes the
   workspace.

If the agent fails, times out or changes nothing, the runner comments on the task with the reason and marks it
*blocked*; nothing is handed in.

## What Select checks (contract `code_change` v2)

| Check | Blocks? | |
| --- | --- | --- |
| `patch_structure` | yes | A plain text diff: no binary, no traversal, no file-mode change, at most 20 files |
| `protected_paths` | yes | No change to CI configuration (`.github/`, `.gitlab-ci.yml`, `.circleci/`), `.env` files or keys |
| `tests_match_patch` | yes | The test report is about **this exact diff** (its SHA-256) and base commit, and the tests passed |
| `tested` | no | Says *not tested* when no runner reported a test run (a proposal written by a model API) |

Every code change goes to a person (`approval: always`). The approval shows whether the tests passed, the command,
its duration and the runner's name, then the diff in colour.

**What the checks cannot prove.** Select does not run the tests itself: a test report is as trustworthy as the runner
you registered. The checks bind the report to the diff, so a diff cannot be swapped after the tests ran. An agent can
still weaken a test inside its own patch, which is why a person reads the diff before anything is merged.

## Set it up

1. **The agent.** Give an agent the `code_change` task type, then in its **Permissions & Evidence** panel issue a
   grant for the repository, for example `repo:acme/shop`, for 1 to 90 days. See
   [capability boundaries](capability-boundaries.md).
2. **A token.** Create an API token for the runner (Settings → your account, or `select-api create-token` in token
   mode). Give it to the runner as `SELECT_RUNNER_TOKEN`, never on the command line.
3. **The runner's machine.** Install `git`, the project's toolchain, Select's API package
   (`uv sync --all-packages` in a clone of Select) and the coding CLI: `npm install -g @anthropic-ai/claude-code` or
   `npm install -g @openai/codex`. Keep a local clone of the repository there; the runner only reads it.
4. **Start it:**

```bash
export SELECT_RUNNER_TOKEN=...            # the token from step 2
export ANTHROPIC_API_KEY=...              # Claude Code (or OPENAI_API_KEY for Codex)
uv run select-api code-runner \
  --api https://select.example.com --company <company id> --agent <agent id> \
  --repository /srv/checkouts/shop --scope repo:acme/shop \
  --test "npm test" --cli claude --max-budget-usd 2
```

`--once` does the waiting tasks and stops; otherwise it checks every 30 seconds (`--interval`). Other options:
`--model`, `--agent-timeout` (900 s), `--test-timeout` (600 s), `--name` (shown in the test reports),
`--keep-workspace` (to inspect a run).

5. **Create a task** of type *Code change* for that agent with the repository scope. The runner takes it; the result
   arrives in Approvals.

After you approve, apply the diff yourself, for example with `git apply` on a branch, and open the pull request as
usual. Select does not apply, commit or push it.

## Verified so far

- The whole loop runs in the test suite (`apps/api/tests/test_code_runner.py`) against the real API, a real git
  repository and a real test command. The coding agent there is a small script that edits a file; a failing test
  blocks the patch before anyone is asked, an agent that changes nothing blocks the task with its reason, and the
  source repository is left untouched.
- Claude Code 2.1.319 accepts the runner's command line and returns its JSON result; driven by the runner with an
  invalid key, it stops with "Invalid API key", which the runner reports on the task. Codex CLI 0.167.0 lists the
  flags the runner uses in `codex exec --help`.
- **Not verified yet:** a run with a valid model key, in which Claude Code or Codex actually changes a repository.
  The opt-in test `test_real_claude_code_capitalises_the_greeting` does it when `SELECT_REAL_CLAUDE_CODE=1` and
  `ANTHROPIC_API_KEY` are set; it costs a few cents.

## Limits

- One runner works for one agent and one repository. Run several runners for several repositories.
- The runner does not create pull requests and never pushes.
- Network access during the agent run and the tests is whatever the runner's machine allows; restrict it there
  (container network policy, firewall).
- Large patches (over 100 kB or 20 files) and binary files fail `patch_structure`.
