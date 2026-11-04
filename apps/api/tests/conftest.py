"""Tests run against a real PostgreSQL database (SELECT_TEST_DATABASE_URL).

The schema is created with the Alembic migrations, so the migrations are tested too.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

TEST_URL = os.environ.get(
    "SELECT_TEST_DATABASE_URL", "postgresql+psycopg://select_user:select@127.0.0.1:5432/select_test"
)


@pytest.fixture(scope="session", autouse=True)
def _environment(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    os.environ["SELECT_DATABASE_URL"] = TEST_URL
    os.environ["SELECT_DATA_DIR"] = str(tmp_path_factory.mktemp("data"))
    os.environ["SELECT_DEMO_STEP_DELAY_MS"] = "0"
    os.environ["SELECT_AUTH_MODE"] = "local"
    from select_api.cli import migrate
    from select_api.config import get_settings
    from select_api.db import get_engine, reset_engine_cache

    get_settings.cache_clear()
    reset_engine_cache()
    with get_engine().begin() as conn:
        conn.execute(text("drop schema public cascade; create schema public;"))
    migrate()
    yield


@pytest.fixture(autouse=True)
def _clean() -> Iterator[None]:
    from select_api.db import get_engine

    yield
    with get_engine().begin() as conn:
        tables = conn.execute(
            text("select tablename from pg_tables where schemaname='public' and tablename <> 'alembic_version'")
        ).scalars()
        conn.execute(text("truncate " + ", ".join(f'"{t}"' for t in tables) + " restart identity cascade"))


@pytest.fixture()
def client() -> Iterator[TestClient]:
    from select_api.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def token_mode(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    from select_api.config import get_settings

    monkeypatch.setenv("SELECT_AUTH_MODE", "token")
    get_settings.cache_clear()
    yield
    monkeypatch.setenv("SELECT_AUTH_MODE", "local")
    get_settings.cache_clear()


REPO = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------- real mail servers for the mail tests
#
# Select's IMAP and SMTP code talks to real protocol servers here: pymap (an IMAP server, in-memory
# backend) and aiosmtpd (an SMTP server). Only the servers are local; nothing in Select is replaced.


def _free_port() -> int:
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="session")
def imap_server() -> Iterator[dict[str, object]]:
    import imaplib
    import subprocess
    import sys
    import time

    port = _free_port()
    pymap = str(Path(sys.executable).parent / "pymap")
    process = subprocess.Popen(  # noqa: S603 - fixed arguments, test-only server
        [pymap, "--host", "127.0.0.1", "--port", str(port), "dict", "--demo-data"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 30
    while True:
        try:
            imaplib.IMAP4("127.0.0.1", port, timeout=2).logout()
            break
        except OSError:
            if time.monotonic() > deadline or process.poll() is not None:
                process.kill()
                raise RuntimeError("the pymap IMAP server did not start") from None
            time.sleep(0.2)
    yield {"host": "127.0.0.1", "port": port, "user": "demouser", "password": "demopass"}
    process.terminate()
    process.wait(timeout=10)


class MailCatcher:
    """aiosmtpd handler that keeps every accepted message and can misbehave on purpose."""

    def __init__(self) -> None:
        self.messages: list[bytes] = []
        self.envelopes: list[tuple[str, list[str]]] = []
        self.rcpt_reply: str | None = None  # e.g. "550 5.1.1 no such user"
        self.data_replies: list[str] = []  # consumed one per message, e.g. ["451 4.3.0 try later"]
        self.drop_after_data = False

    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        if self.rcpt_reply:
            return self.rcpt_reply
        envelope.rcpt_tos.append(address)
        return "250 OK"

    async def handle_DATA(self, server, session, envelope):
        if self.drop_after_data:
            self.messages.append(envelope.original_content or envelope.content)
            server.transport.close()  # the message arrived, the answer never does
            return "250 OK"
        if self.data_replies:
            return self.data_replies.pop(0)
        self.messages.append(envelope.original_content or envelope.content)
        self.envelopes.append((envelope.mail_from, list(envelope.rcpt_tos)))
        return "250 2.0.0 queued as TEST"


@pytest.fixture()
def smtp_server() -> Iterator[dict[str, object]]:
    from aiosmtpd.controller import Controller
    from aiosmtpd.smtp import AuthResult

    def authenticate(server, session, envelope, mechanism, auth_data):  # type: ignore[no-untyped-def]
        ok = auth_data.login == b"shop@example.com" and auth_data.password == b"smtp-secret"
        # handled=False: aiosmtpd answers 235 or 535 itself.
        return AuthResult(success=ok, handled=False)

    catcher = MailCatcher()
    port = _free_port()
    controller = Controller(
        catcher,
        hostname="127.0.0.1",
        port=port,
        authenticator=authenticate,
        auth_require_tls=False,
    )
    controller.start()
    yield {"host": "127.0.0.1", "port": port, "catcher": catcher}
    controller.stop()


@pytest.fixture()
def password_mode(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    from select_api.config import get_settings

    monkeypatch.setenv("SELECT_AUTH_MODE", "password")
    monkeypatch.setenv("SELECT_PUBLIC_URL", "https://select.example.com")
    get_settings.cache_clear()
    yield
    monkeypatch.setenv("SELECT_AUTH_MODE", "local")
    monkeypatch.delenv("SELECT_PUBLIC_URL")
    get_settings.cache_clear()
