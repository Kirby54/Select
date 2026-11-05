"""Regression tests for safe API binding and startup key initialization."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet


def test_local_mode_only_binds_to_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    from select_api.cli import _validate_bind_address
    from select_api.config import get_settings

    monkeypatch.setenv("SELECT_AUTH_MODE", "local")
    get_settings.cache_clear()
    try:
        for address in ("127.0.0.1", "::1", "[::1]", "localhost"):
            _validate_bind_address(address)
        for address in ("0.0.0.0", "::", "[::]", "192.168.1.20", "select.example.com"):
            with pytest.raises(SystemExit, match="Refusing to bind unauthenticated"):
                _validate_bind_address(address)

        monkeypatch.setenv("SELECT_AUTH_MODE", "password")
        get_settings.cache_clear()
        _validate_bind_address("0.0.0.0")
    finally:
        get_settings.cache_clear()


def test_generated_key_is_private_and_reused(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from select_api.config import get_settings
    from select_api.security import _fernet

    monkeypatch.setenv("SELECT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SELECT_SECRET_KEY", "")
    get_settings.cache_clear()
    _fernet.cache_clear()
    try:
        initial = _fernet()
        path = tmp_path / "secret.key"
        assert path.is_file()
        assert path.stat().st_mode & 0o077 == 0
        token = initial.encrypt(b"persisted-secret")

        # Simulate the API and worker independently loading the same volume.
        _fernet.cache_clear()
        assert _fernet().decrypt(token) == b"persisted-secret"
        assert list(tmp_path.glob(".select-key-*")) == []
    finally:
        _fernet.cache_clear()
        get_settings.cache_clear()


def test_existing_key_wins_a_startup_race(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from select_api.config import get_settings
    from select_api.security import _fernet

    monkeypatch.setenv("SELECT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SELECT_SECRET_KEY", "")
    key = Fernet.generate_key()
    from pathlib import Path

    path = Path(tmp_path) / "secret.key"
    path.write_bytes(key)
    get_settings.cache_clear()
    _fernet.cache_clear()
    try:
        assert _fernet().decrypt(Fernet(key).encrypt(b"same-key")) == b"same-key"
        assert path.read_bytes() == key
    finally:
        _fernet.cache_clear()
        get_settings.cache_clear()
