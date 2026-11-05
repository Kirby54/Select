"""Model providers. Each adapter makes real calls; there is no simulated provider.

Token counts come from the provider. Prices do not, so cost is estimated from a price table
the owner maintains per connection, and stored with kind="estimated".
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

import anthropic
import httpx
import openai


class ProviderError(RuntimeError):
    pass


@dataclass
class Completion:
    text: str
    input_tokens: int
    output_tokens: int
    model: str


class Provider(Protocol):
    name: str

    def complete(self, *, model: str, system: str, user: str, json_output: bool, timeout: float) -> Completion: ...

    def list_models(self, timeout: float) -> list[str]: ...


@dataclass
class ProviderInfo:
    id: str
    label: str
    needs_key: bool
    default_base_url: str | None
    docs: str


PROVIDERS: dict[str, ProviderInfo] = {
    "anthropic": ProviderInfo("anthropic", "Anthropic", True, None, "https://docs.claude.com"),
    "openai": ProviderInfo("openai", "OpenAI", True, None, "https://platform.openai.com/docs"),
    "gemini": ProviderInfo(
        "gemini",
        "Google Gemini",
        True,
        "https://generativelanguage.googleapis.com",
        "https://ai.google.dev/gemini-api/docs",
    ),
    "ollama": ProviderInfo(
        "ollama", "Ollama (local)", False, "http://localhost:11434", "https://github.com/ollama/ollama"
    ),
}


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._client = anthropic.Anthropic(api_key=api_key, base_url=base_url or None, max_retries=2)

    def complete(self, *, model: str, system: str, user: str, json_output: bool, timeout: float) -> Completion:
        try:
            message = self._client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
                timeout=timeout,
            )
        except anthropic.APIError as exc:
            raise ProviderError(f"Anthropic: {exc}") from exc
        text = "".join(getattr(block, "text", "") for block in message.content)
        return Completion(text, message.usage.input_tokens, message.usage.output_tokens, message.model)

    def list_models(self, timeout: float) -> list[str]:
        try:
            return [m.id for m in self._client.models.list(limit=100, timeout=timeout).data]
        except anthropic.APIError as exc:
            raise ProviderError(f"Anthropic: {exc}") from exc


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._client = openai.OpenAI(api_key=api_key, base_url=base_url or None, max_retries=2)

    def complete(self, *, model: str, system: str, user: str, json_output: bool, timeout: float) -> Completion:
        try:
            response = self._client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_object"} if json_output else openai.NOT_GIVEN,
                timeout=timeout,
            )
        except openai.APIError as exc:
            raise ProviderError(f"OpenAI: {exc}") from exc
        usage = response.usage
        text = response.choices[0].message.content or ""
        return Completion(
            text, usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0, response.model
        )

    def list_models(self, timeout: float) -> list[str]:
        try:
            return sorted(m.id for m in self._client.models.list(timeout=timeout))
        except openai.APIError as exc:
            raise ProviderError(f"OpenAI: {exc}") from exc


def _json_mapping(response: httpx.Response, provider: str) -> dict[str, object]:
    """An HTTP 200 response is not necessarily a valid provider result."""
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(f"{provider}: response was not valid JSON") from exc
    if not isinstance(data, dict):
        raise ProviderError(f"{provider}: expected a JSON object")
    return data


def _token_count(value: object, provider: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ProviderError(f"{provider}: invalid token usage in response")
    return value


class GeminiProvider:
    """Gemini REST API (generateContent). Google's Python SDK is not a dependency."""

    name = "gemini"

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._key = api_key
        self._base = (base_url or PROVIDERS["gemini"].default_base_url or "").rstrip("/")

    def complete(self, *, model: str, system: str, user: str, json_output: bool, timeout: float) -> Completion:
        body: dict[str, object] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
        }
        if json_output:
            body["generationConfig"] = {"responseMimeType": "application/json"}
        try:
            response = httpx.post(
                f"{self._base}/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": self._key},
                json=body,
                timeout=timeout,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gemini: {exc}") from exc
        data = _json_mapping(response, "Gemini")
        try:
            parts = data["candidates"][0]["content"]["parts"]
            if not isinstance(parts, list):
                raise TypeError("parts must be a list")
            if any(not isinstance(part, dict) or not isinstance(part.get("text", ""), str) for part in parts):
                raise TypeError("parts must contain text")
            text = "".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Gemini: unexpected response shape") from exc
        if not text.strip():
            raise ProviderError("Gemini: response contained no text")
        usage = data.get("usageMetadata") or {}
        if not isinstance(usage, dict):
            raise ProviderError("Gemini: invalid usage metadata")
        return Completion(
            text,
            _token_count(usage.get("promptTokenCount", 0), "Gemini"),
            _token_count(usage.get("candidatesTokenCount", 0), "Gemini"),
            model,
        )

    def list_models(self, timeout: float) -> list[str]:
        try:
            response = httpx.get(f"{self._base}/v1beta/models", headers={"x-goog-api-key": self._key}, timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gemini: {exc}") from exc
        data = _json_mapping(response, "Gemini")
        models = data.get("models", [])
        if not isinstance(models, list) or any(
            not isinstance(item, dict) or not isinstance(item.get("name"), str) for item in models
        ):
            raise ProviderError("Gemini: invalid model list")
        return sorted(item["name"].removeprefix("models/") for item in models)


class OllamaProvider:
    name = "ollama"

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self._base = (base_url or PROVIDERS["ollama"].default_base_url or "").rstrip("/")

    def complete(self, *, model: str, system: str, user: str, json_output: bool, timeout: float) -> Completion:
        body: dict[str, object] = {
            "model": model,
            "stream": False,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if json_output:
            body["format"] = "json"
        try:
            response = httpx.post(f"{self._base}/api/chat", json=body, timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama: {exc}") from exc
        data = _json_mapping(response, "Ollama")
        message = data.get("message")
        if not isinstance(message, dict) or not isinstance(message.get("content"), str):
            raise ProviderError("Ollama: response contains no message text")
        content = message["content"]
        if not content.strip():
            raise ProviderError("Ollama: response contained no text")
        return Completion(
            content,
            _token_count(data.get("prompt_eval_count", 0), "Ollama"),
            _token_count(data.get("eval_count", 0), "Ollama"),
            model,
        )

    def list_models(self, timeout: float) -> list[str]:
        try:
            response = httpx.get(f"{self._base}/api/tags", timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama: {exc}") from exc
        data = _json_mapping(response, "Ollama")
        models = data.get("models", [])
        if not isinstance(models, list) or any(
            not isinstance(item, dict) or not isinstance(item.get("name"), str) for item in models
        ):
            raise ProviderError("Ollama: invalid model list")
        return sorted(item["name"] for item in models)


def build(provider: str, api_key: str | None, base_url: str | None) -> Provider:
    if provider == "anthropic":
        if not api_key:
            raise ProviderError("Anthropic needs an API key")
        return AnthropicProvider(api_key, base_url)
    if provider == "openai":
        if not api_key:
            raise ProviderError("OpenAI needs an API key")
        return OpenAIProvider(api_key, base_url)
    if provider == "gemini":
        if not api_key:
            raise ProviderError("Gemini needs an API key")
        return GeminiProvider(api_key, base_url)
    if provider == "ollama":
        return OllamaProvider(None, base_url)
    raise ProviderError(f"unknown provider '{provider}'")


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def parse_json_object(text: str) -> dict[str, object]:
    """Models sometimes wrap JSON in fences or prose; accept only one JSON object."""
    cleaned = _FENCE.sub("", text.strip()).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ProviderError("the model did not return a JSON object")
    try:
        value = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ProviderError(f"the model returned invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ProviderError("the model returned JSON that is not an object")
    return value


def estimate_cost(
    prices: dict[str, dict[str, str]], model: str, input_tokens: int, output_tokens: int
) -> Decimal | None:
    price = prices.get(model)
    if not price:
        return None
    per_million = Decimal(1_000_000)
    return (Decimal(str(price["input"])) * input_tokens + Decimal(str(price["output"])) * output_tokens) / per_million
