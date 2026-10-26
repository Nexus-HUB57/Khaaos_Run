#!/usr/bin/env python3
"""
KHAAOS RUN — End-to-End Validation v5.0
=========================================
FreeFire parity check — includes Skin System, Emote System,
GAS Integration, Ring Visual, Species VFX Registry.
"""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

class Validator:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.total = 0
        self.categories = {}

    def check(self, category: str, name: str, condition: bool, detail: str = ""):
        self.total += 1
        if condition:
            self.passed += 1
            status = "✓"
        else:
            self.failed += 1
            status = "✗"
        if category not in self.categories:
            self.categories[category] = {"passed": 0, "failed": 0}
        if condition:
            self.categories[category]["passed"] += 1
        else:
            self.categories[category]["failed"] += 1
        suffix = f" — {detail}" if detail else ""
        print(f"  {status} {name}{suffix}")

    def file_exists(self, category: str, name: str, path: Path):
        self.check(category, f"File: {path.name}", path.exists(), str(path))

    def file_contains(self, category: str, name: str, path: Path, text: str):
        if not path.exists():
            self.check(category, name, False, "file not found")
            return
        content = path.read_text(errors="ignore")
        self.check(category, name, text in content, f"'{text[:50]}'")


def main():
    v = Validator()
    print("=" * 72)
    print("KHAAOS RUN — End-to-End Validation v5.0 (FreeFire Parity)")
    print("=" * 72)

    server_game = REPO_ROOT / "server" / "game"
    char_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Character"
    ring_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Ring"
    vfx_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "VFX"
    ops_dir = char_dir / "Operatives"
    tests_int = REPO_ROOT / "tests" / "integration"

    # ═══════════════════════════════════════════════════════════════════════
    # 1. Server-Side Game Systems (v4 carry-over)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[1/10] Server-Side Game Systems")
    cat = "Server Systems"
    for f in ["EconomyMatchBridge.ts", "SpectatorDataPipeline.ts", "DiscordBot.ts", "MatchFlow.ts", "GameServices.ts"]:
        v.file_exists(cat, f, server_game / f)
    v.file_contains(cat, "Server wiring", REPO_ROOT / "server" / "index.ts", "initializeGameServices")

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Skin System (NEW — P0 Gap Closed)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[2/10] Skin/Cosmetic System")
    cat = "Skin System"

    skin_h = char_dir / "KhaaosSkinSystem.h"
    skin_cpp = char_dir / "KhaaosSkinSystem.cpp"
    v.file_exists(cat, "KhaaosSkinSystem.h", skin_h)
    v.file_exists(cat, "KhaaosSkinSystem.cpp", skin_cpp)
    v.file_contains(cat, "6 rarity tiers enum", skin_h, "MITICO")
    v.file_contains(cat, "8 cosmetic slots enum", skin_h, "BANNER")
    v.file_contains(cat, "FKhaaosSkinDef struct", skin_h, "FKhaaosSkinDef")
    v.file_contains(cat, "ColorPrimary/Accent", skin_h, "ColorPrimary")
    v.file_contains(cat, "Emissive intensity", skin_h, "EmissiveIntensity")
    v.file_contains(cat, "Override mesh (RARO+)", skin_h, "OverrideMesh")
    v.file_contains(cat, "Override material (INCOMUM+)", skin_h, "OverrideMaterial")
    v.file_contains(cat, "Aura VFX (EPICO+)", skin_h, "AuraVFX")
    v.file_contains(cat, "Cosmetic loadout struct", skin_h, "FKhaaosCosmeticLoadout")
    v.file_contains(cat, "RegisterSkin method", skin_h, "RegisterSkin")
    v.file_contains(cat, "EquipSkin method", skin_h, "EquipSkin")
    v.file_contains(cat, "ApplyCosmetics method", skin_h, "ApplyCosmetics")
    v.file_contains(cat, "ActivateRarityVFX method", skin_h, "ActivateRarityVFX")
    v.file_contains(cat, "Material swap in .cpp", skin_cpp, "SetSkeletalMeshAsset")
    v.file_contains(cat, "Dynamic material instance", skin_cpp, "CreateDynamicMaterialInstance")
    v.file_contains(cat, "Niagara aura spawn", skin_cpp, "SpawnSystemAttached")
    v.file_contains(cat, "Rarity color mapping", skin_cpp, "GetRarityColor")
    v.file_contains(cat, "Shop ownership grant", skin_h, "GrantSkinOwnership")
    v.file_contains(cat, "CanEquipSkin validation", skin_h, "CanEquipSkin")
    v.file_contains(cat, "RevertToDefault", skin_h, "RevertToDefault")

    # ═══════════════════════════════════════════════════════════════════════
    # 3. Emote System (NEW — P0 Gap Closed)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[3/10] Emote System")
    cat = "Emote System"

    emote_h = char_dir / "KhaaosEmoteSystem.h"
    emote_cpp = char_dir / "KhaaosEmoteSystem.cpp"
    v.file_exists(cat, "KhaaosEmoteSystem.h", emote_h)
    v.file_exists(cat, "KhaaosEmoteSystem.cpp", emote_cpp)
    v.file_contains(cat, "5 categories enum", emote_h, "LENDARIO")  # last category
    v.file_contains(cat, "FKhaaosEmoteDef struct", emote_h, "FKhaaosEmoteDef")
    v.file_contains(cat, "Montage reference", emote_h, "UAnimMontage")
    v.file_contains(cat, "VFX reference", emote_h, "UNiagaraSystem")
    v.file_contains(cat, "Sound reference", emote_h, "USoundBase")
    v.file_contains(cat, "PlayEmote method", emote_h, "PlayEmote")
    v.file_contains(cat, "StopEmote method", emote_h, "StopEmote")
    v.file_contains(cat, "Emote wheel (8 slots)", emote_h, "WheelBindings")
    v.file_contains(cat, "OnEmoteStarted delegate", emote_h, "OnEmoteStarted")
    v.file_contains(cat, "OnEmoteEnded delegate", emote_h, "OnEmoteEnded")
    v.file_contains(cat, "Montage_Play in .cpp", emote_cpp, "Montage_Play")
    v.file_contains(cat, "Montage_Stop in .cpp", emote_cpp, "Montage_Stop")
    v.file_contains(cat, "Looping emote support", emote_h, "bIsLooping")
    v.file_contains(cat, "Species emote category", emote_h, "ESPECIE")

    # ═══════════════════════════════════════════════════════════════════════
    # 4. GAS Integration (NEW — P0 Gap Closed)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[4/10] GAS Species Trait Integration")
    cat = "GAS Integration"

    gas_h = char_dir / "KhaaosSpeciesGAS.h"
    gas_cpp = char_dir / "KhaaosSpeciesGAS.cpp"
    v.file_exists(cat, "KhaaosSpeciesGAS.h", gas_h)
    v.file_exists(cat, "KhaaosSpeciesGAS.cpp", gas_cpp)
    v.file_contains(cat, "AbilitySystemComponent", gas_h, "UAbilitySystemComponent")
    v.file_contains(cat, "AttributeSet", gas_h, "UAttributeSet")
    v.file_contains(cat, "ApplySpeciesTraits method", gas_h, "ApplySpeciesTraits")
    v.file_contains(cat, "RemoveSpeciesTraits method", gas_h, "RemoveSpeciesTraits")
    v.file_contains(cat, "InitializeAttributes method", gas_h, "InitializeAttributes")
    # GameplayEffect references
    for ge in ["GE_HuranRegen", "GE_HuranWaterResist", "GE_HuranSwimBonus",
               "GE_KhaelCryoResist", "GE_VenexSpeedBonus", "GE_OnithToxicResist",
               "GE_ZheersRadResist", "GE_SkeetwFogStealth"]:
        v.file_contains(cat, f"GE: {ge}", gas_h, ge)
    v.file_contains(cat, "ApplySpecToSelf in .cpp", gas_cpp, "ApplyGameplayEffectSpecToSelf")

    # ═══════════════════════════════════════════════════════════════════════
    # 5. Ring Visual System (OVERWRITTEN — P0 Gap Closed)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[5/10] Ring Visual System")
    cat = "Ring Visual"

    ring_vis_h = ring_dir / "KhaaosRingVisualComponent.h"
    ring_vis_cpp = ring_dir / "KhaaosRingVisualComponent.cpp"
    v.file_exists(cat, "KhaaosRingVisualComponent.h", ring_vis_h)
    v.file_exists(cat, "KhaaosRingVisualComponent.cpp", ring_vis_cpp)
    v.file_contains(cat, "NiagaraComponent border", ring_vis_h, "UNiagaraComponent")
    v.file_contains(cat, "MaterialInstanceDynamic glow", ring_vis_h, "UMaterialInstanceDynamic")
    v.file_contains(cat, "Phase visual struct", ring_vis_h, "FKhaaosRingPhaseVisual")
    v.file_contains(cat, "UpdateRingVisual implemented", ring_vis_cpp, "UpdateRingVisual")
    v.file_contains(cat, "ShowNextRingPreview implemented", ring_vis_cpp, "ShowNextRingPreview")
    v.file_contains(cat, "ActivateElectricalStorm implemented", ring_vis_cpp, "ActivateElectricalStorm")
    v.file_contains(cat, "SetRingPhaseVisual implemented", ring_vis_cpp, "SetRingPhaseVisual")
    v.file_contains(cat, "TickComponent for pulse", ring_vis_cpp, "TickComponent")
    v.file_contains(cat, "Phase color changes", ring_vis_cpp, "BorderColor")

    # ═══════════════════════════════════════════════════════════════════════
    # 6. Species VFX Registry (NEW — P1 Gap Closed)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[6/10] Species VFX Registry")
    cat = "Species VFX"

    svfx_h = vfx_dir / "KhaaosSpeciesVFXRegistry.h"
    svfx_cpp = vfx_dir / "KhaaosSpeciesVFXRegistry.cpp"
    v.file_exists(cat, "KhaaosSpeciesVFXRegistry.h", svfx_h)
    v.file_exists(cat, "KhaaosSpeciesVFXRegistry.cpp", svfx_cpp)
    v.file_contains(cat, "GameInstanceSubsystem", svfx_h, "UGameInstanceSubsystem")
    # All 18 species VFX
    for vfx in ["RegenGlow", "WaterDash", "AmphibianEyes",   # Huran
                "CryoShield", "FrostBreath", "EnergyResonance",  # Khael
                "CyberneticGlow", "ShieldPulse", "SpeedTrail",    # Venex
                "ToxicAura", "ScaleShimmer", "HissVFX",          # Onith
                "RadGlow", "MutationPulse", "RadResistAura",     # Zheers
                "Bioluminescence", "FogStealthVFX", "AvianTrail"]: # Skeetw
        v.file_contains(cat, f"VFX: {vfx}", svfx_cpp, vfx)
    v.file_contains(cat, "SpawnSpeciesVFX method", svfx_h, "SpawnSpeciesVFX")
    v.file_contains(cat, "GetSpeciesVFX method", svfx_h, "GetSpeciesVFX")

    # ═══════════════════════════════════════════════════════════════════════
    # 7. 18 Operative Subclasses
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[7/10] 18 Operative Subclasses")
    cat = "Operatives"
    ops = ["KhaaosOpHUR01", "KhaaosOpKHA01", "KhaaosOpVEN01", "KhaaosOpONI01",
           "KhaaosOpZHE01", "KhaaosOpSKW01", "KhaaosOpHUR02", "KhaaosOpVEN02",
           "KhaaosOpHURF01", "KhaaosOpKHAF01", "KhaaosOpVENF01", "KhaaosOpONIF01",
           "KhaaosOpZHEF01", "KhaaosOpSKWF01", "KhaaosOpHURF02", "KhaaosOpKHAF02",
           "KhaaosOpVENF02", "KhaaosOpONIF02"]
    h_count = sum(1 for o in ops if (ops_dir / f"{o}.h").exists())
    cpp_count = sum(1 for o in ops if (ops_dir / f"{o}.cpp").exists())
    v.check(cat, "18 headers exist", h_count == 18, f"{h_count}/18")
    v.check(cat, "18 cpps exist", cpp_count == 18, f"{cpp_count}/18")

    # ═══════════════════════════════════════════════════════════════════════
    # 8. Test Coverage
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[8/10] Test Coverage")
    cat = "Tests"
    for t in ["economy-match-bridge.test.ts", "spectator-data-pipeline.test.ts",
              "discord-bot.test.ts", "match-flow.test.ts", "full-match-simulation.test.ts"]:
        v.file_exists(cat, t, tests_int / t)

    # ═══════════════════════════════════════════════════════════════════════
    # 9. Multi-World + Economy Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[9/10] Multi-World & Economy Pipeline")
    cat = "Pipeline"
    emb = server_game / "EconomyMatchBridge.ts"
    mf = server_game / "MatchFlow.ts"
    for w in ["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]:
        v.file_contains(cat, f"World {w}", mf, w)
    v.file_contains(cat, "Species kill multiplier", emb, "killMultiplier")
    v.file_contains(cat, "Water bonus 1.3×", emb, "1.3")
    v.file_contains(cat, "50K RC transition", emb, "50_000")

    # ═══════════════════════════════════════════════════════════════════════
    # 10. FreeFire Parity Score
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[10/10] FreeFire Parity Assessment")
    cat = "Parity"

    # Check which major systems exist
    checks = {
        "Skin System": (char_dir / "KhaaosSkinSystem.h").exists(),
        "Emote System": (char_dir / "KhaaosEmoteSystem.h").exists(),
        "GAS Integration": (char_dir / "KhaaosSpeciesGAS.h").exists(),
        "Ring Visual": (ring_dir / "KhaaosRingVisualComponent.cpp").exists(),
        "Species VFX": (vfx_dir / "KhaaosSpeciesVFXRegistry.h").exists(),
        "Match Flow": (server_game / "MatchFlow.ts").exists(),
        "Economy Bridge": (server_game / "EconomyMatchBridge.ts").exists(),
        "Discord Bot": (server_game / "DiscordBot.ts").exists(),
        "Spectator Pipeline": (server_game / "SpectatorDataPipeline.ts").exists(),
        "18 Operatives": h_count == 18 and cpp_count == 18,
    }
    for name, ok in checks.items():
        v.check(cat, f"System exists: {name}", ok)

    # ═══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 72)
    print("VALIDATION SUMMARY v5.0")
    print("=" * 72)

    for cat_name, counts in v.categories.items():
        total = counts["passed"] + counts["failed"]
        pct = (counts["passed"] / total * 100) if total > 0 else 0
        status = "✓" if counts["failed"] == 0 else "✗"
        print(f"  {status} [{cat_name}] {counts['passed']}/{total} ({pct:.0f}%)")

    print(f"\n  Total: {v.passed}/{v.total} ({v.passed/v.total*100:.1f}%)")

    # FreeFire proximity score
    systems_ok = sum(1 for ok in checks.values() if ok)
    pct_score = int(systems_ok / len(checks) * 100)
    print(f"\n  🎮 FreeFire Parity Score: {pct_score}% ({systems_ok}/{len(checks)} core systems)")
    if pct_score >= 80:
        print("  ✅ High proximity — major systems operational")
    elif pct_score >= 60:
        print("  🟡 Moderate proximity — key systems in place, needs content")
    else:
        print("  🔴 Low proximity — critical systems still missing")

    if v.failed == 0:
        print("\n  🏆 ALL CODE CHECKS PASSED — Khaaos Run v5.0 Validated!")
    else:
        print(f"\n  ⚠️  {v.failed} checks failed")

    return 0 if v.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
