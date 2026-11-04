"""Company profile: country presets (currency, VAT rates, time zone, language) and operating settings.

VAT presets were checked on 4 November 2026 against public sources listed in docs/configuration.md.
Rates change: the owner can edit them, and the catalog and quote checks always use the stored list.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .models import Company

PRESETS_CHECKED_ON = "2026-11-04"
LANGUAGES = ("fr", "de", "en")


@dataclass(frozen=True)
class CountryPreset:
    code: str
    name: str
    currency: str
    vat_rates: tuple[str, ...]
    timezone: str
    language: str


COUNTRIES: dict[str, CountryPreset] = {
    p.code: p
    for p in (
        CountryPreset("FR", "France", "EUR", ("0.20", "0.10", "0.055", "0.021", "0"), "Europe/Paris", "fr"),
        CountryPreset("BE", "Belgium", "EUR", ("0.21", "0.12", "0.06", "0"), "Europe/Brussels", "fr"),
        CountryPreset("LU", "Luxembourg", "EUR", ("0.17", "0.14", "0.08", "0.03", "0"), "Europe/Luxembourg", "fr"),
        CountryPreset("CH", "Switzerland", "CHF", ("0.081", "0.038", "0.026", "0"), "Europe/Zurich", "fr"),
        CountryPreset("DE", "Germany", "EUR", ("0.19", "0.07", "0"), "Europe/Berlin", "de"),
        CountryPreset("MA", "Morocco", "MAD", ("0.20", "0.10", "0.07", "0"), "Africa/Casablanca", "fr"),
        CountryPreset("DZ", "Algeria", "DZD", ("0.19", "0.09", "0"), "Africa/Algiers", "fr"),
    )
}

# Where a triaged message goes, by category. A value is a task type (handled by an agent allowed
# to do it), "human" (the message waits in Messages for a person) or "ignore".
DEFAULT_ROUTING: dict[str, str] = {
    "quote_request": "quote",
    "support": "support_reply",
    "invoice_question": "human",
    "spam": "ignore",
    "other": "human",
}
ROUTING_CATEGORIES = tuple(DEFAULT_ROUTING)
ROUTABLE_TASK_TYPES = ("quote", "support_reply", "general_task")

DEFAULT_SETTINGS: dict[str, Any] = {
    # Start a task as soon as it is assigned to an agent whose provider is connected.
    "auto_run": True,
    "routing": DEFAULT_ROUTING,
    # Safety cap on e-mails sent per hour; above it e-mails wait for a human.
    "outbound_per_hour": 20,
    # Appended to every e-mail Select sends; put the legal mentions your country requires here.
    "signature": "",
    "quote_validity_days": 30,
    # Added to e-mails that leave without a human review. "autonomous" | "always" | "never".
    "ai_disclosure": "autonomous",
}


def presets() -> list[dict[str, Any]]:
    return [{**asdict(p), "vat_rates": list(p.vat_rates), "checked_on": PRESETS_CHECKED_ON} for p in COUNTRIES.values()]


def settings_for(company: Company) -> dict[str, Any]:
    stored = company.settings or {}
    merged = {**DEFAULT_SETTINGS, **stored}
    merged["routing"] = {**DEFAULT_ROUTING, **(stored.get("routing") or {})}
    return merged


def normalize_rates(rates: list[str]) -> tuple[list[str], list[str]]:
    """Returns (normalized rates, errors). Rates are fractions: "0.20" for 20 %."""
    errors: list[str] = []
    out: list[str] = []
    seen: set[Decimal] = set()
    if not rates:
        errors.append("give at least one VAT rate (use 0 if you do not charge VAT)")
    for raw in rates:
        try:
            value = Decimal(str(raw).strip())
        except InvalidOperation:
            errors.append(f"'{raw}' is not a number")
            continue
        if not value.is_finite() or value < 0 or value >= 1:
            errors.append(f"{raw}: a VAT rate is a fraction between 0 and 1, e.g. 0.20 for 20 %")
            continue
        if value.as_tuple().exponent < -4:  # type: ignore[operator]
            errors.append(f"{raw}: at most four decimals")
            continue
        if value in seen:
            errors.append(f"{raw}: listed twice")
            continue
        seen.add(value)
        out.append(_rate_text(value))
    return out, errors


def _rate_text(value: Decimal) -> str:
    """0.2 -> "0.20", 0.055 -> "0.055", 0 -> "0": the way rates are usually written."""
    if value == 0:
        return "0"
    exponent = value.normalize().as_tuple().exponent
    decimals = -exponent if isinstance(exponent, int) and exponent < 0 else 0
    return format(value, f".{max(2, decimals)}f")


def rate_allowed(rate: str | Decimal, rates: list[str]) -> bool:
    try:
        value = Decimal(str(rate))
    except InvalidOperation:
        return False
    return any(value == Decimal(r) for r in rates)


def validate_timezone(name: str) -> str | None:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return f"unknown time zone '{name}' (use an IANA name such as Europe/Paris)"
    return None


def validate_settings(settings: dict[str, Any], known_task_types: set[str]) -> list[str]:
    errors: list[str] = []
    unknown = sorted(set(settings) - set(DEFAULT_SETTINGS))
    if unknown:
        errors.append(f"unknown setting(s): {', '.join(unknown)}")
    if "auto_run" in settings and not isinstance(settings["auto_run"], bool):
        errors.append("auto_run: true or false")
    if "outbound_per_hour" in settings:
        value = settings["outbound_per_hour"]
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 500:
            errors.append("outbound_per_hour: a whole number between 0 and 500 (0 holds every e-mail for a human)")
    if "signature" in settings and (not isinstance(settings["signature"], str) or len(settings["signature"]) > 2000):
        errors.append("signature: text of at most 2,000 characters")
    if "quote_validity_days" in settings:
        value = settings["quote_validity_days"]
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 365:
            errors.append("quote_validity_days: between 1 and 365")
    if "ai_disclosure" in settings and settings["ai_disclosure"] not in ("autonomous", "always", "never"):
        errors.append("ai_disclosure: autonomous, always or never")
    routing = settings.get("routing")
    if routing is not None:
        if not isinstance(routing, dict):
            errors.append("routing: a mapping from category to destination")
        else:
            for category, target in routing.items():
                if category not in ROUTING_CATEGORIES:
                    errors.append(f"routing.{category}: unknown category")
                elif target not in ("human", "ignore") and (
                    target not in ROUTABLE_TASK_TYPES or target not in known_task_types
                ):
                    errors.append(
                        f"routing.{category}: '{target}' is not a destination "
                        f"(human, ignore or one of {', '.join(ROUTABLE_TASK_TYPES)})"
                    )
    return errors
