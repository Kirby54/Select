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
        data = response.json()
        try:
            text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"Gemini: unexpected response shape ({exc})") from exc
        usage = data.get("usageMetadata", {})
        return Completion(text, int(usage.get("promptTokenCount", 0)), int(usage.get("candidatesTokenCount", 0)), model)

    def list_models(self, timeout: float) -> list[str]:
        try:
            response = httpx.get(f"{self._base}/v1beta/models", headers={"x-goog-api-key": self._key}, timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gemini: {exc}") from exc
        return sorted(m["name"].removeprefix("models/") for m in response.json().get("models", []))


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
        data = response.json()
        return Completion(
            data.get("message", {}).get("content", ""),
            int(data.get("prompt_eval_count", 0)),
            int(data.get("eval_count", 0)),
            model,
        )

    def list_models(self, timeout: float) -> list[str]:
        try:
            response = httpx.get(f"{self._base}/api/tags", timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama: {exc}") from exc
        return sorted(m["name"] for m in response.json().get("models", []))


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
