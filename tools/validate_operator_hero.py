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


def integer_number(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def object_field(
    parent: dict[str, Any], key: str, report: dict[str, Any], label: str | None = None
) -> dict[str, Any]:
    value = parent.get(key, {})
    if not isinstance(value, dict):
        check(report, False, f"{label or key} must be a JSON object")
        return {}
    return value


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

    pivots = object_field(candidate, "pivots", report)
    check(report, finite_number(pivots.get("hips")) and abs(pivots["hips"] - 0.84) <= EPSILON, "hip pivot must be 0.84m ± 0.02m")
    check(report, finite_number(pivots.get("neck")) and abs(pivots["neck"] - 1.68) <= EPSILON, "neck pivot must be 1.68m ± 0.02m")

    anatomy = object_field(candidate, "anatomy", report)
    height_cm = anatomy.get("heightCm")
    mass_kg = anatomy.get("massKg")
    head_to_body_ratio = anatomy.get("headToBodyRatio")
    check(report, finite_number(height_cm) and 140 <= height_cm <= 220, "heightCm must be between 140 and 220")
    check(report, finite_number(mass_kg) and 40 <= mass_kg <= 180, "massKg must be between 40 and 180")
    check(report, finite_number(head_to_body_ratio) and 0.11 <= head_to_body_ratio <= 0.16, "headToBodyRatio is outside the human range")
    for key in ("shoulderWidth", "hipWidth", "limbProportion"):
        value = anatomy.get(key)
        check(report, finite_number(value) and 0.20 <= value <= 0.90, f"{key} is outside the plausible range")

    geometry = object_field(candidate, "geometry", report)
    for key in ("continuousMesh", "eyesAligned", "fingersSeparated"):
        check(report, geometry.get(key) is True, f"geometry.{key} must be true")
    for key in ("floatingParts", "nonManifold", "fusedFingers"):
        check(report, geometry.get(key) is False, f"geometry.{key} must be false")

    rig = object_field(candidate, "rig", report)
    check(report, integer_number(rig.get("orphanWeights")) and rig["orphanWeights"] == 0, "rig must not contain orphan weights")
    check(report, integer_number(rig.get("missingBones")) and rig["missingBones"] == 0, "rig must not reference missing bones")
    check(report, integer_number(rig.get("maxInfluences")) and 1 <= rig["maxInfluences"] <= 4, "rig.maxInfluences must be between 1 and 4")
    check(report, rig.get("bindPoseValid") is True, "bind pose is invalid")

    deformation = object_field(candidate, "deformation", report)
    tests = object_field(deformation, "tests", report, "deformation.tests")
    missing_tests = sorted(name for name in REQUIRED_DEFORMATION_TESTS if tests.get(name) is not True)
    check(report, not missing_tests, f"failed deformation tests: {', '.join(missing_tests)}")
    critical_intersections = deformation.get("criticalIntersections", 1)
    check(report, integer_number(critical_intersections) and critical_intersections == 0, "critical clothing/body intersections detected")
    check(report, finite_number(deformation.get("footSlidingCm")) and 0 <= deformation["footSlidingCm"] <= 2.5, "foot sliding exceeds 2.5cm or is negative")

    facial = object_field(candidate, "facial", report)
    raw_blendshapes = facial.get("blendshapes", [])
    if not isinstance(raw_blendshapes, list):
        check(report, False, "facial.blendshapes must be an array")
        raw_blendshapes = []
    elif not all(isinstance(name, str) for name in raw_blendshapes):
        check(report, False, "facial.blendshapes entries must be strings")
    blendshapes = {name for name in raw_blendshapes if isinstance(name, str)}
    check(report, REQUIRED_BLENDSHAPES <= blendshapes, "required facial blendshapes are missing")
    check(report, facial.get("eyeLidPenetration") is False, "eyelid penetration detected")
    check(report, facial.get("jawBreak") is False, "jaw deformation break detected")
    check(report, facial.get("mouthClosedAtRest") is True, "mouth must remain closed at rest")

    ik = object_field(candidate, "ik", report)
    inverted_knees = ik.get("invertedKnees")
    check(report, integer_number(inverted_knees) and inverted_knees == 0, "inverted knee detected")
    check(report, finite_number(ik.get("handAlignmentErrorCm")) and 0 <= ik["handAlignmentErrorCm"] <= 3.0, "hand alignment error exceeds 3cm or is negative")
    check(report, finite_number(ik.get("footContactErrorCm")) and 0 <= ik["footContactErrorCm"] <= 2.0, "foot contact error exceeds 2cm or is negative")

    performance = object_field(candidate, "performance", report)
    check(report, integer_number(performance.get("fullTriangles")) and 0 <= performance["fullTriangles"] <= 120_000, "fullTriangles must be between 0 and 120000")
    check(report, integer_number(performance.get("proxyTriangles")) and 0 <= performance["proxyTriangles"] <= 900, "proxyTriangles must be between 0 and 900")
    check(report, integer_number(performance.get("fullDrawCalls")) and 0 <= performance["fullDrawCalls"] <= 12, "fullDrawCalls must be between 0 and 12")
    check(report, finite_number(performance.get("frameMs100")) and 0 <= performance["frameMs100"] <= 33.3, "frameMs100 must be between 0 and 33.3ms")

    human_review = object_field(candidate, "humanReview", report)
    report["accepted"] = not report["rejections"]
    if report["accepted"] and human_review.get("approved") is not True:
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
    human_review = candidate.get("humanReview", {}) if isinstance(candidate, dict) else {}
    approved = isinstance(human_review, dict) and human_review.get("approved") is True
    if args.strict_human_review and not approved:
        report["accepted"] = False
        report["rejections"].append("human review approval is required in strict mode")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["accepted"] else 1


if __name__ == "__main__":
    sys.exit(main())
