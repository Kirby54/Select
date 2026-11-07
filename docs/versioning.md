# Versioning and releases

- Select follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version (0.x) may contain breaking changes; they are listed under "Changed" in `CHANGELOG.md` with a migration note.
- The API, the worker and `select-verify` share the version number until 1.0.
- Database changes always ship as Alembic migrations; the API applies them at start.
- Contracts carry their own `version`. A change to a contract's checks bumps its version; receipts keep the version and SHA-256 they were produced with.
- Planned cadence: a release every two weeks when there are user-visible changes.
- **1.0 requires independent acceptance evidence**, not merely an updated version string. The mandatory checklist, blockers and strict preflight are documented in [release/README.md](../release/README.md). The current gates remain pending.
- Do not publish a `v1.0.0` GitHub tag or release before the strict preflight passes and all six CI jobs have succeeded on the release commit.
