# Code change proposals — review-only foundation

Select can now accept a **text-only proposed diff** as a `code_change` task. This is **not** an integrated Claude Code/Codex runtime, and Select does not apply patches, execute tests or push Git commits.

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

Follow [issue #13](https://github.com/Kirby54/Select/issues/13): disposable isolated workspace, strictly scoped repository permissions, CLI adapters for Claude Code/Codex, bounded execution, real tests, a verified diff, evidence receipts and human approval before any pull request. Do not run untrusted agent commands on the Select host.
