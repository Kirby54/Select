# Security model

## Principles

1. **Fail closed.** Anything not verified goes to a person. A crashing check is an error, never a pass.
2. **Agents propose, the server acts.** Agents have no permission to send, pay, sign, hire or file taxes. External effects (sending an e-mail) belong to the server, after the approval rules.
3. **External content is data.** E-mails and documents are stored as task sources and wrapped in `<untrusted_source>` tags in prompts. Deterministic checks compare outputs with the stored sources, so an injected instruction cannot make a wrong price or quantity pass (tests: `test_prompt_injection_*`, end-to-end "an invented price never reaches the approval queue").
4. **Limits independent of the score.** Risk caps and the legal-risk cap are enforced in code. Agents cannot change policies, budgets or licences.

## Accounts and sessions (password mode)

| Control | Detail |
| --- | --- |
| Passwords | Argon2id (`argon2-cffi`), at least 10 characters; a missing account costs the same time as a wrong password |
| Sessions | A random token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` when `SELECT_PUBLIC_URL` is https; only its SHA-256 is stored; 30 days by default; ended by signing out, and every other session ends when the password changes |
| Forged requests | Requests authenticated by the cookie must carry the `x-select-csrf` header, which another site cannot set |
| Guessing | 10 failed sign-ins for one address in 15 minutes block that address for the rest of the window |
| First owner | Created once, under a database lock; afterwards accounts only come from invitations |
| Invitations | Random single-use links, 7 days; only an owner invites an admin; the last owner cannot leave or be demoted |
| API tokens | Stored as SHA-256 hashes, revocable, shown once |

## Mail

| Control | Detail |
| --- | --- |
| Mailbox passwords | Encrypted with `SELECT_SECRET_KEY`, never returned by the API |
| Reading | Read-only folder, `BODY.PEEK`: nothing is marked read, moved or deleted |
| New recipients | An address that never wrote to the company always needs a person |
| Volume | At most `outbound_per_hour` e-mails per hour (default 20); above it they wait |
| Emergency stop | Holds every e-mail that has not left |
| Duplicates | One e-mail per task; the Message-ID is fixed before sending; an e-mail that may have left is marked *uncertain* and never resent without a person |
| Disclosure | E-mails sent without review say an AI prepared them (configurable) |

## Other controls

| Control | Where |
| --- | --- |
| Server-side authorization on every company route, roles owner/admin/member/viewer | `auth.py` |
| Company isolation (unknown and foreign companies both return 404) | `auth.company_context`, tests |
| Provider keys encrypted with Fernet; only the last 4 characters are ever returned | `security.py`, `routes_settings.py` |
| Input validation with Pydantic (extra fields refused), sizes bounded | `views.py` |
| Optimistic concurrency on agents and tasks (409 with the current version) | `routes_org.py`, `routes_work.py` |
| Row locks on approval decisions and task numbering | `routes_work.py` |
| Idempotent submissions (`idempotency_key`) | `routes_work.py` |
| Budgets with hard stop; emergency stop cancelling queued runs | `guards.py`, `routes_org.py` |
| Append-only audit log with CSV export | `audit.py`, `routes_insight.py` |
| Security headers on the web app (`nosniff`, `DENY` framing, referrer policy) | `next.config.ts` |
| Containers run as an unprivileged user; ports bound to 127.0.0.1 | `docker/`, `docker-compose.yml` |

## Not in 0.2

- Single sign-on, two-factor authentication, password reset by e-mail (an admin resets with the CLI).
- OAuth for mailboxes (Microsoft 365, Google): app passwords only.
- Rate limiting per IP address (sign-in is limited per account address; put IP limits in the reverse proxy).

## Local deployment safety

`SELECT_AUTH_MODE=local` intentionally skips sign-in and is **only** for a trusted computer. The `select-api serve` CLI refuses to bind this mode to a public or LAN interface; leave the default `--host 127.0.0.1` in place. Use `SELECT_AUTH_MODE=password` or `token` before exposing the API outside localhost. Reverse proxies and other ASGI launchers must apply equivalent network restrictions; do not expose local mode by running Uvicorn directly on `0.0.0.0`.

When `SELECT_SECRET_KEY` is not provided, the API and worker can start together against a shared `SELECT_DATA_DIR`. They create/read the same encryption key atomically in that directory. **Back it up**: deleting this file makes existing encrypted provider and mailbox credentials unreadable.

- Model-based detection of prompt injection: Select relies on deterministic checks against stored sources instead.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
