# Select 1.0.0 — release decision

**Status on 2026-11-07: NOT APPROVED FOR RELEASE.** This is a release-readiness plan,
not a claim that 1.0.0 exists or is production-ready. The codebase remains at 0.2.0
until the criteria below are completed and independently reviewed. Do not change
version strings or create a `v1.0.0` tag merely to pass a marketing milestone.

## What must be true for 1.0.0

The canonical machine-readable checklist is [readiness.json](readiness.json).
It is initialized with every gate **pending**. Each is linked to the original issue.

| Gate | Issue | Required evidence |
| --- | --- | --- |
| Live generation | [#11](https://github.com/Kirby54/Select/issues/11) | Harmless, explicitly authorized live test for Anthropic, OpenAI, Gemini, Ollama, from generation to verified result and cost |
| OAuth mail | [#12](https://github.com/Kirby54/Select/issues/12) | Gmail and Microsoft 365 PKCE consent, scoped credentials, refresh/revoke, approved sends and retry cases |
| Sandboxed coding | [#13](https://github.com/Kirby54/Select/issues/13) | Disposable Claude Code/Codex runtime, isolation and network limits, reproducible diff/test review, never direct host execution |
| Security and recovery | [#14](https://github.com/Kirby54/Select/issues/14) | Independent threat review, tenant and outbound controls, key rotation/recovery, retention, full data restore drill |
| Supported installers | [#15](https://github.com/Kirby54/Select/issues/15) | Clean-machine install and rollback on Windows, macOS and Linux, with persistent data after restart |
| Fair benchmark | [#16](https://github.com/Kirby54/Select/issues/16) | Real 300-task independently reviewed corpus, 30 traps, matched Select/Paperclip/baseline, three repeated runs, raw results |
| Release checks | [#17](https://github.com/Kirby54/Select/issues/17) | Release SHA CI green, Git-history secret scan, dry-run, migration/rollback docs, user-tested README, release notes |
| First-run accessibility | [#18](https://github.com/Kirby54/Select/issues/18) | Comparable first-run flow data, keyboard/accessibility checks, responsive testing and independently reviewed fixes |

The existing automated test suite is useful evidence but **does not substitute** for
live provider credentials, real mailbox consent, Windows/macOS Docker execution,
an independent security review or a comparative benchmark. Do not attach invented
test results or claim that simulated tests satisfy these gates.

## Evidence standard

For each issue, create a concise file at `release/evidence/<gate-id>.md` containing:

- **Build/commit** and exact versions under test.
- **Test environment**: OS, host, model/provider or mailbox as relevant, without secrets.
- **Procedure** that another reviewer could reproduce.
- **Expected and observed result** including failures; logs/screenshots only if safely redacted.
- **Source links** to immutable CI runs, tickets, or test artifacts where possible.
- **Reviewer name and review date**, plus remaining limitations.

An administrator should verify the claim and change that gate in
`release/readiness.json` to `"status": "verified"`, with the corresponding
`evidence` path, `reviewed_by` and `reviewed_at`. The JSON checker verifies
presence and shape of evidence, **not the honesty or accuracy of its contents**.
A separate reviewer must verify the reported results before the release is approved.

## Release preflight

```bash
# Safe in every commit. Reports malformed checklist entries.
python3 scripts/check-release-readiness.py --validate

# View open tasks. This does not promise a release.
python3 scripts/check-release-readiness.py --report

# Strict release gate: currently EXPECTED TO FAIL.
python3 scripts/check-release-readiness.py --release 1.0.0
```

The strict preflight also requires `1.0.0` consistently in the workspace package,
API package, API runtime `__version__`, verifier library, and web package, plus a
reviewed `CHANGELOG.md` section. When these values change, update lockfiles through
the package managers (e.g. `uv lock`, `npm install --package-lock-only`) and test
the *resulting* build; do not manually replace lockfile hashes.

Before tagging, also confirm on the exact SHA:

1. Every GitHub Actions CI job is green: backend, frontend, both Playwright suites,
   Docker backup/restore and Windows startup syntax.
2. Run the latest install, upgrade and full restore drills with a dedicated test environment.
3. Check the *entire Git history* for committed credentials; rotate any accidentally exposed
   tokens before changing repository visibility.
4. Review open security findings, data migration notes, license and contributor docs.
5. Independently examine the evidence files and all release notes.

Only then should an authorized maintainer create an annotated tag and release:

```bash
git checkout main
git pull --ff-only
python3 scripts/check-release-readiness.py --release 1.0.0
git tag -a v1.0.0 -m "Select 1.0.0"
git push origin v1.0.0
gh release create v1.0.0 --verify-tag --title "Select 1.0.0" --notes-file release/1.0.0-notes.md
```

These commands are a future procedure, **not actions performed** by this change.
The current GitHub connection can modify code and PRs but does not expose a
create-release or tag API. Visibility remains private until the repository owner
explicitly changes it after a separate secret-history audit.

## What can ship earlier

A responsibly labeled **0.x beta**, with a clear limitation list and live model
caveats, can precede 1.0.0. A 1.0.0 tag is a stability promise; tests alone do not
magically provide the missing product capabilities.
