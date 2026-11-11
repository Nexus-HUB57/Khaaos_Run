import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import validate_operator_hero


def valid_candidate():
    return {
        "operativeId": "KhaelVance",
        "seed": 42,
        "profile": "medium",
        "bodyType": "human",
        "pivots": {"hips": 0.84, "neck": 1.68},
        "anatomy": {
            "heightCm": 182,
            "massKg": 82,
            "headToBodyRatio": 0.14,
            "shoulderWidth": 0.5,
            "hipWidth": 0.4,
            "limbProportion": 0.7,
        },
        "geometry": {
            "continuousMesh": True,
            "eyesAligned": True,
            "fingersSeparated": True,
            "floatingParts": False,
            "nonManifold": False,
            "fusedFingers": False,
        },
        "rig": {
            "orphanWeights": 0,
            "missingBones": 0,
            "maxInfluences": 4,
            "bindPoseValid": True,
        },
        "deformation": {
            "tests": {
                name: True
                for name in validate_operator_hero.REQUIRED_DEFORMATION_TESTS
            },
            "criticalIntersections": 0,
            "footSlidingCm": 1.0,
        },
        "facial": {
            "blendshapes": sorted(validate_operator_hero.REQUIRED_BLENDSHAPES),
            "eyeLidPenetration": False,
            "jawBreak": False,
            "mouthClosedAtRest": True,
        },
        "ik": {
            "invertedKnees": 0,
            "handAlignmentErrorCm": 1.0,
            "footContactErrorCm": 1.0,
        },
        "performance": {
            "fullTriangles": 100_000,
            "proxyTriangles": 800,
            "fullDrawCalls": 10,
            "frameMs100": 20.0,
        },
        "humanReview": {"approved": True},
    }


class OperatorHeroManifestValidationTest(unittest.TestCase):
    def test_valid_manifest_is_accepted(self):
        result = validate_operator_hero.validate_candidate(valid_candidate())
        self.assertTrue(result["accepted"], result["rejections"])

    def test_boolean_values_are_rejected_for_integer_metrics(self):
        cases = (
            ("performance", "fullTriangles", True),
            ("performance", "proxyTriangles", True),
            ("performance", "fullDrawCalls", True),
            ("rig", "maxInfluences", True),
            ("rig", "orphanWeights", False),
            ("rig", "missingBones", False),
            ("deformation", "criticalIntersections", False),
            ("ik", "invertedKnees", False),
        )
        for section, field, value in cases:
            with self.subTest(section=section, field=field):
                candidate = valid_candidate()
                candidate[section][field] = value
                result = validate_operator_hero.validate_candidate(candidate)
                self.assertFalse(result["accepted"])

    def test_negative_performance_and_error_metrics_are_rejected(self):
        cases = (
            ("performance", "fullTriangles", -1),
            ("performance", "proxyTriangles", -1),
            ("performance", "fullDrawCalls", -1),
            ("performance", "frameMs100", -0.1),
            ("deformation", "footSlidingCm", -0.1),
            ("ik", "handAlignmentErrorCm", -0.1),
            ("ik", "footContactErrorCm", -0.1),
        )
        for section, field, value in cases:
            with self.subTest(section=section, field=field):
                candidate = valid_candidate()
                candidate[section][field] = value
                result = validate_operator_hero.validate_candidate(candidate)
                self.assertFalse(result["accepted"])

    def test_malformed_nested_sections_return_rejections_not_exceptions(self):
        for section in (
            "pivots",
            "anatomy",
            "geometry",
            "rig",
            "deformation",
            "facial",
            "ik",
            "performance",
            "humanReview",
        ):
            with self.subTest(section=section):
                candidate = valid_candidate()
                candidate[section] = None
                result = validate_operator_hero.validate_candidate(candidate)
                self.assertFalse(result["accepted"])
                self.assertTrue(
                    any(section in rejection for rejection in result["rejections"]),
                    result["rejections"],
                )

    def test_malformed_deformation_tests_and_blendshape_entries_are_rejected(self):
        candidate = valid_candidate()
        candidate["deformation"]["tests"] = []
        candidate["facial"]["blendshapes"] = [
            *sorted(validate_operator_hero.REQUIRED_BLENDSHAPES),
            {"not": "a string"},
        ]
        result = validate_operator_hero.validate_candidate(candidate)
        self.assertFalse(result["accepted"])
        self.assertTrue(any("deformation.tests" in rejection for rejection in result["rejections"]))
        self.assertTrue(any("entries must be strings" in rejection for rejection in result["rejections"]))

    def test_non_numeric_anatomy_values_are_rejected_without_type_error(self):
        candidate = valid_candidate()
        candidate["anatomy"]["heightCm"] = "182"
        result = validate_operator_hero.validate_candidate(candidate)
        self.assertFalse(result["accepted"])
        self.assertTrue(any("heightCm" in rejection for rejection in result["rejections"]))


if __name__ == "__main__":
    unittest.main()
