#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <Unreal Automation report.json | report directory>" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

REPORT_INPUT="$1"
if [[ ! -e "$REPORT_INPUT" ]]; then
  echo "FAIL: report path does not exist: $REPORT_INPUT" >&2
  exit 1
fi

python3 - "$REPORT_INPUT" <<'PY'
import json
import sys
from pathlib import Path

EXPECTED_TESTS = {
    "Khaaos.Zu.Contract.Readme15Variants": "contract",
    "Khaaos.Zu.Authority.ServerOnlyAppliesEffects": "authority",
}
WORLDS = ("CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea")
VARIANTS = (1, 2, 3)
SUCCESS_STATES = {"success", "successwithwarnings", "succeeded", "passed"}
FAIL_STATES = {"fail", "failed", "failure", "error"}


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_reports(input_path: Path):
    if input_path.is_file():
        candidates = [input_path]
    elif input_path.is_dir():
        candidates = sorted(path for path in input_path.rglob("*.json") if path.is_file())
        if not candidates:
            fail(f"no .json report files found under {input_path}")
    else:
        fail(f"not a file or directory: {input_path}")

    valid = []
    parse_errors = []
    for candidate in candidates:
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            parse_errors.append(f"{candidate}: {exc}")
            continue
        if isinstance(data, dict) and isinstance(data.get("tests"), list) and "failed" in data:
            valid.append((candidate, data))

    if len(valid) != 1:
        if not valid:
            details = "; ".join(parse_errors[:3])
            suffix = f"; parse errors: {details}" if details else ""
            fail(f"expected one Unreal Automation JSON report in {input_path}{suffix}")
        fail(
            f"found {len(valid)} Unreal Automation reports under {input_path}; "
            "pass the exact report JSON file to avoid selecting the wrong run"
        )
    return valid[0]


def report_counter(report: dict, name: str) -> int:
    value = report.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        fail(f"report summary field {name!r} must be a non-negative integer")
    return value


def matches_test(test: dict, expected_path: str) -> bool:
    leaf = expected_path.rsplit(".", 1)[-1]
    for key in ("fullTestPath", "testDisplayName", "name"):
        value = test.get(key)
        if not isinstance(value, str):
            continue
        value = value.strip().replace("\\", "/")
        if value in (expected_path, leaf):
            return True
        if value.endswith("." + expected_path) or value.endswith("/" + expected_path):
            return True
    return False


def info_messages(test: dict):
    entries = test.get("entries", [])
    if not isinstance(entries, list):
        return []
    messages = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        event = entry.get("event")
        if not isinstance(event, dict):
            continue
        event_type = event.get("type", "")
        message = event.get("message", "")
        if isinstance(event_type, str) and event_type.casefold() == "info" and isinstance(message, str):
            messages.append(message.strip())
    return messages


report_path, report = load_reports(Path(sys.argv[1]))
summary = {
    name: report_counter(report, name)
    for name in ("succeeded", "succeededWithWarnings", "failed", "notRun", "inProcess")
}
if summary["failed"] != 0:
    fail(f"Unreal report records {summary['failed']} failed test(s)")
if summary["inProcess"] != 0:
    fail(f"Unreal report is incomplete: {summary['inProcess']} test(s) remain in process")

tests = report["tests"]
for index, test in enumerate(tests):
    if not isinstance(test, dict):
        fail(f"tests[{index}] is not a JSON object")
    state = test.get("state", "")
    if isinstance(state, str) and state.casefold() in FAIL_STATES:
        fail(f"report contains failed test state {state!r}: {test.get('fullTestPath', test.get('testDisplayName', index))}")
    errors = test.get("errors", 0)
    if isinstance(errors, bool) or not isinstance(errors, int) or errors < 0:
        fail(f"tests[{index}].errors must be a non-negative integer")
    if errors > 0:
        fail(f"report contains {errors} error(s): {test.get('fullTestPath', test.get('testDisplayName', index))}")

selected = {}
for expected_path, category in EXPECTED_TESTS.items():
    matches = [test for test in tests if matches_test(test, expected_path)]
    if not matches:
        fail(f"required Automation Test is absent from the report: {expected_path}")
    if len(matches) != 1:
        fail(f"expected exactly one result for {expected_path}, found {len(matches)}")
    test = matches[0]
    state = test.get("state")
    if not isinstance(state, str) or state.casefold() not in SUCCESS_STATES:
        fail(f"required test {expected_path} did not succeed (state={state!r})")
    errors = test.get("errors", 0)
    if errors != 0:
        fail(f"required test {expected_path} reports {errors} error(s)")
    selected[category] = test

expected_contract = {
    f"ZU_CASE|contract|{world}|{variant}"
    for world in WORLDS
    for variant in VARIANTS
}
expected_authority = {
    f"ZU_CASE|authority|{world}|{variant}|{role}"
    for world in WORLDS
    for variant in VARIANTS
    for role in ("server", "client")
}


def verify_markers(test: dict, expected: set[str], label: str) -> None:
    messages = info_messages(test)
    observed = [message for message in messages if message.startswith("ZU_CASE|")]
    observed_set = set(observed)
    duplicates = sorted({message for message in observed if observed.count(message) > 1})
    if duplicates:
        fail(f"duplicate {label} coverage marker(s): {', '.join(duplicates)}")
    unexpected = sorted(observed_set - expected)
    missing = sorted(expected - observed_set)
    if unexpected:
        fail(f"unexpected {label} marker(s): {', '.join(unexpected)}")
    if missing:
        fail(f"incomplete {label} coverage; missing {len(missing)} marker(s): {', '.join(missing)}")
    print(f"PASS: {label} coverage markers: {len(observed_set)}/{len(expected)}")


verify_markers(selected["contract"], expected_contract, "contract")
verify_markers(selected["authority"], expected_authority, "authority (15 server + 15 client)")

if summary["succeededWithWarnings"]:
    print(f"WARN: report records {summary['succeededWithWarnings']} test(s) succeeded with warnings")
if summary["notRun"]:
    print(f"WARN: report records {summary['notRun']} test(s) not run; required Zu tests all passed")
print(
    f"PASS: Unreal Automation report {report_path}; required tests succeeded; "
    f"summary succeeded={summary['succeeded']}, "
    f"succeededWithWarnings={summary['succeededWithWarnings']}, failed=0"
)
PY
