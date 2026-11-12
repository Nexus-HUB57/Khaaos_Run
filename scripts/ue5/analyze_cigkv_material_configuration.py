#!/usr/bin/env python3
"""Analyze the UE5.8 material configuration report without visual overclaiming."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="artifacts/cigkv-vertical-slice/material-configuration-report.json")
    parser.add_argument("--output", default="artifacts/cigkv-vertical-slice/material-configuration-analysis.json")
    args = parser.parse_args()
    source = Path(args.input)
    if not source.is_file():
        report = {"schema": "khaaos.cigkv.material-configuration-analysis/v1", "status": "missing", "input": str(source), "errors": ["configuration_report_missing"], "visual_acceptance": "not_measured"}
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return 2
    data = json.loads(source.read_text())
    errors = list(data.get("errors", []))
    warnings = list(data.get("warnings", []))
    profiles = data.get("subsurface_profiles", [])
    instances = data.get("instances", [])
    if data.get("status") != "pass":
        errors.append(f"configuration_status:{data.get('status')}")
    if not profiles:
        errors.append("no_subsurface_profiles_reported")
    if not instances:
        errors.append("no_material_instances_reported")
    report = {
        "schema": "khaaos.cigkv.material-configuration-analysis/v1",
        "status": "pass" if not errors else "fail",
        "input": str(source),
        "engine_version": data.get("engine_version"),
        "summary": {"profiles": len(profiles), "instances": len(instances), "errors": len(errors), "warnings": len(warnings)},
        "errors": errors,
        "warnings": warnings,
        "visual_acceptance": "pending_screenshot_matrix",
        "next_gate": "execute UE5.8 GPU screenshot matrix and inspect SSS/hair highlights",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
