from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Risk = Literal["low", "medium", "high", "legal"]
CheckStatus = Literal["passed", "failed", "error"]
ReceiptStatus = Literal["verified", "failed", "blocked"]


class CheckSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    rule: str
    description: str = ""
    blocking: bool = True
    params: dict[str, Any] = Field(default_factory=dict)


class CorrectionPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_attempts: int = Field(default=2, ge=0, le=5)


class ApprovalPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # "always": a human approves every result regardless of autonomy level.
    # "by_autonomy": the agent's autonomy level for this task type decides.
    mode: Literal["always", "by_autonomy"] = "by_autonomy"
    external_action: str | None = None


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    version: int = Field(ge=1)
    title: str
    description: str = ""
    risk: Risk = "medium"
    required: list[str] = Field(default_factory=list)
    checks: list[CheckSpec]
    correction: CorrectionPolicy = Field(default_factory=CorrectionPolicy)
    approval: ApprovalPolicy = Field(default_factory=ApprovalPolicy)
    sha256: str = ""
    source: str = ""

    def fingerprint(self) -> str:
        return hashlib.sha256(self.source.encode("utf-8")).hexdigest()


class CatalogItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ref: str
    label: str
    unit: str
    unit_price: Decimal
    vat_rate: Decimal = Decimal("0.19")


class VerifyContext(BaseModel):
    """Everything a check may consult. Built by the system, never by the agent."""

    catalog: dict[str, CatalogItem] = Field(default_factory=dict)
    sources: dict[str, str] = Field(default_factory=dict)  # source id -> raw text
    allowed_vat_rates: list[Decimal] = Field(default_factory=lambda: [Decimal("0.19"), Decimal("0.07")])


class CheckResult(BaseModel):
    id: str
    rule: str
    description: str
    blocking: bool
    status: CheckStatus
    message: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class Receipt(BaseModel):
    run_id: str
    contract_id: str
    contract_version: int
    contract_sha256: str
    status: ReceiptStatus
    checks: list[CheckResult]
    missing: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    deliverable_sha256: str
    verified_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    verifier: str = "select-verify/0.1.0"

    @property
    def blocking_failures(self) -> list[CheckResult]:
        return [c for c in self.checks if c.blocking and c.status != "passed"]
