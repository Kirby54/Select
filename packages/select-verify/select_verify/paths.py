"""Tiny path language for addressing fields in a deliverable.

``customer.name``      -> one value
``lines[].quantity``   -> one value per list item
A missing segment yields no value rather than an exception, so rules can report it.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

MISSING = object()


def iter_path(data: Any, path: str) -> Iterator[tuple[str, Any]]:
    """Yield ``(concrete_path, value)`` pairs; ``value`` is ``MISSING`` when absent."""
    yield from _walk(data, path.split("."), "")


def _walk(node: Any, parts: list[str], prefix: str) -> Iterator[tuple[str, Any]]:
    if not parts:
        yield prefix, node
        return
    head, rest = parts[0], parts[1:]
    is_list = head.endswith("[]")
    key = head[:-2] if is_list else head
    here = f"{prefix}.{key}" if prefix else key
    if not isinstance(node, dict) or key not in node:
        yield here, MISSING
        return
    child = node[key]
    if is_list:
        if not isinstance(child, list):
            yield here, MISSING
            return
        for index, item in enumerate(child):
            yield from _walk(item, rest, f"{here}[{index}]")
    else:
        yield from _walk(child, rest, here)


def get_one(data: Any, path: str) -> Any:
    values = list(iter_path(data, path))
    if len(values) != 1:
        return MISSING
    return values[0][1]


def unwrap(value: Any) -> Any:
    """Return the raw value of a sourced field ``{"value": ..., "source_ref": ...}``."""
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value
