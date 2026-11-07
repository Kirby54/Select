# Select 1.0.0 — scope and evidence

Select 1.0.0 is a **self-hosted core** milestone with the included features and unsupported integrations explicitly listed in [1.0.0 notes](1.0.0-notes.md). It is **not a production-security, external-model compatibility or all-roadmap-features certification**.

The maintainer reports that additional tests have been completed, but the repository does not yet contain independently reviewable evidence for those tests. The stricter checklist in [readiness.json](readiness.json) therefore remains pending. No one should claim all those checks passed.

## Two different checks

- `python3 scripts/check-release-readiness.py --core-release 1.0.0` checks version alignment across packages and lockfiles, a 1.0 changelog, and release notes that disclose important unsupported features. This is for the explicitly scoped core milestone **only**.
- `python3 scripts/check-release-readiness.py --release 1.0.0` is the separate, stricter **independent production-readiness certification gate**. It requires external test evidence and reviewers for all eight gates, and is expected to fail until those are supplied.
- `python3 scripts/check-release-readiness.py --validate` merely validates manifest structure, safe for all development commits.

A passing core check **does not** prove live external provider integration, Gmail/Graph OAuth, a sandboxed coder, enterprise readiness, an independent benchmark or real Windows/macOS installs.

## Independent production-readiness work

| Gate | Issue | Evidence still required |
| --- | --- | --- |
| Live providers | [#11](https://github.com/Kirby54/Select/issues/11) | Opt-in real-provider tasks and redacted workflow logs |
| OAuth | [#12](https://github.com/Kirby54/Select/issues/12) | Gmail/Microsoft OAuth consent, refresh/revoke, sending tests |
| Isolated coding | [#13](https://github.com/Kirby54/Select/issues/13) | Disposable Claude Code/Codex sandbox with strict policy |
| Security/recovery | [#14](https://github.com/Kirby54/Select/issues/14) | Independent threat review, secrets scan, retention and key/backup recovery |
| Installers | [#15](https://github.com/Kirby54/Select/issues/15) | Real clean Windows/macOS/Linux install, upgrade and rollback |
| Benchmark | [#16](https://github.com/Kirby54/Select/issues/16) | Real, independently reviewed 300-task comparison |
| Release validation | [#17](https://github.com/Kirby54/Select/issues/17) | History-wide secret scan, reproducible release validation |
| UX accessibility | [#18](https://github.com/Kirby54/Select/issues/18) | First-run performance, responsive and accessibility review |

To mark a gate as verified, add a redacted, reproducible report at `release/evidence/<gate-id>.md` with the tested commit, environment, procedures, observed results, limitations, immutable references and reviewer name/date. Update `readiness.json` with the path, reviewer and review date. Merely asserting that testing happened is not independent evidence.

## Official GitHub release

The repository contains a GitHub Actions workflow for the **one-time** `v1.0.0` core milestone. It publishes only when a successful full CI run on the current **main** commit finishes, the core release preflight passes, and `v1.0.0` does not already exist.

That workflow publishes the explicit limitations verbatim. It does **not** modify any independently verified gate or claim the strict checklist passed. GitHub release publication may fail if the repository or organization restricts `GITHUB_TOKEN` content write permissions; check the workflow result and the Releases tab.

After publication, the stricter evidence checklist remains open for production readiness; treat high-risk deployments as not certified. Protect secrets, review [SECURITY.md](../SECURITY.md), and back up both PostgreSQL and the encryption key as described in [deployment](../docs/deployment.md).
