#!/usr/bin/env python3
"""Add a gallery only after fresh Playwright screenshots have actually been captured."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
SHOTS = ROOT / "docs/screenshots"

REQUIRED = [
    "overview.png", "approvals.png", "agents.png", "costs.png",
    "connections.png", "autonomy.png", "mobile-tasks.png", "mobile-autonomy.png",
]
BEGIN = "<!-- SELECT_SCREENSHOTS_BEGIN -->"
END = "<!-- SELECT_SCREENSHOTS_END -->"

GALLERY = """<!-- SELECT_SCREENSHOTS_BEGIN -->
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

<!-- SELECT_SCREENSHOTS_END -->"""

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
