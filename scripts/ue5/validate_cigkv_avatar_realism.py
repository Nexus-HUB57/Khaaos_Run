#!/usr/bin/env python3
"""Validate the CIGKV hero-avatar realism contract without pretending visual QA."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_avatar_realism_profile.json"
MATERIALS = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/cigkv-vertical-slice/avatar-realism-contract-report.json")
    args = parser.parse_args()
    profile = json.loads(PROFILE.read_text())
    materials = json.loads(MATERIALS.read_text())
    errors: list[str] = []
    targets = profile["targets"]
    params = materials["master"]["parameters"]
    for required in ["RoughnessDetail", "SpecularMap", "SubsurfaceMask", "MicroPoreMap", "FlowMap", "IrisDetail", "WetnessMask", "SubsurfaceRadius", "SubsurfaceProfile", "HairAnisotropy", "HairFlowStrength", "CorneaIOR", "EyeWetness"]:
        if required not in params:
            errors.append(f"master_parameter_missing:{required}")
    hero = materials.get("hero_realism", {})
    for section in ["skin", "eyes", "hair", "mouth"]:
        if section not in hero:
            errors.append(f"material_hero_section_missing:{section}")
    if hero.get("eyes", {}).get("cornea_ior") != targets["eyes"]["cornea_ior"]:
        errors.append("cornea_ior_contract_mismatch")
    if hero.get("hair", {}).get("anisotropy_range") != targets["hair"]["anisotropy_range"]:
        errors.append("hair_anisotropy_range_contract_mismatch")
    if targets["face"]["blendshape_count_min"] < 52:
        errors.append("face_blendshape_gate_too_low")
    if targets["hero_mesh"]["uv_sets_min"] < 2:
        errors.append("hero_mesh_requires_two_uv_sets")
    if targets["deformation"]["max_visible_clipping_frames"] != 0:
        errors.append("deformation_clipping_gate_not_zero")
    report = {
        "schema": "khaaos.cigkv.avatar-realism-contract-report/v1",
        "engine_less": True,
        "status": "pass" if not errors else "fail",
        "errors": errors,
        "checks": {
            "master_parameters": len(params),
            "hero_sections": sorted(hero),
            "blendshape_min": targets["face"]["blendshape_count_min"],
            "lod0_triangles_min": targets["hero_mesh"]["triangles_lod0_min"],
            "skin_maps": len(targets["skin"]["maps_required"]),
            "eye_materials": len(targets["eyes"]["materials_required"]),
            "deformation_cases": len(targets["deformation"]["tests_required"]),
            "visual_acceptance": "pending_ue58_gpu_runner"
        },
        "limitations": ["não inspeciona topologia ou deformação real", "não cria .uasset/.umap", "não comprova aparência sem screenshots UE5.8"],
        "next_actions": ["importar mesh hero e morph targets", "criar materiais de olho/boca", "executar matriz de deformação e 24 capturas no runner UE5.8"]
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
