# Agents

An agent is a role in your organization backed by a model you choose.

| Field | Notes |
| --- | --- |
| Name, role, description, objectives | Shown in the organization and added to the prompt |
| Reports to | Builds the organization chart; loops are refused |
| Provider and model | `anthropic`, `openai`, `gemini` or `ollama` plus the exact model id. Optional |
| Task types | The contracts this agent may work on. A task can only be assigned to an agent allowed to do its type |
| Permissions | `read_messages`, `read_catalog`, `draft_external`. Sending, paying or signing is never a permission |
| Instructions | Appended to Select's fixed safety rules, which come first and cannot be overridden |
| Monthly budget | 0 = no agent-level limit; the company budget still applies |
| Status | `active`, `paused` (no new runs), `archived` |

## Any kind of agent

An agent is a role and a model: a developer, a marketer, an analyst, support or sales. Its role also picks its icon in the
interface. **Free-form tasks** (title, details, result) may go to any agent; their contract always sends the result to a
person, so they never leave unreviewed. Other task types must be allowed on the agent.

Select calls models through their APIs: an agent writes text and structured results (a plan, a reply, a quote, a post). It
does not run tools in a code repository yet; a coding agent that runs elsewhere (Claude Code, Codex…) can hand its result to
Select through the submission API, and Select verifies it the same way.

## Is the agent operational?

The interface says **Ready** only when the agent has a provider, a model and an enabled connection for that provider. A blue pulse next to its name in the sidebar means it has a run queued or running. Otherwise it says **Not connected**: you can still submit results produced elsewhere, and they are verified the same way.

## Two ways to produce results

1. **Live run** — `Run with <agent>` on a task queues a job; the worker calls the provider. Sources are wrapped in `<untrusted_source>` tags and the prompt forbids following instructions found there. The output is parsed as one JSON object and handed to the pipeline. On a failed check, the next attempt receives the failed checks as feedback.
2. **Submission** — `POST /api/companies/{id}/tasks/{task}/submit` with `{"output": {...}, "idempotency_key": "..."}` lets any external agent runtime (or a person) deliver a result. The `Submit output` button does the same in the interface.

## Providers

| Provider | Client | Notes |
| --- | --- | --- |
| Anthropic | official `anthropic` SDK | key required |
| OpenAI | official `openai` SDK, JSON mode | key required; `base_url` allows compatible endpoints |
| Gemini | REST `generateContent` via `httpx` | key required |
| Ollama | REST `/api/chat` via `httpx`, `format: json` | no key; default `http://localhost:11434` |

**Test connection** only lists the provider's models; no company data is sent. Real provider calls are not exercised by the automated tests (no keys in CI); the runner is tested with a double that replaces only the network call.

## Costs

Providers return token counts, not prices. Select multiplies tokens by the price table you enter per model in **Connections** and stores the amount as **estimated**. Without a price the cost is recorded as 0 and the run log says so.
