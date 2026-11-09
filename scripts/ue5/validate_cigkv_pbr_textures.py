#!/usr/bin/env python3
"""Validate generated CIGKV PBR texture sets before UE5 import."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {"basecolor": "RGB", "normal": "RGB", "orm": "RGB", "detail": "RGB"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", default="Unreal/KhaaosRun/Content/Materials/CIGKV/cigkv_pbr_texture_sets.json")
    parser.add_argument("--materials", default="Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json")
    args = parser.parse_args()
    metadata_path = ROOT / args.metadata
    materials_path = ROOT / args.materials
    metadata = json.loads(metadata_path.read_text())
    materials = json.loads(materials_path.read_text())
    errors: list[str] = []
    checks = 0
    for item in metadata.get("sets", []):
        for key, relative in item["files"].items():
            checks += 1
            path = ROOT / relative
            if not path.is_file():
                errors.append(f"missing:{relative}")
                continue
            with Image.open(path) as image:
                if image.size != (2048, 2048): errors.append(f"resolution:{relative}:{image.size}")
                if image.mode != EXPECTED[key]: errors.append(f"mode:{relative}:{image.mode}")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if item["sha256"].get(key) != digest: errors.append(f"sha256:{relative}")
    known_names = {item["material_set"] for item in metadata.get("sets", [])}
    for instance in materials.get("instances", []):
        texture_set = instance.get("texture_set")
        if not texture_set: errors.append(f"instance_without_texture_set:{instance['name']}")
        elif texture_set not in known_names: errors.append(f"unknown_texture_set:{instance['name']}:{texture_set}")
    report = {"schema": "khaaos.cigkv.pbr-texture-validation/v1", "target_resolution": [2048, 2048], "checks": checks, "errors": errors, "status": "pass" if not errors else "fail", "engine_import_pending": True}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
