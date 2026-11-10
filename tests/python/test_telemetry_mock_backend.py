from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from scripts.telemetry_mock_backend import TELEMETRY_PATH, create_server
from scripts.verify_telemetry_mock_capture import verify_capture


class TelemetryMockBackendTests(unittest.TestCase):
    def _start_server(self, capture_path: Path, token: str = "integration-test-token"):
        server = create_server(capture_path, token, scenario="retry-once")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 3.0)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server

    def _post(self, url: str, token: str, idempotency_key: str, body: object) -> int:
        request = Request(
            url,
            data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "Idempotency-Key": idempotency_key,
                "X-Telemetry-Schema-Version": "1",
            },
        )
        try:
            with urlopen(request, timeout=2) as response:
                return response.status
        except HTTPError as error:
            error.close()
            return error.code

    def test_retry_once_preserves_idempotency_key_and_exact_batch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            capture_path = Path(directory) / "capture.json"
            server = self._start_server(capture_path)
            self.assertEqual(server.server_address[0], "127.0.0.1")
            url = f"{server.base_url}{TELEMETRY_PATH}"
            payload = [
                {
                    "type": "telemetry.integration_test",
                    "category": 0,
                    "match": "match-integration-test",
                    "ts": 1793574000123,
                    "value": 7.5,
                    "region": "sa1",
                    "platform": "linux",
                    "metadata": '{"test":"http-retry"}',
                }
            ]
            key = "12345678-1234-4234-8234-123456789abc"

            self.assertEqual(self._post(url, "integration-test-token", key, payload), 503)
            self.assertEqual(self._post(url, "integration-test-token", key, payload), 202)

            summary = verify_capture(capture_path)
            self.assertEqual(summary["result"], "PASS")
            self.assertEqual(summary["attempts"], 2)
            self.assertEqual(summary["unique_batches"], 1)
            self.assertFalse(summary["raw_player_id_in_payload"])

    def test_wrong_token_is_rejected_and_never_recorded_as_authorized(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            capture_path = Path(directory) / "capture.json"
            server = self._start_server(capture_path, token="expected-token")
            status = self._post(
                f"{server.base_url}{TELEMETRY_PATH}",
                "wrong-token",
                "12345678-1234-4234-8234-123456789abc",
                [],
            )
            self.assertEqual(status, 401)
            capture = json.loads(capture_path.read_text(encoding="utf-8"))
            self.assertFalse(capture["requests"][0]["headers"]["authorization_valid"])
            self.assertNotIn("wrong-token", capture_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
