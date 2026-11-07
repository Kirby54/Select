# Security policy

Select decides what AI agents may do without a human. A flaw in its checks, approvals or isolation can have real consequences, so please report problems privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). Do not open a public issue. Include the version or commit, the steps to reproduce and the impact you see.

We aim to acknowledge reports within 3 working days and to agree on a fix and disclosure date with you.

## Supported versions

Only the latest release in the supported 1.x core line is targeted for security fixes. This is a best-effort open-source support policy, not an SLA.

## What is in scope

- Bypassing an approval, a risk cap or the legal-risk cap
- An agent or external content changing a licence level, a policy or a budget
- Reading or writing another company's data
- Exposure of provider API keys or tokens
- Prompt injection that makes a deterministic check pass or an action run without its rules

## Known limitations (1.0 core)

- `SELECT_AUTH_MODE=local` trusts anyone who can reach the server: use it only on your own machine. Docker Compose starts in `password` mode and binds its ports to `127.0.0.1`.
- Sign-in is limited per account address, not per IP address: put IP rate limits in the reverse proxy.
- No single sign-on, no two-factor authentication, no OAuth for mailboxes.
- Model-based review checks are not implemented; only deterministic checks run.

See [docs/security.md](docs/security.md) for the security model.
