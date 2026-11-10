"""Validate CIGKV SSS and hair anisotropy directly inside Unreal Editor.

This script is editor-only: it never reports visual acceptance from JSON alone.
It loads the master/instances, checks parameter presence and values, verifies
SubsurfaceProfile assets, and writes a machine-readable report for CI.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import unreal

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
RECIPE_PATH = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"
OUT = ROOT / "artifacts/cigkv-vertical-slice/material-validation-report.json"
MASTER_PATH = "/Game/Materials/CIGKV/M_CIGKV_Character_Master"
PROFILE_PATHS = {
    "human_skin": "/Game/Materials/CIGKV/SSP_CIGKV_Human_Skin",
    "zheers_skin": "/Game/Materials/CIGKV/SSP_CIGKV_Zheers_Skin",
}


def log(message: str):
    unreal.log(f"[CIGKV_MATERIAL_VALIDATION] {message}")


def load_recipe():
    path = RECIPE_PATH
    if not path.is_file():
        raise RuntimeError(f"receita ausente: {path}")
    return json.loads(path.read_text())


def load_asset(path: str):
    asset = unreal.EditorAssetLibrary.load_asset(path)
    return asset


def scalar_names(asset):
    try:
        return {str(name) for name in unreal.MaterialEditingLibrary.get_scalar_parameter_names(asset)}
    except Exception as exc:
        log(f"não foi possível listar scalars de {asset.get_name()}: {exc}")
        return set()


def scalar_value(asset, name: str):
    try:
        return float(unreal.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(asset, name))
    except Exception:
        return None


def validate_instance(instance: dict, master, shader_tuning: dict):
    name = instance["name"]
    path = f"/Game/Materials/CIGKV/{name}"
    asset = load_asset(path)
    result = {"name": name, "path": path, "exists": bool(asset), "errors": [], "warnings": []}
    if not asset:
        result["errors"].append("material_instance_missing")
        return result
    parent = getattr(asset, "parent", None)
    if parent and parent != master:
        result["errors"].append("material_instance_parent_is_not_master")
    names = scalar_names(asset)
    checks = {}
    if instance["surface"] in {"skin", "species_skin"}:
        skin_key = "human_skin" if instance["surface"] == "skin" else "zheers_skin"
        expected = shader_tuning["subsurface"][skin_key]
        checks["SubsurfaceStrength"] = {"expected": expected["strength"], "actual": scalar_value(asset, "SubsurfaceStrength")}
        checks["SubsurfaceRadius"] = {"expected": expected["radius"], "actual": scalar_value(asset, "SubsurfaceRadius")}
        if "SubsurfaceStrength" not in names: result["errors"].append("missing_SubSurfaceStrength_parameter")
        if "SubsurfaceRadius" not in names: result["errors"].append("missing_SubsurfaceRadius_parameter")
    if instance["surface"] == "hair":
        expected = instance["hair_anisotropy"]
        checks["HairAnisotropy"] = {"expected": expected, "actual": scalar_value(asset, "HairAnisotropy")}
        checks["HairFlowStrength"] = {"expected": shader_tuning["hair"]["hair_flow_strength"], "actual": scalar_value(asset, "HairFlowStrength")}
        if "HairAnisotropy" not in names: result["errors"].append("missing_HairAnisotropy_parameter")
        if "HairFlowStrength" not in names: result["errors"].append("missing_HairFlowStrength_parameter")
    for key, value in checks.items():
        actual = value["actual"]
        if actual is None:
            result["warnings"].append(f"parameter_value_unreadable:{key}")
        elif abs(actual - value["expected"]) > 0.02:
            result["errors"].append(f"parameter_out_of_tolerance:{key}:{actual}:{value['expected']}")
    result["scalar_parameters"] = sorted(names)
    result["checks"] = checks
    result["status"] = "pass" if not result["errors"] else "fail"
    return result


def main():
    recipe = load_recipe()
    master = load_asset(MASTER_PATH)
    report = {
        "schema": "khaaos.cigkv.material-validation-report/v1",
        "engine_only": True,
        "engine_version": str(unreal.SystemLibrary.get_engine_version()),
        "master": {"path": MASTER_PATH, "exists": bool(master), "status": "pass" if master else "fail"},
        "subsurface_profiles": [],
        "instances": [],
        "visual_acceptance": "pending_screenshot_matrix",
        "errors": [],
        "warnings": [],
    }
    if not master:
        report["errors"].append("master_material_missing")
    for key, path in PROFILE_PATHS.items():
        profile = load_asset(path)
        item = {"name": key, "path": path, "exists": bool(profile), "status": "pass" if profile else "fail"}
        if not profile: report["warnings"].append(f"subsurface_profile_missing:{path}")
        report["subsurface_profiles"].append(item)
    if master:
        for instance in recipe["instances"]:
            result = validate_instance(instance, master, recipe["shader_tuning"])
            report["instances"].append(result)
            report["errors"].extend(f"{result['name']}:{error}" for error in result["errors"])
    report["status"] = "pass" if not report["errors"] else "fail"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    log(f"status={report['status']} instances={len(report['instances'])}")
    if report["errors"]:
        raise RuntimeError("; ".join(report["errors"]))


if __name__ == "__main__":
    main()
