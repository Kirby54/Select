"""Live generation probes use a harmless fixed prompt and explicit consent.

The real adapter boundary is replaced here: CI needs no paid keys and never sends company data.
"""

from __future__ import annotations

import pytest
from helpers import ok

from select_api import providers
from select_api.providers import Completion, ProviderError


class ProbeAdapter:
    def __init__(self, text: str = '{"select_probe":"ok"}') -> None:
        self.text = text
        self.requests: list[dict[str, object]] = []

    def complete(self, **kwargs):
        self.requests.append(kwargs)
        return Completion(self.text, 12, 4, str(kwargs["model"]))


def _company_with_connection(client):
    company = ok(client.post("/api/companies", json={"name": "Probe workshop", "country": "DE"}), 201)
    cid = company["id"]
    ok(client.put(f"/api/companies/{cid}/connections/openai", json={"api_key": "secret-provider-test-key"}))
    return cid


def test_generation_probe_requires_explicit_consent_and_is_audited(client, monkeypatch):
    cid = _company_with_connection(client)
    adapter = ProbeAdapter()
    seen = []

    def fake_build(provider, key, base_url):
        seen.append((provider, key, base_url))
        return adapter

    monkeypatch.setattr(providers, "build", fake_build)
    # routes_settings imported build directly.
    from select_api import routes_settings

    monkeypatch.setattr(routes_settings, "build", fake_build)
    url = f"/api/companies/{cid}/connections/openai/probe"
    assert client.post(url, json={"model": "gpt-test"}).status_code == 422
    assert client.post(url, json={"model": "gpt-test", "consent": False}).status_code == 422

    result = ok(client.post(url, json={"model": "gpt-test", "consent": True}))
    assert result == {"ok": True, "model": "gpt-test", "input_tokens": 12, "output_tokens": 4, "error": None}
    assert seen == [("openai", "secret-provider-test-key", None)]
    assert len(adapter.requests) == 1
    assert adapter.requests[0]["json_output"] is True
    assert "company" not in adapter.requests[0]["user"].lower()
    assert "Probe workshop" not in str(adapter.requests[0])
    activity = ok(client.get(f"/api/companies/{cid}/activity"))["items"]
    assert any(item["kind"] == "connection.probed" for item in activity)


def test_generation_probe_rejects_disabled_and_malformed_model(client):
    cid = _company_with_connection(client)
    url = f"/api/companies/{cid}/connections/openai/probe"
    assert client.post(url, json={"model": "../../private", "consent": True}).status_code == 422
    ok(client.put(f"/api/companies/{cid}/connections/openai", json={"enabled": False}))
    assert client.post(url, json={"model": "gpt-test", "consent": True}).status_code == 409


def test_generation_probe_never_leaks_raw_sdk_exception(client, monkeypatch):
    cid = _company_with_connection(client)

    class UnsafeAdapter:
        def complete(self, **kwargs):
            raise RuntimeError("secret-provider-test-key must never reach a browser")

    from select_api import routes_settings

    monkeypatch.setattr(routes_settings, "build", lambda *args: UnsafeAdapter())
    result = ok(
        client.post(
            f"/api/companies/{cid}/connections/openai/probe",
            json={"model": "gpt-test", "consent": True},
        )
    )
    assert result["ok"] is False
    assert "secret-provider-test-key" not in str(result)
    assert "server logs" in result["error"]


def test_generation_probe_handles_rejected_result(client, monkeypatch):
    cid = _company_with_connection(client)
    from select_api import routes_settings

    monkeypatch.setattr(routes_settings, "build", lambda *args: ProbeAdapter('{"select_probe":"wrong"}'))
    result = ok(
        client.post(
            f"/api/companies/{cid}/connections/openai/probe",
            json={"model": "gpt-test", "consent": True},
        )
    )
    assert result["ok"] is False
    assert "unexpected" in result["error"].lower()


@pytest.mark.parametrize("status", [401, 403, 429, 503])
def test_safe_sdk_error_does_not_include_response_body(status: int):
    class FakeException(Exception):
        status_code = status

    failure = providers._safe_sdk_error("OpenAI", FakeException("secret-key or private prompt"))
    assert str(status) in str(failure)
    assert "secret-key" not in str(failure)


def test_safe_http_error_is_redacted():
    import httpx

    request = httpx.Request("GET", "https://internal.example.test/?api_key=secret-value")
    response = httpx.Response(500, request=request, text="private provider response")
    err = httpx.HTTPStatusError("sensitive request", request=request, response=response)
    failure = providers._safe_http_error("Gemini", err)
    assert "500" in str(failure)
    assert "secret-value" not in str(failure)
    assert "private provider response" not in str(failure)
