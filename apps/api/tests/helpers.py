from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

REQUEST = (
    "From: Jonas Weber <jonas.weber@example.org>\n\n"
    "Hello, could you quote 3.2 m of oak worktop and 2 wall shelves? Jonas Weber"
)
CATALOG = [
    {"ref": "AP-120", "label": "Oak worktop", "unit": "m", "unit_price": "189.00", "vat_rate": "0.19"},
    {"ref": "WR-40", "label": "Wall shelf", "unit": "pc", "unit_price": "64.50", "vat_rate": "0.19"},
]


def ok(response: Any, code: int = 200) -> Any:
    assert response.status_code == code, response.text
    return response.json()


def s(value: str, ref: str) -> dict[str, str]:
    return {"value": value, "source_ref": ref}


def good_quote(source: str = "msg-1") -> dict[str, Any]:
    return {
        "customer": {
            "name": s("Jonas Weber", f"source:{source}"),
            "email": s("jonas.weber@example.org", f"source:{source}"),
        },
        "lines": [
            {
                "catalog_ref": "AP-120",
                "quantity": s("3.2", f"source:{source}"),
                "unit_price": s("189.00", "catalog:AP-120"),
                "vat_rate": s("0.19", "catalog:AP-120"),
                "line_total": s("604.80", "calc:q*p"),
            },
            {
                "catalog_ref": "WR-40",
                "quantity": s("2", f"source:{source}"),
                "unit_price": s("64.50", "catalog:WR-40"),
                "vat_rate": s("0.19", "catalog:WR-40"),
                "line_total": s("129.00", "calc:q*p"),
            },
        ],
        "totals": {"net": s("733.80", "calc:sum"), "vat": s("139.42", "calc:vat"), "gross": s("873.22", "calc:gross")},
    }


def setup_company(client: TestClient, *, policy: dict[str, Any] | None = None) -> tuple[str, str]:
    company = ok(client.post("/api/companies", json={"name": "Test Atelier", "monthly_budget": "100.00"}), 201)
    cid = company["id"]
    ok(client.put(f"/api/companies/{cid}/catalog", json=CATALOG))
    if policy is not None:
        ok(client.patch(f"/api/companies/{cid}", json={"policy": policy}))
    agent = ok(
        client.post(
            f"/api/companies/{cid}/agents",
            json={
                "name": "Lea",
                "role": "Sales",
                "task_types": ["quote", "support_reply", "payment_request", "invoice_draft"],
                "permissions": ["read_messages"],
            },
        ),
        201,
    )
    return cid, agent["id"]


def new_quote_task(client: TestClient, cid: str, agent_id: str, title: str = "Quote for Jonas") -> dict[str, Any]:
    return ok(
        client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": title,
                "task_type": "quote",
                "assignee_id": agent_id,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ),
        201,
    )


def submit(client: TestClient, cid: str, task_id: str, output: dict[str, Any], code: int = 200) -> dict[str, Any]:
    return ok(client.post(f"/api/companies/{cid}/tasks/{task_id}/submit", json={"output": output}), code)


def pending_approval(client: TestClient, cid: str, task_id: str) -> dict[str, Any]:
    items = ok(client.get(f"/api/companies/{cid}/approvals"))["items"]
    match = [a for a in items if a["task_id"] == task_id]
    assert match, "no pending approval for task"
    return match[0]


def trust_level(client: TestClient, cid: str, agent_id: str, task_type: str) -> dict[str, Any]:
    agent = ok(client.get(f"/api/companies/{cid}/agents/{agent_id}"))
    return next(t for t in agent["trust"] if t["task_type"] == task_type)
