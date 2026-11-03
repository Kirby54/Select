"""Secrets at rest and API tokens."""

from __future__ import annotations

import hashlib
import os
import secrets
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


class SecretError(RuntimeError):
    pass


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.secret_key.strip()
    if not key:
        key_file = Path(settings.data_dir) / "secret.key"
        if key_file.exists():
            key = key_file.read_text().strip()
        else:
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key = Fernet.generate_key().decode()
            # Create with owner-only permissions before writing the key.
            fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as handle:
                handle.write(key)
    try:
        return Fernet(key.encode())
    except ValueError as exc:
        raise SecretError("SELECT_SECRET_KEY is not a valid Fernet key (32 url-safe base64 bytes)") from exc


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise SecretError("stored secret cannot be decrypted with the current key") from exc


def hint(value: str) -> str:
    """What the UI may show: never more than the last four characters."""
    return f"…{value[-4:]}" if len(value) >= 8 else "…"


def new_token() -> str:
    return "sel_" + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
