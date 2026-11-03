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
