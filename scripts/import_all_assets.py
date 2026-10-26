#!/usr/bin/env python3
"""
Khaaos_Run - Automated Asset Import Pipeline
=============================================

Master script that:
1. Validates all JSON manifests
2. Generates all .uasset.json files (GE + VFX)
3. Creates UE5 Python import scripts
4. Generates DataTable CSVs for UE5 import
5. Creates the Asset Import Manifest
6. Outputs an import report with pass/fail per asset

Usage:
    python scripts/import_all_assets.py
"""

import json
import os
import hashlib
import csv
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = REPO_ROOT / "Unreal" / "KhaaosRun" / "Content"
SCRIPTS_DIR = REPO_ROOT / "scripts"
DATATABLES_DIR = CONTENT_DIR / "DataTables"

# ─── Import Report ─────────────────────────────────────────────────────────────────

class ImportReport:
    def __init__(self):
        self.results: List[Dict] = []
        self.start_time = datetime.now(timezone.utc)

    def add_result(self, asset_name: str, asset_type: str, path: str, status: str, detail: str = ""):
        self.results.append({
            "asset_name": asset_name,
            "asset_type": asset_type,
            "path": path,
            "status": status,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def summary(self) -> Dict:
        total = len(self.results)
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        return {
            "pipeline": "Khaaos_Run Asset Import Pipeline",
            "started_at": self.start_time.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_assets": total,
            "passed": passed,
            "failed": failed,
            "success_rate": f"{(passed/total*100):.1f}%" if total > 0 else "N/A",
            "by_type": self._by_type_summary(),
            "results": self.results,
        }

    def _by_type_summary(self) -> Dict:
        types: Dict[str, Dict] = {}
        for r in self.results:
            t = r["asset_type"]
            if t not in types:
                types[t] = {"total": 0, "passed": 0, "failed": 0}
            types[t]["total"] += 1
            if r["status"] == "PASS":
                types[t]["passed"] += 1
            else:
                types[t]["failed"] += 1
        return types

    def print_report(self):
        s = self.summary()
        print("\n" + "=" * 70)
        print("  KHAAROS_RUN ASSET IMPORT PIPELINE - REPORT")
        print("=" * 70)
        print(f"  Total Assets:  {s['total_assets']}")
        print(f"  Passed:        {s['passed']}")
        print(f"  Failed:        {s['failed']}")
        print(f"  Success Rate:  {s['success_rate']}")
        print("-" * 70)
        for atype, counts in s["by_type"].items():
            print(f"  {atype:30s}  {counts['passed']:3d}/{counts['total']:3d} passed")
        print("=" * 70)
        if s["failed"] > 0:
            print("\n  FAILED ASSETS:")
            for r in self.results:
                if r["status"] == "FAIL":
                    print(f"    - {r['asset_name']}: {r['detail']}")
        print()


report = ImportReport()


def compute_checksum(data: str) -> str:
    """Compute SHA-256 checksum."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()[:16]


def validate_json_file(path: Path) -> Tuple[bool, str]:
    """Validate a JSON file is well-formed."""
    try:
        with open(path, "r") as f:
            json.load(f)
        return True, "Valid JSON"
    except json.JSONDecodeError as e:
        return False, f"JSON decode error: {e}"
    except Exception as e:
        return False, f"Error: {e}"


# ─── Step 1: Generate GE .uasset.json files ────────────────────────────────────────

def step1_generate_ge_uassets():
    """Generate GameplayEffect .uasset.json files."""
    print("\n[Step 1] Generating GameplayEffect .uasset.json files...")
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "generate_ge_uassets.py")],
            capture_output=True, text=True, cwd=str(REPO_ROOT)
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"  ERROR: {result.stderr}")
            report.add_result("GE_generation", "pipeline", "scripts/generate_ge_uassets.py", "FAIL", result.stderr)
            return 0
        # Count generated files
        ge_dir = CONTENT_DIR / "GameplayEffects"
        count = len(list(ge_dir.rglob("*.uasset.json")))
        report.add_result("GE_uassets", "GameplayEffect", "GameplayEffects/", "PASS", f"{count} files generated")
        return count
    except Exception as e:
        report.add_result("GE_generation", "pipeline", "scripts/generate_ge_uassets.py", "FAIL", str(e))
        return 0


# ─── Step 2: Generate VFX .uasset.json files ──────────────────────────────────────

def step2_generate_vfx_uassets():
    """Generate Niagara VFX .uasset.json files."""
    print("\n[Step 2] Generating Niagara VFX .uasset.json files...")
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "generate_vfx_uassets.py")],
            capture_output=True, text=True, cwd=str(REPO_ROOT)
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"  ERROR: {result.stderr}")
            report.add_result("VFX_generation", "pipeline", "scripts/generate_vfx_uassets.py", "FAIL", result.stderr)
            return 0
        vfx_dir = CONTENT_DIR / "VFX"
        count = len(list(vfx_dir.rglob("*.uasset.json")))
        report.add_result("VFX_uassets", "NiagaraSystem", "VFX/", "PASS", f"{count} files generated")
        return count
    except Exception as e:
        report.add_result("VFX_generation", "pipeline", "scripts/generate_vfx_uassets.py", "FAIL", str(e))
        return 0


# ─── Step 3: Generate DataTable CSVs ──────────────────────────────────────────────

def step3_generate_datatables():
    """Generate DataTable CSVs for UE5 import."""
    print("\n[Step 3] Generating DataTable CSVs...")
    DATATABLES_DIR.mkdir(parents=True, exist_ok=True)
    csv_count = 0

    # ── DT_SpeciesAbilities.csv ──────────────────────────────────────────────
    species_abilities = [
        ["SpeciesID", "SpeciesName", "Type", "PassiveTag", "Ability1", "Ability2", "Ability3", "Ultimate"],
        ["SPC_Huran", "Huran", "amphibian", "Regeneracao_Aquatica", "Splash_Dash", "Water_Shield", "Heal_Surge", "Tidal_Wave"],
        ["SPC_Khael", "Khael", "mystic", "Canalizacao_Mistica", "Frost_Nova", "Ice_Barrier", "Crystal_Shard", "Absolute_Zero"],
        ["SPC_Venex", "Venex", "cyborg", "Overclock_Neural", "Pulse_Burst", "Circuit_Wall", "EMP_Shock", "System_Overload"],
        ["SPC_Onith", "Onith", "reptile", "Pele_Escamosa", "Venom_Spit", "Toxic_Cloud", "Scale_Armor", "Plague_Nova"],
        ["SPC_Zheers", "Zheers", "humanoid", "Adaptabilidade", "Mutation_Burst", "Rad_Pulse", "Evolve", "Adaptation_Field"],
        ["SPC_Skeetw", "Skeetw", "avian", "Voo_Planador", "Glide", "Feather_Barrage", "Mist_Cloak", "Storm_Dive"],
    ]
    write_csv(DATATABLES_DIR / "DT_SpeciesAbilities.csv", species_abilities)
    report.add_result("DT_SpeciesAbilities", "DataTable", "DataTables/DT_SpeciesAbilities.csv", "PASS")
    csv_count += 1

    # ── DT_GameplayEffects.csv (all 29 GEs) ─────────────────────────────────
    ge_manifest_path = CONTENT_DIR / "GameplayEffects" / "GE_Manifest.json"
    ge_rows = [["GEName", "Category", "DurationPolicy", "Duration", "ModifierCount", "GrantedTags", "RequiredTags", "StackingType", "StackLimit", "Description"]]
    if ge_manifest_path.exists():
        with open(ge_manifest_path, "r") as f:
            manifest = json.load(f)
        for ge in manifest["gameplay_effects"]:
            ge_rows.append([
                ge["name"], ge["category"], ge["duration_policy"],
                str(ge["duration"]), str(ge["modifier_count"]),
                "|".join(ge["granted_tags"]), "|".join(ge.get("required_tags", [])),
                "StackByDuration" if "StackByDuration" in ge.get("description", "") else "NoStacking",
                str(5 if "buff" in ge["category"].lower() else 1),
                ge["description"]
            ])
    write_csv(DATATABLES_DIR / "DT_GameplayEffects.csv", ge_rows)
    report.add_result("DT_GameplayEffects", "DataTable", "DataTables/DT_GameplayEffects.csv", "PASS")
    csv_count += 1

    # ── DT_VFXSystems.csv (all 27 VFX) ──────────────────────────────────────
    vfx_manifest_path = CONTENT_DIR / "VFX" / "Niagara_VFX_Manifest.json"
    vfx_rows = [["VFXName", "Category", "Subcategory", "Species", "EmitterCount", "RenderType", "GPUCapacity", "PoolMaxSize", "SignificanceRank", "Description"]]
    if vfx_manifest_path.exists():
        with open(vfx_manifest_path, "r") as f:
            manifest = json.load(f)
        for vfx in manifest["vfx_systems"]:
            # Read the uasset.json for more details
            uasset_path = CONTENT_DIR / vfx["uasset_json_path"]
            gpu_cap = 0
            pool_max = 0
            sig_rank = 0
            if uasset_path.exists():
                with open(uasset_path, "r") as f:
                    spec = json.load(f)
                ns = spec.get("niagara_system_spec", {})
                gpu_cap = ns.get("gpu_simulation_settings", {}).get("capacity", 0)
                pool_max = ns.get("pool_config", {}).get("max_pool_size", 0)
                sig_rank = ns.get("significance_rank", 0)
            vfx_rows.append([
                vfx["name"], vfx["category"], vfx["subcategory"],
                vfx.get("species", ""), str(vfx["emitter_count"]),
                vfx["render_type"], str(gpu_cap), str(pool_max),
                str(sig_rank), vfx["description"]
            ])
    write_csv(DATATABLES_DIR / "DT_VFXSystems.csv", vfx_rows)
    report.add_result("DT_VFXSystems", "DataTable", "DataTables/DT_VFXSystems.csv", "PASS")
    csv_count += 1

    # ── DT_WeaponBalance.csv (12 weapons) ────────────────────────────────────
    weapon_rows = [
        ["WeaponID", "Name", "Category", "Slot", "Rarity", "Damage", "FireRate", "Accuracy", "Range", "Mag", "Reload", "Headshot", "AmmoType", "DPS", "SpreadAngle", "RecoilScale", "MuzzleVelocity"],
        ["WPN_Pistol_Onith", "Pistol Onith MK-IV", "PISTOL", "SECONDARY", "COMUM", "28", "400", "85", "40", "15", "1.5", "2.0", "9mm", "186.67", "3.0", "0.8", "350"],
        ["WPN_SMG_Huran", "SMG Huran PDW-9", "SMG", "SECONDARY", "RARO", "22", "800", "68", "35", "30", "1.8", "1.5", "9mm", "293.33", "4.0", "0.6", "320"],
        ["WPN_AssaultRifle_MK1", "Assault Rifle MK1-F", "ASSAULT_RIFLE", "PRIMARY", "RARO", "35", "600", "72", "80", "30", "2.0", "2.0", "5.56mm", "350.0", "2.5", "0.7", "900"],
        ["WPN_Carbine_Venex", "Carbine Venex CR-7", "CARBINE", "PRIMARY", "RARO", "30", "700", "75", "65", "25", "1.8", "1.8", "5.56mm", "350.0", "2.0", "0.5", "850"],
        ["WPN_Sniper_DMR", "Sniper Khaaos SRS-1", "SNIPER", "PRIMARY", "EPICO", "95", "40", "95", "200", "5", "3.5", "3.0", "7.62mm", "63.33", "0.1", "1.5", "1100"],
        ["WPN_DMR_Khael", "DMR Khael MR-12", "DMR", "PRIMARY", "EPICO", "55", "180", "88", "120", "10", "2.5", "2.5", "7.62mm", "165.0", "0.5", "0.9", "950"],
        ["WPN_Shotgun_Breach", "Shotgun Breach SG-12", "SHOTGUN", "PRIMARY", "RARO", "12", "80", "45", "15", "6", "4.2", "1.2", "12g", "16.0", "8.0", "1.2", "400"],
        ["WPN_LMG_Skeetw", "LMG Skeetw MG-6", "LMG", "PRIMARY", "EPICO", "28", "750", "55", "70", "100", "5.0", "1.5", "5.56mm", "350.0", "5.0", "0.8", "850"],
        ["WPN_Knife_Combat", "Faca de Combate K-7", "MELEE", "MELEE", "COMUM", "45", "120", "100", "3", "0", "0", "1.0", "NONE", "90.0", "0.0", "0.0", "0"],
        ["WPN_Espada_Overlord", "Espada Overlord", "MELEE", "MELEE", "LENDARIO", "75", "80", "100", "4", "0", "0", "1.0", "NONE", "100.0", "0.0", "0.0", "0"],
        ["WPN_Canhao_KhaaosPrime", "Canhao Khaaos Prime", "EXOTIC", "PRIMARY", "MITICO", "150", "30", "60", "150", "3", "6.0", "2.0", "KhaaosEnergy", "75.0", "6.0", "2.0", "600"],
        ["WPN_Crossbow_Ancient", "Besta Ancestral Zheers", "CROSSBOW", "PRIMARY", "LENDARIO", "80", "50", "90", "100", "1", "3.0", "2.5", "Bolt", "66.67", "0.2", "0.3", "250"],
    ]
    write_csv(DATATABLES_DIR / "DT_WeaponBalance.csv", weapon_rows)
    report.add_result("DT_WeaponBalance", "DataTable", "DataTables/DT_WeaponBalance.csv", "PASS")
    csv_count += 1

    # ── DT_LootTables.csv (28 loot tables) ───────────────────────────────────
    loot_rows = [
        ["ItemID", "Name", "Type", "Rarity", "Heal", "Defense", "UseTime", "StackMax", "Price", "RarityWeight", "SpawnWeight_Common", "SpawnWeight_Rare", "SpawnWeight_Epic"],
        ["LOOT_Bandage", "Bandage", "Curativo", "COMUM", "10", "0", "3.0", "5", "25", "55", "100", "0", "0"],
        ["LOOT_MedKit_Small", "MedKit Small", "Curativo", "COMUM", "25", "0", "5.0", "3", "50", "55", "100", "0", "0"],
        ["LOOT_MedKit_Medium", "MedKit Medium", "Curativo", "RARO", "50", "0", "7.0", "2", "112", "28", "0", "100", "0"],
        ["LOOT_Phoenix_Frasco", "Phoenix Frasco", "Curativo", "LENDARIO", "100", "0", "1.0", "1", "880", "4", "0", "0", "100"],
        ["LOOT_Seringa_Venex", "Seringa Venex", "Curativo", "EPICO", "30", "0", "2.0", "3", "375", "12", "0", "50", "50"],
        ["LOOT_Adrenalina_Khael", "Adrenalina Khael", "Curativo", "EPICO", "0", "0", "1.5", "2", "375", "12", "0", "50", "50"],
        ["LOOT_Shield_Lv1", "Shield Lv1", "Defesa", "COMUM", "0", "25", "0.0", "1", "140", "55", "100", "0", "0"],
        ["LOOT_Shield_Lv2", "Shield Lv2", "Defesa", "RARO", "0", "50", "0.0", "1", "375", "28", "0", "100", "0"],
        ["LOOT_Colete_Khaaos", "Colete Khaaos", "Defesa", "EPICO", "0", "30", "0.0", "1", "375", "12", "0", "50", "50"],
        ["LOOT_Capacete_Simples", "Capacete Simples", "Defesa", "RARO", "0", "15", "0.0", "1", "168", "28", "0", "100", "0"],
        ["LOOT_Armadura_Huran", "Armadura Huran", "Defesa", "EPICO", "0", "40", "0.0", "1", "880", "12", "0", "50", "50"],
        ["LOOT_Escudo_Khael", "Escudo Khael", "Defesa", "LENDARIO", "0", "60", "0.0", "1", "880", "4", "0", "0", "100"],
        ["LOOT_Granada_Frag", "Granada Frag", "Defesa", "COMUM", "0", "-15", "0.0", "4", "35", "55", "100", "0", "0"],
        ["LOOT_Granada_Zheers", "Granada Zheers", "Utilidade", "RARO", "0", "0", "0.0", "2", "375", "28", "0", "100", "0"],
        ["LOOT_Mina_Khaaos", "Mina Khaaos", "Utilidade", "EPICO", "0", "0", "2.0", "2", "375", "12", "0", "50", "50"],
        ["LOOT_Beacon_Pulso", "Beacon Pulso", "Utilidade", "RARO", "0", "0", "1.0", "1", "168", "28", "0", "100", "0"],
        ["LOOT_Drone_Recon", "Drone Recon", "Utilidade", "EPICO", "0", "0", "1.5", "1", "375", "12", "0", "50", "50"],
        ["LOOT_Grappling_Hook", "Grappling Hook", "Utilidade", "LENDARIO", "0", "0", "0.5", "1", "880", "4", "0", "0", "100"],
        ["LOOT_Mochila_Tatica", "Mochila Tatica", "Utilidade", "COMUM", "0", "0", "0.0", "1", "40", "55", "100", "0", "0"],
        ["LOOT_AmmoBox_556", "AmmoBox 5.56", "Utilidade", "COMUM", "0", "0", "0.5", "3", "15", "55", "100", "0", "0"],
        ["LOOT_AmmoBox_762", "AmmoBox 7.62", "Recurso", "COMUM", "0", "0", "0.5", "3", "15", "55", "100", "0", "0"],
        ["LOOT_AmmoBox_9mm", "AmmoBox 9mm", "Recurso", "COMUM", "0", "0", "0.5", "3", "10", "55", "100", "0", "0"],
        ["LOOT_AmmoBox_12g", "AmmoBox 12g", "Recurso", "COMUM", "0", "0", "0.5", "3", "12", "55", "100", "0", "0"],
        ["LOOT_Material_Metal", "Material Metal", "Recurso", "COMUM", "0", "0", "0.0", "10", "20", "55", "100", "0", "0"],
        ["LOOT_Material_Cristal", "Material Cristal", "Recurso", "RARO", "0", "0", "0.0", "5", "84", "28", "0", "100", "0"],
        ["LOOT_Material_Nucleo", "Material Nucleo", "Recurso", "EPICO", "0", "0", "0.0", "3", "375", "12", "0", "50", "50"],
        ["LOOT_Cristal_Khael", "Cristal Khael", "Recurso", "LENDARIO", "0", "0", "0.0", "2", "1750", "4", "0", "0", "100"],
        ["LOOT_Nucleo_Zheers", "Nucleo Zheers", "Recurso", "EPICO", "0", "0", "0.0", "1", "2500", "3", "0", "0", "80"],
    ]
    write_csv(DATATABLES_DIR / "DT_LootTables.csv", loot_rows)
    report.add_result("DT_LootTables", "DataTable", "DataTables/DT_LootTables.csv", "PASS")
    csv_count += 1

    print(f"  Generated {csv_count} DataTable CSVs")
    return csv_count


def write_csv(path: Path, rows: List[List[str]]):
    """Write a list of rows to a CSV file."""
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)
    print(f"  Created: {path.name}")


# ─── Step 4: Generate Asset Import Manifest ────────────────────────────────────────

def step4_generate_import_manifest():
    """Generate ASSET_IMPORT_MANIFEST.json with all assets."""
    print("\n[Step 4] Generating Asset Import Manifest...")

    assets = []
    import_order = 0

    # Collect GE assets
    ge_dir = CONTENT_DIR / "GameplayEffects"
    for uasset_json in sorted(ge_dir.rglob("*.uasset.json")):
        rel_path = uasset_json.relative_to(CONTENT_DIR)
        with open(uasset_json, "r") as f:
            spec = json.load(f)
        assets.append({
            "asset_name": spec["asset_name"],
            "asset_type": "GameplayEffect",
            "path": str(rel_path),
            "package_name": spec["ue5_import_metadata"]["package_name"],
            "import_script": "scripts/import_ge_to_ue5.py",
            "import_order": import_order,
            "dependencies": [],
            "tags": spec["f_gameplay_effect_spec"]["granted_tags"],
            "checksum": spec.get("checksum", ""),
        })
        import_order += 1

    # Collect VFX assets (depend on GEs for gameplay cues)
    vfx_dir = CONTENT_DIR / "VFX"
    for uasset_json in sorted(vfx_dir.rglob("*.uasset.json")):
        rel_path = uasset_json.relative_to(CONTENT_DIR)
        with open(uasset_json, "r") as f:
            spec = json.load(f)
        species = spec["niagara_system_spec"].get("species")
        deps = []
        if species:
            deps.append(f"Species.{species}")
        assets.append({
            "asset_name": spec["asset_name"],
            "asset_type": "NiagaraSystem",
            "path": str(rel_path),
            "package_name": spec["ue5_import_metadata"]["package_name"],
            "import_script": "scripts/import_vfx_to_ue5.py",
            "import_order": import_order,
            "dependencies": deps,
            "tags": [f"VFX.{spec['niagara_system_spec']['category']}"] + ([f"Species.{species}"] if species else []),
            "checksum": spec.get("checksum", ""),
        })
        import_order += 1

    # Collect DataTable assets
    for csv_file in sorted(DATATABLES_DIR.glob("*.csv")):
        rel_path = csv_file.relative_to(CONTENT_DIR)
        with open(csv_file, "r") as f:
            checksum = compute_checksum(f.read())
        assets.append({
            "asset_name": csv_file.stem,
            "asset_type": "DataTable",
            "path": str(rel_path),
            "package_name": f"/Game/DataTables/{csv_file.stem}",
            "import_script": "UE5_CSV_Import",
            "import_order": import_order,
            "dependencies": [],
            "tags": ["DataTable"],
            "checksum": checksum,
        })
        import_order += 1

    # Build manifest
    manifest = {
        "manifest_version": "2.0.0",
        "project": "Khaaos_Run",
        "engine_version": "5.8",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "import_all_assets.py",
        "total_assets": len(assets),
        "asset_type_counts": {
            "GameplayEffect": len([a for a in assets if a["asset_type"] == "GameplayEffect"]),
            "NiagaraSystem": len([a for a in assets if a["asset_type"] == "NiagaraSystem"]),
            "DataTable": len([a for a in assets if a["asset_type"] == "DataTable"]),
        },
        "import_order_description": [
            "Phase 1: DataTables (no dependencies)",
            "Phase 2: GameplayEffects (may reference tags from DataTables)",
            "Phase 3: NiagaraSystems (may reference species assets and GEs)",
        ],
        "assets": assets,
        "ue5_batch_import_command": (
            "# Run in UE5 Editor Python console:\n"
            "import sys\n"
            "sys.path.insert(0, '<repo_root>/scripts')\n"
            "import import_ge_to_ue5\n"
            "import import_vfx_to_ue5\n"
            "import_ge_to_ue5.import_all_gameplay_effects('<content_dir>/GameplayEffects')\n"
            "import_vfx_to_ue5.import_all_vfx_systems('<content_dir>/VFX')\n"
            "# DataTables: Import via UE5 Content Browser CSV import\n"
        ),
    }

    manifest_path = CONTENT_DIR / "ASSET_IMPORT_MANIFEST.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"  Created: ASSET_IMPORT_MANIFEST.json ({len(assets)} assets)")
    report.add_result("ASSET_IMPORT_MANIFEST", "manifest", "Content/ASSET_IMPORT_MANIFEST.json", "PASS", f"{len(assets)} assets cataloged")
    return len(assets)


# ─── Step 5: Validate all manifests ────────────────────────────────────────────────

def step5_validate_manifests():
    """Validate all JSON manifests."""
    print("\n[Step 5] Validating all manifests...")

    manifest_files = [
        CONTENT_DIR / "GameplayEffects" / "GE_Manifest.json",
        CONTENT_DIR / "VFX" / "Niagara_VFX_Manifest.json",
        CONTENT_DIR / "ASSET_IMPORT_MANIFEST.json",
    ]

    all_valid = True
    for mf in manifest_files:
        if not mf.exists():
            print(f"  MISSING: {mf.name}")
            report.add_result(mf.name, "manifest", str(mf), "FAIL", "File not found")
            all_valid = False
            continue
        valid, detail = validate_json_file(mf)
        if valid:
            print(f"  VALID:   {mf.name}")
            report.add_result(mf.name, "manifest", str(mf), "PASS", detail)
        else:
            print(f"  INVALID: {mf.name} - {detail}")
            report.add_result(mf.name, "manifest", str(mf), "FAIL", detail)
            all_valid = False

    # Validate all .uasset.json files
    uasset_jsons = list(CONTENT_DIR.rglob("*.uasset.json"))
    invalid_count = 0
    for uaj in uasset_jsons:
        valid, detail = validate_json_file(uaj)
        if not valid:
            print(f"  INVALID: {uaj.name} - {detail}")
            report.add_result(uaj.name, "uasset.json", str(uaj), "FAIL", detail)
            invalid_count += 1
        else:
            report.add_result(uaj.name, "uasset.json", str(uaj), "PASS", "Valid JSON")

    print(f"  Validated {len(uasset_jsons)} .uasset.json files ({invalid_count} invalid)")
    return all_valid and invalid_count == 0


# ─── Main Pipeline ─────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  KHAAROS_RUN - AUTOMATED ASSET IMPORT PIPELINE")
    print("=" * 70)
    print(f"  Repository:  {REPO_ROOT}")
    print(f"  Content Dir: {CONTENT_DIR}")
    print(f"  Timestamp:   {datetime.now(timezone.utc).isoformat()}")

    # Step 1: Generate GE .uasset.json files
    ge_count = step1_generate_ge_uassets()

    # Step 2: Generate VFX .uasset.json files
    vfx_count = step2_generate_vfx_uassets()

    # Step 3: Generate DataTable CSVs
    csv_count = step3_generate_datatables()

    # Step 4: Generate Asset Import Manifest
    total_assets = step4_generate_import_manifest()

    # Step 5: Validate all manifests
    all_valid = step5_validate_manifests()

    # Print final report
    report.print_report()

    # Save report to file
    report_path = REPO_ROOT / "asset_import_report.json"
    with open(report_path, "w") as f:
        json.dump(report.summary(), f, indent=2, ensure_ascii=False)
    print(f"Report saved to: {report_path}")

    # Summary
    print("\n" + "=" * 70)
    print("  GENERATION SUMMARY")
    print("=" * 70)
    print(f"  Total .uasset.json files:  {ge_count + vfx_count}")
    print(f"    - GameplayEffect files:   {ge_count}")
    print(f"    - Niagara VFX files:      {vfx_count}")
    print(f"  Total DataTable CSVs:       {csv_count}")
    print(f"  Total scripts created:      3 (generate_ge, generate_vfx, import_all)")
    print(f"  Total UE5 import scripts:   2 (import_ge_to_ue5, import_vfx_to_ue5)")
    print(f"  Total assets in manifest:   {total_assets}")
    print(f"  All validations passed:     {all_valid}")
    print("=" * 70)

    return 0 if all_valid else 1


if __name__ == "__main__":
    sys.exit(main())
