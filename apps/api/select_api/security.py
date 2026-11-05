"""Secrets at rest and API tokens."""

from __future__ import annotations

import hashlib
import os
import secrets
import tempfile
from functools import lru_cache
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
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
        if not key_file.exists():
            key_file.parent.mkdir(parents=True, exist_ok=True)
            # API and worker may both need a key at startup. Build it in a private
            # temporary file, then publish it atomically without overwriting the
            # winner's key. Readers never observe a partially written key.
            fd, temporary = tempfile.mkstemp(prefix=".select-key-", dir=key_file.parent)
            try:
                with os.fdopen(fd, "w") as handle:
                    handle.write(Fernet.generate_key().decode())
                    handle.flush()
                    os.fsync(handle.fileno())
                try:
                    os.link(temporary, key_file)
                except FileExistsError:
                    pass  # Another process published its complete key first.
            finally:
                os.unlink(temporary)
        key = key_file.read_text().strip()
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


_hasher = PasswordHasher()  # Argon2id with the library's RFC 9106 defaults


@lru_cache
def _dummy_hash() -> str:
    return _hasher.hash("select-dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored: str | None, password: str) -> bool:
    """Constant work whether or not the account exists, so timing does not reveal accounts."""
    try:
        _hasher.verify(stored or _dummy_hash(), password)
    except (VerificationError, InvalidHashError):
        return False
    return stored is not None


def needs_rehash(stored: str) -> bool:
    return _hasher.check_needs_rehash(stored)
