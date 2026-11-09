#!/usr/bin/env python3
"""Verify the real Unreal-to-mock telemetry retry integration capture."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

TELEMETRY_PATH = "/api/v1/telemetry/batch"
RAW_PLAYER_SENTINEL = "eos-player-secret-integration-sentinel"
EXPECTED_METADATA = '{"test":"http-retry"}'
UUID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def verify_capture(capture_path: Path) -> dict[str, Any]:
    try:
        document = json.loads(capture_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read mock capture {capture_path}: {error}") from error

    requests = document.get("requests") if isinstance(document, dict) else None
    if not isinstance(requests, list):
        raise ValueError("capture must contain a requests array")
    if [item.get("response_status") for item in requests] != [503, 202]:
        raise ValueError("expected exactly two attempts with responses 503 then 202")

    first, second = requests
    for index, request in enumerate(requests, start=1):
        if request.get("method") != "POST" or request.get("path") != TELEMETRY_PATH:
            raise ValueError(f"attempt {index}: unexpected method or path")
        headers = request.get("headers")
        if not isinstance(headers, dict):
            raise ValueError(f"attempt {index}: missing sanitized headers")
        if not headers.get("content_type_valid") or not headers.get("authorization_valid"):
            raise ValueError(f"attempt {index}: content type or test-token authorization was invalid")
        if headers.get("schema_version") != "1":
            raise ValueError(f"attempt {index}: unexpected telemetry schema version")
        key = headers.get("idempotency_key", "")
        if not isinstance(key, str) or not UUID_PATTERN.fullmatch(key):
            raise ValueError(f"attempt {index}: Idempotency-Key must be a UUID")

    first_headers = first["headers"]
    second_headers = second["headers"]
    if first_headers["idempotency_key"] != second_headers["idempotency_key"]:
        raise ValueError("retry changed Idempotency-Key; duplicate batches could be counted twice")
    if first.get("body") != second.get("body"):
        raise ValueError("retry changed the serialized batch body")

    body = first.get("body")
    if not isinstance(body, list) or len(body) != 1:
        raise ValueError("expected one event in the captured batch")
    event = body[0]
    if not isinstance(event, dict):
        raise ValueError("captured batch event must be a JSON object")
    expected_fields = {
        "type": "telemetry.integration_test",
        "category": 0,
        "match": "match-integration-test",
        "value": 7.5,
        "metadata": EXPECTED_METADATA,
        "region": "sa1",
        "platform": "linux",
    }
    for field, expected in expected_fields.items():
        if event.get(field) != expected:
            raise ValueError(f"event field {field!r} did not match the integration-test contract")
    if "player" in event or RAW_PLAYER_SENTINEL in json.dumps(body, sort_keys=True):
        raise ValueError("raw player/EOS identifier leaked into telemetry payload")
    timestamp = event.get("ts")
    if not isinstance(timestamp, (int, float)) or timestamp <= 0:
        raise ValueError("event timestamp must be a positive Unix-millisecond value")

    return {
        "result": "PASS",
        "attempts": len(requests),
        "responses": [503, 202],
        "unique_batches": 1,
        "events": len(body),
        "idempotency_key": first_headers["idempotency_key"],
        "authorization": "valid test token (redacted)",
        "raw_player_id_in_payload": False,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"Usage: {Path(argv[0]).name} <capture.json>", file=sys.stderr)
        return 2
    try:
        summary = verify_capture(Path(argv[1]))
    except ValueError as error:
        print(f"Telemetry mock verification failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
