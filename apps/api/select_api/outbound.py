"""What a verified result looks like as an e-mail.

The same function renders the approval preview and the e-mail that is sent, so a person always
approves the exact text that leaves Select. Prices and totals come from the verified deliverable,
which code computed from the catalog; nothing here is written by a model.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from email.utils import getaddresses
from typing import Any

from select_verify import Contract
from sqlalchemy.orm import Session

from .company_profile import settings_for
from .models import Company, MailMessage, Task

EMAIL_ACTIONS = ("send_email", "send_quote_email")

TEXT: dict[str, dict[str, str]] = {
    "fr": {
        "quote_subject": "Votre devis – {company}",
        "greeting": "Bonjour {name},",
        "greeting_anon": "Bonjour,",
        "quote_intro": "Merci pour votre demande. Voici notre proposition\u202f:",
        "net": "Total HT",
        "vat": "TVA",
        "gross": "Total TTC",
        "validity": "Ce devis est valable {days} jours.",
        "colon": "\u202f:",
        "at": "à",
        "disclosure": (
            "Ce message a été préparé par un assistant IA et vérifié automatiquement, sans relecture humaine."
        ),
    },
    "de": {
        "quote_subject": "Ihr Angebot – {company}",
        "greeting": "Guten Tag {name},",
        "greeting_anon": "Guten Tag,",
        "quote_intro": "Vielen Dank für Ihre Anfrage. Hier ist unser Angebot:",
        "net": "Summe netto",
        "vat": "MwSt.",
        "gross": "Gesamtbetrag brutto",
        "validity": "Dieses Angebot ist {days} Tage gültig.",
        "colon": ":",
        "at": "à",
        "disclosure": (
            "Diese Nachricht wurde von einem KI-Assistenten erstellt und automatisch geprüft, "
            "ohne menschliche Durchsicht."
        ),
    },
    "en": {
        "quote_subject": "Your quote – {company}",
        "greeting": "Hello {name},",
        "greeting_anon": "Hello,",
        "quote_intro": "Thank you for your request. Here is our quote:",
        "net": "Net total",
        "vat": "VAT",
        "gross": "Total",
        "validity": "This quote is valid for {days} days.",
        "colon": ":",
        "at": "at",
        "disclosure": "This message was prepared by an AI assistant and checked automatically, without human review.",
    },
}

SYMBOLS = {"EUR": "€", "CHF": "CHF", "MAD": "MAD", "DZD": "DZD", "USD": "$", "GBP": "£"}


@dataclass
class OutgoingEmail:
    action: str
    to: str
    subject: str
    body: str
    in_reply_to: str | None = None
    references: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> OutgoingEmail:
        return cls(
            action=str(data["action"]),
            to=str(data["to"]),
            subject=str(data["subject"]),
            body=str(data["body"]),
            in_reply_to=data.get("in_reply_to"),
            references=data.get("references"),
        )

    def preview(self) -> list[str]:
        return [f"To: {self.to}", f"Subject: {self.subject}", "", *self.body.splitlines()]


def unwrap(value: Any) -> str:
    if isinstance(value, dict) and "value" in value:
        value = value["value"]
    return "" if value is None else str(value)


def format_amount(value: Any, currency: str, language: str) -> str:
    try:
        amount = Decimal(unwrap(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return unwrap(value)
    text = f"{amount:,.2f}"
    if language == "fr":
        text = text.replace(",", " ").replace(".", ",")
    elif language == "de":
        text = text.replace(",", "§").replace(".", ",").replace("§", ".")
    symbol = SYMBOLS.get(currency, currency)
    return f"{symbol}{text}" if language == "en" and symbol in ("€", "$", "£") else f"{text} {symbol}"


def format_rate(value: Any, language: str) -> str:
    """0.055 -> "5,5 %" in French, "5,5 %" in German, "5.5%" in English."""
    try:
        percent = (Decimal(unwrap(value)) * 100).normalize()
    except (InvalidOperation, ValueError):
        return unwrap(value)
    text = format(percent, "f")
    if language == "fr":
        return text.replace(".", ",") + "\u202f%"
    if language == "de":
        return text.replace(".", ",") + "\u00a0%"
    return f"{text}%"


def _rate(line: dict[str, Any]) -> Decimal | None:
    try:
        return Decimal(unwrap(line.get("vat_rate")))
    except (InvalidOperation, ValueError):
        return None


def _quantity(value: Any, language: str) -> str:
    raw = unwrap(value)
    return raw.replace(".", ",") if language in ("fr", "de") and re.fullmatch(r"\d+\.\d+", raw) else raw


def _reply_subject(subject: str) -> str:
    subject = subject.strip()
    return subject if re.match(r"^(re|aw|tr|fwd?)\s*:", subject, re.IGNORECASE) else f"Re: {subject}"


def _quote_body(company: Company, deliverable: dict[str, Any], words: dict[str, str], language: str) -> str:
    customer = deliverable.get("customer") or {}
    name = unwrap(customer.get("name")).strip()
    currency = str(deliverable.get("currency") or company.currency)
    validity = int(settings_for(company)["quote_validity_days"])
    catalog = {str(item.get("ref")): item for item in company.catalog or []}
    lines = [words["greeting"].format(name=name) if name else words["greeting_anon"], "", words["quote_intro"], ""]
    items = [line for line in deliverable.get("lines") or [] if isinstance(line, dict)]
    # One rate for every line: it is shown on the VAT total. Several rates: each line shows its own,
    # and the VAT total stays the single verified amount (no per-rate rounding of our own).
    rates = {_rate(line) for line in items}
    single = next(iter(rates)) if len(rates) == 1 else None
    for line in items:
        item = catalog.get(str(line.get("catalog_ref")), {})
        unit = str(line.get("unit") or item.get("unit") or "")
        label = str(line.get("label") or item.get("label") or line.get("catalog_ref") or "")
        quantity = f"{_quantity(line.get('quantity'), language)} {unit}".strip()
        own = _rate(line)
        rate = "" if single is not None or own is None else f" ({words['vat']} {format_rate(own, language)})"
        lines.append(
            f"- {quantity} × {label} "
            f"{words['at']} {format_amount(line.get('unit_price'), currency, language)} "
            f"= {format_amount(line.get('line_total'), currency, language)}{rate}"
        )
    totals = deliverable.get("totals") or {}
    vat_label = words["vat"] if single is None else f"{words['vat']} {format_rate(single, language)}"
    lines += [
        "",
        f"{words['net']}{words['colon']} {format_amount(totals.get('net'), currency, language)}",
        f"{vat_label}{words['colon']} {format_amount(totals.get('vat'), currency, language)}",
        f"{words['gross']}{words['colon']} {format_amount(totals.get('gross'), currency, language)}",
        "",
        words["validity"].format(days=validity),
    ]
    return "\n".join(lines)


def render_email(
    db: Session, company: Company, task: Task, contract: Contract, deliverable: dict[str, Any], *, autonomous: bool
) -> OutgoingEmail | None:
    """The e-mail a verified result would send, or None when its contract sends no e-mail."""
    action = contract.approval.external_action
    if action not in EMAIL_ACTIONS:
        return None
    language = company.language if company.language in TEXT else "en"
    words = TEXT[language]
    settings = settings_for(company)
    message = db.get(MailMessage, task.message_id) if task.message_id else None
    if action == "send_email":
        to = unwrap(deliverable.get("to"))
        subject = str(deliverable.get("subject") or "")
        body = str(deliverable.get("body") or "").rstrip()
    else:
        to = unwrap((deliverable.get("customer") or {}).get("email"))
        if message and message.subject:
            subject = _reply_subject(message.subject)
        else:
            subject = words["quote_subject"].format(company=company.name)
        body = _quote_body(company, deliverable, words, language)
    signature = str(settings.get("signature") or "").strip()
    if signature:
        body += "\n\n" + signature
    disclosure = settings.get("ai_disclosure", "autonomous")
    if disclosure == "always" or (disclosure == "autonomous" and autonomous):
        body += "\n\n" + words["disclosure"]
    in_reply_to = references = None
    if message is not None:
        in_reply_to = message.message_id
        references = " ".join(p for p in ((message.references or "").strip(), message.message_id) if p)[-2000:]
    return OutgoingEmail(
        action=action,
        to=to.strip()[:254],
        subject=" ".join(subject.split())[:500],
        body=body,
        in_reply_to=in_reply_to,
        references=references,
    )


_HEADER = re.compile(r"^(from|reply-to)\s*:\s*(.+)$", re.IGNORECASE)


def header_addresses(text: str) -> set[str]:
    """Addresses in the From/Reply-To lines of the header block that starts a source text."""
    found: set[str] = set()
    for line in text.splitlines():
        if not line.strip():
            break
        match = _HEADER.match(line.strip())
        if match:
            found |= {addr.lower() for _name, addr in getaddresses([match.group(2)]) if addr}
    return found


def known_senders(db: Session, task: Task) -> set[str]:
    """Addresses that wrote to the company about this task. Built by code from stored data."""
    addresses: set[str] = set()
    if task.message_id:
        message = db.get(MailMessage, task.message_id)
        if message is not None:
            addresses |= {a.lower() for a in (message.from_address, message.reply_to) if a}
    for source in (task.inputs or {}).get("sources", []):
        if isinstance(source, dict) and isinstance(source.get("text"), str):
            addresses |= header_addresses(source["text"])
    return addresses
