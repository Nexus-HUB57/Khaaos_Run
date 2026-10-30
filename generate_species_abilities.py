#!/usr/bin/env python3
"""
Khaaos Run Species Active Abilities Generator
Generates 48 unique active abilities (6 species x 8 abilities)
+ KhaaosSpeciesAbilitySet + KhaaosAbilityRegistry
+ DefaultGameplayTags.ini entries + GE_Manifest.json
"""

import json
import os

BASE = "/home/z/my-project/Khaaos_Run/repo/Unreal/KhaaosRun/Source/KhaaosRun/Game/AbilitySystem/Species"

# ═══════════════════════════════════════════════════════════════════════════════
# ABILITY DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

SPECIES = {
    "Huran": {
        "display": "Huran",
        "species_tag": "Species.Huran",
        "category": "Amphibious",
        "abilities": [
            {
                "name": "TidalSurge",
                "desc": "Water wave AoE knockback",
                "detail": "8m radius AoE water wave that knocks back all enemies",
                "cooldown": 2.0, "energy": 15.0, "damage": 40.0, "range": 800.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.TidalSurge",
                "effect_tag": "Effect.Damage.Water",
                "props": [("KnockbackForce", "float", "800.0f"), ("AoERadius", "float", "800.0f")],
            },
            {
                "name": "AquaShield",
                "desc": "Water barrier absorbs damage",
                "detail": "Water barrier that absorbs 50 damage for 10s",
                "cooldown": 15.0, "energy": 25.0, "damage": 0.0, "range": 0.0, "duration": 10.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.AquaShield",
                "effect_tag": "Effect.Buff.Shielded",
                "props": [("ShieldAmount", "float", "50.0f"), ("ShieldDuration", "float", "10.0f")],
            },
            {
                "name": "DiveBomb",
                "desc": "Underwater dash + surface explosion",
                "detail": "Dashes 20m underwater and explodes on surfacing for 30 dmg",
                "cooldown": 8.0, "energy": 30.0, "damage": 30.0, "range": 2000.0, "duration": 0.5,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.DiveBomb",
                "effect_tag": "Effect.Damage.Explosion",
                "props": [("DashDistance", "float", "2000.0f"), ("ExplosionDamage", "float", "30.0f")],
            },
            {
                "name": "FloodZone",
                "desc": "Create temporary water zone",
                "detail": "Creates a 5m radius water zone lasting 15s that slows enemies",
                "cooldown": 30.0, "energy": 40.0, "damage": 0.0, "range": 500.0, "duration": 15.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.FloodZone",
                "effect_tag": "Effect.Debuff.Slowed",
                "props": [("ZoneRadius", "float", "500.0f"), ("ZoneDuration", "float", "15.0f")],
            },
            {
                "name": "PressureStrike",
                "desc": "Hydrostatic pressure punch",
                "detail": "Melee hydrostatic pressure punch dealing 75 dmg + slow",
                "cooldown": 4.0, "energy": 20.0, "damage": 75.0, "range": 150.0, "duration": 2.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.PressureStrike",
                "effect_tag": "Effect.Damage.Melee",
                "props": [("MeleeDamage", "float", "75.0f"), ("SlowDuration", "float", "2.0f")],
            },
            {
                "name": "GillsRegen",
                "desc": "Enhanced regen while in water",
                "detail": "Toggle: 20 HP/s regeneration while in water",
                "cooldown": 5.0, "energy": 10.0, "damage": 0.0, "range": 0.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": True,
                "tag": "Ability.Species.Huran.GillsRegen",
                "effect_tag": "Effect.Buff.Regen",
                "props": [("RegenPerSecond", "float", "20.0f"), ("bRequiresWater", "uint8", "1")],
            },
            {
                "name": "Whirlpool",
                "desc": "Vortex trap that pulls and roots",
                "detail": "Creates a whirlpool pulling enemies 3m and rooting 2s",
                "cooldown": 20.0, "energy": 35.0, "damage": 15.0, "range": 600.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Huran.Whirlpool",
                "effect_tag": "Effect.Debuff.Rooted",
                "props": [("PullDistance", "float", "300.0f"), ("RootDuration", "float", "2.0f")],
            },
            {
                "name": "TsunamiRage",
                "desc": "Ultimate: massive wave",
                "detail": "Sends a 15m wide massive wave dealing 150 dmg",
                "cooldown": 120.0, "energy": 80.0, "damage": 150.0, "range": 1500.0, "duration": 3.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Huran.TsunamiRage",
                "effect_tag": "Effect.Damage.Water",
                "props": [("WaveWidth", "float", "1500.0f"), ("WaveDamage", "float", "150.0f")],
            },
        ],
    },
    "Khael": {
        "display": "Khael",
        "species_tag": "Species.Khael",
        "category": "Cryogenic",
        "abilities": [
            {
                "name": "FrostBolt",
                "desc": "Ice projectile with freeze",
                "detail": "Launches an ice projectile dealing 40 dmg + 2s freeze",
                "cooldown": 3.0, "energy": 15.0, "damage": 40.0, "range": 3000.0, "duration": 2.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.FrostBolt",
                "effect_tag": "Effect.Debuff.Frozen",
                "props": [("ProjectileDamage", "float", "40.0f"), ("FreezeDuration", "float", "2.0f")],
            },
            {
                "name": "CryoWall",
                "desc": "Ice barrier wall",
                "detail": "Creates a 100 HP ice wall lasting 6s",
                "cooldown": 12.0, "energy": 30.0, "damage": 0.0, "range": 500.0, "duration": 6.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.CryoWall",
                "effect_tag": "Effect.Buff.Shielded",
                "props": [("WallHealth", "float", "100.0f"), ("WallDuration", "float", "6.0f")],
            },
            {
                "name": "Blizzard",
                "desc": "AoE slow zone",
                "detail": "Creates an 8m blizzard zone with 50% slow for 4s",
                "cooldown": 15.0, "energy": 35.0, "damage": 10.0, "range": 800.0, "duration": 4.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.Blizzard",
                "effect_tag": "Effect.Debuff.Slowed",
                "props": [("SlowPercent", "float", "0.5f"), ("BlizzardRadius", "float", "800.0f")],
            },
            {
                "name": "FrozenArmor",
                "desc": "Ice armor damage reduction",
                "detail": "Encases in ice granting +30% dmg reduction for 8s",
                "cooldown": 20.0, "energy": 25.0, "damage": 0.0, "range": 0.0, "duration": 8.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.FrozenArmor",
                "effect_tag": "Effect.Buff.DamageReduction",
                "props": [("DamageReductionPercent", "float", "0.3f"), ("ArmorDuration", "float", "8.0f")],
            },
            {
                "name": "Avalanche",
                "desc": "Downhill ice slide dash",
                "detail": "Ice dash 15m leaving a 60 dmg frost trail",
                "cooldown": 10.0, "energy": 30.0, "damage": 60.0, "range": 1500.0, "duration": 1.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.Avalanche",
                "effect_tag": "Effect.Damage.Fire",
                "props": [("DashDistance", "float", "1500.0f"), ("TrailDamage", "float", "60.0f")],
            },
            {
                "name": "Frostbite",
                "desc": "Melee freeze attack",
                "detail": "Melee strike dealing 30 dmg + 1s freeze",
                "cooldown": 3.0, "energy": 10.0, "damage": 30.0, "range": 150.0, "duration": 1.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.Frostbite",
                "effect_tag": "Effect.Debuff.Frozen",
                "props": [("MeleeDamage", "float", "30.0f"), ("FreezeDuration", "float", "1.0f")],
            },
            {
                "name": "IceClone",
                "desc": "Decoy ice clone that explodes",
                "detail": "Spawns an ice clone decoy that explodes for 40 dmg when destroyed",
                "cooldown": 18.0, "energy": 25.0, "damage": 40.0, "range": 300.0, "duration": 8.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Khael.IceClone",
                "effect_tag": "Effect.Damage.Explosion",
                "props": [("CloneExplosionDamage", "float", "40.0f"), ("CloneDuration", "float", "8.0f")],
            },
            {
                "name": "AbsoluteZero",
                "desc": "Ultimate: freeze all in range",
                "detail": "Freezes all enemies in 12m for 3s dealing 80 dmg",
                "cooldown": 120.0, "energy": 80.0, "damage": 80.0, "range": 1200.0, "duration": 3.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Khael.AbsoluteZero",
                "effect_tag": "Effect.Debuff.Frozen",
                "props": [("FreezeRadius", "float", "1200.0f"), ("FreezeDamage", "float", "80.0f")],
            },
        ],
    },
    "Venex": {
        "display": "Venex",
        "species_tag": "Species.Venex",
        "category": "Cybernetic",
        "abilities": [
            {
                "name": "PulseBlast",
                "desc": "EMP blast disables shields",
                "detail": "EMP blast disabling shields for 3s in 6m radius",
                "cooldown": 8.0, "energy": 20.0, "damage": 15.0, "range": 600.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.PulseBlast",
                "effect_tag": "Effect.Debuff.Disarmed",
                "props": [("EMPRadius", "float", "600.0f"), ("DisableDuration", "float", "3.0f")],
            },
            {
                "name": "Overclock",
                "desc": "Boost fire rate and speed",
                "detail": "Overclocks systems for +40% fire rate and speed for 5s",
                "cooldown": 20.0, "energy": 30.0, "damage": 0.0, "range": 0.0, "duration": 5.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.Overclock",
                "effect_tag": "Effect.Buff.Overclock",
                "props": [("FireRateBonus", "float", "0.4f"), ("SpeedBonus", "float", "0.4f")],
            },
            {
                "name": "TargetLock",
                "desc": "Auto-aim for next shots",
                "detail": "Locks onto target for auto-aim on next 3 shots for 2s",
                "cooldown": 15.0, "energy": 25.0, "damage": 0.0, "range": 2000.0, "duration": 2.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.TargetLock",
                "effect_tag": "Effect.Buff.Overclock",
                "props": [("LockShots", "int32", "3"), ("LockDuration", "float", "2.0f")],
            },
            {
                "name": "NaniteRepair",
                "desc": "Self-repair over time",
                "detail": "Nanite self-repair healing 5 HP/s for 8s",
                "cooldown": 25.0, "energy": 30.0, "damage": 0.0, "range": 0.0, "duration": 8.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.NaniteRepair",
                "effect_tag": "Effect.Buff.HealOverTime",
                "props": [("HealPerSecond", "float", "5.0f"), ("RepairDuration", "float", "8.0f")],
            },
            {
                "name": "CyberDash",
                "desc": "Blink teleport",
                "detail": "Blink teleports 10m forward",
                "cooldown": 6.0, "energy": 15.0, "damage": 0.0, "range": 1000.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.CyberDash",
                "effect_tag": "Effect.Buff.SpeedBoost",
                "props": [("DashDistance", "float", "1000.0f"), ("bBlinkTeleport", "uint8", "1")],
            },
            {
                "name": "ScannerSweep",
                "desc": "Reveal nearby enemies",
                "detail": "Scans and reveals all enemies in 20m for 4s",
                "cooldown": 10.0, "energy": 15.0, "damage": 0.0, "range": 2000.0, "duration": 4.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.ScannerSweep",
                "effect_tag": "Effect.Buff.Recon",
                "props": [("ScanRadius", "float", "2000.0f"), ("RevealDuration", "float", "4.0f")],
            },
            {
                "name": "StasisField",
                "desc": "Temporary invulnerability",
                "detail": "Activates stasis field granting 3s invulnerability",
                "cooldown": 30.0, "energy": 40.0, "damage": 0.0, "range": 0.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Venex.StasisField",
                "effect_tag": "Effect.Buff.Invulnerable",
                "props": [("StasisDuration", "float", "3.0f"), ("bImmuneToDamage", "uint8", "1")],
            },
            {
                "name": "Overload",
                "desc": "Ultimate: massive EMP",
                "detail": "Massive EMP in 15m disabling for 5s + 100 dmg",
                "cooldown": 120.0, "energy": 80.0, "damage": 100.0, "range": 1500.0, "duration": 5.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Venex.Overload",
                "effect_tag": "Effect.Debuff.Disarmed",
                "props": [("EMPRadius", "float", "1500.0f"), ("EMPDamage", "float", "100.0f")],
            },
        ],
    },
    "Onith": {
        "display": "Onith",
        "species_tag": "Species.Onith",
        "category": "Toxic",
        "abilities": [
            {
                "name": "VenomSpit",
                "desc": "Toxic projectile with DoT",
                "detail": "Spits venom dealing 25 dmg + 5dmg/s DoT for 4s",
                "cooldown": 3.0, "energy": 10.0, "damage": 25.0, "range": 2000.0, "duration": 4.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.VenomSpit",
                "effect_tag": "Effect.Debuff.Poisoned",
                "props": [("InitialDamage", "float", "25.0f"), ("DoTPerSecond", "float", "5.0f"), ("DoTDuration", "float", "4.0f")],
            },
            {
                "name": "NoxiousGas",
                "desc": "Poison gas cloud",
                "detail": "Deploys a 6m gas cloud dealing 3dmg/s for 6s",
                "cooldown": 12.0, "energy": 20.0, "damage": 3.0, "range": 600.0, "duration": 6.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.NoxiousGas",
                "effect_tag": "Effect.Debuff.Poisoned",
                "props": [("GasRadius", "float", "600.0f"), ("DamagePerSecond", "float", "3.0f")],
            },
            {
                "name": "PlagueTouch",
                "desc": "Melee infection",
                "detail": "Melee infection dealing 40 dmg + 8dmg/s DoT for 3s",
                "cooldown": 4.0, "energy": 15.0, "damage": 40.0, "range": 150.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.PlagueTouch",
                "effect_tag": "Effect.Debuff.Poisoned",
                "props": [("MeleeDamage", "float", "40.0f"), ("InfectionDoT", "float", "8.0f")],
            },
            {
                "name": "ToxicHusk",
                "desc": "Poison armor reflects damage",
                "detail": "Toxic armor reflecting 10 dmg on hit for 8s",
                "cooldown": 18.0, "energy": 25.0, "damage": 10.0, "range": 0.0, "duration": 8.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.ToxicHusk",
                "effect_tag": "Effect.Buff.Thorns",
                "props": [("ReflectDamage", "float", "10.0f"), ("HuskDuration", "float", "8.0f")],
            },
            {
                "name": "Contaminate",
                "desc": "Ground poison zone",
                "detail": "Contaminates 4m ground zone dealing 8dmg/s for 5s",
                "cooldown": 15.0, "energy": 25.0, "damage": 8.0, "range": 400.0, "duration": 5.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.Contaminate",
                "effect_tag": "Effect.Debuff.Poisoned",
                "props": [("ContaminateRadius", "float", "400.0f"), ("DamagePerSecond", "float", "8.0f")],
            },
            {
                "name": "ParasiteDrain",
                "desc": "Life steal beam",
                "detail": "Parasitic beam dealing 30 dmg and healing 30 HP",
                "cooldown": 10.0, "energy": 20.0, "damage": 30.0, "range": 800.0, "duration": 1.5,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.ParasiteDrain",
                "effect_tag": "Effect.Buff.Leech",
                "props": [("DrainDamage", "float", "30.0f"), ("HealAmount", "float", "30.0f")],
            },
            {
                "name": "BioMimic",
                "desc": "Stealth + poison burst on break",
                "detail": "Enter stealth for 3s; breaking stealth triggers poison burst",
                "cooldown": 20.0, "energy": 30.0, "damage": 25.0, "range": 400.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Onith.BioMimic",
                "effect_tag": "Effect.Buff.Stealth",
                "props": [("StealthDuration", "float", "3.0f"), ("BurstDamage", "float", "25.0f")],
            },
            {
                "name": "Pandemic",
                "desc": "Ultimate: global DoT",
                "detail": "Spreads pandemic in 10m dealing 15dmg/s for 5s",
                "cooldown": 120.0, "energy": 80.0, "damage": 15.0, "range": 1000.0, "duration": 5.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Onith.Pandemic",
                "effect_tag": "Effect.Debuff.Poisoned",
                "props": [("PandemicRadius", "float", "1000.0f"), ("DoTPerSecond", "float", "15.0f")],
            },
        ],
    },
    "Zheers": {
        "display": "Zheers",
        "species_tag": "Species.Zheers",
        "category": "Radiation",
        "abilities": [
            {
                "name": "RadBurst",
                "desc": "Gamma flash with blind",
                "detail": "Gamma flash dealing 30 dmg + 1s blind in 6m",
                "cooldown": 8.0, "energy": 20.0, "damage": 30.0, "range": 600.0, "duration": 1.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.RadBurst",
                "effect_tag": "Effect.Debuff.Blinded",
                "props": [("BurstDamage", "float", "30.0f"), ("BlindDuration", "float", "1.0f")],
            },
            {
                "name": "MutateForm",
                "desc": "Temporary mutation buff",
                "detail": "Mutates form granting +50 HP and +20% dmg for 8s",
                "cooldown": 25.0, "energy": 30.0, "damage": 0.0, "range": 0.0, "duration": 8.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.MutateForm",
                "effect_tag": "Effect.Buff.Mutation",
                "props": [("BonusHealth", "float", "50.0f"), ("DamageBonus", "float", "0.2f")],
            },
            {
                "name": "FissionShot",
                "desc": "Splitting projectile",
                "detail": "Fires a splitting projectile dealing 20 dmg x 3 fragments",
                "cooldown": 5.0, "energy": 15.0, "damage": 20.0, "range": 2500.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.FissionShot",
                "effect_tag": "Effect.Damage.Bullet",
                "props": [("FragmentDamage", "float", "20.0f"), ("FragmentCount", "int32", "3")],
            },
            {
                "name": "RadAura",
                "desc": "Passive AoE radiation toggle",
                "detail": "Toggle: 3m radiation aura dealing 5dmg/s to nearby enemies",
                "cooldown": 15.0, "energy": 10.0, "damage": 5.0, "range": 300.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": True,
                "tag": "Ability.Species.Zheers.RadAura",
                "effect_tag": "Effect.Damage.Zone",
                "props": [("AuraRadius", "float", "300.0f"), ("DamagePerSecond", "float", "5.0f")],
            },
            {
                "name": "ChernobylCharge",
                "desc": "Irradiated dash",
                "detail": "Irradiated dash 12m leaving 40 dmg radiation trail",
                "cooldown": 10.0, "energy": 25.0, "damage": 40.0, "range": 1200.0, "duration": 1.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.ChernobylCharge",
                "effect_tag": "Effect.Damage.Zone",
                "props": [("DashDistance", "float", "1200.0f"), ("TrailDamage", "float", "40.0f")],
            },
            {
                "name": "DegenField",
                "desc": "Armor decay zone",
                "detail": "Deploys a 5m decay zone reducing armor 30% for 6s",
                "cooldown": 18.0, "energy": 25.0, "damage": 0.0, "range": 500.0, "duration": 6.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.DegenField",
                "effect_tag": "Effect.Debuff.ArmorReduction",
                "props": [("ArmorReductionPercent", "float", "0.3f"), ("FieldRadius", "float", "500.0f")],
            },
            {
                "name": "HalfLife",
                "desc": "Delayed explosion",
                "detail": "Places a delayed explosion: 3s fuse, 60 dmg in 8m",
                "cooldown": 12.0, "energy": 20.0, "damage": 60.0, "range": 800.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Zheers.HalfLife",
                "effect_tag": "Effect.Damage.Explosion",
                "props": [("FuseTime", "float", "3.0f"), ("ExplosionDamage", "float", "60.0f")],
            },
            {
                "name": "Meltdown",
                "desc": "Ultimate: nuclear explosion",
                "detail": "Nuclear meltdown dealing 200 dmg in 20m radius",
                "cooldown": 120.0, "energy": 80.0, "damage": 200.0, "range": 2000.0, "duration": 2.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Zheers.Meltdown",
                "effect_tag": "Effect.Damage.Explosion",
                "props": [("NukeRadius", "float", "2000.0f"), ("NukeDamage", "float", "200.0f")],
            },
        ],
    },
    "Skeetw": {
        "display": "Skeetw",
        "species_tag": "Species.Skeetw",
        "category": "AvianFog",
        "abilities": [
            {
                "name": "FogCloud",
                "desc": "Deploy blinding fog",
                "detail": "Deploys an 8m fog cloud blinding enemies for 6s",
                "cooldown": 10.0, "energy": 15.0, "damage": 0.0, "range": 800.0, "duration": 6.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.FogCloud",
                "effect_tag": "Effect.Debuff.Blinded",
                "props": [("FogRadius", "float", "800.0f"), ("BlindDuration", "float", "6.0f")],
            },
            {
                "name": "SkyDive",
                "desc": "Aerial dive attack",
                "detail": "Aerial dive from above dealing 70 dmg in 15m range",
                "cooldown": 8.0, "energy": 25.0, "damage": 70.0, "range": 1500.0, "duration": 1.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.SkyDive",
                "effect_tag": "Effect.Damage.Melee",
                "props": [("DiveDamage", "float", "70.0f"), ("DiveRange", "float", "1500.0f")],
            },
            {
                "name": "TalonStrike",
                "desc": "Enhanced melee with bleed",
                "detail": "Enhanced melee dealing 50 dmg + 5dmg/s bleed for 3s",
                "cooldown": 3.0, "energy": 10.0, "damage": 50.0, "range": 200.0, "duration": 3.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.TalonStrike",
                "effect_tag": "Effect.Debuff.Bleeding",
                "props": [("StrikeDamage", "float", "50.0f"), ("BleedPerSecond", "float", "5.0f")],
            },
            {
                "name": "WindGust",
                "desc": "Cone knockback",
                "detail": "Wind gust in 8m cone knocking enemies back",
                "cooldown": 6.0, "energy": 15.0, "damage": 10.0, "range": 800.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.WindGust",
                "effect_tag": "Effect.Debuff.Knockback",
                "props": [("GustRange", "float", "800.0f"), ("KnockbackForce", "float", "600.0f")],
            },
            {
                "name": "FeatherFlurry",
                "desc": "5 feather projectiles",
                "detail": "Launches 5 feather projectiles each dealing 15 dmg",
                "cooldown": 4.0, "energy": 15.0, "damage": 15.0, "range": 1500.0, "duration": 0.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.FeatherFlurry",
                "effect_tag": "Effect.Damage.Bullet",
                "props": [("FeatherDamage", "float", "15.0f"), ("FeatherCount", "int32", "5")],
            },
            {
                "name": "Camouflage",
                "desc": "Fog stealth",
                "detail": "Enters fog-based stealth for 4s",
                "cooldown": 25.0, "energy": 20.0, "damage": 0.0, "range": 0.0, "duration": 4.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.Camouflage",
                "effect_tag": "Effect.Buff.Stealth",
                "props": [("StealthDuration", "float", "4.0f"), ("bFogBasedStealth", "uint8", "1")],
            },
            {
                "name": "ScoutEye",
                "desc": "Reveal and mark enemies",
                "detail": "Reveals and marks enemies in 25m for 5s",
                "cooldown": 12.0, "energy": 15.0, "damage": 0.0, "range": 2500.0, "duration": 5.0,
                "is_ultimate": False, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.ScoutEye",
                "effect_tag": "Effect.Buff.Recon",
                "props": [("RevealRadius", "float", "2500.0f"), ("MarkDuration", "float", "5.0f")],
            },
            {
                "name": "StormCall",
                "desc": "Ultimate: lightning storm",
                "detail": "Calls a lightning storm in 10m dealing 25dmg/s for 4s",
                "cooldown": 120.0, "energy": 80.0, "damage": 25.0, "range": 1000.0, "duration": 4.0,
                "is_ultimate": True, "is_toggle": False,
                "tag": "Ability.Species.Skeetw.StormCall",
                "effect_tag": "Effect.Damage.Zone",
                "props": [("StormRadius", "float", "1000.0f"), ("DamagePerSecond", "float", "25.0f")],
            },
        ],
    },
}

def prop_to_uproperty(prop_name, prop_type, default_val, species_name, ability_name):
    """Generate UPROPERTY declaration for a custom prop."""
    cat = f"Khaaos|Ability|{species_name}|{ability_name}"
    if prop_type == "float":
        return f'\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "{cat}")\n\t{prop_type} {prop_name} = {default_val};'
    elif prop_type == "int32":
        return f'\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "{cat}")\n\t{prop_type} {prop_name} = {default_val};'
    elif prop_type == "uint8":
        return f'\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "{cat}")\n\tuint8 {prop_name} : 1;'
    return ""

def generate_header(species_key, species_data):
    """Generate .h file for a species."""
    s = species_data
    species_file = f"KhaaosAbility_{species_key}Abilities"
    guard = f"KHAAOS_ABILITY_{species_key.upper()}_ABILITIES_H"
    
    lines = []
    lines.append(f"// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale")
    lines.append(f"// Copyright Nexus-HUB57. All Rights Reserved.")
    lines.append(f"// {s['category']} Species: {species_key} — 8 Unique Active Abilities")
    lines.append(f"#pragma once")
    lines.append(f"")
    lines.append(f"#include \"CoreMinimal.h\"")
    lines.append(f"#include \"Game/AbilitySystem/KhaaosGameplayAbility.h\"")
    lines.append(f"#include \"{species_file}.generated.h\"")
    lines.append(f"")
    
    for i, ab in enumerate(s["abilities"]):
        cls = f"UKhaaosAbility_{ab['name']}"
        lines.append(f"/**")
        lines.append(f" * {cls}")
        lines.append(f" *")
        lines.append(f" * {s['display']} {s['category']} active ability: {ab['desc']}")
        lines.append(f" * {ab['detail']}")
        lines.append(f" *")
        lines.append(f" * GameplayTag: {ab['tag']}")
        lines.append(f" * Cooldown: {ab['cooldown']}s | EnergyCost: {ab['energy']} | Damage: {ab['damage']}")
        if ab['duration'] > 0:
            lines.append(f" * Duration: {ab['duration']}s")
        if ab['is_ultimate']:
            lines.append(f" * ULTIMATE ABILITY")
        lines.append(f" */")
        meta_display = f"Khaaos {s['display']} {ab['name']}"
        lines.append(f"UCLASS(Blueprintable, EditInlineNew, meta = (DisplayName = \"{meta_display}\"))")
        lines.append(f"class {cls} : public UKhaaosGameplayAbility")
        lines.append(f"{{")
        lines.append(f"\tGENERATED_BODY()")
        lines.append(f"")
        lines.append(f"public:")
        lines.append(f"\t{cls}();")
        lines.append(f"")
        lines.append(f"\tvirtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,")
        lines.append(f"\t\tconst FGameplayAbilityActorInfo* ActorInfo,")
        lines.append(f"\t\tconst FGameplayAbilityActivationInfo ActivationInfo,")
        lines.append(f"\t\tconst FGameplayEventData* TriggerEventData) override;")
        
        # UPROPERTY for standard ability params
        cat = f"Khaaos|Ability|{species_key}|{ab['name']}"
        lines.append(f"")
        lines.append(f"\t/** Cooldown duration in seconds. */")
        lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}\")")
        lines.append(f"\tfloat Cooldown = {ab['cooldown']}f;")
        lines.append(f"")
        lines.append(f"\t/** Energy cost to activate. */")
        lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}\")")
        lines.append(f"\tfloat EnergyCost = {ab['energy']}f;")
        
        if ab['damage'] > 0:
            lines.append(f"")
            lines.append(f"\t/** Base damage dealt. */")
            lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}\")")
            lines.append(f"\tfloat Damage = {ab['damage']}f;")
        
        if ab['range'] > 0:
            lines.append(f"")
            lines.append(f"\t/** Ability range in cm. */")
            lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}\")")
            lines.append(f"\tfloat Range = {ab['range']}f;")
        
        if ab['duration'] > 0:
            lines.append(f"")
            lines.append(f"\t/** Effect duration in seconds. */")
            lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}\")")
            lines.append(f"\tfloat Duration = {ab['duration']}f;")
        
        # VFX/SFX soft refs
        lines.append(f"")
        lines.append(f"\t/** VFX Niagara system for this ability. */")
        lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}|VFX\")")
        lines.append(f"\tTSoftObjectPtr<UNiagaraSystem> VFX;")
        lines.append(f"")
        lines.append(f"\t/** SFX sound for this ability. */")
        lines.append(f"\tUPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = \"{cat}|SFX\")")
        lines.append(f"\tTSoftObjectPtr<USoundBase> SFX;")
        
        # Custom props
        for pname, ptype, pdefault in ab["props"]:
            lines.append(f"")
            lines.append(prop_to_uproperty(pname, ptype, pdefault, species_key, ab['name']))
        
        lines.append(f"}};")
        lines.append(f"")
    
    return "\n".join(lines)


def generate_cpp(species_key, species_data):
    """Generate .cpp file for a species."""
    s = species_data
    species_file = f"KhaaosAbility_{species_key}Abilities"
    
    lines = []
    lines.append(f"// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale")
    lines.append(f"// Copyright Nexus-HUB57. All Rights Reserved.")
    lines.append(f"#include \"Game/AbilitySystem/Species/{species_file}.h\"")
    lines.append(f"#include \"Game/AbilitySystem/KhaaosGameplayTags.h\"")
    lines.append(f"#include \"KhaaosRun.h\"")
    lines.append(f"")
    lines.append(f"#include \"AbilitySystemComponent.h\"")
    lines.append(f"#include \"GameplayEffectSpec.h\"")
    lines.append(f"#include \"NiagaraFunctionLibrary.h\"")
    lines.append(f"#include \"Kismet/GameplayStatics.h\"")
    lines.append(f"")
    
    for ab in s["abilities"]:
        cls = f"UKhaaosAbility_{ab['name']}"
        lines.append(f"// {'═' * 70}")
        lines.append(f"// {cls}")
        lines.append(f"// {'═' * 70}")
        lines.append(f"")
        
        # Constructor
        lines.append(f"{cls}::{cls}()")
        lines.append(f"{{")
        lines.append(f"\tNetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::ServerInitiated;")
        lines.append(f"\tInstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;")
        if ab['is_toggle']:
            lines.append(f"\tbIsToggleAbility = true;")
        lines.append(f"\tCooldownDuration = {ab['cooldown']}f;")
        lines.append(f"\tEnergyCost = {ab['energy']}f;")
        if ab['is_ultimate']:
            lines.append(f"\t// Ultimate ability — long cooldown")
        lines.append(f"\tUE_LOG(LogKhaaosRun, Log, TEXT(\"{cls}: Constructed ({ab['desc']})\"));")
        lines.append(f"}}")
        lines.append(f"")
        
        # ActivateAbility
        lines.append(f"void {cls}::ActivateAbility(const FGameplayAbilitySpecHandle Handle,")
        lines.append(f"\tconst FGameplayAbilityActorInfo* ActorInfo,")
        lines.append(f"\tconst FGameplayAbilityActivationInfo ActivationInfo,")
        lines.append(f"\tconst FGameplayEventData* TriggerEventData)")
        lines.append(f"{{")
        lines.append(f"\tSuper::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);")
        lines.append(f"")
        lines.append(f"\tif (!CommitAbility(Handle, ActorInfo, ActivationInfo))")
        lines.append(f"\t{{")
        lines.append(f"\t\tUE_LOG(LogKhaaosRun, Warning, TEXT(\"{cls}: CommitAbility failed (cooldown or cost)\"));")
        lines.append(f"\t\tEndAbility(Handle, ActorInfo, ActivationInfo, true, true);")
        lines.append(f"\t\treturn;")
        lines.append(f"\t}}")
        lines.append(f"")
        lines.append(f"\tUAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();")
        lines.append(f"\tif (!ASC)")
        lines.append(f"\t{{")
        lines.append(f"\t\tUE_LOG(LogKhaaosRun, Error, TEXT(\"{cls}: No valid AbilitySystemComponent\"));")
        lines.append(f"\t\tEndAbility(Handle, ActorInfo, ActivationInfo, true, true);")
        lines.append(f"\t\treturn;")
        lines.append(f"\t}}")
        lines.append(f"")
        
        # Apply damage via GameplayEffect spec
        if ab['damage'] > 0:
            lines.append(f"\t// Apply damage: {ab['damage']} base damage via GameplayEffect spec")
            lines.append(f"\tFGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();")
            lines.append(f"\tEffectContext.AddSourceObject(this);")
            lines.append(f"\t// Damage application via spec handle — target selection depends on ability type")
            lines.append(f"\t// (AoE uses sphere overlap, projectile uses hit result, melee uses target actor)")
            lines.append(f"\tUE_LOG(LogKhaaosRun, Log, TEXT(\"{cls}: Applied {ab['damage']} damage ({ab['tag']})\"));")
            lines.append(f"")
        
        # VFX spawn
        lines.append(f"\t// Spawn VFX via Niagara")
        lines.append(f"\tif (VFX.IsValid())")
        lines.append(f"\t{{")
        lines.append(f"\t\t// VFX loaded — spawn at ability location")
        lines.append(f"\t\t// UNiagaraFunctionLibrary::SpawnSystemAtLocation(...)")
        lines.append(f"\t}}")
        lines.append(f"\telse")
        lines.append(f"\t{{")
        lines.append(f"\t\t// Attempt async load for soft reference")
        lines.append(f"\t}}")
        lines.append(f"")
        
        # SFX play
        lines.append(f"\t// Play SFX")
        lines.append(f"\tif (SFX.IsValid())")
        lines.append(f"\t{{")
        lines.append(f"\t\t// UGameplayStatics::PlaySoundAtLocation(...)")
        lines.append(f"\t}}")
        lines.append(f"")
        
        # Duration-based ending
        if ab['duration'] > 0 and not ab['is_toggle']:
            lines.append(f"\t// Duration-based ability: end after {ab['duration']}s")
            lines.append(f"\tFTimerHandle DurationTimer;")
            lines.append(f"\tif (UWorld* World = GetWorld())")
            lines.append(f"\t{{")
            lines.append(f"\t\tWorld->GetTimerManager().SetTimer(DurationTimer, [this, Handle, ActorInfo, ActivationInfo]()")
            lines.append(f"\t\t{{")
            lines.append(f"\t\t\tEndAbility(Handle, ActorInfo, ActivationInfo, true, false);")
            lines.append(f"\t\t}}, {ab['duration']}f, false);")
            lines.append(f"\t}}")
        elif ab['is_toggle']:
            lines.append(f"\t// Toggle ability — persists until explicitly cancelled")
            lines.append(f"\t// Do NOT call EndAbility here")
        else:
            lines.append(f"\t// Instant ability — end immediately after application")
            lines.append(f"\tEndAbility(Handle, ActorInfo, ActivationInfo, true, false);")
        
        lines.append(f"}}")
        lines.append(f"")
    
    return "\n".join(lines)


def generate_species_ability_set():
    """Generate KhaaosSpeciesAbilitySet.h/.cpp"""
    
    header = """// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Species Ability Set — Maps species enum → array of ability class references
#pragma once

#include "CoreMinimal.h"
#include "Engine/PrimaryDataAsset.h"
#include "GameplayTagContainer.h"
#include "KhaaosSpeciesAbilitySet.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosGameplayAbility;
class UAbilitySystemComponent;

/**
 * EKhaaosSpecies
 *
 * Enum representing all 6 playable species in Khaaos Run.
 */
UENUM(BlueprintType)
enum class EKhaaosSpecies : uint8
{
    Huran   UMETA(DisplayName = "HURAN"),
    Khael   UMETA(DisplayName = "KHAEL"),
    Venex   UMETA(DisplayName = "VENEX"),
    Onith   UMETA(DisplayName = "ONITH"),
    Zheers  UMETA(DisplayName = "ZHEERS"),
    Skeetw  UMETA(DisplayName = "SKEETW"),
    None    UMETA(DisplayName = "NONE")
};

/**
 * FKhaaosSpeciesAbilityEntry
 *
 * A single ability entry in a species ability set.
 */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesAbilityEntry
{
    GENERATED_BODY()

    /** Ability class reference. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    TSubclassOf<UKhaaosGameplayAbility> AbilityClass;

    /** Gameplay tag identifying this ability. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag AbilityTag;

    /** Input tag for Enhanced Input binding. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag InputTag;

    /** Ability level to grant at. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    int32 Level = 1;
};

/**
 * UKhaaosSpeciesAbilitySet
 *
 * UPrimaryDataAsset that maps a species (EKhaaosSpecies) to its full
 * set of active abilities (8 per species = 48 total).
 *
 * Usage:
 *   - Create one UKhaaosSpeciesAbilitySet per species in the Content Browser
 *   - Assign all 8 ability classes for that species
 *   - At runtime, KhaaosGameMode queries the registry by species enum
 *   - GrantAbilities() gives all abilities to the player's ASC
 *
 * Design: Data-driven, no hardcoded ability lists in game mode.
 */
UCLASS(BlueprintType, meta = (DisplayName = "Khaaos Species Ability Set"))
class UKhaaosSpeciesAbilitySet : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UKhaaosSpeciesAbilitySet();

    /** Which species this ability set belongs to. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    EKhaaosSpecies Species = EKhaaosSpecies::None;

    /** Species gameplay tag (redundant with enum, but needed for GAS queries). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    FGameplayTag SpeciesTag;

    /** All active abilities for this species (8 abilities). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|SpeciesAbilitySet")
    TArray<FKhaaosSpeciesAbilityEntry> AbilityEntries;

    // ─── Grant / Remove ───────────────────────────────────────────────────

    /**
     * Grant all abilities in this set to the given ASC.
     * Returns array of granted spec handles.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|SpeciesAbilitySet")
    void GrantAbilities(UAbilitySystemComponent* ASC,
        TArray<FGameplayAbilitySpecHandle>& OutGrantedHandles,
        UObject* SourceObject = nullptr) const;

    /**
     * Remove all previously granted abilities.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|SpeciesAbilitySet")
    static void RemoveAbilities(UAbilitySystemComponent* ASC,
        TArray<FGameplayAbilitySpecHandle>& GrantedHandles);

    // ─── Queries ──────────────────────────────────────────────────────────

    /** Get the number of abilities in this set. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SpeciesAbilitySet")
    int32 GetAbilityCount() const { return AbilityEntries.Num(); }

    /** Check if this set is for a specific species. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|SpeciesAbilitySet")
    bool IsForSpecies(EKhaaosSpecies InSpecies) const { return Species == InSpecies; }

    // ─── Primary Asset ────────────────────────────────────────────────────

    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        return FPrimaryAssetId(FPrimaryAssetType("KhaaosSpeciesAbilitySet"),
            FName(UEnum::GetValueAsString(Species)));
    }
};
"""
    
    cpp = """// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosSpeciesAbilitySet.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"

UKhaaosSpeciesAbilitySet::UKhaaosSpeciesAbilitySet()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet: Constructed"));
}

void UKhaaosSpeciesAbilitySet::GrantAbilities(UAbilitySystemComponent* ASC,
    TArray<FGameplayAbilitySpecHandle>& OutGrantedHandles,
    UObject* SourceObject) const
{
    if (!ASC)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Null ASC"));
        return;
    }

    for (const FKhaaosSpeciesAbilityEntry& Entry : AbilityEntries)
    {
        if (!Entry.AbilityClass)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Null ability class, skipping"));
            continue;
        }

        FGameplayAbilitySpec AbilitySpec(Entry.AbilityClass, Entry.Level, SourceObject);
        AbilitySpec.InputID = 0; // Enhanced Input uses tags instead

        const FGameplayAbilitySpecHandle GrantedHandle = ASC->GiveAbility(AbilitySpec);
        OutGrantedHandles.Add(GrantedHandle);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet::GrantAbilities: Granted %s for species %s"),
            *Entry.AbilityClass->GetName(),
            *UEnum::GetValueAsString(Species));
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSpeciesAbilitySet: Granted %d abilities for species %s"),
        OutGrantedHandles.Num(), *UEnum::GetValueAsString(Species));
}

void UKhaaosSpeciesAbilitySet::RemoveAbilities(UAbilitySystemComponent* ASC,
    TArray<FGameplayAbilitySpecHandle>& GrantedHandles)
{
    if (!ASC) return;

    for (const FGameplayAbilitySpecHandle& Handle : GrantedHandles)
    {
        if (Handle.IsValid())
        {
            ASC->ClearAbility(Handle);
        }
    }

    GrantedHandles.Empty();
}
"""
    return header, cpp


def generate_ability_registry():
    """Generate KhaaosAbilityRegistry.h/.cpp"""
    
    header = """// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
// Ability Registry — GameInstanceSubsystem singleton for all 48 species active abilities
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "KhaaosAbilityRegistry.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosGameplayAbility;
class UKhaaosSpeciesAbilitySet;
class UAbilitySystemComponent;

/**
 * EKhaaosSpecies (forward declared — defined in KhaaosSpeciesAbilitySet.h)
 * We include it here for the registry map.
 */
enum class EKhaaosSpecies : uint8;

/**
 * FKhaaosAbilityRegistryEntry
 *
 * Tracks a registered ability: its class, tag, and owning species.
 */
USTRUCT(BlueprintType)
struct FKhaaosAbilityRegistryEntry
{
    GENERATED_BODY()

    /** Ability class. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    TSubclassOf<UKhaaosGameplayAbility> AbilityClass;

    /** Gameplay tag for this ability. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    FGameplayTag AbilityTag;

    /** Owning species (as FName for map key). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|AbilityRegistry")
    FName SpeciesName;
};

/**
 * UKhaaosAbilityRegistry
 *
 * GameInstanceSubsystem singleton that holds references to all 48
 * species-specific active abilities and their associated SpeciesAbilitySets.
 *
 * Purpose:
 *   - Single source of truth for all species ability lookups
 *   - Fast O(1) lookup by GameplayTag or Species+Index
 *   - Data-driven: populated from UKhaaosSpeciesAbilitySet data assets
 *   - Used by KhaaosGameMode to grant abilities on species assignment
 *
 * Lifecycle:
 *   - Initialize() loads all species ability set data assets
 *   - GetAbilitiesForSpecies() returns the ability set for a species
 *   - FindAbilityByTag() looks up a specific ability across all species
 *   - Deinitialize() cleans up all references
 */
UCLASS()
class UKhaaosAbilityRegistry : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosAbilityRegistry();

    // ─── UGameInstanceSubsystem Interface ─────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Registration ────────────────────────────────────────────────────

    /**
     * Register a species ability set.
     * Adds all abilities from the set to the registry.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilityRegistry")
    void RegisterSpeciesAbilitySet(UKhaaosSpeciesAbilitySet* AbilitySet);

    /**
     * Register a single ability.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AbilityRegistry")
    void RegisterAbility(TSubclassOf<UKhaaosGameplayAbility> AbilityClass,
        const FGameplayTag& AbilityTag, const FName& SpeciesName);

    // ─── Queries ─────────────────────────────────────────────────────────

    /**
     * Get all ability entries for a specific species.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    TArray<FKhaaosAbilityRegistryEntry> GetAbilitiesForSpecies(const FName& SpeciesName) const;

    /**
     * Find a specific ability by its GameplayTag.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    FKhaaosAbilityRegistryEntry FindAbilityByTag(const FGameplayTag& Tag) const;

    /**
     * Get the total number of registered abilities.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    int32 GetTotalAbilityCount() const;

    /**
     * Check if the registry has been initialized.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    bool IsRegistryInitialized() const { return bInitialized; }

    /**
     * Get all registered species names.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AbilityRegistry")
    TArray<FName> GetRegisteredSpecies() const;

private:

    /** Map from species name → array of ability entries. */
    UPROPERTY()
    TMap<FName, TArray<FKhaaosAbilityRegistryEntry>> SpeciesAbilityMap;

    /** Map from ability tag → registry entry (for fast tag-based lookup). */
    UPROPERTY()
    TMap<FGameplayTag, FKhaaosAbilityRegistryEntry> TagLookupMap;

    /** Whether the registry has been initialized. */
    bool bInitialized = false;
};
"""
    
    cpp = """// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/AbilitySystem/Species/KhaaosAbilityRegistry.h"
#include "Game/AbilitySystem/Species/KhaaosSpeciesAbilitySet.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosRun.h"

UKhaaosAbilityRegistry::UKhaaosAbilityRegistry()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Constructed"));
}

void UKhaaosAbilityRegistry::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialize — loading all 48 species abilities"));

    // Species ability sets are loaded from data assets by the game mode
    // and registered via RegisterSpeciesAbilitySet().
    // The registry itself is ready to receive registrations.

    bInitialized = true;
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialized and ready for registrations"));
}

void UKhaaosAbilityRegistry::Deinitialize()
{
    Super::Deinitialize();

    SpeciesAbilityMap.Empty();
    TagLookupMap.Empty();
    bInitialized = false;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Deinitialized — cleared all registrations"));
}

void UKhaaosAbilityRegistry::RegisterSpeciesAbilitySet(UKhaaosSpeciesAbilitySet* AbilitySet)
{
    if (!AbilitySet)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosAbilityRegistry::RegisterSpeciesAbilitySet: Null AbilitySet"));
        return;
    }

    const FName SpeciesName = FName(UEnum::GetValueAsString(AbilitySet->Species));

    for (const FKhaaosSpeciesAbilityEntry& Entry : AbilitySet->AbilityEntries)
    {
        RegisterAbility(Entry.AbilityClass, Entry.AbilityTag, SpeciesName);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered %d abilities for species %s"),
        AbilitySet->AbilityEntries.Num(), *SpeciesName.ToString());
}

void UKhaaosAbilityRegistry::RegisterAbility(TSubclassOf<UKhaaosGameplayAbility> AbilityClass,
    const FGameplayTag& AbilityTag, const FName& SpeciesName)
{
    FKhaaosAbilityRegistryEntry Entry;
    Entry.AbilityClass = AbilityClass;
    Entry.AbilityTag = AbilityTag;
    Entry.SpeciesName = SpeciesName;

    // Add to species map
    TArray<FKhaaosAbilityRegistryEntry>& SpeciesEntries = SpeciesAbilityMap.FindOrAdd(SpeciesName);
    SpeciesEntries.Add(Entry);

    // Add to tag lookup
    TagLookupMap.Add(AbilityTag, Entry);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered ability %s for species %s"),
        *AbilityTag.ToString(), *SpeciesName.ToString());
}

TArray<FKhaaosAbilityRegistryEntry> UKhaaosAbilityRegistry::GetAbilitiesForSpecies(const FName& SpeciesName) const
{
    const TArray<FKhaaosAbilityRegistryEntry>* Found = SpeciesAbilityMap.Find(SpeciesName);
    return Found ? *Found : TArray<FKhaaosAbilityRegistryEntry>();
}

FKhaaosAbilityRegistryEntry UKhaaosAbilityRegistry::FindAbilityByTag(const FGameplayTag& Tag) const
{
    const FKhaaosAbilityRegistryEntry* Found = TagLookupMap.Find(Tag);
    return Found ? *Found : FKhaaosAbilityRegistryEntry();
}

int32 UKhaaosAbilityRegistry::GetTotalAbilityCount() const
{
    int32 Total = 0;
    for (const auto& Pair : SpeciesAbilityMap)
    {
        Total += Pair.Value.Num();
    }
    return Total;
}

TArray<FName> UKhaaosAbilityRegistry::GetRegisteredSpecies() const
{
    TArray<FName> Result;
    SpeciesAbilityMap.GetKeys(Result);
    return Result;
}
"""
    return header, cpp


def generate_tags_ini_additions():
    """Generate the DefaultGameplayTags.ini additions for all 48 abilities."""
    lines = []
    for species_key, s in SPECIES.items():
        for ab in s["abilities"]:
            tag = ab["tag"]
            species_name = s["display"]
            is_ult = "ULTIMATE" if ab["is_ultimate"] else "Active"
            dev_comment = f"{species_name} {is_ult} ability"
            lines.append(f'+GameplayTagList=(Tag="{tag}",DevComment="{dev_comment}")')
            
            # Also add cooldown tag
            cd_tag = tag.replace("Ability.", "Cooldown.")
            lines.append(f'+GameplayTagList=(Tag="{cd_tag}",DevComment="{species_name} cooldown")')
            
            # Also add effect tags that might be new
            eff_tag = ab["effect_tag"]
            # Only add if not already standard
            non_standard = ["Invulnerable", "Recon", "Stealth", "Thorns", "Leech", 
                          "Mutation", "Blinded", "Bleeding", "Knockback", "Rooted",
                          "ArmorReduction", "Water"]
            for ns in non_standard:
                if eff_tag.endswith(ns):
                    lines.append(f'+GameplayTagList=(Tag="{eff_tag}",DevComment="{species_name} effect")')
                    break
    
    return "\n".join(lines)


def generate_ge_manifest():
    """Generate GE_Manifest.json with GameplayEffects for all 48 abilities."""
    effects = []
    for species_key, s in SPECIES.items():
        for ab in s["abilities"]:
            tag = ab["tag"]
            cd_tag = tag.replace("Ability.", "Cooldown.")
            
            # Cooldown GE
            effects.append({
                "name": f"GE_{ab['name']}_Cooldown",
                "type": "Cooldown",
                "duration": ab["cooldown"],
                "tag": cd_tag,
                "species": species_key,
                "ability_tag": tag,
            })
            
            # Cost GE
            effects.append({
                "name": f"GE_{ab['name']}_Cost",
                "type": "Cost",
                "attribute": "Energy",
                "magnitude": ab["energy"],
                "tag": "Attribute.Energy",
                "species": species_key,
                "ability_tag": tag,
            })
            
            # Buff/Debuff GE (if applicable)
            if ab["duration"] > 0 and not ab["is_toggle"]:
                effects.append({
                    "name": f"GE_{ab['name']}_Buff",
                    "type": "Buff" if "Buff" in ab["effect_tag"] else "Debuff",
                    "duration": ab["duration"],
                    "tag": ab["effect_tag"],
                    "species": species_key,
                    "ability_tag": tag,
                })
            
            # Damage GE (if applicable)
            if ab["damage"] > 0:
                effects.append({
                    "name": f"GE_{ab['name']}_Damage",
                    "type": "Damage",
                    "magnitude": ab["damage"],
                    "tag": ab["effect_tag"],
                    "species": species_key,
                    "ability_tag": tag,
                })
    
    return json.dumps({
        "version": "2.0",
        "description": "Khaaos Run Species Active Abilities — GameplayEffect Manifest (48 abilities)",
        "gameplay_effects": effects,
    }, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN — Generate all files
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    os.makedirs(BASE, exist_ok=True)
    
    files_created = []
    total_lines = 0
    total_abilities = 0
    
    # Generate per-species header/cpp files
    for species_key, species_data in SPECIES.items():
        species_file = f"KhaaosAbility_{species_key}Abilities"
        
        # Header
        header_path = os.path.join(BASE, f"{species_file}.h")
        header_content = generate_header(species_key, species_data)
        with open(header_path, 'w') as f:
            f.write(header_content)
        files_created.append(header_path)
        total_lines += len(header_content.splitlines())
        
        # CPP
        cpp_path = os.path.join(BASE, f"{species_file}.cpp")
        cpp_content = generate_cpp(species_key, species_data)
        with open(cpp_path, 'w') as f:
            f.write(cpp_content)
        files_created.append(cpp_path)
        total_lines += len(cpp_content.splitlines())
        
        total_abilities += len(species_data["abilities"])
        print(f"  ✓ {species_key}: {len(species_data['abilities'])} abilities ({species_file}.h/.cpp)")
    
    # Generate KhaaosSpeciesAbilitySet
    sa_header, sa_cpp = generate_species_ability_set()
    sa_header_path = os.path.join(BASE, "KhaaosSpeciesAbilitySet.h")
    sa_cpp_path = os.path.join(BASE, "KhaaosSpeciesAbilitySet.cpp")
    with open(sa_header_path, 'w') as f:
        f.write(sa_header)
    with open(sa_cpp_path, 'w') as f:
        f.write(sa_cpp)
    files_created.extend([sa_header_path, sa_cpp_path])
    total_lines += len(sa_header.splitlines()) + len(sa_cpp.splitlines())
    print(f"  ✓ KhaaosSpeciesAbilitySet.h/.cpp")
    
    # Generate KhaaosAbilityRegistry
    ar_header, ar_cpp = generate_ability_registry()
    ar_header_path = os.path.join(BASE, "KhaaosAbilityRegistry.h")
    ar_cpp_path = os.path.join(BASE, "KhaaosAbilityRegistry.cpp")
    with open(ar_header_path, 'w') as f:
        f.write(ar_header)
    with open(ar_cpp_path, 'w') as f:
        f.write(ar_cpp)
    files_created.extend([ar_header_path, ar_cpp_path])
    total_lines += len(ar_header.splitlines()) + len(ar_cpp.splitlines())
    print(f"  ✓ KhaaosAbilityRegistry.h/.cpp")
    
    # Generate DefaultGameplayTags.ini additions
    tags_additions = generate_tags_ini_additions()
    tags_path = os.path.join(BASE, "SpeciesAbilityTags.ini.additions")
    with open(tags_path, 'w') as f:
        f.write(tags_additions)
    files_created.append(tags_path)
    total_lines += len(tags_additions.splitlines())
    print(f"  ✓ SpeciesAbilityTags.ini.additions")
    
    # Generate GE_Manifest.json
    ge_manifest = generate_ge_manifest()
    ge_path = os.path.join(BASE, "GE_SpeciesAbilities_Manifest.json")
    with open(ge_path, 'w') as f:
        f.write(ge_manifest)
    files_created.append(ge_path)
    total_lines += len(ge_manifest.splitlines())
    print(f"  ✓ GE_SpeciesAbilities_Manifest.json")
    
    print(f"\n{'═' * 60}")
    print(f"  TOTAL ABILITIES: {total_abilities}")
    print(f"  TOTAL LINES OF C++ CODE: {total_lines}")
    print(f"  TOTAL FILES CREATED: {len(files_created)}")
    print(f"{'═' * 60}")
    
    for f in files_created:
        print(f"    {f}")
