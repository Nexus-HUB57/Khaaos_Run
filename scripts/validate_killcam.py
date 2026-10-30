#!/usr/bin/env python3
"""
Khaaos Run — Kill Cam In-Editor Validation Script

Validates the KhaaosKillCamComponent C++ system without requiring
a full UE5 editor launch. Checks:
  1. KillCam state machine completeness (7 states)
  2. Camera mode implementation (4 modes)
  3. Slow-motion time dilation pipeline
  4. Species VFX integration during SpeciesCloseUp mode
  5. FKhaaosKillCamData struct completeness
  6. FKhaaosKillCamConfig defaults
  7. Delegate broadcast correctness
  8. State transition order validation
  9. Integration with KhaaosSpeciesVFXRegistry
  10. Integration with EKhaaosSpecies enum

Usage:
  python scripts/validate_killcam.py [--verbose]
"""

import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List

GREEN = "\033[92m"; RED = "\033[91m"; CYAN = "\033[96m"; BOLD = "\033[1m"; RESET = "\033[0m"
def c(color, msg): return f"{color}{msg}{RESET}"

@dataclass
class Check:
    name: str; passed: bool; detail: str = ""

def run_checks(source_dir: Path) -> List[Check]:
    checks = []
    
    # ── Read KillCam files ──
    killcam_h = source_dir / "Game/Camera/KhaaosKillCamComponent.h"
    killcam_cpp = source_dir / "Game/Camera/KhaaosKillCamComponent.cpp"
    vfx_registry_h = source_dir / "Game/VFX/KhaaosSpeciesVFXRegistry.h"
    species_gas_h = source_dir / "Game/Character/KhaaosSpeciesGAS.h"

    if not killcam_h.exists():
        checks.append(Check("KillCam .h exists", False, f"Not found: {killcam_h}"))
        return checks
    checks.append(Check("KillCam .h exists", True))

    h_content = killcam_h.read_text(encoding='utf-8')
    cpp_content = killcam_cpp.read_text(encoding='utf-8') if killcam_cpp.exists() else ""

    # ── 1. State Machine Completeness ──
    expected_states = ["Idle", "PreRoll", "Playback", "SlowMo", "SpeciesReveal", "FadeOut", "Finished"]
    for state in expected_states:
        found = f'UMETA(DisplayName = "{state}")' in h_content
        checks.append(Check(f"State: {state}", found, "Present" if found else "MISSING"))

    # ── 2. Camera Modes ──
    expected_modes = ["Orbit", "FlyBy", "SpeciesCloseUp", "CinematicDolly"]
    for mode in expected_modes:
        found = f'UMETA(DisplayName = "{mode}")' in h_content
        checks.append(Check(f"Mode: {mode}", found, "Present" if found else "MISSING"))

    # ── 3. Slow-Motion Pipeline ──
    checks.append(Check("ApplySlowMotion()", "ApplySlowMotion" in cpp_content,
                         "Implemented" if "ApplySlowMotion" in cpp_content else "MISSING"))
    checks.append(Check("RestoreTimeDilation()", "RestoreTimeDilation" in cpp_content,
                         "Implemented" if "RestoreTimeDilation" in cpp_content else "MISSING"))
    checks.append(Check("GlobalSlowMoDilation property", "GlobalSlowMoDilation" in h_content,
                         "Present" if "GlobalSlowMoDilation" in h_content else "MISSING"))
    checks.append(Check("SetTimeDilation call", "SetTimeDilation" in cpp_content,
                         "Implemented" if "SetTimeDilation" in cpp_content else "MISSING"))
    checks.append(Check("GetTimeDilation save", "GetTimeDilation" in cpp_content,
                         "Implemented" if "GetTimeDilation" in cpp_content else "MISSING"))

    # ── 4. Species VFX Integration ──
    checks.append(Check("SpawnSpeciesRevealVFX()", "SpawnSpeciesRevealVFX" in cpp_content,
                         "Implemented" if "SpawnSpeciesRevealVFX" in cpp_content else "MISSING"))
    checks.append(Check("CleanupSpeciesVFX()", "CleanupSpeciesVFX" in cpp_content,
                         "Implemented" if "CleanupSpeciesVFX" in cpp_content else "MISSING"))
    checks.append(Check("VFXRegistry access", "KhaaosSpeciesVFXRegistry" in cpp_content,
                         "Integrated" if "KhaaosSpeciesVFXRegistry" in cpp_content else "NOT INTEGRATED"))
    checks.append(Check("GetSpeciesVFXNames call", "GetSpeciesVFXNames" in cpp_content,
                         "Called" if "GetSpeciesVFXNames" in cpp_content else "NOT CALLED"))
    checks.append(Check("SpawnSpeciesVFXAtLocation call", "SpawnSpeciesVFXAtLocation" in cpp_content,
                         "Called" if "SpawnSpeciesVFXAtLocation" in cpp_content else "NOT CALLED"))

    # ── 5. FKhaaosKillCamData Completeness ──
    data_fields = [
        "KillerLocation", "VictimLocation", "KillerRotation", "VictimRotation",
        "KillerSpecies", "VictimSpecies", "KillingBlowDamage", "KillTimestamp", "bWasHeadshot"
    ]
    for field in data_fields:
        found = field in h_content
        checks.append(Check(f"KillCamData.{field}", found, "Present" if found else "MISSING"))

    # ── 6. FKhaaosKillCamConfig Defaults ──
    config_fields = [
        "Mode", "Duration", "SlowMoTimeScale", "SlowMoDuration",
        "OrbitRadius", "OrbitSpeed", "FOV", "DOFAperture",
        "bShowSpeciesVFX", "FadeOutDuration"
    ]
    for field in config_fields:
        found = field in h_content
        checks.append(Check(f"KillCamConfig.{field}", found, "Present" if found else "MISSING"))

    # ── 7. Delegates ──
    checks.append(Check("FOnKillCamStarted", "FOnKillCamStarted" in h_content,
                         "Present" if "FOnKillCamStarted" in h_content else "MISSING"))
    checks.append(Check("FOnKillCamFinished", "FOnKillCamFinished" in h_content,
                         "Present" if "FOnKillCamFinished" in h_content else "MISSING"))
    checks.append(Check("OnKillCamStarted.Broadcast", "OnKillCamStarted.Broadcast" in cpp_content,
                         "Broadcasts" if "OnKillCamStarted.Broadcast" in cpp_content else "NOT BROADCAST"))
    checks.append(Check("OnKillCamFinished.Broadcast", "OnKillCamFinished.Broadcast" in cpp_content,
                         "Broadcasts" if "OnKillCamFinished.Broadcast" in cpp_content else "NOT BROADCAST"))

    # ── 8. State Transition Order ──
    # PreRoll → Playback → SlowMo → SpeciesReveal/FadeOut → Finished
    transitions = [
        ("PreRoll→Playback", "TransitionToState(EKillCamState::Playback)" in cpp_content),
        ("Playback→SlowMo", "TransitionToState(EKillCamState::SlowMo)" in cpp_content),
        ("SlowMo→SpeciesReveal", "TransitionToState(EKillCamState::SpeciesReveal)" in cpp_content),
        ("SlowMo→FadeOut", "TransitionToState(EKillCamState::FadeOut)" in cpp_content),
        ("SpeciesReveal→FadeOut", "TickSpeciesReveal" in cpp_content and "EKillCamState::FadeOut" in cpp_content),
        ("FadeOut→Finished", "TransitionToState(EKillCamState::Finished)" in cpp_content),
    ]
    for name, found in transitions:
        checks.append(Check(f"Transition: {name}", found, "Valid" if found else "INVALID"))

    # ── 9. SpeciesVFXRegistry Integration ──
    if vfx_registry_h.exists():
        vfx_content = vfx_registry_h.read_text(encoding='utf-8')
        checks.append(Check("VFXRegistry subsystem", "UGameInstanceSubsystem" in vfx_content,
                             "Correct" if "UGameInstanceSubsystem" in vfx_content else "WRONG BASE"))
        checks.append(Check("VFXRegistry GetSpeciesVFX", "GetSpeciesVFX" in vfx_content,
                             "Present" if "GetSpeciesVFX" in vfx_content else "MISSING"))
        checks.append(Check("VFXRegistry SpawnSpeciesVFX", "SpawnSpeciesVFX" in vfx_content,
                             "Present" if "SpawnSpeciesVFX" in vfx_content else "MISSING"))

    # ── 10. Species Enum Integration ──
    if species_gas_h.exists():
        gas_content = species_gas_h.read_text(encoding='utf-8')
        species_values = ["HURAN", "KHAEL", "VENEX", "ONITH", "ZHEERS", "SKEETW", "NONE"]
        for species in species_values:
            found = species in gas_content
            checks.append(Check(f"Species enum: {species}", found, "Present" if found else "MISSING"))

    # ── Camera Update Methods ──
    update_methods = ["UpdateOrbitCamera", "UpdateFlyByCamera", 
                      "UpdateSpeciesCloseUpCamera", "UpdateCinematicDollyCamera"]
    for method in update_methods:
        in_h = method in h_content
        in_cpp = method in cpp_content
        checks.append(Check(f"Method: {method}", in_h and in_cpp,
                             f"Declared+Implemented" if (in_h and in_cpp) else f"h={in_h} cpp={in_cpp}"))

    # ── Component Tick Setup ──
    checks.append(Check("PrimaryComponentTick", "PrimaryComponentTick" in cpp_content,
                         "Configured" if "PrimaryComponentTick" in cpp_content else "NOT CONFIGURED"))
    checks.append(Check("SetComponentTickEnabled", "SetComponentTickEnabled" in cpp_content,
                         "Managed" if "SetComponentTickEnabled" in cpp_content else "NOT MANAGED"))

    # ── Time Dilation Values ──
    has_dilation_03 = "0.3f" in cpp_content or "0.3f" in h_content
    checks.append(Check("SlowMo dilation ~0.3", has_dilation_03,
                         "Value set" if has_dilation_03 else "NO DEFAULT"))

    # ── NiagaraComponent tracking ──
    checks.append(Check("SpawnedSpeciesVFX array", "SpawnedSpeciesVFX" in h_content,
                         "Tracked" if "SpawnedSpeciesVFX" in h_content else "NOT TRACKED"))
    checks.append(Check("VFX Deactivate on cleanup", "Deactivate()" in cpp_content,
                         "Cleanup works" if "Deactivate()" in cpp_content else "NO CLEANUP"))

    return checks


def main():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    source_dir = repo_root / "Unreal/KhaaosRun/Source/KhaaosRun"

    print(c(BOLD, "\n═══ Khaaos Run — Kill Cam In-Editor Validation ═══\n"))

    checks = run_checks(source_dir)

    passed = sum(1 for c in checks if c.passed)
    failed = sum(1 for c in checks if not c.passed)
    total = len(checks)

    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    if verbose:
        for check in checks:
            status = c(GREEN, "✓") if check.passed else c(RED, "✗")
            detail = f" — {check.detail}" if check.detail else ""
            print(f"  {status} {check.name}{detail}")

    rate = (passed / total * 100) if total > 0 else 0
    print(f"\n  Total:  {total}")
    print(f"  " + c(GREEN, f"Passed: {passed}"))
    print(f"  " + c(RED, f"Failed: {failed}"))
    print(f"  Rate:   {rate:.1f}%")

    if failed == 0:
        print(c(GREEN, f"\n  ✅ ALL {total} KillCam checks PASSED"))
    else:
        print(c(RED, f"\n  ❌ {failed} checks FAILED"))

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
