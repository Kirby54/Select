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
    # "token": every request needs "Authorization: Bearer <token>" created with `select-api create-token`.
    auth_mode: Literal["local", "token"] = "local"
    data_dir: Path = Path("./data")
    # Fernet key (urlsafe base64, 32 bytes). If empty, a key file is created in data_dir on first start.
    secret_key: str = ""
    contracts_dir: Path = REPO_ROOT / "contracts"
    packs_dir: Path = REPO_ROOT / "packs"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    demo_step_delay_ms: int = 350
    worker_poll_seconds: float = 1.0
    run_timeout_seconds: float = 120.0
    auto_migrate: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
