# Parity with Paperclip

Snapshot of 3 November 2026, from a shallow clone of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) (about 3,400 server files, 1,500 UI components, 3,500 test files), its README and its [five-minute guide](https://docs.paperclip.ing/guides/getting-started/five-minute-path/). "Paperclip" lists what the code or documentation shows; it says nothing about quality. Select 0.2 is young; Paperclip is a mature product. **No claim of superiority is made without a measurement**, and none has been run yet.

| Capability | Paperclip | Select 0.2 | To build | Tests in Select |
| --- | --- | --- | --- | --- |
| Installation | One command (`npx paperclipai onboard`, Node.js 24), embedded PostgreSQL | `start.sh` / `start.ps1` around Docker Compose (images not built in the development environment) | Run without Docker | `start.sh` tested with a stand-in Docker CLI |
| Accounts, members, roles | Yes | Password sign-in, invitations, roles, API tokens; no SSO or 2FA | SSO, 2FA, reset by e-mail | `test_accounts.py`, e2e `complete.spec.ts` |
| Org chart, agents with roles, budgets, pause | Yes | Yes; agents listed in the sidebar with role icons and a "working" pulse | Agent config history | governance tests |
| Agent runtimes | Many adapters (Claude Code, Codex, Cursor, Gemini, OpenClaw, HTTP, plugins), workspaces | 4 model APIs, a submission API for any runtime, and a code runner for Claude Code and Codex in disposable workspaces (no real-key run recorded yet) | Pull requests after approval, more CLIs | runner tests (network double), `test_code_runner.py` (stand-in agent CLI) |
| Agents organising themselves | Heartbeats; a CEO agent proposes a strategy, hires and creates tasks | Work comes from people, e-mail, routines and code routing; no planning agent | Planning agent | — |
| Tasks, comments, history | Very rich (threads, documents, attachments, labels, relations, live run transcripts) | List, board, comments, history, project colours | Attachments, labels, live transcripts | vertical slice |
| Scheduled work | Heartbeats, routines | Routines (cron) in the company's time zone, missed runs fire once | — | `test_routine_creates_tasks_on_schedule`, e2e |
| Approvals | Yes | Yes, with the exact outgoing content and the receipt | Bulk decisions | vertical slice, autonomy tests |
| **Completion checks** | Per-issue contracts with risk, completion authority and a server arbiter | Per-task-type YAML contracts with deterministic rules and receipts | Model-based checks | 19 select-verify tests |
| **Trust** | Presets chosen by a person (`standard`, `low_trust_review`) | **Licence per agent × task type that changes with verified outcomes** | Calibration from data | autonomy tests |
| Autonomy rate next to the error rate | Not found | Yes | Benchmark | `test_promotion_path_to_autonomous` |
| Value provenance | Not found | Every number must come from a source | Richer sources (files) | select-verify tests |
| Business e-mail loop (read a mailbox, answer, send) | Not found in the code reviewed | IMAP in, triage, routing, verified reply or quote, SMTP out once | OAuth mailboxes, attachments | `test_mail_flow.py`, e2e with real local mail servers |
| Country set-up (VAT, currency, time zone) | Not found | 7 country presets, catalog import | More countries | `test_setup_and_routines.py`, catalog tests |
| Budgets and cost tracking | Yes, detailed | Estimated from tokens, hard stop | Provider-reported prices | `test_budget_hard_stop` |
| Audit log | Yes | Yes, CSV export | Retention policy | activity test |
| Plugins, skills, MCP | Yes | No | Contract packs as plugins | — |
| Demo without API key | Not found | Yes, a reproducible week | — | `test_demo_week_runs_the_real_pipeline` |
| Tests | ~3,500 test files | 79 Python, 20 frontend unit, 11 end-to-end | More coverage | — |

## What this means

- Select should **not** claim to orchestrate more or better than Paperclip. It does not.
- Select's bet is narrower: **autonomy that is earned and lost from verified outcomes, value provenance and an honest error rate**, applied to work that leaves the company (e-mail, quotes). Paperclip has contracts and trust presets, but in the code reviewed its trust is set by people, not by results.
- Paperclip is ahead for agents that write code and organise themselves.
- The fair comparison is the benchmark described in [bench/README.md](../bench/README.md): same tasks, same models, autonomy rate *and* undetected-error rate side by side. It has not been run.
