# Parity with Paperclip

Snapshot of 3 November 2026, from a shallow clone of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) (about 3,400 server files, 1,500 UI components, 3,500 test files) and its README. "Paperclip" lists what the code or documentation shows; it says nothing about quality. Select 0.1 is a young foundation; Paperclip is a mature product. **No claim of superiority is made without a measurement**, and none has been run yet.

| Capability | Paperclip | Select 0.1 | To build | Priority | Tests in Select |
| --- | --- | --- | --- | --- | --- |
| Org chart, reporting lines | Yes (OrgChart page) | Yes, persisted, loop-checked | Drag and drop | Medium | `test_agent_validation_and_org_loops` |
| Agents with roles, budgets, pause | Yes | Yes | Agent config history | Medium | governance tests |
| Tasks (issues), comments, history | Yes, very rich (threads, documents, attachments, labels, relations) | Basic: list, board, comments, history, archive | Attachments, labels, sub-task UI | Medium | vertical slice |
| Goals and projects | Yes | Basic CRUD | Progress roll-up | Low | — |
| Approvals | Yes (approvals, decision queues) | Yes, with exact payload and receipt | Bulk decisions | High | vertical slice, autonomy tests |
| **Completion contracts** | **Yes**: per-issue contracts with risk, completion authority and server arbiter (`completion_contracts`, `work_assessments`) | Per-task-type YAML contracts with deterministic rules and receipts | Model-based checks, more rules | High | 17 select-verify tests |
| **Trust levels** | Static presets chosen by a human (`standard`, `low_trust_review`) | **Licence per agent × task type that changes with verified outcomes** | Calibration from data | Core | autonomy tests |
| Autonomy counter with error rate | Not found | Yes | Benchmark | Core | `test_promotion_path_to_autonomous` |
| Value provenance (`source_ref`) | Not found | Yes, enforced by `provenance` rule | Richer sources (files) | High | select-verify tests |
| Exact money arithmetic | Finance events exist; not reviewed | Decimal everywhere, floats refused | — | — | `test_floats_are_refused` |
| Budgets and cost tracking | Yes, detailed | Yes, estimated from tokens, hard stop | Provider-reported prices | Medium | `test_budget_hard_stop` |
| Audit log | Yes | Yes, CSV export | Retention policy | Medium | activity test |
| Model providers / runtimes | Many adapters (Claude Code, Codex, Cursor, Gemini, OpenClaw, HTTP, plugins) | 4 direct providers + submission API for any runtime | Adapter plugins | Medium | runner tests (network double) |
| Sandboxed execution, workspaces | Yes (git worktrees, cloud sandboxes) | No | — | Not planned for 0.x | — |
| Scheduled routines, heartbeats | Yes | No | Scheduled tasks | Medium | — |
| Plugins, skills, MCP | Yes | No | Contract packs as plugins | Low | — |
| Multi-company, members, roles | Yes | Yes (token mode) | Login screen, SSO | Medium | `test_isolation_and_roles_in_token_mode` |
| Secrets management | Yes | Encrypted provider keys | Secret rotation | Medium | `test_secrets_are_encrypted_and_never_returned` |
| Demo without API key | Not found | Yes, reproducible week | — | Done | `test_demo_week_runs_the_real_pipeline` |
| Installation | One command (`npx paperclipai onboard`), embedded PostgreSQL | Docker Compose (not yet built end to end), dev script | Verify compose build in CI | High | e2e |
| Tests | ~3,500 test files | 52 backend, 9 frontend unit, 5 end-to-end | More coverage | Ongoing | — |

## What this means

- Select should **not** claim to orchestrate more or better than Paperclip. It does not.
- Select's distinct bet is narrower: **autonomy that is earned and lost from verified outcomes, with value provenance and an honest error rate**. Paperclip has contracts and trust presets, but in the code reviewed its trust is set by people, not by results.
- The fair comparison is the benchmark described in the audit (`autonomy-bench`): same tasks, same models, autonomy rate *and* undetected-error rate side by side. It has not been run.
