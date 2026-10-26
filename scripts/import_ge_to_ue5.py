#!/usr/bin/env python3
"""
UE5 Python import script for Khaaos_Run GameplayEffects.

Run inside UE5 Editor Python console or via command line:
  python import_ge_to_ue5.py

Requires: unreal module (UE5 Python scripting plugin enabled)
"""

import unreal
import json
import os

# UE5 asset utilities
editor_asset_lib = unreal.EditorAssetLibrary
system_lib = unreal.SystemLibrary

# Base content path
CONTENT_BASE = "/Game/GameplayEffects"

# Duration policy mapping
DURATION_POLICY_MAP = {
    "Instant": unreal.EDurationType.INSTANT,
    "HasDuration": unreal.EDurationType.HAS_DURATION,
    "Infinite": unreal.EDurationType.INFINITE,
}

# Modifier op mapping
MODIFIER_OP_MAP = {
    "Additive": unreal.EModifierOp.ADD,
    "Multiplicative": unreal.EModifierOp.MULTIPLY,
    "Division": unreal.EModifierOp.DIVIDE,
    "Override": unreal.EModifierOp.OVERRIDE,
}

# Stacking type mapping
STACKING_TYPE_MAP = {
    "NoStacking": unreal.EGameplayEffectStackingType.NO_STACKING,
    "StackByDuration": unreal.EGameplayEffectStackingType.STACK_BY_DURATION,
    "StackBySource": unreal.EGameplayEffectStackingType.STACK_BY_SOURCE,
    "StackCountReset": unreal.EGameplayEffectStackingType.STACK_COUNT_RESET,
}


def load_ge_spec(json_path: str) -> dict:
    """Load a .uasset.json spec file."""
    with open(json_path, "r") as f:
        return json.load(f)


def create_gameplay_effect(spec: dict) -> bool:
    """Create a GameplayEffect asset from a JSON spec."""
    spec_data = spec["f_gameplay_effect_spec"]
    asset_name = spec["asset_name"]
    category = spec["ue5_import_metadata"]["content_path"].split("/")[1]
    package_path = f"{CONTENT_BASE}/{category}"
    full_path = f"{package_path}/{asset_name}"

    # Check if asset already exists
    if editor_asset_lib.does_asset_exist(full_path):
        unreal.log_warning(f"Asset already exists: {full_path}, skipping")
        return True

    try:
        # Create the GameplayEffect asset
        asset = editor_asset_lib.create_asset(asset_name, package_path, unreal.GameplayEffect, None)
        if not asset:
            unreal.log_error(f"Failed to create asset: {full_path}")
            return False

        # Set duration policy
        policy_key = spec_data["duration_policy"]
        if policy_key in DURATION_POLICY_MAP:
            asset.set_editor_property("duration_policy", DURATION_POLICY_MAP[policy_key])

        # Set duration magnitude
        if spec_data["duration_magnitude"] != 0:
            magnitude = unreal.ScalableFloat()
            magnitude.set_editor_property("value", spec_data["duration_magnitude"])
            asset.set_editor_property("duration_magnitude", magnitude)

        # Set stacking
        stack_type = spec_data["stacking_type"]
        if stack_type in STACKING_TYPE_MAP:
            asset.set_editor_property("stacking_type", STACKING_TYPE_MAP[stack_type])
        asset.set_editor_property("stack_limit_count", spec_data["stack_limit_count"])

        # Add modifiers
        for mod_data in spec_data["modifiers"]:
            modifier = unreal.FGameplayModifierInfo()
            modifier.set_editor_property("modifier_op",
                MODIFIER_OP_MAP.get(mod_data["modifier_op"], unreal.EModifierOp.ADD))
            mag = unreal.ScalableFloat()
            mag.set_editor_property("value", mod_data["magnitude"])
            modifier.set_editor_property("modifier_magnitude", mag)
            asset.modifiers.append(modifier)

        # Add granted tags
        if spec_data["granted_tags"]:
            tag_container = unreal.GameplayTagContainer()
            for tag_str in spec_data["granted_tags"]:
                tag = unreal.GameplayTag.request_gameplay_tag(tag_str)
                if tag.is_valid():
                    tag_container.add_tag(tag)
            asset.set_editor_property("granted_tags", tag_container)

        # Save the asset
        editor_asset_lib.save_asset(full_path, only_if_is_dirty=False)
        unreal.log(f"Created GameplayEffect: {full_path}")
        return True

    except Exception as e:
        unreal.log_error(f"Error creating {full_path}: {e}")
        return False


def import_all_gameplay_effects(json_dir: str) -> dict:
    """Import all GameplayEffects from .uasset.json files."""
    results = {"total": 0, "success": 0, "failed": 0, "errors": []}

    for root, dirs, files in os.walk(json_dir):
        for fname in files:
            if not fname.endswith(".uasset.json"):
                continue
            fpath = os.path.join(root, fname)
            try:
                spec = load_ge_spec(fpath)
                if create_gameplay_effect(spec):
                    results["success"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append(fpath)
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"{fpath}: {e}")
            results["total"] += 1

    unreal.log(f"GE Import Complete: {results['success']}/{results['total']} successful")
    return results


if __name__ == "__main__":
    # Path to the GameplayEffects content directory
    ge_content_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "Unreal", "KhaaosRun", "Content", "GameplayEffects"
    )
    import_all_gameplay_effects(ge_content_dir)