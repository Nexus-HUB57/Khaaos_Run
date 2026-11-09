#!/usr/bin/env python3
"""Validate a generated Khaaos Run operator hero candidate manifest.

The validator is intentionally engine-independent: DCC/export pipelines can emit
one JSON manifest, then CI can reject unsafe geometry, rigging, facial, IK or
performance metrics before the asset is imported into the runtime.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

EPSILON = 0.02
REQUIRED_PROFILE_FIELDS = {"operativeId", "seed", "profile", "bodyType"}
REQUIRED_DEFORMATION_TESTS = {
    "blink",
    "run",
    "aim",
    "fall",
    "recovery",
    "footPlanting",
}
REQUIRED_BLENDSHAPES = {
    "blink_l",
    "blink_r",
    "jaw_open",
    "lip_press",
    "brow_down_l",
    "brow_down_r",
}


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def check(report: dict[str, Any], condition: bool, message: str) -> None:
    if not condition:
        report["rejections"].append(message)


def validate_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    report: dict[str, Any] = {"accepted": True, "rejections": [], "warnings": []}
    check(report, isinstance(candidate, dict), "manifest must be a JSON object")
    if report["rejections"]:
        report["accepted"] = False
        return report

    missing = sorted(REQUIRED_PROFILE_FIELDS - candidate.keys())
    check(report, not missing, f"missing identity fields: {', '.join(missing)}")
    if missing:
        report["accepted"] = False
        return report
    check(report, isinstance(candidate["operativeId"], str) and bool(candidate["operativeId"].strip()), "operativeId must be a non-empty string")
    check(report, isinstance(candidate["seed"], int) and not isinstance(candidate["seed"], bool), "seed must be an integer")
    check(report, isinstance(candidate["profile"], str), "profile must be a string")
    check(report, isinstance(candidate["bodyType"], str), "bodyType must be a string")

    pivots = candidate.get("pivots", {})
    check(report, finite_number(pivots.get("hips")) and abs(pivots["hips"] - 0.84) <= EPSILON, "hip pivot must be 0.84m ± 0.02m")
    check(report, finite_number(pivots.get("neck")) and abs(pivots["neck"] - 1.68) <= EPSILON, "neck pivot must be 1.68m ± 0.02m")

    anatomy = candidate.get("anatomy", {})
    check(report, 140 <= anatomy.get("heightCm", -1) <= 220, "heightCm must be between 140 and 220")
    check(report, 40 <= anatomy.get("massKg", -1) <= 180, "massKg must be between 40 and 180")
    check(report, 0.11 <= anatomy.get("headToBodyRatio", -1) <= 0.16, "headToBodyRatio is outside the human range")
    for key in ("shoulderWidth", "hipWidth", "limbProportion"):
        check(report, 0.20 <= anatomy.get(key, -1) <= 0.90, f"{key} is outside the plausible range")

    geometry = candidate.get("geometry", {})
    for key in ("continuousMesh", "eyesAligned", "fingersSeparated"):
        check(report, geometry.get(key) is True, f"geometry.{key} must be true")
    for key in ("floatingParts", "nonManifold", "fusedFingers"):
        check(report, geometry.get(key) is False, f"geometry.{key} must be false")

    rig = candidate.get("rig", {})
    check(report, rig.get("orphanWeights") == 0, "rig must not contain orphan weights")
    check(report, rig.get("missingBones") == 0, "rig must not reference missing bones")
    check(report, isinstance(rig.get("maxInfluences"), int) and 1 <= rig["maxInfluences"] <= 4, "rig.maxInfluences must be between 1 and 4")
    check(report, rig.get("bindPoseValid") is True, "bind pose is invalid")

    deformation = candidate.get("deformation", {})
    tests = deformation.get("tests", {})
    missing_tests = sorted(name for name in REQUIRED_DEFORMATION_TESTS if tests.get(name) is not True)
    check(report, not missing_tests, f"failed deformation tests: {', '.join(missing_tests)}")
    check(report, deformation.get("criticalIntersections", 1) == 0, "critical clothing/body intersections detected")
    check(report, finite_number(deformation.get("footSlidingCm")) and deformation["footSlidingCm"] <= 2.5, "foot sliding exceeds 2.5cm")

    facial = candidate.get("facial", {})
    blendshapes = set(facial.get("blendshapes", [])) if isinstance(facial.get("blendshapes"), list) else set()
    check(report, REQUIRED_BLENDSHAPES <= blendshapes, "required facial blendshapes are missing")
    check(report, facial.get("eyeLidPenetration") is False, "eyelid penetration detected")
    check(report, facial.get("jawBreak") is False, "jaw deformation break detected")
    check(report, facial.get("mouthClosedAtRest") is True, "mouth must remain closed at rest")

    ik = candidate.get("ik", {})
    check(report, ik.get("invertedKnees") == 0, "inverted knee detected")
    check(report, finite_number(ik.get("handAlignmentErrorCm")) and ik["handAlignmentErrorCm"] <= 3.0, "hand alignment error exceeds 3cm")
    check(report, finite_number(ik.get("footContactErrorCm")) and ik["footContactErrorCm"] <= 2.0, "foot contact error exceeds 2cm")

    performance = candidate.get("performance", {})
    check(report, isinstance(performance.get("fullTriangles"), int) and performance["fullTriangles"] <= 120_000, "fullTriangles exceeds 120000")
    check(report, isinstance(performance.get("proxyTriangles"), int) and performance["proxyTriangles"] <= 900, "proxyTriangles exceeds 900")
    check(report, isinstance(performance.get("fullDrawCalls"), int) and performance["fullDrawCalls"] <= 12, "fullDrawCalls exceeds 12")
    check(report, finite_number(performance.get("frameMs100")) and performance["frameMs100"] <= 33.3, "frameMs100 exceeds the 33.3ms budget")

    report["accepted"] = not report["rejections"]
    if report["accepted"] and not candidate.get("humanReview", {}).get("approved", False):
        report["warnings"].append("candidate passed automated checks but still needs humanReview.approved=true")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="candidate JSON manifest")
    parser.add_argument("--strict-human-review", action="store_true", help="reject candidates without human approval")
    args = parser.parse_args()

    try:
        candidate = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"accepted": False, "rejections": [f"cannot read manifest: {exc}"]}, ensure_ascii=False, indent=2))
        return 2

    report = validate_candidate(candidate)
    if args.strict_human_review and not candidate.get("humanReview", {}).get("approved", False):
        report["accepted"] = False
        report["rejections"].append("human review approval is required in strict mode")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["accepted"] else 1


if __name__ == "__main__":
    sys.exit(main())
