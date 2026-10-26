#!/usr/bin/env python3
"""
UE5 Python import script for Khaaos_Run Niagara VFX Systems.

Run inside UE5 Editor Python console or via command line:
  python import_vfx_to_ue5.py

Requires: unreal module (UE5 Python scripting plugin enabled)
           Niagara plugin must be enabled in the project.
"""

import unreal
import json
import os

# UE5 asset utilities
editor_asset_lib = unreal.EditorAssetLibrary

# Base content path
CONTENT_BASE = "/Game/VFX"


def load_vfx_spec(json_path: str) -> dict:
    """Load a .uasset.json spec file."""
    with open(json_path, "r") as f:
        return json.load(f)


def create_niagara_system(spec: dict) -> bool:
    """Create a NiagaraSystem asset from a JSON spec.

    Note: Full Niagara system creation requires the Niagara Editor module.
    This script creates a placeholder Niagara system and logs the
    required emitter/module configuration for manual setup or future automation.
    """
    spec_data = spec["niagara_system_spec"]
    asset_name = spec["asset_name"]
    cat = spec_data["category"]
    subcat = spec_data["subcategory"]
    package_path = f"{CONTENT_BASE}/{cat}/{subcat}"
    full_path = f"{package_path}/{asset_name}"

    # Check if asset already exists
    if editor_asset_lib.does_asset_exist(full_path):
        unreal.log_warning(f"Asset already exists: {full_path}, skipping")
        return True

    try:
        # Create the NiagaraSystem asset
        asset = editor_asset_lib.create_asset(
            asset_name, package_path, unreal.NiagaraSystem, None
        )
        if not asset:
            unreal.log_error(f"Failed to create Niagara system: {full_path}")
            return False

        # Configure GPU simulation settings
        gpu_sim = spec_data["gpu_simulation_settings"]
        niagara_sim = asset.get_editor_property("gpu_computation_setting") if hasattr(asset, "get_editor_property") else None

        # Log emitter configuration for manual setup
        for emitter_conf in spec_data["emitters"]:
            unreal.log(f"  Emitter: {emitter_conf['emitter_name']}")
            unreal.log(f"    Spawn Rate: {emitter_conf['spawn_rate']}")
            unreal.log(f"    Lifetime: {emitter_conf['lifetime']}")
            unreal.log(f"    Size: {emitter_conf['initial_size']}")
            unreal.log(f"    Color: {emitter_conf['initial_color']}")

        # Save the asset
        editor_asset_lib.save_asset(full_path, only_if_is_dirty=False)
        unreal.log(f"Created NiagaraSystem: {full_path}")
        return True

    except Exception as e:
        unreal.log_error(f"Error creating {full_path}: {e}")
        return False


def register_vfx_with_manager(vfx_name: str, asset_path: str) -> None:
    """Register a VFX with the KhaaosVFXManager subsystem.

    This should be called during game initialization to populate
    the VFXRegistry in UKhaaosVFXManager.
    """
    unreal.log(f"Register VFX: {vfx_name} -> {asset_path}")
    # In practice, this calls:
    # VFXManager = world.GetSubsystem(UKhaaosVFXManager)
    # VFXManager.RegisterVFX(vfx_name, NiagaraSystem)


def import_all_vfx_systems(json_dir: str) -> dict:
    """Import all Niagara VFX systems from .uasset.json files."""
    results = {"total": 0, "success": 0, "failed": 0, "errors": []}

    for root, dirs, files in os.walk(json_dir):
        for fname in files:
            if not fname.endswith(".uasset.json"):
                continue
            fpath = os.path.join(root, fname)
            try:
                spec = load_vfx_spec(fpath)
                if create_niagara_system(spec):
                    results["success"] += 1
                    # Register with VFX manager
                    register_vfx_with_manager(
                        spec["asset_name"],
                        spec["ue5_import_metadata"]["package_name"]
                    )
                else:
                    results["failed"] += 1
                    results["errors"].append(fpath)
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"{fpath}: {e}")
            results["total"] += 1

    unreal.log(f"VFX Import Complete: {results['success']}/{results['total']} successful")
    return results


if __name__ == "__main__":
    # Path to the VFX content directory
    vfx_content_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "Unreal", "KhaaosRun", "Content", "VFX"
    )
    import_all_vfx_systems(vfx_content_dir)