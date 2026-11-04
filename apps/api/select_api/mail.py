"""IMAP (read incoming mail) and SMTP (send approved mail) with the Python standard library.

Reading never changes the mailbox: the folder is opened read-only and bodies are fetched with
BODY.PEEK, so messages stay unread for the people who use the same mailbox.

Sending distinguishes three failures, because an e-mail must never be sent twice by accident:
- SendDeferred: nothing was handed over (connection, login, temporary refusal); safe to retry.
- SendRejected: the server refused the message for good; retrying would not help.
- SendUncertain: the connection broke while the message was being handed over; a person checks.
"""

from __future__ import annotations

import imaplib
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from email import policy
from email.message import EmailMessage, Message
from email.parser import BytesParser
from email.utils import format_datetime, formataddr, getaddresses, parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any

log = logging.getLogger("select.mail")

MAX_BODY_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 18_000
FETCH_LIMIT = 50
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


class MailError(RuntimeError):
    pass


class SendDeferred(MailError):
    pass


class SendRejected(MailError):
    pass


class SendUncertain(MailError):
    pass


@dataclass(frozen=True)
class Server:
    host: str
    port: int
    security: str  # ssl | starttls | none
    username: str
    password: str | None


def _context() -> ssl.SSLContext:
    # System trust store (honours SSL_CERT_FILE); certificate and host name are always verified.
    return ssl.create_default_context()


# ---------------------------------------------------------------- IMAP


def _quote_mailbox(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def imap_connect(server: Server, timeout: float = 30) -> imaplib.IMAP4:
    try:
        if server.security == "ssl":
            conn: imaplib.IMAP4 = imaplib.IMAP4_SSL(server.host, server.port, ssl_context=_context(), timeout=timeout)
        else:
            conn = imaplib.IMAP4(server.host, server.port, timeout=timeout)
            if server.security == "starttls":
                conn.starttls(ssl_context=_context())
    except (OSError, imaplib.IMAP4.error) as exc:
        raise MailError(f"cannot reach the IMAP server {server.host}:{server.port}: {exc}") from exc
    try:
        conn.login(server.username, server.password or "")
    except imaplib.IMAP4.error as exc:
        _imap_close(conn)
        raise MailError(f"IMAP login refused for {server.username}: {_text(exc)}") from exc
    return conn


def _imap_close(conn: imaplib.IMAP4) -> None:
    try:
        conn.logout()
    except (OSError, imaplib.IMAP4.error) as exc:
        log.warning("IMAP logout failed (connection already closed): %s", exc)


def _text(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, Exception) and value.args:
        return " ".join(_text(a) for a in value.args)
    return str(value)


def _select(conn: imaplib.IMAP4, folder: str) -> tuple[int, int | None]:
    status, data = conn.select(_quote_mailbox(folder), readonly=True)
    if status != "OK":
        raise MailError(f"folder '{folder}' cannot be opened: {_text(data[0] if data else '')}")
    _, validity = conn.response("UIDVALIDITY")
    _, uidnext = conn.response("UIDNEXT")
    if not validity or validity[0] is None:
        raise MailError("the IMAP server did not report UIDVALIDITY; it cannot be followed safely")
    next_uid = int(uidnext[0]) if uidnext and uidnext[0] is not None else None
    return int(validity[0]), next_uid


def _uids(conn: imaplib.IMAP4, *criteria: str) -> list[int]:
    status, data = conn.uid("SEARCH", *criteria)
    if status != "OK":
        raise MailError(f"IMAP search failed: {_text(data[0] if data else '')}")
    return sorted(int(x) for x in (data[0] or b"").split())


def imap_test(server: Server, folder: str) -> dict[str, Any]:
    conn = imap_connect(server)
    try:
        validity, _ = _select(conn, folder)
        total = len(_uids(conn, "ALL"))
        return {"folder": folder, "messages": total, "uidvalidity": validity}
    finally:
        _imap_close(conn)


@dataclass
class FetchResult:
    uidvalidity: int
    last_uid: int
    messages: list[tuple[int, bytes, bool]] = field(default_factory=list)  # (uid, raw, truncated)
    baseline: bool = False  # True on the first poll: the position was recorded


def _imap_date(day: date) -> str:
    return f"{day.day:02d}-{MONTHS[day.month - 1]}-{day.year}"


def _fetch_sizes(conn: imaplib.IMAP4, uids: list[int]) -> dict[int, int]:
    status, data = conn.uid("FETCH", ",".join(str(u) for u in uids), "(UID RFC822.SIZE)")
    if status != "OK":
        raise MailError(f"IMAP fetch failed: {_text(data[0] if data else '')}")
    sizes: dict[int, int] = {}
    for item in data:
        line = _text(item[0] if isinstance(item, tuple) else item)
        uid, size = re.search(r"UID (\d+)", line), re.search(r"RFC822\.SIZE (\d+)", line)
        if uid and size:
            sizes[int(uid.group(1))] = int(size.group(1))
    return sizes


def _fetch_raw(conn: imaplib.IMAP4, uid: int, part: str) -> bytes:
    status, data = conn.uid("FETCH", str(uid), f"(BODY.PEEK[{part}])")
    if status != "OK":
        raise MailError(f"IMAP fetch of message {uid} failed: {_text(data[0] if data else '')}")
    for item in data:
        if isinstance(item, tuple) and len(item) == 2 and isinstance(item[1], bytes):
            return item[1]
    raise MailError(f"message {uid} came back empty")


def imap_fetch_new(
    server: Server,
    folder: str,
    uidvalidity: int | None,
    last_uid: int | None,
    *,
    import_days: int = 0,
    today: date | None = None,
    limit: int = FETCH_LIMIT,
) -> FetchResult:
    """Messages that arrived after ``last_uid``. On the first call, record the position instead."""
    conn = imap_connect(server)
    try:
        validity, next_uid = _select(conn, folder)
        if uidvalidity is None or uidvalidity != validity or last_uid is None:
            # First poll (or the server renumbered the folder): start from the current end of the
            # mailbox so old mail is not answered, plus the last `import_days` days if requested.
            existing = _uids(conn, "ALL")
            position = max(existing, default=(next_uid - 1) if next_uid else 0)
            result = FetchResult(uidvalidity=validity, last_uid=position, baseline=True)
            if import_days > 0:
                since = (today or datetime.now(UTC).date()) - timedelta(days=import_days)
                wanted = _uids(conn, "SINCE", _imap_date(since))[-limit:]
                result.messages = _download(conn, wanted)
            return result
        wanted = [u for u in _uids(conn, "UID", f"{last_uid + 1}:*") if u > last_uid][:limit]
        result = FetchResult(uidvalidity=validity, last_uid=max(wanted, default=last_uid))
        result.messages = _download(conn, wanted)
        return result
    except (OSError, imaplib.IMAP4.error) as exc:
        raise MailError(f"IMAP error: {_text(exc)}") from exc
    finally:
        _imap_close(conn)


def _download(conn: imaplib.IMAP4, uids: list[int]) -> list[tuple[int, bytes, bool]]:
    if not uids:
        return []
    sizes = _fetch_sizes(conn, uids)
    out = []
    for uid in uids:
        if sizes.get(uid, 0) > MAX_BODY_BYTES:
            out.append((uid, _fetch_raw(conn, uid, "HEADER"), True))
        else:
            out.append((uid, _fetch_raw(conn, uid, ""), False))
    return out


# ---------------------------------------------------------------- parsing


_BLOCK_TAGS = frozenset({"p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "blockquote"})


class _HtmlText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "head"):
            self.skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "head") and self.skip:
            self.skip -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    parser = _HtmlText()
    parser.feed(html)
    parser.close()
    text = "".join(parser.parts)
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _part_text(part: Message) -> str:
    try:
        content = part.get_content()  # type: ignore[attr-defined]
    except (LookupError, UnicodeError, AssertionError):
        payload = part.get_payload(decode=True)
        content = payload.decode("utf-8", "replace") if isinstance(payload, bytes) else str(payload or "")
    return content if isinstance(content, str) else ""


AUTOMATIC_SENDERS = re.compile(
    r"^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?)([+.\-].*)?$", re.IGNORECASE
)


def automatic_reason(msg: Message, from_address: str) -> str | None:
    """Why a message must never get an automatic answer (RFC 3834), or None."""
    auto = str(msg.get("Auto-Submitted", "")).strip().lower()
    if auto and auto != "no":
        return f"automatic message (Auto-Submitted: {auto})"
    precedence = str(msg.get("Precedence", "")).strip().lower()
    if precedence in ("bulk", "junk", "list", "auto_reply"):
        return f"bulk or automatic message (Precedence: {precedence})"
    if msg.get("X-Autoreply") or msg.get("X-Autorespond"):
        return "automatic reply"
    if msg.get("List-Id") or msg.get("List-Unsubscribe"):
        return "newsletter or mailing list"
    if msg.get_content_type() == "multipart/report":
        return "delivery report"
    local = from_address.split("@", 1)[0]
    if AUTOMATIC_SENDERS.match(local):
        return f"sent by an automatic address ({from_address})"
    return None


@dataclass
class ParsedMessage:
    message_id: str | None
    in_reply_to: str | None
    references: str | None
    from_name: str
    from_address: str
    reply_to: str | None
    to: str
    subject: str
    date: datetime | None
    text: str
    attachments: list[dict[str, Any]]
    automatic: str | None
    truncated: bool


def parse_message(raw: bytes, *, truncated: bool = False) -> ParsedMessage:
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    from_name, from_address = parseaddr(str(msg.get("From", "")))
    reply_to = parseaddr(str(msg.get("Reply-To", "")))[1] or None
    recipients = [str(v) for v in (msg.get_all("To", []) or []) + (msg.get_all("Cc", []) or [])]
    to = ", ".join(addr for _name, addr in getaddresses(recipients) if addr)
    try:
        sent = parsedate_to_datetime(str(msg["Date"])) if msg.get("Date") else None
        if sent is not None and sent.tzinfo is None:
            sent = sent.replace(tzinfo=UTC)
    except (TypeError, ValueError, IndexError):
        sent = None
    text = ""
    attachments: list[dict[str, Any]] = []
    if not truncated:
        body = msg.get_body(preferencelist=("plain", "html"))  # type: ignore[attr-defined]
        if body is not None:
            text = _part_text(body)
            if body.get_content_type() == "text/html":
                text = html_to_text(text)
        for part in msg.iter_attachments():  # type: ignore[attr-defined]
            payload = part.get_payload(decode=True)
            attachments.append(
                {
                    "filename": part.get_filename() or "(unnamed)",
                    "content_type": part.get_content_type(),
                    "size": len(payload) if isinstance(payload, bytes) else 0,
                }
            )
    text = text.replace("\r\n", "\n").strip()
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "\n[… message shortened by Select]"
    return ParsedMessage(
        message_id=(str(msg.get("Message-ID", "")).strip() or None),
        in_reply_to=(str(msg.get("In-Reply-To", "")).strip() or None),
        references=(" ".join(str(msg.get("References", "")).split()) or None),
        from_name=from_name.strip(),
        from_address=from_address.strip().lower(),
        reply_to=reply_to.strip().lower() if reply_to else None,
        to=to,
        subject=" ".join(str(msg.get("Subject", "")).split()),
        date=sent,
        text=text,
        attachments=attachments,
        automatic=automatic_reason(msg, from_address.strip().lower()),
        truncated=truncated,
    )


def source_text(parsed: ParsedMessage) -> str:
    """The text an agent sees: a header block written by Select, then the body as received."""
    sender = formataddr((parsed.from_name, parsed.from_address)) if parsed.from_name else parsed.from_address
    lines = [f"From: {sender}"]
    if parsed.reply_to and parsed.reply_to != parsed.from_address:
        lines.append(f"Reply-To: {parsed.reply_to}")
    if parsed.to:
        lines.append(f"To: {parsed.to}")
    if parsed.date:
        lines.append(f"Date: {format_datetime(parsed.date)}")
    lines.append(f"Subject: {parsed.subject}")
    if parsed.attachments:
        names = ", ".join(a["filename"] for a in parsed.attachments)
        lines.append(f"Attachments (not read by Select): {names}")
    body = parsed.text or ("[message too large: only its headers were imported]" if parsed.truncated else "")
    return "\n".join(lines) + "\n\n" + body


# ---------------------------------------------------------------- SMTP


def _smtp_open(server: Server, timeout: float) -> smtplib.SMTP:
    try:
        if server.security == "ssl":
            smtp: smtplib.SMTP = smtplib.SMTP_SSL(server.host, server.port, timeout=timeout, context=_context())
        else:
            smtp = smtplib.SMTP(server.host, server.port, timeout=timeout)
            smtp.ehlo()
            if server.security == "starttls":
                smtp.starttls(context=_context())
                smtp.ehlo()
    except (OSError, smtplib.SMTPException) as exc:
        raise SendDeferred(f"cannot reach the SMTP server {server.host}:{server.port}: {exc}") from exc
    if server.username:
        try:
            smtp.login(server.username, server.password or "")
        except smtplib.SMTPAuthenticationError as exc:
            _smtp_close(smtp)
            raise SendRejected(
                f"SMTP login refused for {server.username}: {exc.smtp_code} {_text(exc.smtp_error)}"
            ) from exc
        except (OSError, smtplib.SMTPException) as exc:
            _smtp_close(smtp)
            raise SendDeferred(f"SMTP login failed: {exc}") from exc
    return smtp


def _smtp_close(smtp: smtplib.SMTP) -> None:
    try:
        smtp.quit()
    except (OSError, smtplib.SMTPException) as exc:
        # The message (if any) was already accepted or refused; closing is only housekeeping.
        log.warning("SMTP QUIT failed: %s", exc)
        smtp.close()


def smtp_test(server: Server, timeout: float = 20) -> None:
    """Connects, upgrades to TLS, logs in and says NOOP. Never sends anything."""
    smtp = _smtp_open(server, timeout)
    try:
        code, reply = smtp.noop()
        if code != 250:
            raise SendDeferred(f"SMTP server answered NOOP with {code} {_text(reply)}")
    finally:
        _smtp_close(smtp)


def build_email(
    *,
    from_address: str,
    from_name: str,
    to: str,
    subject: str,
    body: str,
    message_id: str,
    in_reply_to: str | None,
    references: str | None,
    review: str,
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((from_name, from_address)) if from_name else from_address
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = format_datetime(datetime.now(UTC))
    msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = references or in_reply_to
    msg["X-Mailer"] = "Select"
    msg["X-Select-Review"] = review
    msg.set_content(body)
    return msg


def smtp_send(server: Server, msg: EmailMessage, timeout: float = 60) -> str:
    smtp = _smtp_open(server, timeout)
    broken = False
    try:
        smtp.send_message(msg)
    except smtplib.SMTPRecipientsRefused as exc:
        detail = "; ".join(f"{rcpt}: {code} {_text(text)}" for rcpt, (code, text) in exc.recipients.items())
        if all(400 <= code < 500 for code, _ in exc.recipients.values()):
            raise SendDeferred(f"recipient temporarily refused: {detail}") from exc
        raise SendRejected(f"recipient refused: {detail}") from exc
    except smtplib.SMTPSenderRefused as exc:
        error = SendDeferred if 400 <= exc.smtp_code < 500 else SendRejected
        raise error(f"sender {_text(exc.sender)} refused: {exc.smtp_code} {_text(exc.smtp_error)}") from exc
    except smtplib.SMTPDataError as exc:
        # The server answered the message with a refusal: it was not accepted.
        error = SendDeferred if 400 <= exc.smtp_code < 500 else SendRejected
        raise error(f"message refused: {exc.smtp_code} {_text(exc.smtp_error)}") from exc
    except smtplib.SMTPHeloError as exc:
        raise SendDeferred(f"SMTP greeting refused: {exc.smtp_code} {_text(exc.smtp_error)}") from exc
    except smtplib.SMTPNotSupportedError as exc:
        raise SendRejected(f"the server cannot carry this message: {exc}") from exc
    except (smtplib.SMTPException, OSError) as exc:
        # The connection broke during the hand-over: the server may or may not have accepted it.
        broken = True
        raise SendUncertain(f"connection lost while sending: {exc}") from exc
    finally:
        if broken:
            smtp.close()
        else:
            _smtp_close(smtp)
    return f"accepted by {server.host}:{server.port}"
