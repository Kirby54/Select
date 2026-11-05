"""Provider protocol regressions: no live keys or external network needed.

Mock only HTTP transport; exercise response decoding, provider adapters and cost input validation.
Real provider API calls still require an optional live test with user-owned credentials.
"""

from __future__ import annotations

import httpx
import pytest
from pydantic import ValidationError
from select_api import providers
from select_api.views import ConnectionIn


def response(payload: object, *, path: str = "https://example.test/models") -> httpx.Response:
    return httpx.Response(200, json=payload, request=httpx.Request("GET", path))


@pytest.mark.parametrize("invalid", ["NaN", "Infinity", "-Infinity", "-1", "not-a-number"])
def test_invalid_model_prices_are_validation_errors(invalid: str) -> None:
    with pytest.raises(ValidationError):
        ConnectionIn.model_validate({"prices": {"model": {"input": invalid, "output": "1.00"}}})


def test_valid_model_prices_preserve_decimal_strings() -> None:
    config = ConnectionIn.model_validate({"prices": {"model": {"input": "0", "output": "0.25"}}})
    assert config.prices["model"]["output"] == "0.25"


@pytest.mark.parametrize("name", ["Gemini", "Ollama"])
@pytest.mark.parametrize("payload", [["not an object"], {"message": []}, {"candidates": []}])
def test_malformed_provider_completions_fail_cleanly(monkeypatch, name: str, payload: object) -> None:
    monkeypatch.setattr(providers.httpx, "post", lambda *args, **kwargs: response(payload))
    adapter = providers.GeminiProvider("test-key") if name == "Gemini" else providers.OllamaProvider()
    with pytest.raises(providers.ProviderError, match=name):
        adapter.complete(model="test", system="sys", user="user", json_output=True, timeout=1)


@pytest.mark.parametrize("name", ["Gemini", "Ollama"])
def test_non_json_http_success_is_rejected(monkeypatch, name: str) -> None:
    raw = httpx.Response(200, content=b"<html>oops</html>", request=httpx.Request("GET", "https://example.test"))
    monkeypatch.setattr(providers.httpx, "post", lambda *args, **kwargs: raw)
    adapter = providers.GeminiProvider("test-key") if name == "Gemini" else providers.OllamaProvider()
    with pytest.raises(providers.ProviderError, match="not valid JSON"):
        adapter.complete(model="test", system="sys", user="user", json_output=True, timeout=1)


def test_gemini_completion_and_model_list(monkeypatch) -> None:
    payload = {
        "candidates": [{"content": {"parts": [{"text": '{"ok":'}, {"text": "true}"}]}}],
        "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 4},
    }
    requests: list[dict[str, object]] = []

    def post(*args, **kwargs):
        requests.append(kwargs)
        return response(payload)

    monkeypatch.setattr(providers.httpx, "post", post)
    monkeypatch.setattr(
        providers.httpx,
        "get",
        lambda *args, **kwargs: response({"models": [{"name": "models/gemini-2"}, {"name": "models/gemini-1"}]}),
    )
    adapter = providers.GeminiProvider("test-key")
    result = adapter.complete(model="gemini-1", system="sys", user="hello", json_output=True, timeout=10)
    assert (result.text, result.input_tokens, result.output_tokens) == ('{"ok":true}', 12, 4)
    assert requests[0]["json"]["generationConfig"]["responseMimeType"] == "application/json"
    assert adapter.list_models(timeout=10) == ["gemini-1", "gemini-2"]


def test_ollama_completion_and_model_list(monkeypatch) -> None:
    payload = {
        "message": {"content": '{"status":"ready"}'},
        "prompt_eval_count": 21,
        "eval_count": 8,
    }
    requests: list[dict[str, object]] = []

    def post(*args, **kwargs):
        requests.append(kwargs)
        return response(payload)

    monkeypatch.setattr(providers.httpx, "post", post)
    monkeypatch.setattr(
        providers.httpx,
        "get",
        lambda *args, **kwargs: response({"models": [{"name": "qwen"}, {"name": "llama"}]}),
    )
    adapter = providers.OllamaProvider()
    result = adapter.complete(model="llama", system="sys", user="hello", json_output=True, timeout=10)
    assert (result.text, result.input_tokens, result.output_tokens) == ('{"status":"ready"}', 21, 8)
    assert requests[0]["json"]["format"] == "json"
    assert adapter.list_models(timeout=10) == ["llama", "qwen"]


@pytest.mark.parametrize("payload", [{"models": "invalid"}, {"models": [{"bad": "key"}]}, []])
@pytest.mark.parametrize("name", ["Gemini", "Ollama"])
def test_malformed_model_list_is_reported(monkeypatch, name: str, payload: object) -> None:
    monkeypatch.setattr(providers.httpx, "get", lambda *args, **kwargs: response(payload))
    adapter = providers.GeminiProvider("test-key") if name == "Gemini" else providers.OllamaProvider()
    with pytest.raises(providers.ProviderError, match=name):
        adapter.list_models(timeout=1)


@pytest.mark.parametrize("name", ["Gemini", "Ollama"])
def test_negative_token_usage_is_rejected(monkeypatch, name: str) -> None:
    gemini = {
        "candidates": [{"content": {"parts": [{"text": "valid"}]}}],
        "usageMetadata": {"promptTokenCount": -1},
    }
    ollama = {"message": {"content": "valid"}, "eval_count": -1}
    monkeypatch.setattr(
        providers.httpx, "post", lambda *args, **kwargs: response(gemini if name == "Gemini" else ollama)
    )
    adapter = providers.GeminiProvider("test-key") if name == "Gemini" else providers.OllamaProvider()
    with pytest.raises(providers.ProviderError, match="invalid token usage"):
        adapter.complete(model="test", system="sys", user="user", json_output=True, timeout=1)
