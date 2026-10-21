#!/usr/bin/env python3
"""
validate_spawn_points.py — Step 2: Validate CIGKV Spawn Points

Loads CIGKV_level_data.json and validates:
  - All 50 spawn points: minimum 500cm spacing, within 2048x2048 bounds,
    correct sector membership, proper distribution.
  - ZEX zones don't overlap spawn points.
  - Loot distribution matches rarity table.

Exit code 0 if all pass, 1 if any fail.

Usage:
    python validate_spawn_points.py [--input PATH] [--output-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[3]  # repo/
DEFAULT_INPUT = REPO_ROOT / "config" / "levels" / "CIGKV_level_data.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "mvp_output"

MIN_SPAWN_SPACING_CM = 500  # Minimum distance between any two spawns
MAP_SIZE_X = 2048
MAP_SIZE_Y = 2048

# Expected spawn distribution per sector
EXPECTED_DISTRIBUTION = {
    "ArmoryHub": 5,
    "ProvingGrounds": 20,
    "Park": 25,
}

# Minimum clearance between a spawn point and a ZEX zone boundary
ZEX_SPAWN_CLEARANCE_CM = 100


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_level_data(path: Path) -> Dict[str, Any]:
    """Load and return the CIGKV level data JSON."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dist2d(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in the XY plane."""
    return math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


def point_in_bounds(x: float, y: float, bounds: Dict) -> bool:
    """Check if a 2D point lies within a bounding box."""
    return (bounds["min_x"] <= x <= bounds["max_x"] and
            bounds["min_y"] <= y <= bounds["max_y"])


# ---------------------------------------------------------------------------
# Validation Functions
# ---------------------------------------------------------------------------

def validate_minimum_spacing(spawns: List[Dict]) -> Tuple[bool, List[str]]:
    """Validate no two spawn points are within MIN_SPAWN_SPACING_CM of each other."""
    errors: List[str] = []
    violations: List[Dict] = []

    for i in range(len(spawns)):
        for j in range(i + 1, len(spawns)):
            d = dist2d(spawns[i]["x"], spawns[i]["y"],
                       spawns[j]["x"], spawns[j]["y"])
            if d < MIN_SPAWN_SPACING_CM:
                errors.append(
                    f"Spawn {spawns[i]['id']} and {spawns[j]['id']} are "
                    f"{d:.1f}cm apart (min {MIN_SPAWN_SPACING_CM}cm)"
                )
                violations.append({
                    "spawn_a": spawns[i]["id"],
                    "spawn_b": spawns[j]["id"],
                    "distance": round(d, 1),
                    "minimum": MIN_SPAWN_SPACING_CM,
                })

    passed = len(errors) == 0
    return passed, errors, violations


def validate_map_bounds(spawns: List[Dict], map_x: int, map_y: int) -> Tuple[bool, List[str]]:
    """Validate all spawn points are within map bounds."""
    errors: List[str] = []
    out_of_bounds: List[Dict] = []

    for sp in spawns:
        if not (0 <= sp["x"] <= map_x and 0 <= sp["y"] <= map_y):
            errors.append(
                f"Spawn {sp['id']} at ({sp['x']}, {sp['y']}) is outside "
                f"map bounds (0-{map_x}, 0-{map_y})"
            )
            out_of_bounds.append({
                "spawn_id": sp["id"],
                "x": sp["x"],
                "y": sp["y"],
                "map_max_x": map_x,
                "map_max_y": map_y,
            })

    passed = len(errors) == 0
    return passed, errors, out_of_bounds


def validate_sector_membership(spawns: List[Dict], sectors: List[Dict]) -> Tuple[bool, List[str]]:
    """Validate all spawn points are in their declared sector bounds."""
    errors: List[str] = []
    sector_map = {s["name"]: s for s in sectors}
    wrong_sector: List[Dict] = []

    for sp in spawns:
        sec = sector_map.get(sp["sector"])
        if sec is None:
            errors.append(
                f"Spawn {sp['id']} references unknown sector '{sp['sector']}'"
            )
            wrong_sector.append({
                "spawn_id": sp["id"],
                "declared_sector": sp["sector"],
                "error": "unknown_sector",
            })
            continue

        if not point_in_bounds(sp["x"], sp["y"], sec["bounds"]):
            errors.append(
                f"Spawn {sp['id']} at ({sp['x']}, {sp['y']}) is outside "
                f"its sector '{sp['sector']}' bounds"
            )
            wrong_sector.append({
                "spawn_id": sp["id"],
                "x": sp["x"],
                "y": sp["y"],
                "declared_sector": sp["sector"],
                "sector_bounds": sec["bounds"],
                "error": "outside_sector_bounds",
            })

    passed = len(errors) == 0
    return passed, errors, wrong_sector


def validate_distribution(spawns: List[Dict]) -> Tuple[bool, List[str], Dict[str, int]]:
    """Validate proper spawn distribution across sectors."""
    errors: List[str] = []
    counts = Counter(sp["sector"] for sp in spawns)

    for sector, expected in EXPECTED_DISTRIBUTION.items():
        actual = counts.get(sector, 0)
        if actual != expected:
            errors.append(
                f"Sector '{sector}' has {actual} spawns, expected {expected}"
            )

    # Check for unexpected sectors
    for sector in counts:
        if sector not in EXPECTED_DISTRIBUTION:
            errors.append(
                f"Unexpected sector '{sector}' with {counts[sector]} spawns"
            )

    passed = len(errors) == 0
    return passed, errors, dict(counts)


def validate_zex_spawn_clearance(
    spawns: List[Dict], zex_zones: List[Dict]
) -> Tuple[bool, List[str]]:
    """Validate ZEX zones don't overlap spawn points."""
    errors: List[str] = []
    overlaps: List[Dict] = []

    for zone in zex_zones:
        for sp in spawns:
            d = dist2d(zone["x"], zone["y"], sp["x"], sp["y"])
            if d < zone["radius"] + ZEX_SPAWN_CLEARANCE_CM:
                errors.append(
                    f"ZEX zone {zone['id']} (center {zone['x']},{zone['y']} r={zone['radius']}) "
                    f"too close to spawn {sp['id']} ({sp['x']},{sp['y']}): "
                    f"distance={d:.1f}cm < zone_radius+clearance={zone['radius']+ZEX_SPAWN_CLEARANCE_CM}cm"
                )
                overlaps.append({
                    "zex_zone_id": zone["id"],
                    "spawn_id": sp["id"],
                    "distance": round(d, 1),
                    "zone_radius": zone["radius"],
                    "clearance": ZEX_SPAWN_CLEARANCE_CM,
                })

    passed = len(errors) == 0
    return passed, errors, overlaps


def validate_loot_rarity(
    loot_points: List[Dict], expected_rarity: Dict[str, int]
) -> Tuple[bool, List[str], Dict[str, int]]:
    """Validate loot distribution matches rarity table."""
    errors: List[str] = []
    actual_counts = Counter(lp["rarity"] for lp in loot_points)

    for rarity, expected_count in expected_rarity.items():
        actual = actual_counts.get(rarity, 0)
        if actual != expected_count:
            errors.append(
                f"Loot rarity '{rarity}': actual={actual}, expected={expected_count}"
            )

    # Check for unexpected rarities
    for rarity in actual_counts:
        if rarity not in expected_rarity:
            errors.append(
                f"Unexpected loot rarity '{rarity}' with count {actual_counts[rarity]}"
            )

    passed = len(errors) == 0
    return passed, errors, dict(actual_counts)


# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

def generate_report(
    data: Dict,
    results: Dict,
    output_dir: Path,
) -> Path:
    """Generate a JSON validation report."""
    report = {
        "level": data["level_name"],
        "map_size": data["map_size"],
        "total_spawns": len(data["spawn_points"]),
        "total_zex_zones": len(data["zex_zones"]),
        "total_loot_points": len(data["loot_spawn_points"]),
        "validations": results,
        "all_passed": all(v["passed"] for v in results.values()),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "cigkv_validation_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    return report_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Step 2: Validate CIGKV Spawn Points"
    )
    parser.add_argument(
        "--input", type=Path, default=DEFAULT_INPUT,
        help="Path to CIGKV_level_data.json",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
        help="Output directory for validation report",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("Step 2: CIGKV Spawn Point Validation")
    print("=" * 70)

    # Load data
    print(f"\nLoading level data from {args.input} ...")
    data = load_level_data(args.input)
    spawns = data["spawn_points"]
    sectors = data["sectors"]
    zex_zones = data["zex_zones"]
    loot_points = data["loot_spawn_points"]
    rarity_table = data["loot_rarity_distribution"]
    map_x = data["map_size"]["x"]
    map_y = data["map_size"]["y"]

    results: Dict[str, Dict] = {}
    all_passed = True

    # ---- 1. Minimum Spacing ----
    print(f"\n[1/6] Validating minimum spawn spacing ({MIN_SPAWN_SPACING_CM}cm) ...")
    passed, errors, violations = validate_minimum_spacing(spawns)
    results["minimum_spacing"] = {
        "passed": passed,
        "min_spacing_cm": MIN_SPAWN_SPACING_CM,
        "violation_count": len(violations),
        "violations": violations[:20],  # cap for report size
    }
    if passed:
        print(f"  ✓ PASS — All {len(spawns)} spawn points have ≥{MIN_SPAWN_SPACING_CM}cm spacing")
    else:
        print(f"  ✗ FAIL — {len(violations)} spacing violations")
        for err in errors[:10]:
            print(f"    - {err}")
        if len(errors) > 10:
            print(f"    ... and {len(errors) - 10} more")
    all_passed = all_passed and passed

    # ---- 2. Map Bounds ----
    print(f"\n[2/6] Validating spawn points within map bounds ({map_x}x{map_y}) ...")
    passed, errors, out_of_bounds = validate_map_bounds(spawns, map_x, map_y)
    results["map_bounds"] = {
        "passed": passed,
        "out_of_bounds_count": len(out_of_bounds),
        "out_of_bounds": out_of_bounds,
    }
    if passed:
        print(f"  ✓ PASS — All spawns within map bounds")
    else:
        print(f"  ✗ FAIL — {len(out_of_bounds)} spawns out of bounds")
        for err in errors:
            print(f"    - {err}")
    all_passed = all_passed and passed

    # ---- 3. Sector Membership ----
    print("\n[3/6] Validating sector membership ...")
    passed, errors, wrong_sector = validate_sector_membership(spawns, sectors)
    results["sector_membership"] = {
        "passed": passed,
        "wrong_sector_count": len(wrong_sector),
        "wrong_sector": wrong_sector,
    }
    if passed:
        print(f"  ✓ PASS — All spawns are within their declared sectors")
    else:
        print(f"  ✗ FAIL — {len(wrong_sector)} spawns in wrong sector")
        for err in errors:
            print(f"    - {err}")
    all_passed = all_passed and passed

    # ---- 4. Distribution ----
    print("\n[4/6] Validating spawn distribution across sectors ...")
    passed, errors, counts = validate_distribution(spawns)
    results["distribution"] = {
        "passed": passed,
        "expected": EXPECTED_DISTRIBUTION,
        "actual": counts,
    }
    print(f"  Actual: ArmoryHub={counts.get('ArmoryHub',0)}, "
          f"ProvingGrounds={counts.get('ProvingGrounds',0)}, "
          f"Park={counts.get('Park',0)}")
    print(f"  Expected: ArmoryHub={EXPECTED_DISTRIBUTION['ArmoryHub']}, "
          f"ProvingGrounds={EXPECTED_DISTRIBUTION['ProvingGrounds']}, "
          f"Park={EXPECTED_DISTRIBUTION['Park']}")
    if passed:
        print(f"  ✓ PASS — Distribution matches expected")
    else:
        print(f"  ✗ FAIL — Distribution mismatch")
        for err in errors:
            print(f"    - {err}")
    all_passed = all_passed and passed

    # ---- 5. ZEX-Spawn Clearance ----
    print(f"\n[5/6] Validating ZEX zones don't overlap spawns (clearance={ZEX_SPAWN_CLEARANCE_CM}cm) ...")
    passed, errors, overlaps = validate_zex_spawn_clearance(spawns, zex_zones)
    results["zex_spawn_clearance"] = {
        "passed": passed,
        "clearance_cm": ZEX_SPAWN_CLEARANCE_CM,
        "overlap_count": len(overlaps),
        "overlaps": overlaps[:20],
    }
    if passed:
        print(f"  ✓ PASS — No ZEX zones overlap spawn points")
    else:
        print(f"  ✗ FAIL — {len(overlaps)} ZEX-spawn overlaps")
        for err in errors[:10]:
            print(f"    - {err}")
        if len(errors) > 10:
            print(f"    ... and {len(errors) - 10} more")
    all_passed = all_passed and passed

    # ---- 6. Loot Rarity Distribution ----
    print("\n[6/6] Validating loot rarity distribution ...")
    passed, errors, actual_rarity = validate_loot_rarity(loot_points, rarity_table)
    results["loot_rarity"] = {
        "passed": passed,
        "expected": rarity_table,
        "actual": actual_rarity,
    }
    print(f"  Actual:   {dict(sorted(actual_rarity.items()))}")
    print(f"  Expected: {dict(sorted(rarity_table.items()))}")
    if passed:
        print(f"  ✓ PASS — Loot rarity matches expected table")
    else:
        print(f"  ✗ FAIL — Loot rarity mismatch")
        for err in errors:
            print(f"    - {err}")
    all_passed = all_passed and passed

    # ---- Generate Report ----
    report_path = generate_report(data, results, args.output_dir)
    print(f"\nValidation report saved to {report_path}")

    # ---- Final Verdict ----
    print("\n" + "=" * 70)
    if all_passed:
        print("VALIDATION RESULT: ✓ ALL PASS")
        print("=" * 70)
        sys.exit(0)
    else:
        failed_checks = [k for k, v in results.items() if not v["passed"]]
        print(f"VALIDATION RESULT: ✗ FAIL — {len(failed_checks)} check(s) failed: {failed_checks}")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()
