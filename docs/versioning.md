# Versioning and releases

- Select follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version (0.x) may contain breaking changes; they are listed under "Changed" in `CHANGELOG.md` with a migration note.
- The API, the worker and `select-verify` share the version number until 1.0.
- Database changes always ship as Alembic migrations; the API applies them at start.
- Contracts carry their own `version`. A change to a contract's checks bumps its version; receipts keep the version and SHA-256 they were produced with.
- Planned cadence: a release every two weeks when there are user-visible changes.
