#!/usr/bin/env python3
"""
Generate GameplayEffect .uasset.json placeholder files for the 29 GEs in Khaaos_Run.

These structured JSON+binary placeholder files can be imported by the UE5 Python
scripting plugin to create real GameplayEffect assets in the Unreal Editor.

Usage:
    python scripts/generate_ge_uassets.py

Output:
    - Unreal/KhaaosRun/Content/GameplayEffects/GE_Manifest.json
    - Unreal/KhaaosRun/Content/GameplayEffects/{Category}/GE_*.{name}.uasset.json
    - scripts/import_ge_to_ue5.py
"""

import json
import os
import hashlib
import struct
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = REPO_ROOT / "Unreal" / "KhaaosRun" / "Content" / "GameplayEffects"
SCRIPTS_DIR = REPO_ROOT / "scripts"

# ─── 29 GameplayEffects ───────────────────────────────────────────────────────────

GAMEPLAY_EFFECTS = [
    # ── Cooldown GEs (5) ──────────────────────────────────────────────────────
    {
        "name": "GE_Cooldown_Sprint",
        "category": "Cooldown",
        "duration_policy": "HasDuration",
        "duration": 1.0,
        "modifiers": [],
        "granted_tags": ["Cooldown.Sprint"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Sprint cooldown - 1s between sprint activations"
    },
    {
        "name": "GE_Cooldown_Shield",
        "category": "Cooldown",
        "duration_policy": "HasDuration",
        "duration": 8.0,
        "modifiers": [],
        "granted_tags": ["Cooldown.Shield"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Shield cooldown - 8s recharge time"
    },
    {
        "name": "GE_Cooldown_Heal",
        "category": "Cooldown",
        "duration_policy": "HasDuration",
        "duration": 12.0,
        "modifiers": [],
        "granted_tags": ["Cooldown.Heal"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Heal cooldown - 12s between self-heal uses"
    },
    {
        "name": "GE_Cooldown_Ultimate",
        "category": "Cooldown",
        "duration_policy": "HasDuration",
        "duration": 45.0,
        "modifiers": [],
        "granted_tags": ["Cooldown.Ultimate"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Ultimate ability cooldown - 45s"
    },
    {
        "name": "GE_Cooldown_GrapplingHook",
        "category": "Cooldown",
        "duration_policy": "HasDuration",
        "duration": 15.0,
        "modifiers": [],
        "granted_tags": ["Cooldown.GrapplingHook"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Grappling hook cooldown - 15s"
    },
    # ── Cost GEs (3) ──────────────────────────────────────────────────────────
    {
        "name": "GE_Cost_Health",
        "category": "Cost",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -10.0, "channel": "Primary"}
        ],
        "granted_tags": [],
        "required_tags": ["Attribute.Health"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Instant health cost - subtracts from health attribute"
    },
    {
        "name": "GE_Cost_Energy",
        "category": "Cost",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Energy", "modifier_op": "Additive", "magnitude": -20.0, "channel": "Primary"}
        ],
        "granted_tags": [],
        "required_tags": ["Attribute.Energy"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Instant energy cost - subtracts from energy attribute"
    },
    {
        "name": "GE_Cost_Credits",
        "category": "Cost",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Credits", "modifier_op": "Additive", "magnitude": -50.0, "channel": "Primary"}
        ],
        "granted_tags": [],
        "required_tags": ["Attribute.Credits"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Instant credits cost - subtracts from credits attribute"
    },
    # ── Buff GEs (7) ──────────────────────────────────────────────────────────
    {
        "name": "GE_Buff_SpeedBoost",
        "category": "Buff",
        "duration_policy": "HasDuration",
        "duration": 5.0,
        "modifiers": [
            {"attribute": "Attribute.Speed", "modifier_op": "Multiplicative", "magnitude": 1.4, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Buff.SpeedBoost"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 5,
        "description": "40% speed boost for 5s - sprint/movement buff"
    },
    {
        "name": "GE_Buff_Shielded",
        "category": "Buff",
        "duration_policy": "HasDuration",
        "duration": 10.0,
        "modifiers": [
            {"attribute": "Attribute.Shield", "modifier_op": "Additive", "magnitude": 50.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Buff.Shielded"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 3,
        "description": "Shield buff - adds 50 shield points for 10s"
    },
    {
        "name": "GE_Buff_HealOverTime",
        "category": "Buff",
        "duration_policy": "HasDuration",
        "duration": 7.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": 5.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Buff.HealOverTime"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 5,
        "period": 1.0,
        "description": "Heal over time - 5 HP/s for 7s (35 total)"
    },
    {
        "name": "GE_Buff_DamageReduction",
        "category": "Buff",
        "duration_policy": "HasDuration",
        "duration": 8.0,
        "modifiers": [
            {"attribute": "Attribute.DamageReduction", "modifier_op": "Additive", "magnitude": 0.3, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Buff.DamageReduction"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 3,
        "description": "30% damage reduction for 8s"
    },
    {
        "name": "GE_Buff_Regen",
        "category": "Buff",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": 2.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Buff.Regen", "Ability.Passive.Species.Huran.RegeneracaoAquatica"],
        "required_tags": ["Species.Huran"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "period": 1.0,
        "description": "Huran passive - infinite aquatic regeneration, 2 HP/s"
    },
    {
        "name": "GE_Buff_Canalizacao",
        "category": "Buff",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.Energy", "modifier_op": "Additive", "magnitude": 3.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Buff.Canalizacao", "Ability.Passive.Species.Khael.CanalizacaoMistica"],
        "required_tags": ["Species.Khael"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "period": 1.0,
        "description": "Khael passive - infinite mystic channeling, +3 Energy/s"
    },
    {
        "name": "GE_Buff_Overclock",
        "category": "Buff",
        "duration_policy": "HasDuration",
        "duration": 6.0,
        "modifiers": [
            {"attribute": "Attribute.Speed", "modifier_op": "Multiplicative", "magnitude": 1.25, "channel": "Primary"},
            {"attribute": "Attribute.Energy", "modifier_op": "Additive", "magnitude": -5.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Buff.Overclock", "Ability.Passive.Species.Venex.OverclockNeural"],
        "required_tags": ["Species.Venex"],
        "stacking_type": "StackByDuration",
        "stack_limit": 2,
        "period": 1.0,
        "description": "Venex passive - 25% speed boost + energy drain for 6s"
    },
    # ── Debuff GEs (6) ────────────────────────────────────────────────────────
    {
        "name": "GE_Debuff_Slowed",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 4.0,
        "modifiers": [
            {"attribute": "Attribute.Speed", "modifier_op": "Multiplicative", "magnitude": 0.5, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Debuff.Slowed"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 10,
        "description": "50% slow for 4s"
    },
    {
        "name": "GE_Debuff_Burning",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 5.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -3.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Debuff.Burning"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 10,
        "period": 1.0,
        "description": "Burning DOT - 3 HP/s damage for 5s (15 total)"
    },
    {
        "name": "GE_Debuff_Frozen",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 3.0,
        "modifiers": [
            {"attribute": "Attribute.Speed", "modifier_op": "Multiplicative", "magnitude": 0.1, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Debuff.Frozen"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 5,
        "description": "Frozen - 90% speed reduction for 3s (Khael ability)"
    },
    {
        "name": "GE_Debuff_Poisoned",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 8.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -2.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Debuff.Poisoned"],
        "required_tags": [],
        "stacking_type": "StackByDuration",
        "stack_limit": 10,
        "period": 1.0,
        "description": "Poisoned DOT - 2 HP/s damage for 8s (Onith ability)"
    },
    {
        "name": "GE_Debuff_Silenced",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 4.0,
        "modifiers": [],
        "granted_tags": ["Effect.Debuff.Silenced"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Silenced - blocks ability activation for 4s"
    },
    {
        "name": "GE_Debuff_Disarmed",
        "category": "Debuff",
        "duration_policy": "HasDuration",
        "duration": 3.0,
        "modifiers": [],
        "granted_tags": ["Effect.Debuff.Disarmed"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Disarmed - blocks weapon use for 3s"
    },
    # ── Damage GEs (4) ────────────────────────────────────────────────────────
    {
        "name": "GE_Damage_Bullet",
        "category": "Combat",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -30.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Damage.Bullet"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Instant bullet damage - base 30 HP"
    },
    {
        "name": "GE_Damage_Explosion",
        "category": "Combat",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -60.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Damage.Explosion"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "is_radial": True,
        "radial_radius": 500.0,
        "description": "Instant radial explosion damage - base 60 HP, 500cm radius"
    },
    {
        "name": "GE_Damage_Melee",
        "category": "Combat",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -45.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Damage.Melee"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Instant melee damage - base 45 HP"
    },
    {
        "name": "GE_Damage_Zone",
        "category": "Combat",
        "duration_policy": "Instant",
        "duration": 0.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": -5.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Damage.Zone"],
        "required_tags": [],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "gameplay_cues": ["GameplayCue.Damage.Zone"],
        "description": "Instant safe zone tick damage - 5 HP per tick"
    },
    # ── Species Passive GEs (4) ───────────────────────────────────────────────
    {
        "name": "GE_Species_Onith_PeleEscamosa",
        "category": "Species",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.OnithProjectileDamageReduction", "modifier_op": "Additive", "magnitude": 0.15, "channel": "Primary"},
            {"attribute": "Attribute.OnithExplosionDamageReduction", "modifier_op": "Additive", "magnitude": 0.15, "channel": "Primary"}
        ],
        "granted_tags": ["Species.Onith", "Ability.Passive.Species.Onith.PeleEscamosa"],
        "required_tags": ["Species.Onith"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Onith passive - 15% projectile/explosion damage reduction (scaly skin)"
    },
    {
        "name": "GE_Species_Zheers_Adaptabilidade",
        "category": "Species",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.Adaptabilidade", "modifier_op": "Additive", "magnitude": 1.0, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Buff.Adaptabilidade", "Ability.Passive.Species.Zheers.Adaptabilidade"],
        "required_tags": ["Species.Zheers"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Zheers passive - adaptability scaling, all stats +1% per stack"
    },
    {
        "name": "GE_Species_Skeetw_VooPlanador",
        "category": "Species",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.GlideDuration", "modifier_op": "Additive", "magnitude": 5.0, "channel": "Primary"},
            {"attribute": "Attribute.FallSpeedMultiplier", "modifier_op": "Multiplicative", "magnitude": 0.3, "channel": "Primary"}
        ],
        "granted_tags": ["Effect.Buff.Glide", "Ability.Passive.Species.Skeetw.VooPlanador"],
        "required_tags": ["Species.Skeetw"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "description": "Skeetw passive - gliding flight, 5s duration, 70% fall speed reduction"
    },
    {
        "name": "GE_Species_Huran_RegenAquatica",
        "category": "Species",
        "duration_policy": "Infinite",
        "duration": -1.0,
        "modifiers": [
            {"attribute": "Attribute.Health", "modifier_op": "Additive", "magnitude": 3.0, "channel": "Periodic"}
        ],
        "granted_tags": ["Effect.Buff.Regen", "Ability.Passive.Species.Huran.RegeneracaoAquatica"],
        "required_tags": ["Species.Huran"],
        "stacking_type": "NoStacking",
        "stack_limit": 1,
        "period": 1.0,
        "description": "Huran species passive - aquatic regeneration 3 HP/s in water zones"
    },
]


def compute_checksum(data: str) -> str:
    """Compute SHA-256 checksum for validation."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()[:16]


def generate_uasset_json(ge: dict) -> dict:
    """Generate a structured .uasset.json companion file for a GameplayEffect."""
    now = datetime.now(timezone.utc).isoformat()

    # Build the FGameplayEffectSpec structure
    spec = {
        "asset_type": "GameplayEffect",
        "asset_class": "UGameplayEffect",
        "asset_name": ge["name"],
        "version": 1,
        "generated_at": now,
        "generator": "generate_ge_uassets.py",

        "f_gameplay_effect_spec": {
            "duration_policy": ge["duration_policy"],
            "duration_magnitude": ge["duration"],
            "modifiers": ge["modifiers"],
            "granted_tags": ge["granted_tags"],
            "required_tags": ge.get("required_tags", []),
            "stacking_type": ge["stacking_type"],
            "stack_limit_count": ge["stack_limit"],
        },

        "execution_info": {
            "calc_modifiers_from_base": True,
            "period": ge.get("period", 0.0),
            "execute_periodic_on_apply": ge.get("period", 0.0) > 0.0,
            "is_radial": ge.get("is_radial", False),
            "radial_radius": ge.get("radial_radius", 0.0),
        },

        "gameplay_cues": ge.get("gameplay_cues", []),

        "ue5_import_metadata": {
            "content_path": f"GameplayEffects/{ge['category']}/{ge['name']}",
            "package_name": f"/Game/GameplayEffects/{ge['category']}/{ge['name']}",
            "asset_registry_type": "GameplayEffect",
            "import_script": "import_ge_to_ue5.py",
        }
    }

    return spec


def generate_ge_manifest(effects: list) -> dict:
    """Generate the GE_Manifest.json with all 29 GameplayEffects."""
    return {
        "manifest_version": "1.0.0",
        "project": "Khaaos_Run",
        "engine_version": "5.8",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_gameplay_effects": len(effects),
        "categories": {
            "Cooldown": len([e for e in effects if e["category"] == "Cooldown"]),
            "Cost": len([e for e in effects if e["category"] == "Cost"]),
            "Buff": len([e for e in effects if e["category"] == "Buff"]),
            "Debuff": len([e for e in effects if e["category"] == "Debuff"]),
            "Combat": len([e for e in effects if e["category"] == "Combat"]),
            "Species": len([e for e in effects if e["category"] == "Species"]),
        },
        "gameplay_effects": [
            {
                "name": e["name"],
                "category": e["category"],
                "duration_policy": e["duration_policy"],
                "duration": e["duration"],
                "modifier_count": len(e["modifiers"]),
                "granted_tags": e["granted_tags"],
                "required_tags": e.get("required_tags", []),
                "description": e["description"],
                "uasset_json_path": f"GameplayEffects/{e['category']}/{e['name']}.uasset.json",
            }
            for e in effects
        ]
    }


def generate_import_ge_script(effects: list) -> str:
    """Generate the UE5 Python import script for GameplayEffects."""
    lines = [
        '#!/usr/bin/env python3',
        '"""',
        'UE5 Python import script for Khaaos_Run GameplayEffects.',
        '',
        'Run inside UE5 Editor Python console or via command line:',
        '  python import_ge_to_ue5.py',
        '',
        'Requires: unreal module (UE5 Python scripting plugin enabled)',
        '"""',
        '',
        'import unreal',
        'import json',
        'import os',
        '',
        '# UE5 asset utilities',
        'editor_asset_lib = unreal.EditorAssetLibrary',
        'system_lib = unreal.SystemLibrary',
        '',
        '# Base content path',
        'CONTENT_BASE = "/Game/GameplayEffects"',
        '',
        '# Duration policy mapping',
        'DURATION_POLICY_MAP = {',
        '    "Instant": unreal.EDurationType.INSTANT,',
        '    "HasDuration": unreal.EDurationType.HAS_DURATION,',
        '    "Infinite": unreal.EDurationType.INFINITE,',
        '}',
        '',
        '# Modifier op mapping',
        'MODIFIER_OP_MAP = {',
        '    "Additive": unreal.EModifierOp.ADD,',
        '    "Multiplicative": unreal.EModifierOp.MULTIPLY,',
        '    "Division": unreal.EModifierOp.DIVIDE,',
        '    "Override": unreal.EModifierOp.OVERRIDE,',
        '}',
        '',
        '# Stacking type mapping',
        'STACKING_TYPE_MAP = {',
        '    "NoStacking": unreal.EGameplayEffectStackingType.NO_STACKING,',
        '    "StackByDuration": unreal.EGameplayEffectStackingType.STACK_BY_DURATION,',
        '    "StackBySource": unreal.EGameplayEffectStackingType.STACK_BY_SOURCE,',
        '    "StackCountReset": unreal.EGameplayEffectStackingType.STACK_COUNT_RESET,',
        '}',
        '',
        '',
        'def load_ge_spec(json_path: str) -> dict:',
        '    """Load a .uasset.json spec file."""',
        '    with open(json_path, "r") as f:',
        '        return json.load(f)',
        '',
        '',
        'def create_gameplay_effect(spec: dict) -> bool:',
        '    """Create a GameplayEffect asset from a JSON spec."""',
        '    spec_data = spec["f_gameplay_effect_spec"]',
        '    asset_name = spec["asset_name"]',
        '    category = spec["ue5_import_metadata"]["content_path"].split("/")[1]',
        '    package_path = f"{CONTENT_BASE}/{category}"',
        '    full_path = f"{package_path}/{asset_name}"',
        '',
        '    # Check if asset already exists',
        '    if editor_asset_lib.does_asset_exist(full_path):',
        '        unreal.log_warning(f"Asset already exists: {full_path}, skipping")',
        '        return True',
        '',
        '    try:',
        '        # Create the GameplayEffect asset',
        '        asset = editor_asset_lib.create_asset(asset_name, package_path, unreal.GameplayEffect, None)',
        '        if not asset:',
        '            unreal.log_error(f"Failed to create asset: {full_path}")',
        '            return False',
        '',
        '        # Set duration policy',
        '        policy_key = spec_data["duration_policy"]',
        '        if policy_key in DURATION_POLICY_MAP:',
        '            asset.set_editor_property("duration_policy", DURATION_POLICY_MAP[policy_key])',
        '',
        '        # Set duration magnitude',
        '        if spec_data["duration_magnitude"] != 0:',
        '            magnitude = unreal.ScalableFloat()',
        '            magnitude.set_editor_property("value", spec_data["duration_magnitude"])',
        '            asset.set_editor_property("duration_magnitude", magnitude)',
        '',
        '        # Set stacking',
        '        stack_type = spec_data["stacking_type"]',
        '        if stack_type in STACKING_TYPE_MAP:',
        '            asset.set_editor_property("stacking_type", STACKING_TYPE_MAP[stack_type])',
        '        asset.set_editor_property("stack_limit_count", spec_data["stack_limit_count"])',
        '',
        '        # Add modifiers',
        '        for mod_data in spec_data["modifiers"]:',
        '            modifier = unreal.FGameplayModifierInfo()',
        '            modifier.set_editor_property("modifier_op",',
        '                MODIFIER_OP_MAP.get(mod_data["modifier_op"], unreal.EModifierOp.ADD))',
        '            mag = unreal.ScalableFloat()',
        '            mag.set_editor_property("value", mod_data["magnitude"])',
        '            modifier.set_editor_property("modifier_magnitude", mag)',
        '            asset.modifiers.append(modifier)',
        '',
        '        # Add granted tags',
        '        if spec_data["granted_tags"]:',
        '            tag_container = unreal.GameplayTagContainer()',
        '            for tag_str in spec_data["granted_tags"]:',
        '                tag = unreal.GameplayTag.request_gameplay_tag(tag_str)',
        '                if tag.is_valid():',
        '                    tag_container.add_tag(tag)',
        '            asset.set_editor_property("granted_tags", tag_container)',
        '',
        '        # Save the asset',
        '        editor_asset_lib.save_asset(full_path, only_if_is_dirty=False)',
        '        unreal.log(f"Created GameplayEffect: {full_path}")',
        '        return True',
        '',
        '    except Exception as e:',
        '        unreal.log_error(f"Error creating {full_path}: {e}")',
        '        return False',
        '',
        '',
        'def import_all_gameplay_effects(json_dir: str) -> dict:',
        '    """Import all GameplayEffects from .uasset.json files."""',
        '    results = {"total": 0, "success": 0, "failed": 0, "errors": []}',
        '',
        '    for root, dirs, files in os.walk(json_dir):',
        '        for fname in files:',
        '            if not fname.endswith(".uasset.json"):',
        '                continue',
        '            fpath = os.path.join(root, fname)',
        '            try:',
        '                spec = load_ge_spec(fpath)',
        '                if create_gameplay_effect(spec):',
        '                    results["success"] += 1',
        '                else:',
        '                    results["failed"] += 1',
        '                    results["errors"].append(fpath)',
        '            except Exception as e:',
        '                results["failed"] += 1',
        '                results["errors"].append(f"{fpath}: {e}")',
        '            results["total"] += 1',
        '',
        '    unreal.log(f"GE Import Complete: {results[\'success\']}/{results[\'total\']} successful")',
        '    return results',
        '',
        '',
        'if __name__ == "__main__":',
        '    # Path to the GameplayEffects content directory',
        '    ge_content_dir = os.path.join(',
        '        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),',
        '        "Unreal", "KhaaosRun", "Content", "GameplayEffects"',
        '    )',
        '    import_all_gameplay_effects(ge_content_dir)',
    ]

    return "\n".join(lines)


def main():
    """Main entry point - generate all GE .uasset.json files and manifests."""
    effects = GAMEPLAY_EFFECTS
    print(f"Generating {len(effects)} GameplayEffect .uasset.json files...")

    # Ensure directories exist
    for cat in set(e["category"] for e in effects):
        (CONTENT_DIR / cat).mkdir(parents=True, exist_ok=True)

    # Generate .uasset.json for each GE
    generated_files = []
    for ge in effects:
        spec = generate_uasset_json(ge)
        output_path = CONTENT_DIR / ge["category"] / f"{ge['name']}.uasset.json"

        with open(output_path, "w") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)

        # Compute checksum
        with open(output_path, "r") as f:
            checksum = compute_checksum(f.read())
        spec["checksum"] = checksum

        # Rewrite with checksum
        with open(output_path, "w") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)

        generated_files.append(str(output_path))
        print(f"  Created: {ge['category']}/{ge['name']}.uasset.json")

    # Generate GE_Manifest.json
    manifest = generate_ge_manifest(effects)
    manifest_path = CONTENT_DIR / "GE_Manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"  Created: GE_Manifest.json ({len(effects)} effects)")

    # Generate UE5 Python import script
    import_script = generate_import_ge_script(effects)
    import_path = SCRIPTS_DIR / "import_ge_to_ue5.py"
    with open(import_path, "w") as f:
        f.write(import_script)
    print(f"  Created: scripts/import_ge_to_ue5.py")

    print(f"\nDone! Generated {len(generated_files)} .uasset.json files + manifest + import script")
    return generated_files


if __name__ == "__main__":
    main()
