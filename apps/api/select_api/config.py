from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SELECT_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://select:select@localhost:5432/select"
    # "local": single implicit owner, for a machine you control (bind to localhost).
    # "password": people sign in with an e-mail and a password (sessions in an HttpOnly cookie);
    #             API tokens work too. The first visit creates the owner account.
    # "token": every request needs "Authorization: Bearer <token>" created with `select-api create-token`.
    auth_mode: Literal["local", "password", "token"] = "local"
    # The address people use to open Select. Invitation links use it; https makes cookies Secure.
    public_url: str = "http://localhost:3000"
    session_days: int = Field(default=30, ge=1, le=365)
    data_dir: Path = Path("./data")
    # Fernet key (urlsafe base64, 32 bytes). If empty, a key file is created in data_dir on first start.
    secret_key: str = ""
    contracts_dir: Path = REPO_ROOT / "contracts"
    packs_dir: Path = REPO_ROOT / "packs"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    demo_step_delay_ms: int = 350
    worker_poll_seconds: float = 1.0
    # How often the worker fires due routines, schedules mailbox reads and checks half-sent e-mails.
    scheduler_seconds: float = 15.0
    run_timeout_seconds: float = 120.0
    auto_migrate: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
