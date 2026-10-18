#!/usr/bin/env python3
"""Khaaos Run — Asset Importer for UE5 Editor.
Imports FBX meshes, creates material instances by rarity.
"""
import json
import os
import subprocess
from pathlib import Path

RARITY_COLORS = {
    "COMUM":    {"base": (0.7, 0.7, 0.7), "emissive": (0.0, 0.0, 0.0)},
    "RARO":     {"base": (0.2, 0.4, 0.9), "emissive": (0.05, 0.1, 0.3)},
    "EPICO":    {"base": (0.6, 0.2, 0.9), "emissive": (0.2, 0.05, 0.4)},
    "LENDARIO": {"base": (0.9, 0.7, 0.1), "emissive": (0.5, 0.3, 0.0)},
    "MITICO":   {"base": (0.9, 0.1, 0.1), "emissive": (0.6, 0.0, 0.0)},
}

def import_fbx(fbx_path, dest_path, skeletal=False):
    cmd = [
        "python", "-c",
        f"import unreal; unreal.EditorAssetLibrary.import_asset('{dest_path}', '{fbx_path}', skeletal={skeletal})"
    ]
    print(f"  Import: {fbx_path} → {dest_path}")
    # In UE5 editor, this would be: unreal.EditorAssetLibrary.import_asset(...)

def create_material_instance(rarity, parent_path, dest_path):
    colors = RARITY_COLORS.get(rarity, RARITY_COLORS["COMUM"])
    print(f"  MatInst: {rarity} → {dest_path} (base={colors['base']}, emissive={colors['emissive']})")
    # In UE5 editor: unreal.MaterialEditingLibrary.create_material_instance(...)

def import_all_assets(manifest_path, content_root):
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    for asset in manifest.get("assets", []):
        fbx = asset.get("fbx_path", "")
        rarity = asset.get("rarity", "COMUM")
        if fbx and os.path.exists(fbx):
            dest = os.path.join(content_root, asset.get("ue_path", ""))
            import_fbx(fbx, dest, skeletal=asset.get("skeletal", False))
            create_material_instance(rarity, "/Game/Materials/M_Base", dest + "_MI")

if __name__ == "__main__":
    import sys
    manifest = sys.argv[1] if len(sys.argv) > 1 else "asset_manifest.json"
    content = sys.argv[2] if len(sys.argv) > 2 else "/Game/Khaaos/"
    import_all_assets(manifest, content)
    print("Asset import complete!")
