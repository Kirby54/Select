# autonomy-bench (protocol, not run yet)

No result is published. This file describes how Select will be measured so that results can be reproduced and challenged.

## Question

On the same work, how much finishes without a human, and how many errors get through unnoticed?

## Setup

- **Tasks:** one simulated week, 300 tasks of six types (quote, support reply, invoice draft, triage, social post, small code fix), each with a reference result checked by hand. 30 tasks contain a trap: missing information, a wrong figure in the source, or a prompt-injection e-mail.
- **Configurations:** Select; Paperclip with an equivalent team and approvals; a single agent without orchestration. The Paperclip configuration is published with the benchmark and its maintainers are invited to improve it first.
- **Controls:** same models and versions, same budget per task, same machine, fixed temperature, three repetitions.
- **Human:** a script plays the reviewer and approves or corrects against the reference, so interventions are counted without bias.

## Measures

Autonomy rate and undetected-error rate (always reported together), traps caught, human interventions per day, cost per correct task, duration, recovery after a forced stop, installation time.

## Status

To do: write the 300 tasks and references (`bench/tasks/`), the reviewer script and the runner. Contributions welcome.
