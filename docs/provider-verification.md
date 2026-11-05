# Test a real AI provider before trusting it with company work

Select's regular CI validates delivery contracts and the model-runner pipeline without sending company data to external services. Those tests **do not prove** that a particular model name, API key or provider account is ready for production.

Use the optional command below to make **one real generation request** using a harmless fixed prompt. This is an explicit, possibly billable action; it is never run automatically by CI.

## Prerequisites

Run from a checked-out Select repository after `uv sync --all-packages --frozen`. Pick a model your account has permission to call.

For Ollama, start the local service and pull the model first:

```bash
uv run select-api probe-provider --provider ollama --model llama3.2
```

For Anthropic, OpenAI or Gemini, provide a **test API key as an environment variable**, not as a command-line argument or in the repository:

```bash
# In a local terminal, enter the test key without echoing it.
read -rs SELECT_PROBE_API_KEY
export SELECT_PROBE_API_KEY
echo
uv run select-api probe-provider --provider anthropic --model YOUR_AVAILABLE_MODEL
unset SELECT_PROBE_API_KEY
```

Choose `--provider openai` or `--provider gemini` to test those adapters instead. If a custom endpoint is necessary, add `--base-url https://YOUR_TRUSTED_ENDPOINT`. Never point a provider carrying an API key at an endpoint you do not trust.

## What a successful probe proves

- Your chosen adapter can make a generation request to the configured endpoint using the supplied model.
- The response includes a JSON object matching the tiny known test instruction.
- Select can parse the response and reports the token counters it received.

The command prints only a concise pass/fail status and token counts. It does not print the key, returned text, or any company information. The command does not save the key, create an agent, send e-mail, modify autonomy or check a delivery contract.

## What it does *not* prove

- Your production quota or account permissions for other models.
- Reliability, accuracy, safety or consistency of the chosen model.
- Acceptance of real company payloads, integrations, outbound approval or SMTP delivery.
- Performance under load or a provider SLA.
- That the provider was tested by the Select maintainers: only **your own** local result can establish this.

Treat a passing probe as a prerequisite for broader integration testing, not a release certification. Follow [Security](security.md) and [Deployment](deployment.md) before connecting real company data.

## Troubleshooting

A missing key produces a local error before any network request. An unavailable model, invalid credentials, rate limits or a non-JSON response fail the probe with a nonzero exit code. Confirm your model ID with the provider and check your billing/quota settings. For local Ollama, verify the server is listening at the configured URL. If a model does not support structured JSON responses, this strict probe will fail; use a compatible model.
