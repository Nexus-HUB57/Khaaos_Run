#!/usr/bin/env python3
"""Loopback-only mock for Unreal telemetry transport integration tests."""
from __future__ import annotations

import json
import os
import signal
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

TELEMETRY_PATH = "/api/v1/telemetry/batch"
MAX_BODY_BYTES = 1_048_576


def write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
    ) as handle:
        json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
        temporary_path = Path(handle.name)
    temporary_path.replace(path)


class TelemetryMockServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, capture_path: Path, expected_token: str, scenario: str = "retry-once") -> None:
        if not expected_token:
            raise ValueError("expected_token must not be empty")
        if scenario not in {"retry-once", "success"}:
            raise ValueError(f"unsupported mock scenario: {scenario}")
        self.capture_path = capture_path
        self.expected_token = expected_token
        self.scenario = scenario
        self.captured_requests: list[dict[str, Any]] = []
        self.capture_lock = threading.Lock()
        super().__init__(("127.0.0.1", 0), self._handler_type())

    @staticmethod
    def _handler_type() -> type[BaseHTTPRequestHandler]:
        class Handler(BaseHTTPRequestHandler):
            server: TelemetryMockServer

            def log_message(self, _format: str, *_args: Any) -> None:
                # Request content and authorization are deliberately not logged.
                return

            def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
                if self.path != "/__health":
                    self._send_json(404, {"error": "not_found"})
                    return
                self._send_json(200, {"ready": True})

            def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
                content_length_text = self.headers.get("Content-Length", "0")
                try:
                    content_length = int(content_length_text)
                except ValueError:
                    content_length = -1

                raw_body = b""
                parsed_body: Any = None
                parse_error = False
                if 0 <= content_length <= MAX_BODY_BYTES:
                    raw_body = self.rfile.read(content_length)
                    try:
                        parsed_body = json.loads(raw_body.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        parse_error = True
                else:
                    parse_error = True

                headers = {
                    "content_type_valid": self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                    == "application/json",
                    "authorization_valid": self.headers.get("Authorization")
                    == f"Bearer {self.server.expected_token}",
                    "idempotency_key": self.headers.get("Idempotency-Key", ""),
                    "schema_version": self.headers.get("X-Telemetry-Schema-Version", ""),
                }

                if self.path != TELEMETRY_PATH:
                    status = 404
                elif content_length > MAX_BODY_BYTES:
                    status = 413
                elif parse_error:
                    status = 400
                elif not headers["authorization_valid"]:
                    status = 401
                elif not headers["content_type_valid"] or headers["schema_version"] != "1":
                    status = 400
                elif not headers["idempotency_key"] or not isinstance(parsed_body, list):
                    status = 400
                elif self.server.scenario == "retry-once" and self.server.request_count == 0:
                    status = 503
                else:
                    status = 202

                capture = {
                    "method": "POST",
                    "path": self.path,
                    "headers": headers,
                    "body": parsed_body,
                    "response_status": status,
                }
                with self.server.capture_lock:
                    self.server.captured_requests.append(capture)
                    write_json_atomic(self.server.capture_path, {"requests": self.server.captured_requests})

                if status == 503:
                    self._send_json(status, {"accepted": False, "retry": True}, retry_after="1")
                elif status == 202:
                    count = len(parsed_body) if isinstance(parsed_body, list) else 0
                    self._send_json(status, {"accepted": True, "event_count": count})
                else:
                    self._send_json(status, {"accepted": False})

            @property
            def server(self) -> TelemetryMockServer:
                return self._server  # type: ignore[return-value]

            @server.setter
            def server(self, value: TelemetryMockServer) -> None:
                self._server = value

            def _send_json(self, status: int, payload: dict[str, Any], retry_after: str | None = None) -> None:
                body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                if retry_after is not None:
                    self.send_header("Retry-After", retry_after)
                self.end_headers()
                self.wfile.write(body)

        return Handler

    @property
    def request_count(self) -> int:
        with self.capture_lock:
            return len(self.captured_requests)

    @property
    def base_url(self) -> str:
        host, port = self.server_address[:2]
        return f"http://{host}:{port}"


def create_server(capture_path: Path, expected_token: str, scenario: str = "retry-once") -> TelemetryMockServer:
    return TelemetryMockServer(capture_path, expected_token, scenario)


def main() -> int:
    capture_value = os.environ.get("KHAAOS_TELEMETRY_MOCK_CAPTURE_FILE", "")
    ready_value = os.environ.get("KHAAOS_TELEMETRY_MOCK_READY_FILE", "")
    token = os.environ.get("KHAAOS_TELEMETRY_TOKEN", "")
    scenario = os.environ.get("KHAAOS_TELEMETRY_MOCK_SCENARIO", "retry-once")
    if not capture_value or not ready_value or not token:
        raise SystemExit(
            "Set KHAAOS_TELEMETRY_MOCK_CAPTURE_FILE, KHAAOS_TELEMETRY_MOCK_READY_FILE, "
            "and a non-production KHAAOS_TELEMETRY_TOKEN."
        )

    server = create_server(Path(capture_value), token, scenario)
    ready_path = Path(ready_value)
    write_json_atomic(
        ready_path,
        {"url": f"{server.base_url}{TELEMETRY_PATH}", "health_url": f"{server.base_url}/__health"},
    )

    def request_shutdown(_signal_number: int, _frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
