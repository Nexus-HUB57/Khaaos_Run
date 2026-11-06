#!/usr/bin/env python3
"""Prepare and validate the CIGKV character vertical slice.

This script is engine-less by design. It validates source provenance and emits a
manifest for the licensed UE5.8 runner. It never claims that FBX/UMAP/UASSET
files or screenshots exist when they were not produced by Unreal.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLICE = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_character_slice.json"
MATERIALS = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/cigkv-vertical-slice/prepare-report.json")
    args = parser.parse_args()

    slice_data = json.loads(SLICE.read_text())
    materials_data = json.loads(MATERIALS.read_text())
    characters = []
    errors = []
    for character in slice_data["characters"]:
        source = ROOT / character["source"]
        exists = source.is_file()
        item = {
            "slot": character["slot"],
            "source": character["source"],
            "source_exists": exists,
            "source_sha256": sha256(source) if exists else None,
            "normalized_source": character["normalized_source"],
            "normalized_source_exists": (ROOT / character["normalized_source"]).is_file(),
            "canonical_skeleton": character["canonical_skeleton"],
            "canonical_height_cm": character["canonical_height_cm"],
            "bind_pose": character["bind_pose"],
            "status": character["status"],
        }
        characters.append(item)
        if not exists:
            errors.append(f"source ausente: {character['source']}")

    report = {
        "schema": "khaaos.cigkv.vertical-slice.prepare-report/v1",
        "status": "ready_for_ue5_runner" if not errors else "blocked_missing_source",
        "engineless": True,
        "engine_claim": "nenhum .uasset/.umap ou screenshot é criado por este script",
        "slice_manifest": str(SLICE.relative_to(ROOT)),
        "materials_manifest": str(MATERIALS.relative_to(ROOT)),
        "material_instance_count": len(materials_data["instances"]),
        "characters": characters,
        "errors": errors,
        "next_action": "Executar Blender/IK Retargeter e depois scripts/ue5_editor/cigkv_vertical_slice.py no runner UE5.8 licenciado.",
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
