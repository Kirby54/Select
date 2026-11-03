# Security policy

Select decides what AI agents may do without a human. A flaw in its checks, approvals or isolation can have real consequences, so please report problems privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). Do not open a public issue. Include the version or commit, the steps to reproduce and the impact you see.

We aim to acknowledge reports within 3 working days and to agree on a fix and disclosure date with you.

## Supported versions

Only the latest `0.x` release receives security fixes during the pre-1.0 phase.

## What is in scope

- Bypassing an approval, a risk cap or the legal-risk cap
- An agent or external content changing a licence level, a policy or a budget
- Reading or writing another company's data
- Exposure of provider API keys or tokens
- Prompt injection that makes a deterministic check pass or an action run without its rules

## Known limitations (by design in 0.1)

- `SELECT_AUTH_MODE=local` trusts anyone who can reach the server. Docker Compose binds to `127.0.0.1` for that reason. Use `token` mode before exposing Select to a network.
- There is no outbound connector yet: approved actions are recorded as "ready to send" and are not sent.
- Model-based review checks are not implemented; only deterministic checks run.

See [docs/security.md](docs/security.md) for the security model.
