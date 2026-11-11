import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_cigkv_map_coordinates as validator


def valid_map():
    return {
        "level_name": "TestMap",
        "coordinate_system": "UE5_LEFT_HANDED_Z_UP",
        "unit": "cm",
        "coordinate_origin": {"x": 0, "y": 0, "z": 0},
        "world_bounds": {
            "min": {"x": 0, "y": 0, "z": 0},
            "max": {"x": 100, "y": 100, "z": 50},
        },
        "map_size": {"x": 100, "y": 100, "z": 50},
        "sectors": [
            {"name": "Arena", "bounds": {"min_x": 0, "max_x": 100, "min_y": 0, "max_y": 100}}
        ],
        "spawn_points": [
            {"id": 1, "x": 10, "y": 20, "z": 0, "sector": "Arena", "rotation": 90}
        ],
        "zex_zones": [
            {"id": 1, "x": 30, "y": 30, "radius": 5, "sector": "Arena"}
        ],
        "loot_spawn_points": [
            {"id": 1, "x": 40, "y": 50, "z": 0, "rarity": "common"}
        ],
        "zone_phases": [
            {"phase": 1, "center": {"x": 50, "y": 50}}
        ],
    }


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, allow_nan=True), encoding="utf-8")


class CIGKVMapCoordinateValidationTest(unittest.TestCase):
    def validate_temp(self, data, allow_legacy=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "map.json"
        write_json(path, data)
        result, loaded = validator.validate_document(path, allow_legacy_contract=allow_legacy)
        return result, loaded

    def codes(self, result, severity="errors"):
        return {issue["code"] for issue in result[severity]}

    def test_valid_explicit_coordinate_contract_is_load_ready(self):
        result, loaded = self.validate_temp(valid_map())
        self.assertIsNotNone(loaded)
        self.assertEqual(result["errors"], [])
        self.assertTrue(result["coordinate_contract_complete"])
        self.assertTrue(result["safe_to_load_into_unreal"])

    def test_missing_origin_and_world_bounds_block_strict_load(self):
        data = valid_map()
        del data["coordinate_origin"]
        del data["world_bounds"]
        result, _ = self.validate_temp(data)
        self.assertIn("missing_coordinate_origin", self.codes(result))
        self.assertIn("missing_world_bounds", self.codes(result))
        self.assertFalse(result["safe_to_load_into_unreal"])

    def test_legacy_opt_in_is_diagnostic_and_never_marks_load_ready(self):
        data = valid_map()
        del data["coordinate_origin"]
        del data["world_bounds"]
        result, _ = self.validate_temp(data, allow_legacy=True)
        self.assertEqual(result["errors"], [])
        self.assertIn("missing_coordinate_origin", self.codes(result, "warnings"))
        self.assertIn("missing_world_bounds", self.codes(result, "warnings"))
        self.assertFalse(result["safe_to_load_into_unreal"])

    def test_boolean_missing_and_out_of_bounds_coordinates_are_rejected(self):
        data = valid_map()
        data["spawn_points"][0]["z"] = True
        data["loot_spawn_points"].append({"id": 2, "x": 50, "y": 50})
        data["loot_spawn_points"].append({"id": 3, "x": 101, "y": 50, "z": 0})
        result, _ = self.validate_temp(data)
        self.assertIn("invalid_coordinate", self.codes(result))
        self.assertIn("missing_coordinate", self.codes(result))
        self.assertIn("coordinate_out_of_bounds", self.codes(result))

    def test_duplicate_spawn_id_and_exact_spawn_coordinate_are_rejected(self):
        data = valid_map()
        data["spawn_points"].append(copy.deepcopy(data["spawn_points"][0]))
        result, _ = self.validate_temp(data)
        self.assertIn("duplicate_record_id", self.codes(result))
        self.assertIn("duplicate_coordinates", self.codes(result))

    def test_unknown_sector_and_zex_radius_crossing_world_bounds_are_rejected(self):
        data = valid_map()
        data["spawn_points"][0]["sector"] = "MissingSector"
        data["zex_zones"][0].update({"x": 98, "y": 50, "radius": 5})
        result, _ = self.validate_temp(data)
        self.assertIn("unknown_sector", self.codes(result))
        self.assertIn("radius_out_of_bounds", self.codes(result))

    def test_non_standard_nan_constant_is_not_accepted_as_json(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "nan.json"
        path.write_text('{"value": NaN}', encoding="utf-8")
        result, loaded = validator.validate_document(path)
        self.assertIsNone(loaded)
        self.assertIn("json_load_failed", self.codes(result))

    def test_coordinate_drift_between_copies_blocks_combined_report(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        first = valid_map()
        second = copy.deepcopy(first)
        second["spawn_points"][0]["x"] = 11
        first_path = Path(temp.name) / "config/map.json"
        second_path = Path(temp.name) / "content/map.json"
        write_json(first_path, first)
        write_json(second_path, second)

        report = validator.build_report([first_path, second_path])
        self.assertEqual(report["coordinate_copy_parity"], "DIVERGED")
        self.assertIn("coordinate_copy_drift", {issue["code"] for issue in report["cross_file_errors"]})
        self.assertFalse(report["safe_to_load_into_unreal"])

    def test_single_input_does_not_claim_copy_parity(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "map.json"
        write_json(path, valid_map())
        report = validator.build_report([path])
        self.assertEqual(report["coordinate_copy_parity"], "NOT_COMPARED")

    def test_record_order_does_not_create_coordinate_copy_drift(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        first = valid_map()
        second = copy.deepcopy(first)
        for key in ("sectors", "spawn_points", "zex_zones", "loot_spawn_points", "zone_phases"):
            second[key].reverse()
        first_path = Path(temp.name) / "config/map.json"
        second_path = Path(temp.name) / "content/map.json"
        write_json(first_path, first)
        write_json(second_path, second)

        report = validator.build_report([first_path, second_path])
        self.assertEqual(report["coordinate_copy_parity"], "MATCH")
        self.assertTrue(report["safe_to_load_into_unreal"])

    def test_repository_json_copies_match_but_are_blocked_without_coordinate_contract(self):
        report = validator.build_report(list(validator.DEFAULT_INPUTS))
        self.assertEqual(report["coordinate_copy_parity"], "MATCH")
        self.assertFalse(report["safe_to_load_into_unreal"])
        for file_report in report["files"]:
            self.assertEqual(file_report["counts"]["spawn_points"], 50)
            self.assertEqual(file_report["counts"]["zex_zones"], 15)
            self.assertIn("missing_coordinate_origin", self.codes(file_report))
            self.assertIn("missing_world_bounds", self.codes(file_report))

    def test_current_repository_coordinates_pass_bounds_only_in_explicit_legacy_mode(self):
        report = validator.build_report(list(validator.DEFAULT_INPUTS), allow_legacy_contract=True)
        for file_report in report["files"]:
            self.assertEqual(file_report["errors"], [])
            self.assertFalse(file_report["safe_to_load_into_unreal"])


if __name__ == "__main__":
    unittest.main()
