# Code change proposals — review-only foundation

Select accepts a **text-only proposed diff** as a `code_change` task. Select itself never applies patches, executes code or pushes Git commits. To have Claude Code or Codex make the change in a disposable workspace and attach the project's test results, use the [code runner](code-runner.md); without it, a proposal is marked *not tested*.

## Purpose

This gives an external agent a structured submission path and a mandatory human decision:

1. Create a task of type `code_change` and assign an agent.
2. An externally running coding agent may submit a JSON object with `summary` and `diff`.
3. The `unified_diff_shape` verifier rejects missing, oversized, binary, traversal and unsupported file-mode diffs. It reports the touched paths.
4. Select records the receipt and **always** requests human review, independently of the agent's autonomy.
5. A human may approve or request changes. Approval only records the decision; it does **not** write to a repository or publish code.

Example JSON:

```json
{
  "summary": "Propose showing the corrected greeting.",
  "diff": "diff --git a/src/app.py b/src/app.py\n--- a/src/app.py\n+++ b/src/app.py\n@@ -1 +1 @@\n-print('hello')\n+print('Hello')\n",
  "tests_to_run": ["python -m pytest"]
}
```

Test commands in `tests_to_run` are suggestions only. Select does not execute them.

**Important limitations:** a valid shape is not evidence that a patch applies, passes tests, changes only approved code, or is safe. The rule supports a restrictive subset of text diffs (simple relative paths, no binary files, no renames/file-mode changes). All proposals require explicit human approval. Never connect this contract directly to automatic patch application.

## Roadmap to a real coding runtime

The [code runner](code-runner.md) covers the first part of [issue #13](https://github.com/Kirby54/Select/issues/13): a disposable workspace without remotes, CLI adapters for Claude Code and Codex, time limits, the project's tests on the exact diff, a receipt binding the test report to that diff, and human approval. Still open: a run verified with a real model key, opening a pull request after approval, and network policies enforced by Select rather than by the runner's machine. Never run agent commands on the Select host.
