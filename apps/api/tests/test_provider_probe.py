"""The opt-in model probe must never disclose credentials or send company data."""

from __future__ import annotations

import pytest
from select_api.cli import main, probe_provider
from select_api.providers import Completion, ProviderError


class FakeProvider:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[dict[str, object]] = []

    def complete(self, *, model, system, user, json_output, timeout):
        self.calls.append(
            {"model": model, "system": system, "user": user, "json_output": json_output, "timeout": timeout}
        )
        return Completion(self.text, 7, 3, model)


def test_probe_checks_real_adapter_protocol_without_company_data(monkeypatch, capsys) -> None:
    from select_api import providers

    fake = FakeProvider('{"select_probe": "ok"}')
    calls: list[tuple[str, str | None, str | None]] = []

    def build(provider, key, url):
        calls.append((provider, key, url))
        return fake

    monkeypatch.setenv("SELECT_PROBE_API_KEY", "private-key-for-test")
    monkeypatch.setattr(providers, "build", build)
    probe_provider("openai", "model-test", "https://example.test", 20)
    output = capsys.readouterr().out
    assert "Probe passed" in output and "private-key-for-test" not in output
    assert calls == [("openai", "private-key-for-test", "https://example.test")]
    assert fake.calls[0]["json_output"] is True
    assert "select_probe" in fake.calls[0]["user"]
    assert "company" not in fake.calls[0]["user"].lower()


def test_probe_requires_environment_key_for_paid_provider(monkeypatch) -> None:
    monkeypatch.delenv("SELECT_PROBE_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="SELECT_PROBE_API_KEY"):
        probe_provider("anthropic", "model-test", None, 30)


def test_probe_invalid_model_output_exits_with_error(monkeypatch, capsys) -> None:
    from select_api import providers

    monkeypatch.setenv("SELECT_PROBE_API_KEY", "secret")
    monkeypatch.setattr(providers, "build", lambda *args: FakeProvider('{"select_probe": "wrong"}'))
    with pytest.raises(SystemExit) as exc:
        probe_provider("openai", "model-test", None, 30)
    assert exc.value.code == 1
    assert "Probe failed" in capsys.readouterr().err


def test_probe_handles_network_provider_error_without_echoing_key(monkeypatch, capsys) -> None:
    from select_api import providers

    class BrokenProvider:
        def complete(self, **kwargs):
            raise ProviderError("provider unavailable")

    monkeypatch.setenv("SELECT_PROBE_API_KEY", "private-key")
    monkeypatch.setattr(providers, "build", lambda *args: BrokenProvider())
    with pytest.raises(SystemExit):
        probe_provider("gemini", "model-test", None, 1)
    message = capsys.readouterr().err
    assert "provider unavailable" in message
    assert "private-key" not in message


def test_probe_timeout_is_bounded() -> None:
    with pytest.raises(SystemExit):
        main(["probe-provider", "--provider", "ollama", "--model", "local", "--timeout", "0"])
