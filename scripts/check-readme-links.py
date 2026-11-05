"""Pre-release check: every relative README link and embedded image exists in Git.

Only local paths are checked. This does not validate remote URLs.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]+\")?\)")
HTML_SOURCE = re.compile(r"\b(?:src|href)=[\"']([^\"']+)[\"']", re.IGNORECASE)


def find_local_links(text: str) -> list[str]:
    candidates = MARKDOWN_LINK.findall(text) + HTML_SOURCE.findall(text)
    return [value for value in candidates if value and not value.startswith("#")]


def check_readme(root: Path = ROOT) -> list[str]:
    failures: list[str] = []
    readme = root / "README.md"
    for raw in find_local_links(readme.read_text(encoding="utf-8")):
        parts = urlsplit(raw)
        if parts.scheme or parts.netloc or raw.startswith("//"):
            continue
        target = (root / unquote(parts.path)).resolve()
        if not target.is_relative_to(root.resolve()) or not target.exists():
            failures.append(raw)
    return sorted(set(failures))


def main() -> int:
    missing = check_readme()
    if missing:
        for path in missing:
            print(f"README points to a missing local file: {path}", file=sys.stderr)
        return 1
    print("All local README links and images resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
