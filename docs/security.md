# Security model

## Principles

1. **Fail closed.** Anything not verified goes to a human. A crashing check is an error, never a pass.
2. **Agents propose, the server acts.** Agents have no permission to send, pay, sign, hire or file taxes. External effects belong to the server, after the approval rules.
3. **External content is data.** E-mails and documents are stored as task sources and wrapped in `<untrusted_source>` tags in prompts. Deterministic checks compare outputs with the stored sources, so an injected instruction cannot make a wrong price or quantity pass (tests: `test_prompt_injection_*`).
4. **Limits independent of the score.** Risk caps and the legal-risk cap are enforced in code. Agents cannot change policies, budgets or licences.

## Controls in 0.1

| Control | Where |
| --- | --- |
| Server-side authorization on every company route, roles owner/admin/member/viewer | `auth.py` |
| Company isolation (unknown and foreign companies both return 404) | `auth.company_context`, tests |
| Bearer tokens stored as SHA-256 hashes, revocable | `security.py`, `api_tokens` |
| Provider keys encrypted with Fernet; only the last 4 characters are ever returned | `security.py`, `routes_settings.py` |
| Input validation with Pydantic (extra fields refused), sizes bounded | `views.py` |
| Optimistic concurrency on agents and tasks (409 with the current version) | `routes_org.py`, `routes_work.py` |
| Row locks on approval decisions and task numbering | `routes_work.py` |
| Idempotent submissions (`idempotency_key`) | `routes_work.py` |
| Budgets with hard stop; emergency stop cancelling queued runs | `runner.py`, `routes_org.py` |
| Append-only audit log with CSV export | `audit.py`, `routes_insight.py` |
| Security headers on the web app (`nosniff`, `DENY` framing, referrer policy) | `next.config.ts` |
| Containers run as an unprivileged user; ports bound to 127.0.0.1 | `docker/`, `docker-compose.yml` |

## Not in 0.1

- Single sign-on and a login screen (token mode is API-token based).
- Webhooks (none are exposed, so none to sign yet).
- Rate limiting per user (put it in the reverse proxy).
- Model-based detection of prompt injection: Select relies on deterministic checks against stored sources instead.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
