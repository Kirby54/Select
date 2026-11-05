"""Real localhost HTTP transport through Ollama adapter, worker, verification and approvals.

Unlike the other runner tests this does NOT replace the provider or httpx client:
a disposable HTTP server receives actual requests. It does not test a real Ollama model.
"""

from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterator

from helpers import REQUEST, ok, setup_company


class OllamaStub(BaseHTTPRequestHandler):
    calls: list[dict[str, object]] = []
    reply: dict[str, object] = {}

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler interface
        length = int(self.headers["content-length"])
        request = json.loads(self.rfile.read(length))
        self.calls.append({"path": self.path, "body": request})
        payload = json.dumps(self.reply).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


@contextmanager
def local_ollama(reply: dict[str, object]) -> Iterator[tuple[str, type[OllamaStub]]]:
    class Handler(OllamaStub):
        calls: list[dict[str, object]] = []

    Handler.reply = reply
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", Handler
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


EXTRACTION = {
    "customer": {
        "name": {"value": "Jonas Weber", "source_ref": "source:msg-1"},
        "email": {"value": "jonas.weber@example.org", "source_ref": "source:msg-1"},
    },
    "items": [
        {"catalog_ref": "AP-120", "quantity": {"value": "3.2", "source_ref": "source:msg-1"}},
        {"catalog_ref": "WR-40", "quantity": {"value": "2", "source_ref": "source:msg-1"}},
    ],
    "missing": [],
}


def test_real_ollama_http_transport_verifies_quote_without_sending(client) -> None:
    """The full worker and deterministic verifier execute, only model inference is stubbed."""
    from select_api import worker

    reply = {
        "message": {"role": "assistant", "content": json.dumps(EXTRACTION)},
        "prompt_eval_count": 105,
        "eval_count": 49,
    }
    with local_ollama(reply) as (url, handler):
        cid, aid = setup_company(client)
        ok(client.put(
            f"/api/companies/{cid}/connections/ollama",
            json={"base_url": url, "enabled": True, "prices": {"llama-test": {"input": "0.00", "output": "0.00"}}},
        ))
        agent = ok(client.get(f"/api/companies/{cid}/agents/{aid}"))
        ok(client.patch(
            f"/api/companies/{cid}/agents/{aid}",
            json={"version": agent["version"], "provider": "ollama", "model": "llama-test"},
        ))
        task = ok(client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": "Real HTTP adapter quote",
                "task_type": "quote",
                "assignee_id": aid,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ), 201)
        while worker.run_once("ollama-http-test"):
            pass
        detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
        assert detail["status"] == "awaiting_approval"
        assert detail["receipts"][0]["status"] == "verified"
        assert detail["result"]["totals"]["gross"]["value"] == "873.22"
        assert len(handler.calls) == 1
        wire = handler.calls[0]
        assert wire["path"] == "/api/chat"
        request_body = wire["body"]
        assert request_body["model"] == "llama-test"
        assert request_body["stream"] is False
        assert request_body["format"] == "json"
        assert "<untrusted_source" in request_body["messages"][1]["content"]
        assert detail["runs"][0]["input_tokens"] == 105
        assert detail["runs"][0]["output_tokens"] == 49
        approvals = ok(client.get(f"/api/companies/{cid}/approvals"))
        assert approvals
        # Production send must never happen without a human approval.
        assert all(item["status"] == "pending" for item in approvals)
