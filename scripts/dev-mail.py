"""Local mail servers to try Select's mail loop without a real mailbox (development only).

    uv run python scripts/dev-mail.py serve            # IMAP on 127.0.0.1:1143, SMTP on 127.0.0.1:1025
    uv run python scripts/dev-mail.py drop --subject "Quote please" --body "3 shelves, please"

In Select, connect a mailbox with: IMAP 127.0.0.1 port 1143, security "None", user demouser,
password demopass; SMTP 127.0.0.1 port 1025, security "None", same user and password.
Every e-mail Select sends is written to ./data/dev-mail/sent/ as a .eml file. Nothing leaves
this machine. pymap and aiosmtpd are development dependencies (uv sync installs them).
"""

from __future__ import annotations

import argparse
import imaplib
import subprocess
import sys
import time
import uuid
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path

USER, PASSWORD = "demouser", "demopass"


def serve(imap_port: int, smtp_port: int, out: Path) -> None:
    from aiosmtpd.controller import Controller
    from aiosmtpd.smtp import AuthResult

    out.mkdir(parents=True, exist_ok=True)

    class Keep:
        async def handle_DATA(self, server, session, envelope):
            name = out / f"{datetime.now(UTC):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}.eml"
            name.write_bytes(envelope.original_content or envelope.content)
            print(f"SMTP: accepted for {', '.join(envelope.rcpt_tos)} -> {name}", flush=True)
            return "250 2.0.0 kept locally"

    def authenticate(server, session, envelope, mechanism, auth_data):  # type: ignore[no-untyped-def]
        ok = auth_data.login == USER.encode() and auth_data.password == PASSWORD.encode()
        return AuthResult(success=ok, handled=False)

    pymap = Path(sys.executable).parent / "pymap"
    imap = subprocess.Popen(  # noqa: S603 - fixed arguments
        [str(pymap), "--host", "127.0.0.1", "--port", str(imap_port), "dict", "--demo-data"]
    )
    smtp = Controller(Keep(), hostname="127.0.0.1", port=smtp_port, authenticator=authenticate, auth_require_tls=False)
    smtp.start()
    print(f"IMAP 127.0.0.1:{imap_port} and SMTP 127.0.0.1:{smtp_port}, user {USER} / {PASSWORD}", flush=True)
    try:
        while imap.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        smtp.stop()
        imap.terminate()


def drop(imap_port: int, sender: str, subject: str, body: str, to: str = "contact@example.com") -> None:
    """Puts a message in the INBOX the way a mail server would (IMAP APPEND)."""
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = format_datetime(datetime.now(UTC))
    msg["Message-ID"] = f"<{uuid.uuid4().hex}@dev-mail.local>"
    msg.set_content(body)
    conn = imaplib.IMAP4("127.0.0.1", imap_port)
    conn.login(USER, PASSWORD)
    status, data = conn.append("INBOX", None, None, msg.as_bytes())
    conn.logout()
    print(status, data[0].decode() if data and isinstance(data[0], bytes) else data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--imap-port", type=int, default=1143)
    parser.add_argument("--smtp-port", type=int, default=1025)
    sub = parser.add_subparsers(dest="command", required=True)
    serve_cmd = sub.add_parser("serve")
    serve_cmd.add_argument("--out", type=Path, default=Path("data/dev-mail/sent"))
    drop_cmd = sub.add_parser("drop")
    drop_cmd.add_argument("--sender", default="Jonas Weber <jonas.weber@example.org>")
    drop_cmd.add_argument("--subject", default="Quote for a worktop")
    drop_cmd.add_argument(
        "--body", default="Hello, could you quote 3.2 m of oak worktop and 2 wall shelves?\nBest regards, Jonas Weber"
    )
    drop_cmd.add_argument("--to", default="contact@example.com", help="the address the e-mail was written to")
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.imap_port, args.smtp_port, args.out)
    else:
        drop(args.imap_port, args.sender, args.subject, args.body, args.to)


if __name__ == "__main__":
    main()
