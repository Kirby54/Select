"""Exact money arithmetic.

Floats are refused everywhere: a value must arrive as a string, an int or a Decimal.
Amounts are rounded half-up to the currency's minor unit only when a total is produced.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

CENT = Decimal("0.01")


class MoneyError(ValueError):
    """Raised when a value cannot be used as an exact amount."""


def to_decimal(value: object, *, field: str = "value") -> Decimal:
    if isinstance(value, bool):
        raise MoneyError(f"{field}: booleans are not amounts")
    if isinstance(value, float):
        raise MoneyError(f'{field}: floats are refused; send the amount as a string such as "189.00"')
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, int):
        result = Decimal(value)
    elif isinstance(value, str):
        try:
            result = Decimal(value.strip())
        except InvalidOperation as exc:
            raise MoneyError(f"{field}: {value!r} is not a number") from exc
    else:
        raise MoneyError(f"{field}: unsupported type {type(value).__name__}")
    if not result.is_finite():
        raise MoneyError(f"{field}: must be finite")
    return result


def round_money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def fmt(value: Decimal) -> str:
    """Canonical string form used in deliverables and receipts."""
    return format(round_money(value), "f")
