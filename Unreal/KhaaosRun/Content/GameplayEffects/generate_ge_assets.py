#!/usr/bin/env python3
"""
Khaaos Run - UE5 GameplayEffect Asset Generator
Run this script inside Unreal Editor's Python console:
  PythonScriptPlugin::ExecuteScript("generate_ge_assets.py")
"""

import unreal

def create_gameplay_effect(name, asset_path, duration_policy, modifier_op,
                           attribute_name, magnitude, tags,
                           duration_seconds=0, period=0, stack_limit=1):
    """Create a GameplayEffect blueprint asset."""
    # Check if asset already exists
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        print(f"  [SKIP] {name} already exists")
        return

    # Create the asset
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.GameplayEffectFactoryNew()
    ge = asset_tools.create_asset(name, unreal.SystemLibrary.get_project_content_directory(),
                                   unreal.GameplayEffect, factory)
    if not ge:
        print(f"  [FAIL] Could not create {name}")
        return

    # Set duration policy
    dp_map = {"Instant": unreal.EDurationPolicyType.INSTANT,
              "HasDuration": unreal.EDurationPolicyType.HAS_DURATION,
              "Infinite": unreal.EDurationPolicyType.INFINITE}
    ge.set_editor_property("duration_policy", dp_map.get(duration_policy, unreal.EDurationPolicyType.INFINITE))

    if duration_policy == "HasDuration" and duration_seconds > 0:
        ge.set_editor_property("duration_magnitude", unreal.ScalableFloat(duration_seconds))

    # Set periodic execution if applicable
    if period > 0:
        ge.set_editor_property("period", unreal.ScalableFloat(period))

    # Add modifier
    if attribute_name != "None":
        modifier = unreal.FGameplayModifierInfo()
        # Set modifier operation
        op_map = {"Add": unreal.EGameplayModOp.ADD,
                  "Multiply": unreal.EGameplayModOp.MULTIPLY,
                  "Override": unreal.EGameplayModOp.OVERRIDE}
        modifier.set_editor_property("modifier_op", op_map.get(modifier_op, unreal.EGameplayModOp.ADD))
        modifier.set_editor_property("magnitude", unreal.ScalableFloat(magnitude))
        ge.get_editor_property("modifiers").append(modifier)

    # Set granted tags
    if tags:
        granted_tags = unreal.GameplayTagContainer()
        for tag in tags.split(","):
            granted_tags.add_tag(unreal.GameplayTag.request_gameplay_tag(tag.strip()))
        ge.set_editor_property("granted_tags", granted_tags)

    # Save the asset
    unreal.EditorAssetLibrary.save_asset(asset_path, only_if_is_dirty=False)
    print(f"  [OK] Created {name} at {asset_path}")


def main():
    """Generate all Khaaos Run GameplayEffect assets."""
    print("Khaaos Run - Generating GameplayEffect assets...")
    base = "/Game/GameplayEffects/"

    create_gameplay_effect(
        name="GE_HuranRegen",
        asset_path="/Game/GameplayEffects/Species/GE_HuranRegen",
        duration_policy="Infinite",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=5.0,
        tags="Effect.Buff.HuranRegen",
        duration_seconds=0,
        period=1.0
    )
    create_gameplay_effect(
        name="GE_HuranWaterResist",
        asset_path="/Game/GameplayEffects/Species/GE_HuranWaterResist",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="RingDamageTaken",
        magnitude=0.5,
        tags="Effect.Buff.WaterResist",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_HuranSwimBonus",
        asset_path="/Game/GameplayEffects/Species/GE_HuranSwimBonus",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="SwimSpeed",
        magnitude=1.2,
        tags="Effect.Buff.SwimBonus",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_KhaelCryoResist",
        asset_path="/Game/GameplayEffects/Species/GE_KhaelCryoResist",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="CryoDamageTaken",
        magnitude=0.3,
        tags="Effect.Buff.CryoResist",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_VenexSpeedBonus",
        asset_path="/Game/GameplayEffects/Species/GE_VenexSpeedBonus",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="MoveSpeed",
        magnitude=1.2,
        tags="Effect.Buff.SpeedBonus",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_OnithToxicResist",
        asset_path="/Game/GameplayEffects/Species/GE_OnithToxicResist",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="ToxicDamageTaken",
        magnitude=0.85,
        tags="Effect.Buff.ToxicResist",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_ZheersRadResist",
        asset_path="/Game/GameplayEffects/Species/GE_ZheersRadResist",
        duration_policy="Infinite",
        modifier_op="Multiply",
        attribute_name="RadDamageTaken",
        magnitude=0.9,
        tags="Effect.Buff.RadResist",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_SkeetwFogStealth",
        asset_path="/Game/GameplayEffects/Species/GE_SkeetwFogStealth",
        duration_policy="Infinite",
        modifier_op="Override",
        attribute_name="Visibility",
        magnitude=0.0,
        tags="Effect.Buff.FogStealth",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_ShootDamage",
        asset_path="/Game/GameplayEffects/Combat/GE_ShootDamage",
        duration_policy="Instant",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-25.0,
        tags="Effect.Damage.Ballistic",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_HeadshotDamage",
        asset_path="/Game/GameplayEffects/Combat/GE_HeadshotDamage",
        duration_policy="Instant",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-50.0,
        tags="Effect.Damage.Ballistic",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_MeleeDamage",
        asset_path="/Game/GameplayEffects/Combat/GE_MeleeDamage",
        duration_policy="Instant",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-50.0,
        tags="Effect.Damage.Melee",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_UltimateDamage",
        asset_path="/Game/GameplayEffects/Combat/GE_UltimateDamage",
        duration_policy="Instant",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-200.0,
        tags="Effect.Damage.Area",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_ShieldBuff",
        asset_path="/Game/GameplayEffects/Defense/GE_ShieldBuff",
        duration_policy="HasDuration",
        modifier_op="Add",
        attribute_name="Shield",
        magnitude=100.0,
        tags="Effect.Buff.Shielded",
        duration_seconds=5.0,
        period=0
    )
    create_gameplay_effect(
        name="GE_HealOverTime",
        asset_path="/Game/GameplayEffects/Defense/GE_HealOverTime",
        duration_policy="HasDuration",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=50.0,
        tags="Effect.Buff.HealOverTime",
        duration_seconds=3.0,
        period=0.5
    )
    create_gameplay_effect(
        name="GE_SprintSpeed",
        asset_path="/Game/GameplayEffects/Movement/GE_SprintSpeed",
        duration_policy="HasDuration",
        modifier_op="Multiply",
        attribute_name="MoveSpeed",
        magnitude=1.5,
        tags="Effect.Buff.SpeedBoost",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_SlideSpeed",
        asset_path="/Game/GameplayEffects/Movement/GE_SlideSpeed",
        duration_policy="HasDuration",
        modifier_op="Multiply",
        attribute_name="MoveSpeed",
        magnitude=2.0,
        tags="Effect.Buff.SpeedBoost",
        duration_seconds=1.0,
        period=0
    )
    create_gameplay_effect(
        name="GE_SlowDebuff",
        asset_path="/Game/GameplayEffects/Debuffs/GE_SlowDebuff",
        duration_policy="HasDuration",
        modifier_op="Multiply",
        attribute_name="MoveSpeed",
        magnitude=0.5,
        tags="Effect.Debuff.Slowed",
        duration_seconds=3.0,
        period=0
    )
    create_gameplay_effect(
        name="GE_FreezeDebuff",
        asset_path="/Game/GameplayEffects/Debuffs/GE_FreezeDebuff",
        duration_policy="HasDuration",
        modifier_op="Override",
        attribute_name="MoveSpeed",
        magnitude=0.0,
        tags="Effect.Debuff.Frozen",
        duration_seconds=2.0,
        period=0
    )
    create_gameplay_effect(
        name="GE_BurnDebuff",
        asset_path="/Game/GameplayEffects/Debuffs/GE_BurnDebuff",
        duration_policy="HasDuration",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-5.0,
        tags="Effect.Debuff.Burning",
        duration_seconds=4.0,
        period=1.0
    )
    create_gameplay_effect(
        name="GE_PoisonDebuff",
        asset_path="/Game/GameplayEffects/Debuffs/GE_PoisonDebuff",
        duration_policy="HasDuration",
        modifier_op="Add",
        attribute_name="Health",
        magnitude=-3.0,
        tags="Effect.Debuff.Poisoned",
        duration_seconds=5.0,
        period=1.0
    )
    create_gameplay_effect(
        name="GE_EnergyCost",
        asset_path="/Game/GameplayEffects/Costs/GE_EnergyCost",
        duration_policy="Instant",
        modifier_op="Add",
        attribute_name="Energy",
        magnitude=-10.0,
        tags="Effect.Cost.Energy",
        duration_seconds=0,
        period=0
    )
    create_gameplay_effect(
        name="GE_Cooldown",
        asset_path="/Game/GameplayEffects/Cooldowns/GE_Cooldown",
        duration_policy="HasDuration",
        modifier_op="Override",
        attribute_name="None",
        magnitude=1.0,
        tags="Cooldown.Global",
        duration_seconds=5.0,
        period=0
    )

    print("\nAll GameplayEffect assets generated successfully!")

main()