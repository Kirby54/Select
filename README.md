<p align="center">
  <img src="docs/hero-select.svg" width="100%" alt="Select — AI agents that earn their autonomy. Every result checked by code. Trust earned from evidence, never by default." />
</p>

<h1 align="center">Select</h1>

<p align="center"><strong>Run your company with AI agents that earn their autonomy.</strong></p>

<p align="center">
Agents of any kind — developers, marketers, support, sales — work in an organization you design. Every result is checked by code against a delivery contract,
and an agent stops needing your approval only once its verified record shows it can — per task type, revocable at any time.
</p>

<p align="center">
  <img src="docs/screenshots/overview.png" alt="Select home after the demo week: four figures, the autonomy rate next to the errors found afterwards, what needs you and recent activity" width="900" />
</p>

> **Try Select without an API key:** [Start locally](#quickstart), create the first owner account, open the **demo company** from the account menu, then choose **Run demo week**. Explore verification receipts and human approvals using fictional data. [Screenshots](#explore-the-interface) · [Five-minute guide](docs/getting-started.md) · [Current limits](#limits).
>
> **Building reliable AI agents?** Select checks deliverables against code-defined contracts, records evidence, and makes autonomy revocable per agent and task type. If this is useful, [star Select](https://github.com/Kirby54/Select) to find it later, or [share feedback](https://github.com/Kirby54/Select/issues/new/choose).

> **Status: 1.0.0 core release.** Self-hosted task management, deterministic verification and approvals are covered by automated tests, including Ubuntu Docker CI. This is **not production-safety certification**: native OAuth mail, sandboxed coding execution and independently verified real paid-provider acceptance remain unavailable or unverified. See [release notes](release/1.0.0-notes.md) and [Limits](#limits).

## Why Select

Multi-agent orchestrators let you decide in advance what agents may do alone. Select replaces that guess with evidence:

- **Delivery contracts.** Each task type has a YAML contract. The system runs its checks itself and keeps a **receipt** — contract version and hash, every check, the evidence. A model never declares that a check passed.
- **Autonomy earned per agent and task type.** Supervised → sampled → autonomous after a streak of verified successes; back to supervised at the first blocking failure or human correction.
- **Limits the score never overrides.** Payments, contracts, taxes and hiring are always supervised, in code.
- **An honest counter.** The share of work finished without a person is always shown next to the rate of errors people found afterwards.
- **No invented numbers.** Every value carries its source; a quantity that is not in the customer's e-mail fails verification.

<p align="center">
  <img src="docs/how-select-works.svg" width="100%" alt="How Select works: task arrives, agent works, code verifies, human approves, and Select sends once with a permanent log. Verified success can increase autonomy; blocking failures revoke it. Payments, signatures, hiring and taxes stay human." />
</p>

Both diagrams are SVG and can be reviewed or edited directly in the repository.

## What it does

| | |
| --- | --- |
| Start | First visit creates the owner; guided setup: country (VAT, currency, time zone, language), a starting team, an AI model, a mailbox, a catalog |
| Agents | Any role and model (Anthropic, OpenAI, Gemini, Ollama), org chart, permissions, budgets; a submission API for agents that run elsewhere |
| Work | Tasks from you, from incoming e-mail or from routines; list and board, projects, goals, comments, history |
| Mail | Reads a real mailbox (IMAP), triages, routes by code, prepares replies and quotes, sends once over SMTP after approval |
| Verification | `select-verify`: deterministic rules, exact-decimal money, VAT rates, provenance, receipts |
| Autonomy | Licences, promotion and demotion with reasons, sampling, risk caps, revocation, the counter |
| Approvals | The exact e-mail or content that would leave Select, the reason a person is asked, the proof |
| Team | Password sign-in, invitations, roles, API tokens |
| Operations | Costs and budgets with hard stop, emergency stop, audit log with CSV export |
| Demo | A recorded week in a fictional workshop, no API key |

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/messages.png" alt="Messages: an e-mail received, the triage and quote tasks it created, and the reply sent" /></td>
    <td width="50%"><img src="docs/screenshots/approval-email.png" alt="Approval: exactly the quote e-mail that will be sent, in French, with the VAT rate" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/setup-company.png" alt="Guided setup: the country fills currency, VAT rates, time zone and language" /></td>
    <td><img src="docs/screenshots/routines.png" alt="Routines: a weekly task on the company's clock, with its agent" /></td>
  </tr>
</table>

These four come from the end-to-end test run against local IMAP and SMTP test servers (`E2E_SCREENSHOTS_DIR`); the others are the demo company. All are real captures.

<!-- SELECT_SCREENSHOTS_BEGIN -->
## Explore the interface

These are real Playwright screenshots of Select running locally with **fictional demo data**.
No external model provider or mailbox is connected in this capture session.

<table>
  <tr>
    <td width="50%"><strong>Human approvals</strong><br /><img src="docs/screenshots/approvals.png" alt="Select approval queue with review context and verified results" /></td>
    <td width="50%"><strong>Agent team</strong><br /><img src="docs/screenshots/agents.png" alt="Select agent management, responsibilities and runtime status" /></td>
  </tr>
  <tr>
    <td><strong>Costs and budgets</strong><br /><img src="docs/screenshots/costs.png" alt="Select spending, budgets and agent activity" /></td>
    <td><strong>Model connections</strong><br /><img src="docs/screenshots/connections.png" alt="Select model connections and generation verification" /></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-tasks.png" alt="Select tasks on a mobile viewport" width="240" />
  <img src="docs/screenshots/mobile-autonomy.png" alt="Select autonomy tracking on a mobile viewport" width="240" />
</p>

<!-- SELECT_SCREENSHOTS_END -->

## Quickstart

Requirements: Docker Desktop (Windows, macOS) or Docker Engine with Compose (Linux).

```bash
git clone https://github.com/Kirby54/Select.git select
cd select
./start.sh                 # Windows: .\start.ps1
```

The script writes `.env` with random secrets (keep a copy), starts the containers and opens <http://localhost:3000>, where the first visit creates your account. Without the script: `cp .env.example .env`, set the secrets, `docker compose up --build`.

No API key yet? Open the demo company from the account menu and press **Run demo week**.

Five-minute guide: [docs/getting-started.md](docs/getting-started.md). Development setup without Docker: [docs/installation.md](docs/installation.md).

## How autonomy works

| Level | A verified result… |
| --- | --- |
| Supervised | goes to a person |
| Sampled | goes to a person if picked (default 20 %), otherwise finishes |
| Autonomous | finishes; a person can revoke the licence at once |

Default promotion thresholds are 20 and 50 verified successes in a row — **starting hypotheses to calibrate, not proven values**. An e-mail to an address that never wrote to you always goes to a person. Details: [docs/autonomy.md](docs/autonomy.md).

<p align="center">
  <img src="docs/screenshots/autonomy.png" alt="Autonomy: the rate next to the errors found afterwards, where each licence stands and what the next level needs" width="900" />
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/tasks.png" alt="Tasks grouped by status, navigable with the keyboard" /></td>
    <td width="50%"><img src="docs/screenshots/organization.png" alt="Org chart with each agent's role icon, model and autonomy" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/verification.png" alt="Verification: contracts, checks and receipts with real counts" /></td>
    <td><img src="docs/screenshots/task-receipts.png" alt="A task with its verification receipts" /></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-overview.png" alt="Home on a phone" width="240" />
  <img src="docs/screenshots/mobile-approvals.png" alt="Approvals on a phone" width="240" />
</p>

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

## Architecture

Next.js 16 web app → FastAPI API → PostgreSQL 16, with a worker on a durable PostgreSQL job queue that runs agents, reads mailboxes, sends approved e-mail and fires routines. `select-verify` is a separate Python library with no database or network access. See [docs/architecture.md](docs/architecture.md) and the interface's [design system](docs/design-system.md).

## Security

Agents never hold a permission to send, pay or sign; the server applies the approval rules and sends. External content is treated as data and checked against stored sources. Passwords use Argon2id; sessions live in an HttpOnly cookie with an anti-forgery header; provider keys and mailbox passwords are encrypted. Read [docs/security.md](docs/security.md) and [docs/deployment.md](docs/deployment.md) before opening Select to a network.

## Tests

```bash
make test     # Python verifier/API tests on PostgreSQL plus frontend unit tests
make e2e      # Playwright UI scenarios against a running stack
```

`e2e/complete.spec.ts` (4 more scenarios) runs on a password-mode stack with the local mail servers of `scripts/dev-mail.py`: first owner, guided setup, a real IMAP mailbox, an e-mail triaged, routed, quoted, approved and sent once over SMTP (the `.eml` file is checked), a weekly routine seen from a New York browser on Paris time, and an invited colleague joining.

## Verify a real model (optional)

The CI tests use network doubles, not real provider keys. Before connecting production data, use the explicit [live-provider probe](docs/provider-verification.md) with **your own test credentials**. It sends a harmless fixed JSON-generation prompt and reports whether the chosen model returns the expected result. It never stores the key or accesses company data. Real-provider compatibility is **not yet certified** by the maintainers.

## Benchmarks

None published yet. The protocol (`autonomy-bench`: same tasks and models, autonomy rate and undetected-error rate side by side, compared with a single agent and with Paperclip) is in [bench/README.md](bench/README.md). Until it runs, Select makes no comparative claim. Feature parity is tracked honestly in [docs/parity.md](docs/parity.md).

## Limits

- **Provider calls** have not been exercised against real paid-model APIs (no keys in CI). An Ollama-compatible localhost HTTP stub is used to test the full worker, deterministic verification and approval pipeline; it does not execute a real model.
- **Docker**: GitHub Actions builds both images, starts PostgreSQL, API, worker and web with Compose, and reaches the API health endpoint through the web proxy on Ubuntu. The `start.sh` script itself was tested with a stand-in Docker CLI; real macOS/Windows installations and `start.ps1` have not been exercised in CI.
- **Mailboxes** were tested against local IMAP and SMTP servers, not yet at a real provider. No OAuth: Microsoft 365 and Outlook.com cannot connect yet; Gmail needs an app password.
- **Agents write text and structured results through model APIs.** Code-change proposals can be checked for basic diff structure and sent to mandatory human review, but no repository code is edited, executed or pushed by Select. There is no isolated Claude Code or Codex runtime yet. See [review-only code proposals](docs/code-change-proposals.md).
- Attachments are not read; quotes are sent as e-mail text, without a PDF.
- **No e-invoice**: the invoice draft is not an XRechnung or ZUGFeRD file and is never presented as compliant. Businesses exempt from VAT (*franchise en base*) are not handled properly yet.
- No single sign-on, two-factor authentication, plugins or sandboxed code execution.

## Documentation

[Five minutes](docs/getting-started.md) · [Installation](docs/installation.md) · [Provider probe](docs/provider-verification.md) · [Configuration](docs/configuration.md) · [Mail](docs/mail.md) · [Agents](docs/agents.md) · [Autonomy](docs/autonomy.md) · [Verification](docs/verification.md) · [Workflows and routines](docs/workflows.md) · [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Security](docs/security.md) · [Troubleshooting](docs/troubleshooting.md) · [Design system](docs/design-system.md) · [Français](docs/fr/README.md)

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions: a new contract for a task type you know, or a new deterministic rule — each with one accepted and one rejected example.

## 1.0.0 release readiness

**1.0.0 is a self-hosted core milestone, not an independent production certification.** The higher-assurance, independently reviewed production-readiness checklist remains pending in [release readiness](release/README.md); passing CI alone does not prove the open roadmap integrations or readiness for high-risk environments.

## Roadmap

1. Verify with real model keys and real mailboxes; keep Docker startup, recovery and tests green across supported environments.
2. Coding-agent runtimes: run Claude Code or Codex in a code workspace, verify with the project's tests, approve the exact diff.
3. Run without Docker (embedded database), like a one-command install.
4. Quote PDFs, attachments, OAuth mailboxes, VAT-exempt businesses.
5. Run `autonomy-bench` and publish the raw results.

## Licence

The application (`apps/`) is licensed under **AGPL-3.0-only** ([LICENSE](LICENSE)). The `select-verify` library is licensed under **Apache-2.0** ([packages/select-verify/LICENSE](packages/select-verify/LICENSE)) so that other tools can adopt delivery contracts freely.

## Support

Questions, ideas and bugs: [GitHub Issues](https://github.com/Kirby54/Select/issues/new/choose) (pick the relevant template). Security vulnerabilities: report privately as described in [SECURITY.md](SECURITY.md).
