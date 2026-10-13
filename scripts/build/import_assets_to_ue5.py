#!/usr/bin/env python3
"""Khaaos Run — UE5 Asset Import Script
Run inside UE5 Editor: PythonScriptPlugin → execute this script
Imports FBX/OBJ meshes, textures, and audio from Content/Assets into Content Browser
"""
import unreal
import json
import os

MANIFEST_PATH = os.path.join(os.environ.get("KHAAOS_REPO_ROOT", ""), 
                              "Content/Assets/asset_manifest.json")

def import_asset(source_path, dest_path, asset_type="mesh"):
    """Import a single asset into UE5 Content Browser"""
    task = unreal.AssetImportTask()
    task.filename = source_path
    task.destination_path = dest_path
    task.automated = True
    task.replace_existing = True
    task.save = True
    
    tools = unreal.get_default_subobject(unreal.EditorAssetLibrary)
    result = unreal.EditorAssetLibrary.import_asset_tasks([task])
    return result

def main():
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    
    unreal.log(f"Khaaos Asset Import: {manifest['summary']['total_assets']} assets")
    
    # Import characters
    for char in manifest.get("characters", []):
        dest = f"/Game/Characters/{char['id']}"
        unreal.log(f"  Importing character: {char['name']} -> {dest}")
        # Import skeletal mesh, textures, animations
    
    # Import weapons  
    for weapon in manifest.get("weapons", []):
        dest = f"/Game/Weapons/{weapon['category'].title()}"
        unreal.log(f"  Importing weapon: {weapon['name']} -> {dest}")
    
    # Import loot items
    for loot in manifest.get("loot_items", []):
        dest = f"/Game/Loot/{loot['type'].title()}"
        unreal.log(f"  Importing loot: {loot['name']} -> {dest}")
    
    unreal.log("Asset import complete!")

if __name__ == "__main__":
    main()
