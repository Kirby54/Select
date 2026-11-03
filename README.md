<p align="center">
  <img src="docs/logo.svg" width="56" alt="Select logo" />
</p>

<h1 align="center">Select</h1>

<p align="center"><strong>Run your company with AI agents that earn their autonomy.</strong></p>

<p align="center">
Agents from any provider work in an organization you design. Every result is checked by code against a delivery contract,
and an agent stops needing your approval only once its verified record shows it can — per task type, revocable at any time.
</p>

<p align="center">
  <img src="docs/screenshots/overview.png" alt="Select overview after the demo week: autonomy rate next to the undetected-error rate, finished tasks per day" width="900" />
</p>

> **Status: 0.1, an early foundation.** The core loop runs and is tested. Some parts are not verified yet; they are listed under [Limits](#limits).

## Why Select

Multi-agent orchestrators let you decide in advance what agents may do alone. Select replaces that guess with evidence:

- **Delivery contracts.** Each task type has a YAML contract. The system runs its checks itself and keeps a **receipt** — contract version and hash, every check, the evidence. A model never declares that a check passed.
- **An autonomy licence per agent and task type.** Supervised → sampled → autonomous after a streak of verified successes; back to supervised at the first blocking failure or human correction. Lea can be autonomous on triage and supervised on quotes.
- **Limits the score never overrides.** Contracts have a risk class; legal-risk work (payments, contracts, taxes, hiring) is always supervised, in code.
- **An honest counter.** The share of work finished without a human is always shown next to the rate of errors humans found afterwards.
- **No invented numbers.** Values carry a `source_ref`; a quantity that is not in the customer's e-mail fails verification.

## Features in 0.1

| | |
| --- | --- |
| Organization | Org chart with reporting lines, agents with model, permissions, task types, budget |
| Work | Tasks (list and board), goals, projects, comments, history, inbox |
| Verification | `select-verify`: 9 deterministic rules, exact-decimal money, provenance, receipts |
| Autonomy | Licences, promotion and demotion with explanations, sampling, risk caps, revocation, counter |
| Approvals | The exact content that would leave Select, the reason a human is asked, the proof |
| Operations | Costs per agent, model, provider and task; budgets with hard stop; emergency stop; audit log with CSV export |
| Providers | Anthropic and OpenAI (official SDKs), Gemini and Ollama (HTTP APIs); plus a submission API for any agent runtime |
| First business pack | Mail → quote: the model extracts, code prices from your catalog |
| Demo | A recorded week in a fictional workshop, no API key, reproducible |
| Interface | Dark graphite design system, keyboard-first (Ctrl/⌘ K, J/K, G then a letter), inspector panels, phone tab bar, WCAG 2.2 AA contrast |

<p align="center">
  <img src="docs/screenshots/autonomy.png" alt="Autonomy page: licences per agent and task type, and why each level changed" width="900" />
</p>

## Quickstart

```bash
git clone <URL_OF_THIS_REPOSITORY> select
cd select
docker compose up --build
```

Open <http://localhost:3000>, click **Open the demo**, then **Run demo week**.

Developer setup without Docker, and requirements: [docs/installation.md](docs/installation.md).

```bash
uv sync --all-packages && (cd apps/web && npm ci && npm run build)
export SELECT_DATABASE_URL=postgresql+psycopg://user@127.0.0.1:5432/select
./scripts/dev-up.sh
```

## Configuration

Environment variables prefixed `SELECT_`: database URL, auth mode (`local` or `token`), secret key for provider keys. See [.env.example](.env.example) and [docs/configuration.md](docs/configuration.md). Per company, in the interface: budget, autonomy policy, catalog, provider connections.

## A contract

```yaml
id: support_reply
version: 1
title: Support reply
risk: medium
required: [to, subject, body]
checks:
  - id: recipient_from_message
    rule: provenance          # the address must be the one that wrote to us
    params: { fields: [to] }
  - id: no_unauthorised_promises
    rule: forbidden_phrases
    params: { field: body, phrases: ["refund", "discount", "guarantee"] }
approval:
  mode: by_autonomy
  external_action: send_email
```

More in [docs/verification.md](docs/verification.md).

## How autonomy works

| Level | A verified result… |
| --- | --- |
| Supervised | goes to a human |
| Sampled | goes to a human if picked (default 20 %), otherwise finishes |
| Autonomous | finishes; a human can revoke the licence at once |

Default promotion thresholds are 20 and 50 verified successes in a row — **starting hypotheses to calibrate, not proven values**. Details: [docs/autonomy.md](docs/autonomy.md).

<p align="center">
  <img src="docs/screenshots/approvals.png" alt="Approval queue: who asks, why a human is asked, which checks ran, the exact quote that would be sent" width="900" />
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/tasks.png" alt="Tasks grouped by status, navigable with the keyboard" /></td>
    <td width="50%"><img src="docs/screenshots/organization.png" alt="Organization chart with each post's model, status and autonomy level" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/verification.png" alt="Verification: contracts, checks and receipts with real counts" /></td>
    <td><img src="docs/screenshots/task-receipts.png" alt="A task with its verification receipts" /></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-overview.png" alt="Overview on a phone" width="240" />
  <img src="docs/screenshots/mobile-approvals.png" alt="Approvals on a phone" width="240" />
</p>

## Architecture

Next.js 16 web app → FastAPI API → PostgreSQL 16, with a worker on a durable PostgreSQL job queue. `select-verify` is a separate Python library with no database or network access. See [docs/architecture.md](docs/architecture.md). The interface follows its own design system, documented in [docs/design-system.md](docs/design-system.md).

## Security

Agents never hold a permission to send, pay or sign; the server applies the approval rules. External content is treated as data and checked against stored sources. Provider keys are encrypted. `local` auth mode is for your own machine only — read [docs/security.md](docs/security.md) and [docs/deployment.md](docs/deployment.md) before exposing Select.

## Tests

```bash
make test     # 52 backend tests on PostgreSQL + 10 frontend unit tests
make e2e      # 7 Playwright scenarios against a running stack
```

The end-to-end suite creates a company, an agent and a task in the browser, submits a result, checks the receipt, approves it and verifies the history and the counters; it also checks that an injected price never reaches approval, that the keyboard moves through tasks and opens the inspector, that a phone reaches approvals from the tab bar, and that ten pages have no horizontal scroll at 360 px. Screenshots in this README are real captures of the demo company (`node scripts/screenshots.mjs`).

## Benchmarks

None published yet. The protocol (`autonomy-bench`: same tasks and models, autonomy rate and undetected-error rate side by side, compared with a single agent and with Paperclip) is described in [bench/README.md](bench/README.md). Until it runs, Select makes no comparative claim. Feature parity is tracked honestly in [docs/parity.md](docs/parity.md).

## Limits

- **Provider calls** have not been exercised against the real APIs (no keys in the build environment); the runner is tested with a double replacing only the network call.
- **Docker Compose** validates but had not been built end to end at release time (container registries were unreachable). The services inside were run and tested directly.
- **No outbound connector**: approved e-mails are recorded as "ready to send", not sent.
- **No e-invoice**: the invoice draft is not an XRechnung or ZUGFeRD file and is never presented as compliant.
- No scheduled routines, plugins, sandboxed code execution or single sign-on yet.

## Documentation

[Getting started](docs/getting-started.md) · [Installation](docs/installation.md) · [Architecture](docs/architecture.md) · [Configuration](docs/configuration.md) · [Agents](docs/agents.md) · [Autonomy](docs/autonomy.md) · [Verification](docs/verification.md) · [Workflows](docs/workflows.md) · [Deployment](docs/deployment.md) · [Security](docs/security.md) · [Troubleshooting](docs/troubleshooting.md) · [Design system](docs/design-system.md) · [Français](docs/fr/README.md)

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions: a new contract for a task type you know, or a new deterministic rule — each with one accepted and one rejected example.

## Roadmap

1. Run `autonomy-bench` and publish the raw results.
2. Outbound connectors (e-mail first) behind the approval rules.
3. More business packs (support, invoicing with real e-invoice validation).
4. Scheduled tasks and agent-to-agent delegation.
5. Login screen and single sign-on.

## Licence

The application (`apps/`) is licensed under **AGPL-3.0-only** ([LICENSE](LICENSE)). The `select-verify` library is licensed under **Apache-2.0** ([packages/select-verify/LICENSE](packages/select-verify/LICENSE)) so that other tools can adopt delivery contracts freely.

## Support

Questions and ideas: GitHub Discussions. Bugs: GitHub Issues. Vulnerabilities: privately, see [SECURITY.md](SECURITY.md).
