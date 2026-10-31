"""Synthetic fixtures for static weapon-source audit behavior, not gameplay evidence."""

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "audit_weapon_source_divergence.py"
SPEC = importlib.util.spec_from_file_location("audit_weapon_source_divergence", SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(AUDIT)

CSV_FIELDS = [
    "WeaponID", "Name", "Category", "Slot", "Rarity", "Damage", "FireRate",
    "Accuracy", "Range", "Mag", "Reload", "Headshot", "AmmoType", "DPS",
    "SpreadAngle", "RecoilScale", "MuzzleVelocity",
]


def fixture_weapon(weapon_id="WPN_Test", *, damage=40, fire_rate=600, pellets=1):
    return {
        "id": weapon_id,
        "name": "Test Weapon",
        "damage": damage,
        "fire_rate": fire_rate,
        "range": 50,
        "mag": 30,
        "reload": 2,
        "headshot_multiplier": 2,
        "pellet_count": pellets,
    }


class WeaponSourceAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.weapons_dir = self.root / "components_dev/weapons"
        self.weapons_dir.mkdir(parents=True)
        weapon = fixture_weapon()
        (self.weapons_dir / "weapons_manifest.json").write_text(
            json.dumps({"weapon_count": 1, "weapons": [{"id": weapon["id"]}]}),
            encoding="utf-8",
        )
        (self.weapons_dir / f"{weapon['id']}.json").write_text(
            json.dumps(weapon), encoding="utf-8"
        )

        data_table = self.root / "Unreal/KhaaosRun/Content/DataTables/DT_WeaponBalance.csv"
        data_table.parent.mkdir(parents=True)
        self.data_table = data_table
        self.write_datatable([self.csv_row(damage=40)])

        mvp_path = self.root / "scripts/mvp/step4_3d_assets/asset_manifest_mvp.json"
        mvp_path.parent.mkdir(parents=True)
        self.mvp_path = mvp_path
        self.write_mvp([{"id": "WPN_Test", "gameplay": {
            "damage": 120, "fire_rate_rpm": 60, "magazine_size": 2,
            "reload_time_s": 3.5, "effective_range_m": 15,
            "headshot_multiplier": 1.2, "pellet_count": 8,
        }}])
        (self.root / "Unreal/KhaaosRun/Content/Weapons").mkdir(parents=True)

    def csv_row(self, *, weapon_id="WPN_Test", damage=40):
        return {
            "WeaponID": weapon_id,
            "Name": "Test Weapon",
            "Category": "TEST",
            "Slot": "PRIMARY",
            "Rarity": "RARO",
            "Damage": str(damage),
            "FireRate": "600",
            "Accuracy": "70",
            "Range": "50",
            "Mag": "30",
            "Reload": "2",
            "Headshot": "2",
            "AmmoType": "TEST",
            "DPS": "400",
            "SpreadAngle": "1",
            "RecoilScale": "1",
            "MuzzleVelocity": "500",
        }

    def write_datatable(self, rows):
        with self.data_table.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    def write_mvp(self, weapons):
        self.mvp_path.write_text(json.dumps({"weapons": weapons}), encoding="utf-8")

    def test_report_exposes_raw_conflicts_and_never_selects_authority(self):
        report = AUDIT.build_report(self.root)
        self.assertEqual(report["authority_status"], "UNRESOLVED")
        self.assertIsNone(report["canonical_source"])
        self.assertFalse(report["runtime_loading_proven"])
        self.assertEqual(report["audit_status"], "CONFLICTS_DETECTED")
        self.assertGreater(report["conflicting_weapon_field_pairs"], 0)
        row = report["comparisons"][0]
        self.assertEqual(row["weapon_id"], "WPN_Test")
        self.assertEqual(row["field_conflicts"]["damage"]["components_dev_json"], 40)
        self.assertEqual(row["field_conflicts"]["damage"]["mvp_asset_manifest"], 120)

    def test_agreement_and_uasset_presence_still_do_not_prove_runtime_loading(self):
        mvp = [{"id": "WPN_Test", "gameplay": {
            "damage": 40, "fire_rate_rpm": 600, "magazine_size": 30,
            "reload_time_s": 2, "effective_range_m": 50,
            "headshot_multiplier": 2, "pellet_count": 1,
        }}]
        self.write_mvp(mvp)
        marker = self.root / "Unreal/KhaaosRun/Content/Weapons/ImportedWeapon.uasset"
        marker.write_bytes(b"test fixture only")

        report = AUDIT.build_report(self.root)
        self.assertEqual(report["audit_status"], "NO_RAW_VALUE_CONFLICTS_DETECTED")
        self.assertEqual(report["runtime_content_evidence"]["interpretation"], "UE_FILES_PRESENT_UNVALIDATED")
        self.assertFalse(report["runtime_loading_proven"])
        self.assertEqual(report["authority_status"], "UNRESOLVED")

    def test_duplicate_datatable_ids_are_rejected(self):
        self.write_datatable([self.csv_row(), self.csv_row()])
        with self.assertRaisesRegex(AUDIT.AuditError, "ID duplicado"):
            AUDIT.build_report(self.root)

    def test_missing_datatable_column_is_rejected(self):
        with self.data_table.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["WeaponID", "Damage"], lineterminator="\n")
            writer.writeheader()
            writer.writerow({"WeaponID": "WPN_Test", "Damage": "40"})
        with self.assertRaisesRegex(AUDIT.AuditError, "colunas ausentes"):
            AUDIT.build_report(self.root)

    def test_manifest_file_mismatch_is_rejected(self):
        (self.weapons_dir / "WPN_Orphan.json").write_text(
            json.dumps(fixture_weapon("WPN_Orphan")), encoding="utf-8"
        )
        with self.assertRaisesRegex(AUDIT.AuditError, "manifesto/arquivos divergem"):
            AUDIT.build_report(self.root)


if __name__ == "__main__":
    unittest.main()
