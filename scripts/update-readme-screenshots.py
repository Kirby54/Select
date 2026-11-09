#!/usr/bin/env python3
"""Add a gallery only after fresh Playwright screenshots have actually been captured."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
SHOTS = ROOT / "docs/screenshots"

REQUIRED = [
    "home.png",
    "approvals.png",
    "agent.png",
    "tasks.png",
    "team.png",
    "messages.png",
    "receipt.png",
    "autonomy.png",
    "routines.png",
    "mobile-home.png",
    "mobile-approval.png",
]
BEGIN = "<!-- SELECT_SCREENSHOTS_BEGIN -->"
END = "<!-- SELECT_SCREENSHOTS_END -->"


def cell(name: str, title: str, alt: str) -> str:
    return f'<td width="50%"><strong>{title}</strong><br /><img src="docs/screenshots/{name}" alt="{alt}" /></td>'


ROWS = [
    (
        cell(
            "approvals.png",
            "Exactly what would leave",
            "The approval of a quote: who asks, why a person is asked, "
            "the checks that passed and exactly the e-mail that would be sent",
        ),
        cell(
            "agent.png",
            "An agent's record",
            "Sam, the support agent: tasks done, checks passed, work finished "
            "without a person, and the licence earned on each type of task",
        ),
    ),
    (
        cell("tasks.png", "All the work", "Tasks grouped by status, with priority, project colour and agent"),
        cell("team.png", "The team", "The org chart: each agent's role, connection and autonomy level"),
    ),
    (
        cell(
            "messages.png",
            "E-mail in, work out",
            "A customer e-mail triaged by an agent and routed by code to the quotes agent",
        ),
        cell(
            "receipt.png",
            "No invented numbers",
            "A failed verification: a quantity the customer never wrote stops the quote before anyone is asked",
        ),
    ),
    (
        cell(
            "autonomy.png",
            "Autonomy, earned",
            "Where each licence stands and what the next level needs, next to the errors found afterwards",
        ),
        cell("routines.png", "Work on a schedule", "Routines that create tasks on the company's clock"),
    ),
]

GALLERY = "\n".join(
    [
        BEGIN,
        "## See it work",
        "",
        "Real captures of Select running **Brightloop Studio**, a sample company that",
        "[`scripts/sample-company.py`](scripts/sample-company.py) creates through the public API:",
        "8 agents, 4 projects, 3 routines and a mailbox on local test servers. The agents' results were written",
        "by the script and handed in through the submission API, so **no model was called**. Everything else is",
        "Select at work: it verified each result, kept the receipts, asked for approvals, moved the licences,",
        "triaged the incoming e-mail and sent the approved replies once over SMTP.",
        "Refresh them with the *Refresh real README screenshots* workflow.",
        "",
        "<table>",
        *(f"  <tr>\n    {left}\n    {right}\n  </tr>" for left, right in ROWS),
        "</table>",
        "",
        '<p align="center">',
        '  <img src="docs/screenshots/mobile-home.png" alt="Home on a phone" width="260" />',
        '  <img src="docs/screenshots/mobile-approval.png" alt="Approving a quote on a phone, with the exact e-mail"'
        ' width="260" />',
        "</p>",
        "",
        END,
    ]
)


def main() -> None:
    for name in REQUIRED:
        path = SHOTS / name
        if not path.is_file() or path.stat().st_size < 1000:
            raise SystemExit(f"Missing or empty real screenshot: {path}")
        if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise SystemExit(f"Not a PNG screenshot: {path}")

    current = README.read_text(encoding="utf-8")
    if BEGIN in current:
        if END not in current:
            raise SystemExit("README screenshot gallery markers are incomplete")
        before, rest = current.split(BEGIN, 1)
        _, after = rest.split(END, 1)
        updated = before + GALLERY + after
    else:
        if "## Quickstart" not in current:
            raise SystemExit("Could not locate README quickstart insertion point")
        updated = current.replace("## Quickstart", GALLERY + "\n\n## Quickstart", 1)
    README.write_text(updated, encoding="utf-8")
    print(f"Updated README using {len(REQUIRED)} verified PNG files")


if __name__ == "__main__":
    main()
