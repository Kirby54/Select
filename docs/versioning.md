# Versioning and releases

- Select follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version (0.x) may contain breaking changes; they are listed under "Changed" in `CHANGELOG.md` with a migration note.
- The API, the worker and `select-verify` share the version number until 1.0.
- Database changes always ship as Alembic migrations; the API applies them at start.
- Contracts carry their own `version`. A change to a contract's checks bumps its version; receipts keep the version and SHA-256 they were produced with.
- Planned cadence: a release every two weeks when there are user-visible changes.
- **The 1.0.0 core milestone is explicitly scope-limited** to supported self-hosted workflows; it is not a production-security or all-integrations certification. Read [release notes](../release/1.0.0-notes.md).
- The independently audited, higher-assurance readiness checklist in [release/README.md](../release/README.md) is still pending. The strict evidence gate is for certification, not evidence that users' unrecorded tests occurred.
- Only release a version when every CI job passes on the exact release commit, versions and lockfiles agree, and public notes state unsupported/unverified behavior. Full independent production certification additionally requires the strict evidence gate.
