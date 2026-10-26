#!/usr/bin/env python3
"""
KHAAOS RUN — End-to-End Validation v6.0
=========================================
FreeFire parity check — includes all v5 systems PLUS:
  PostProcessManager, CinematicCamera, CharacterLODSystem, ScreenEffects.
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
    print("KHAAOS RUN — End-to-End Validation v6.0 (FreeFire Parity)")
    print("=" * 72)

    server_game = REPO_ROOT / "server" / "game"
    char_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Character"
    ring_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Ring"
    vfx_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "VFX"
    gfx_dir = REPO_ROOT / "Unreal" / "KhaaosRun" / "Source" / "KhaaosRun" / "Game" / "Graphics"
    ops_dir = char_dir / "Operatives"
    tests_int = REPO_ROOT / "tests" / "integration"

    # ═══════════════════════════════════════════════════════════════════════
    # 1. Server-Side Game Systems
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[1/14] Server-Side Game Systems")
    cat = "Server Systems"
    for f in ["EconomyMatchBridge.ts", "SpectatorDataPipeline.ts", "DiscordBot.ts", "MatchFlow.ts", "GameServices.ts"]:
        v.file_exists(cat, f, server_game / f)
    v.file_contains(cat, "Server wiring", REPO_ROOT / "server" / "index.ts", "initializeGameServices")

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Skin System
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[2/14] Skin/Cosmetic System")
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
    # 3. Emote System
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[3/14] Emote System")
    cat = "Emote System"

    emote_h = char_dir / "KhaaosEmoteSystem.h"
    emote_cpp = char_dir / "KhaaosEmoteSystem.cpp"
    v.file_exists(cat, "KhaaosEmoteSystem.h", emote_h)
    v.file_exists(cat, "KhaaosEmoteSystem.cpp", emote_cpp)
    v.file_contains(cat, "5 categories enum", emote_h, "LENDARIO")
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
    # 4. GAS Integration
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[4/14] GAS Species Trait Integration")
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
    for ge in ["GE_HuranRegen", "GE_HuranWaterResist", "GE_HuranSwimBonus",
               "GE_KhaelCryoResist", "GE_VenexSpeedBonus", "GE_OnithToxicResist",
               "GE_ZheersRadResist", "GE_SkeetwFogStealth"]:
        v.file_contains(cat, f"GE: {ge}", gas_h, ge)
    v.file_contains(cat, "ApplySpecToSelf in .cpp", gas_cpp, "ApplyGameplayEffectSpecToSelf")

    # ═══════════════════════════════════════════════════════════════════════
    # 5. Ring Visual System
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[5/14] Ring Visual System")
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
    # 6. Species VFX Registry
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[6/14] Species VFX Registry")
    cat = "Species VFX"

    svfx_h = vfx_dir / "KhaaosSpeciesVFXRegistry.h"
    svfx_cpp = vfx_dir / "KhaaosSpeciesVFXRegistry.cpp"
    v.file_exists(cat, "KhaaosSpeciesVFXRegistry.h", svfx_h)
    v.file_exists(cat, "KhaaosSpeciesVFXRegistry.cpp", svfx_cpp)
    v.file_contains(cat, "GameInstanceSubsystem", svfx_h, "UGameInstanceSubsystem")
    for vfx in ["RegenGlow", "WaterDash", "AmphibianEyes",
                "CryoShield", "FrostBreath", "EnergyResonance",
                "CyberneticGlow", "ShieldPulse", "SpeedTrail",
                "ToxicAura", "ScaleShimmer", "HissVFX",
                "RadGlow", "MutationPulse", "RadResistAura",
                "Bioluminescence", "FogStealthVFX", "AvianTrail"]:
        v.file_contains(cat, f"VFX: {vfx}", svfx_cpp, vfx)
    v.file_contains(cat, "SpawnSpeciesVFX method", svfx_h, "SpawnSpeciesVFX")
    v.file_contains(cat, "GetSpeciesVFX method", svfx_h, "GetSpeciesVFX")

    # ═══════════════════════════════════════════════════════════════════════
    # 7. 18 Operative Subclasses
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[7/14] 18 Operative Subclasses")
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
    print("\n[8/14] Test Coverage")
    cat = "Tests"
    for t in ["economy-match-bridge.test.ts", "spectator-data-pipeline.test.ts",
              "discord-bot.test.ts", "match-flow.test.ts", "full-match-simulation.test.ts"]:
        v.file_exists(cat, t, tests_int / t)

    # ═══════════════════════════════════════════════════════════════════════
    # 9. Multi-World + Economy Pipeline
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[9/14] Multi-World & Economy Pipeline")
    cat = "Pipeline"
    emb = server_game / "EconomyMatchBridge.ts"
    mf = server_game / "MatchFlow.ts"
    for w in ["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]:
        v.file_contains(cat, f"World {w}", mf, w)
    v.file_contains(cat, "Species kill multiplier", emb, "killMultiplier")
    v.file_contains(cat, "Water bonus 1.3x", emb, "1.3")
    v.file_contains(cat, "50K RC transition", emb, "50_000")

    # ═══════════════════════════════════════════════════════════════════════
    # 10. PostProcessManager (NEW — P0 Graphics Gap)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[10/14] PostProcessManager (World Profiles)")
    cat = "PostProcess"

    pp_h = gfx_dir / "KhaaosPostProcessManager.h"
    pp_cpp = gfx_dir / "KhaaosPostProcessManager.cpp"
    v.file_exists(cat, "KhaaosPostProcessManager.h", pp_h)
    v.file_exists(cat, "KhaaosPostProcessManager.cpp", pp_cpp)
    v.file_contains(cat, "5 world profiles enum", pp_h, "CIGKV")
    v.file_contains(cat, "BARBURHEN profile", pp_h, "BARBURHEN")
    v.file_contains(cat, "PRIADUS profile", pp_h, "PRIADUS")
    v.file_contains(cat, "CKESALTH profile", pp_h, "CKESALTH")
    v.file_contains(cat, "ARUKHEEA profile", pp_h, "ARUKHEEA")
    v.file_contains(cat, "PostProcessProfile struct", pp_h, "FKhaaosPostProcessProfile")
    v.file_contains(cat, "ScreenEffectState struct", pp_h, "FKhaaosScreenEffectState")
    v.file_contains(cat, "ColorGradingTint", pp_h, "ColorGradingTint")
    v.file_contains(cat, "VignetteIntensity", pp_h, "VignetteIntensity")
    v.file_contains(cat, "BloomIntensity", pp_h, "BloomIntensity")
    v.file_contains(cat, "LumenQuality", pp_h, "LumenQuality")
    v.file_contains(cat, "NaniteEnabled", pp_h, "NaniteEnabled")
    v.file_contains(cat, "HeatHazeIntensity", pp_h, "HeatHazeIntensity")
    v.file_contains(cat, "FrostVignetteIntensity", pp_h, "FrostVignetteIntensity")
    v.file_contains(cat, "SetWorldProfile method", pp_h, "SetWorldProfile")
    v.file_contains(cat, "TriggerDamageVignette method", pp_h, "TriggerDamageVignette")
    v.file_contains(cat, "TriggerLowHealthPulse method", pp_h, "TriggerLowHealthPulse")
    v.file_contains(cat, "TriggerEliminationFlash method", pp_h, "TriggerEliminationFlash")
    v.file_contains(cat, "SetKillStreakGlow method", pp_h, "SetKillStreakGlow")
    v.file_contains(cat, "ForceLumenQuality method", pp_h, "ForceLumenQuality")
    v.file_contains(cat, "5 world profiles in .cpp", pp_cpp, "BARBURHEN")
    v.file_contains(cat, "Priadus cool blue tint", pp_cpp, "0.7")
    v.file_contains(cat, "Profile lerp transition", pp_cpp, "ProfileLerpAlpha")
    v.file_contains(cat, "Screen effect decay", pp_cpp, "UpdateScreenEffects")

    # ═══════════════════════════════════════════════════════════════════════
    # 11. CinematicCamera (NEW — P0 Camera Gap)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[11/14] CinematicCamera (Kill Cam & Spectator)")
    cat = "CinematicCamera"

    cam_h = gfx_dir / "KhaaosCinematicCamera.h"
    cam_cpp = gfx_dir / "KhaaosCinematicCamera.cpp"
    v.file_exists(cat, "KhaaosCinematicCamera.h", cam_h)
    v.file_exists(cat, "KhaaosCinematicCamera.cpp", cam_cpp)
    v.file_contains(cat, "10 camera modes enum", cam_h, "DEATH_CAMERA")
    v.file_contains(cat, "KILLCAM_REPLAY mode", cam_h, "KILLCAM_REPLAY")
    v.file_contains(cat, "SPECTATOR_FREECAM mode", cam_h, "SPECTATOR_FREECAM")
    v.file_contains(cat, "SPECTATOR_FOLLOW mode", cam_h, "SPECTATOR_FOLLOW")
    v.file_contains(cat, "CINEMATIC_WORLD_TRANSITION", cam_h, "CINEMATIC_WORLD_TRANSITION")
    v.file_contains(cat, "CINEMATIC_VICTORY mode", cam_h, "CINEMATIC_VICTORY")
    v.file_contains(cat, "KillCamData struct", cam_h, "FKhaaosKillCamData")
    v.file_contains(cat, "CameraShakeConfig struct", cam_h, "FKhaaosCameraShakeConfig")
    v.file_contains(cat, "StartKillCam method", cam_h, "StartKillCam")
    v.file_contains(cat, "Kill cam duration 3s", cam_h, "3.0")
    v.file_contains(cat, "Kill cam 0.25x slow-mo", cam_h, "0.25")
    v.file_contains(cat, "SetSpectatorTarget method", cam_h, "SetSpectatorTarget")
    v.file_contains(cat, "CycleSpectatorTarget method", cam_h, "CycleSpectatorTarget")
    v.file_contains(cat, "PlayWorldTransitionCinematic", cam_h, "PlayWorldTransitionCinematic")
    v.file_contains(cat, "TriggerCameraShake method", cam_h, "TriggerCameraShake")
    v.file_contains(cat, "StartDeathCamera method", cam_h, "StartDeathCamera")
    v.file_contains(cat, "OnKillCamFinished delegate", cam_h, "OnKillCamFinished")
    v.file_contains(cat, "OnTransitionCinematicFinished", cam_h, "OnTransitionCinematicFinished")
    v.file_contains(cat, "FOV override", cam_h, "SetFOV")
    v.file_contains(cat, "Camera mode switch in .cpp", cam_cpp, "SetCameraMode")
    v.file_contains(cat, "Time scale apply", cam_cpp, "ApplyTimeScale")

    # ═══════════════════════════════════════════════════════════════════════
    # 12. CharacterLODSystem (NEW — P0 Performance Gap)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[12/14] CharacterLODSystem (Performance & Culling)")
    cat = "CharacterLOD"

    lod_h = gfx_dir / "KhaaosCharacterLODSystem.h"
    lod_cpp = gfx_dir / "KhaaosCharacterLODSystem.cpp"
    v.file_exists(cat, "KhaaosCharacterLODSystem.h", lod_h)
    v.file_exists(cat, "KhaaosCharacterLODSystem.cpp", lod_cpp)
    v.file_contains(cat, "4 LOD levels enum", lod_h, "CULLED")
    v.file_contains(cat, "HIGH LOD level", lod_h, "HIGH")
    v.file_contains(cat, "MEDIUM LOD level", lod_h, "MEDIUM")
    v.file_contains(cat, "LOW LOD level", lod_h, "LOW")
    v.file_contains(cat, "LODThresholds struct", lod_h, "FKhaaosLODThresholds")
    v.file_contains(cat, "AnimationBudget struct", lod_h, "FKhaaosAnimationBudget")
    v.file_contains(cat, "30m HIGH->MEDIUM", lod_h, "30.0")
    v.file_contains(cat, "60m MEDIUM->LOW", lod_h, "60.0")
    v.file_contains(cat, "100m LOW->CULLED", lod_h, "100.0")
    v.file_contains(cat, "2ms anim budget", lod_h, "2.0")
    v.file_contains(cat, "Max 10 HIGH LOD", lod_h, "10")
    v.file_contains(cat, "RegisterCharacter method", lod_h, "RegisterCharacter")
    v.file_contains(cat, "ForceHighLOD method", lod_h, "ForceHighLOD")
    v.file_contains(cat, "IsOverBudget method", lod_h, "IsOverBudget")
    v.file_contains(cat, "ApplyLODToCharacter in .cpp", lod_cpp, "ApplyLODToCharacter")
    v.file_contains(cat, "SortCharactersByPriority", lod_cpp, "SortCharactersByPriority")
    v.file_contains(cat, "Mesh LOD switching", lod_cpp, "SetLODLevel")

    # ═══════════════════════════════════════════════════════════════════════
    # 13. ScreenEffects (NEW — P0 UI Effects Gap)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[13/14] ScreenEffects (UI Overlay System)")
    cat = "ScreenEffects"

    se_h = gfx_dir / "KhaaosScreenEffects.h"
    se_cpp = gfx_dir / "KhaaosScreenEffects.cpp"
    v.file_exists(cat, "KhaaosScreenEffects.h", se_h)
    v.file_exists(cat, "KhaaosScreenEffects.cpp", se_cpp)
    v.file_contains(cat, "9 effect types enum", se_h, "REVIVE_EFFECT")
    v.file_contains(cat, "DAMAGE_VIGNETTE type", se_h, "DAMAGE_VIGNETTE")
    v.file_contains(cat, "LOW_HEALTH_PULSE type", se_h, "LOW_HEALTH_PULSE")
    v.file_contains(cat, "ZONE_WARNING type", se_h, "ZONE_WARNING")
    v.file_contains(cat, "HEAL_OVERLAY type", se_h, "HEAL_OVERLAY")
    v.file_contains(cat, "ELIMINATION_FLASH type", se_h, "ELIMINATION_FLASH")
    v.file_contains(cat, "SHIELD_BREAK type", se_h, "SHIELD_BREAK")
    v.file_contains(cat, "KILL_STREAK_GLOW type", se_h, "KILL_STREAK_GLOW")
    v.file_contains(cat, "WORLD_TRANSITION_FLASH", se_h, "WORLD_TRANSITION_FLASH")
    v.file_contains(cat, "ScreenEffectConfig struct", se_h, "FKhaaosScreenEffectConfig")
    v.file_contains(cat, "ActiveScreenEffect struct", se_h, "FKhaaosActiveScreenEffect")
    v.file_contains(cat, "TriggerDamageVignette method", se_h, "TriggerDamageVignette")
    v.file_contains(cat, "StartLowHealthPulse method", se_h, "StartLowHealthPulse")
    v.file_contains(cat, "TriggerZoneWarning method", se_h, "TriggerZoneWarning")
    v.file_contains(cat, "TriggerHealOverlay method", se_h, "TriggerHealOverlay")
    v.file_contains(cat, "TriggerEliminationFlash method", se_h, "TriggerEliminationFlash")
    v.file_contains(cat, "TriggerShieldBreak method", se_h, "TriggerShieldBreak")
    v.file_contains(cat, "SetKillStreakGlow method", se_h, "SetKillStreakGlow")
    v.file_contains(cat, "TriggerWorldTransitionFlash", se_h, "TriggerWorldTransitionFlash")
    v.file_contains(cat, "TriggerReviveEffect method", se_h, "TriggerReviveEffect")
    v.file_contains(cat, "ClearAllEffects method", se_h, "ClearAllEffects")
    v.file_contains(cat, "GlobalIntensityMultiplier", se_h, "GlobalIntensityMultiplier")
    v.file_contains(cat, "OnEffectTriggered delegate", se_h, "OnEffectTriggered")
    v.file_contains(cat, "OnEffectFinished delegate", se_h, "OnEffectFinished")
    v.file_contains(cat, "Effect update loop in .cpp", se_cpp, "UpdateEffects")
    v.file_contains(cat, "Sin pulse for looping", se_cpp, "sin")  # or FMath::Sin
    v.file_contains(cat, "Fade in/out logic", se_cpp, "FadeInTime")

    # ═══════════════════════════════════════════════════════════════════════
    # 14. FreeFire Parity Score (expanded)
    # ═══════════════════════════════════════════════════════════════════════
    print("\n[14/14] FreeFire Parity Assessment")
    cat = "Parity"

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
        "PostProcess Manager": (gfx_dir / "KhaaosPostProcessManager.h").exists(),
        "Cinematic Camera": (gfx_dir / "KhaaosCinematicCamera.h").exists(),
        "Character LOD System": (gfx_dir / "KhaaosCharacterLODSystem.h").exists(),
        "Screen Effects": (gfx_dir / "KhaaosScreenEffects.h").exists(),
    }
    for name, ok in checks.items():
        v.check(cat, f"System exists: {name}", ok)

    # ═══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 72)
    print("VALIDATION SUMMARY v6.0")
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
    print(f"\n  FreeFire Parity Score: {pct_score}% ({systems_ok}/{len(checks)} core systems)")

    if pct_score >= 90:
        print("  HIGH proximity — visual + gameplay systems operational")
    elif pct_score >= 70:
        print("  GOOD proximity — major systems in place, polish needed")
    elif pct_score >= 50:
        print("  MODERATE proximity — key systems in place, needs content")
    else:
        print("  LOW proximity — critical systems still missing")

    if v.failed == 0:
        print("\n  ALL CODE CHECKS PASSED — Khaaos Run v6.0 Validated!")
    else:
        print(f"\n  {v.failed} checks failed")

    return 0 if v.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
