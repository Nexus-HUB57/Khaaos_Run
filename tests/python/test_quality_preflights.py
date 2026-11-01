import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "mvp" / "step4_3d_assets"))

import validate_weapon_balance
import check_visual_readiness


class WeaponBalanceMetricsTest(unittest.TestCase):
    def test_shotgun_uses_all_pellets_and_is_only_theoretical(self):
        weapon = {
            "id": "WPN_TestShotgun",
            "name": "Test Shotgun",
            "category": "SHOTGUN",
            "rarity": "COMMON",
            "damage": 12,
            "fire_rate": 80,
            "headshot_multiplier": 1.2,
            "pellet_count": 9,
            "mag": 6,
            "reload": 4.2,
            "range": 15,
        }
        metrics = validate_weapon_balance.calculate_metrics(weapon)
        self.assertEqual(metrics["dps"], 144.0)
        self.assertEqual(metrics["headshot_dps"], 172.8)
        self.assertEqual(metrics["ttk_100hp"], 0.694)
        self.assertEqual(metrics["mag_burst_damage"], 648)
        self.assertEqual(metrics["sustain_dps"], 74.48)

    def test_invalid_weapon_stats_are_rejected(self):
        with self.assertRaises(validate_weapon_balance.ValidationError):
            validate_weapon_balance.calculate_metrics({"id": "broken"})

    def test_generated_report_is_never_marked_balanced_without_playtests(self):
        with tempfile.TemporaryDirectory() as temp:
            weapons_dir = Path(temp) / "components_dev" / "weapons"
            weapons_dir.mkdir(parents=True)
            weapon = {
                "id": "WPN_TestRifle",
                "name": "Test Rifle",
                "category": "ASSAULT_RIFLE",
                "rarity": "COMMON",
                "damage": 30,
                "fire_rate": 600,
                "headshot_multiplier": 2,
                "pellet_count": 1,
                "mag": 30,
                "reload": 2,
                "range": 50,
            }
            (weapons_dir / "weapons_manifest.json").write_text(
                json.dumps({"weapon_count": 1, "weapons": [{"id": weapon["id"]}]}), encoding="utf-8"
            )
            (weapons_dir / f"{weapon['id']}.json").write_text(json.dumps(weapon), encoding="utf-8")
            report = validate_weapon_balance.build_report(weapons_dir, generated_at="2026-10-25T00:00:00Z")
            self.assertEqual(report["balance_summary"]["balance_status"], "UNVERIFIED")
            self.assertEqual(report["balance_summary"]["evidence_status"], "NO_PLAYTEST_TELEMETRY")
            self.assertEqual(report["weapons"][0]["dps"], 300.0)

    def test_report_validator_rejects_duplicate_weapon_ids(self):
        expected = {
            "evidence_scope": validate_weapon_balance.EVIDENCE_SCOPE,
            "weapons": [{"id": "WPN_A", "name": "A", "category": "RIFLE", "rarity": "COMMON",
                         "tier_rating": "B", "dps": 100.0, "headshot_dps": 200.0,
                         "ttk_100hp": 1.0, "mag_burst_damage": 300, "sustain_dps": 50.0,
                         "range": 50, "pellet_count": 1}],
            "balance_summary": {"max_dps": 100.0, "min_dps": 100.0, "dps_ratio_max_min": 1.0,
                                "avg_dps": 100.0, "weapon_count": 1,
                                "tier_distribution": {"B": 1}},
        }
        actual = json.loads(json.dumps(expected))
        actual["weapons"].append(json.loads(json.dumps(actual["weapons"][0])))
        errors = validate_weapon_balance.validate_report(actual, expected)
        self.assertTrue(any("ID duplicado" in error for error in errors))

    def test_manifest_rejects_non_string_id_before_deduplication(self):
        with tempfile.TemporaryDirectory() as temp:
            weapons_dir = Path(temp)
            (weapons_dir / "weapons_manifest.json").write_text(
                json.dumps({"weapon_count": 1, "weapons": [{"id": []}]}), encoding="utf-8"
            )
            with self.assertRaises(validate_weapon_balance.ValidationError):
                validate_weapon_balance.load_sources(weapons_dir)

    def test_report_validator_rejects_invalid_weapon_rows(self):
        expected = {
            "evidence_scope": validate_weapon_balance.EVIDENCE_SCOPE,
            "weapons": [{"id": "WPN_A", "name": "A", "category": "RIFLE", "rarity": "COMMON",
                         "tier_rating": "B", "dps": 100.0, "headshot_dps": 200.0,
                         "ttk_100hp": 1.0, "mag_burst_damage": 300, "sustain_dps": 50.0,
                         "range": 50, "pellet_count": 1}],
            "balance_summary": {"max_dps": 100.0, "min_dps": 100.0, "dps_ratio_max_min": 1.0,
                                "avg_dps": 100.0, "weapon_count": 1,
                                "tier_distribution": {"B": 1}},
        }
        actual = json.loads(json.dumps(expected))
        actual["weapons"][0] = {"id": []}
        errors = validate_weapon_balance.validate_report(actual, expected)
        self.assertTrue(any("linha de arma inválida" in error for error in errors))


class VisualReadinessTest(unittest.TestCase):
    @staticmethod
    def write_obj(path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
            encoding="utf-8",
        )

    @staticmethod
    def write_tga(path: Path, width: int, height: int):
        path.parent.mkdir(parents=True, exist_ok=True)
        header = bytearray(18)
        header[2] = 2
        header[12:14] = width.to_bytes(2, "little")
        header[14:16] = height.to_bytes(2, "little")
        header[16] = 24
        path.write_bytes(header + bytes(width * height * 3))

    @staticmethod
    def write_asset_report(path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "summary": {"total_vertices": 3, "total_faces": 1},
            "assets": [
                {
                    "asset_id": "WPN_TestRifle",
                    "category": "weapon",
                    "vertices": 3,
                    "faces": 1,
                    "target_polycount": 12000,
                },
                {"asset_id": "VFX_Test", "category": "vfx", "vertices": 0, "faces": 0},
            ],
        }
        path.write_text(json.dumps(report), encoding="utf-8")

    def test_source_assets_are_not_mistaken_for_imported_unreal_content(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            assets = base / "assets"
            report_path = base / "asset_report.json"
            content = base / "Content"
            self.write_asset_report(report_path)
            self.write_obj(assets / "weapons" / "WPN_TestRifle" / "WPN_TestRifle.obj")
            self.write_tga(assets / "vfx" / "VFX_Test" / "texture.tga", 64, 64)
            (content / "WPN_TestRifle_pending_import").parent.mkdir(parents=True, exist_ok=True)
            (content / "WPN_TestRifle_pending_import").write_text("pending", encoding="utf-8")

            result = check_visual_readiness.build_readiness_report(report_path, assets, content)
            self.assertEqual(result["readiness_status"], "BLOCKED_NO_IMPORTED_UE_CONTENT_OR_MAP")
            self.assertTrue(result["source_geometry"]["matches_asset_report_summary"])
            self.assertEqual(result["source_geometry"]["actual_vertices"], 3)
            self.assertEqual(result["textures"]["below_threshold_count"], 1)
            self.assertEqual(result["unreal_content"]["pending_import_count"], 1)

    def test_artifact_presence_is_unvalidated_even_for_empty_unrelated_files(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            assets = base / "assets"
            report_path = base / "asset_report.json"
            content = base / "Content"
            self.write_asset_report(report_path)
            self.write_obj(assets / "weapons" / "WPN_TestRifle" / "WPN_TestRifle.obj")
            content.mkdir(parents=True)
            (content / "Unrelated.uasset").write_bytes(b"")
            (content / "Empty.umap").write_bytes(b"")

            result = check_visual_readiness.build_readiness_report(report_path, assets, content)
            self.assertEqual(result["readiness_status"], "UE_FILES_PRESENT_UNVALIDATED")
            self.assertFalse(result["engine_visual_validation"])


if __name__ == "__main__":
    unittest.main()
