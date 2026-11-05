# autonomy-bench — reproducible measurement protocol

No comparative result is published. A strict metrics summarizer is implemented, but the task corpus and independent benchmark executions remain to be produced. Do **not** interpret tests, demonstrations or made-up examples as benchmark measurements.

## Question

On the same work, how much finishes without a human, and how many errors get through unnoticed?

## Setup

- **Tasks:** one simulated week, 300 tasks of six types (quote, support reply, invoice draft, triage, social post, small code fix), each with a reference result checked by hand. 30 tasks contain a trap: missing information, a wrong figure in the source, or a prompt-injection e-mail.
- **Configurations:** Select; Paperclip with an equivalent team and approvals; a single agent without orchestration. The Paperclip configuration is published with the benchmark and its maintainers are invited to improve it first.
- **Controls:** same models and versions, same budget per task, same machine, fixed temperature, three repetitions.
- **Human:** a script plays the reviewer and approves or corrects against the reference, so interventions are counted without bias.

## Measures

Autonomy rate and undetected-error rate (always reported together), traps caught, human interventions per day, cost per correct task, duration, recovery after a forced stop, installation time.


## Metrics summarizer (implemented)

The \`summarize.py\` tool accepts an independently reviewed JSONL file. It **does not run agents** and does not create or fabricate task outcomes:

\`\`\`bash
python3 bench/summarize.py /path/to/independently-reviewed-results.jsonl --output /path/to/report.json
python3 -m unittest discover -s bench -p 'test_*.py'
\`\`\`

Each line must include these fields (one completed task per system and task ID):

| Field | Value | How it must be established |
| --- | --- | --- |
| \`system\`, \`task_id\` | strings | Matching task IDs for each compared system |
| \`verified\` | boolean | Deterministic checks / reviewer-established acceptance |
| \`autonomous\` | boolean | Finished with zero human interventions |
| \`reviewed\` | boolean | Independent post-hoc review performed |
| \`late_error\` | boolean or null | Error found *after* completion, null when not reviewed |
| \`trap\` | boolean | Task contains a pre-defined independently documented trap |
| \`trap_blocked\` | boolean or null | The trap was prevented, null if the task had no trap |
| \`human_interventions\` | non-negative integer | Number of actual decisions made by people |
| \`duration_ms\` | non-negative integer | Elapsed wall time for the same task boundary |
| \`cost_usd\` | non-negative decimal string | Provider billing estimate/receipt using the same price policy |

The report contains autonomy rate, verified completion rate, post-hoc error rate on reviewed tasks, trap detection rate, intervention count, total task duration and cost per verified result. Rates with no valid denominator are **null**, not zero. An invalid or incomplete record, duplicate task, inconsistent autonomous claim or mismatched comparison task set makes the command fail.

For fairness, run Select, Paperclip and the baseline with the **same cases** and publish independent references, model IDs/versions, model temperatures, hardware, prompt budgets, run logs, billing method, failures, and raw JSONL. Report the number of reviewed tasks and the late-error rate **next to** autonomy. An unreviewed task must never be silently treated as error-free.

## Status

To do: write the 300 tasks and references (`bench/tasks/`), the reviewer script and the runner. Contributions welcome.
