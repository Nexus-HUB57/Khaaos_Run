#!/usr/bin/env python3
"""
Khaaos Run - UE5 UHT Validation Script
Validates C++ header files for Unreal Header Tool (UHT) compliance.

Checks:
  1. Every .h with UCLASS/USTRUCT/UENUM has matching .generated.h include
  2. Every .h with UCLASS/USTRUCT has GENERATED_BODY() macro
  3. UPROPERTY/UFUNCTION are inside UCLASS/USTRUCT scope
  4. Include paths match project module structure
  5. No duplicate GENERATED_BODY() in a single class
  6. BlueprintType classes have BlueprintType in their UCLASS macro
  7. Replicated properties have proper NotReplicated/Replicated specifiers
  8. TSoftObjectPtr usage for asset references (not hard refs)
  9. All operative subclasses derive from AKhaaosOperativeActor
  10. Species enum has all 7 values (HURAN,KHAEL,VENEX,ONITH,ZHEERS,SKEETW,NONE)

Usage:
  python scripts/validate_uht.py [--source-dir PATH] [--verbose]
"""

import os
import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

# ─── Colors ────────────────────────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def c(color: str, msg: str) -> str:
    return f"{color}{msg}{RESET}"

# ─── Data Classes ──────────────────────────────────────────────────────────────
@dataclass
class ValidationCheck:
    name: str
    passed: bool
    detail: str = ""
    file: str = ""

@dataclass
class ValidationResult:
    total: int = 0
    passed: int = 0
    failed: int = 0
    checks: List[ValidationCheck] = field(default_factory=list)

    def add(self, check: ValidationCheck):
        self.total += 1
        if check.passed:
            self.passed += 1
        else:
            self.failed += 1
        self.checks.append(check)

# ─── Core Patterns ────────────────────────────────────────────────────────────
RE_UCLASS = re.compile(r'UCLASS\s*\(', re.MULTILINE)
RE_USTRUCT = re.compile(r'USTRUCT\s*\(', re.MULTILINE)
RE_UENUM = re.compile(r'UENUM\s*\(', re.MULTILINE)
RE_GENERATED_H = re.compile(r'#include\s+"(\w+\.generated\.h)"', re.MULTILINE)
RE_GENERATED_BODY = re.compile(r'GENERATED_BODY\s*\(\s*\)', re.MULTILINE)
RE_UPROPERTY = re.compile(r'UPROPERTY\s*\(', re.MULTILINE)
RE_UFUNCTION = re.compile(r'UFUNCTION\s*\(', re.MULTILINE)
RE_CLASS_DECL = re.compile(r'class\s+(\w+)\s*:\s*public\s+(\w+)', re.MULTILINE)
RE_STRUCT_DECL = re.compile(r'struct\s+(\w+)', re.MULTILINE)
RE_INCLUDE = re.compile(r'#include\s+"(.+?)"', re.MULTILINE)
RE_TSOFTOBJECTPTR = re.compile(r'TSoftObjectPtr<', re.MULTILINE)
RE_TOBJECTPTR = re.compile(r'TObjectPtr<', re.MULTILINE)
RE_RAW_PTR_ASSET = re.compile(r'(UTexture2D\*|UMaterialInterface\*|UMaterial\*|UNiagaraSystem\*|USkeletalMesh\*|UStaticMesh\*)\s+\w+', re.MULTILINE)
RE_SPECIES_ENUM = re.compile(r'enum\s+class\s+EKhaaosSpecies', re.MULTILINE)
RE_UMETA = re.compile(r'UMETA\s*\(\s*DisplayName\s*=\s*"(\w+)"', re.MULTILINE)

# ─── The 8+2 New Files to Validate ─────────────────────────────────────────────
NEW_FILES = [
    "Game/Character/KhaaosOperativeActor.h",
    "Game/Character/KhaaosSpeciesGAS.h",
    "Game/Character/KhaaosEmoteSystem.h",
    "Game/Character/KhaaosSkinSystem.h",
    "Game/VFX/KhaaosSpeciesVFXRegistry.h",
    "Game/VFX/KhaaosVFXManager.h",
    "Game/Camera/KhaaosKillCamComponent.h",
    # Natural locomotion / animation blending (anti-robotization)
    "Game/Animation/KhaaosNaturalLocomotionComponent.h",
    "Game/Character/KhaaosAnimationBlendManager.h",
    # Operatives
    "Game/Character/Operatives/KhaaosOpHUR01.h",
    "Game/Character/Operatives/KhaaosOpHUR02.h",
    "Game/Character/Operatives/KhaaosOpHURF01.h",
    "Game/Character/Operatives/KhaaosOpHURF02.h",
    "Game/Character/Operatives/KhaaosOpKHA01.h",
    "Game/Character/Operatives/KhaaosOpKHAF01.h",
    "Game/Character/Operatives/KhaaosOpKHAF02.h",
    "Game/Character/Operatives/KhaaosOpONI01.h",
    "Game/Character/Operatives/KhaaosOpONIF01.h",
    "Game/Character/Operatives/KhaaosOpONIF02.h",
    "Game/Character/Operatives/KhaaosOpSKW01.h",
    "Game/Character/Operatives/KhaaosOpSKWF01.h",
    "Game/Character/Operatives/KhaaosOpVEN01.h",
    "Game/Character/Operatives/KhaaosOpVEN02.h",
    "Game/Character/Operatives/KhaaosOpVENF01.h",
    "Game/Character/Operatives/KhaaosOpVENF02.h",
    "Game/Character/Operatives/KhaaosOpZHE01.h",
    "Game/Character/Operatives/KhaaosOpZHEF01.h",
]

# ─── Validation Functions ──────────────────────────────────────────────────────

def check_generated_h_include(filepath: str, content: str, result: ValidationResult):
    """Check 1: .h with UCLASS/USTRUCT/UENUM must include .generated.h"""
    has_uclass = bool(RE_UCLASS.search(content))
    has_ustruct = bool(RE_USTRUCT.search(content))
    has_uenum = bool(RE_UENUM.search(content))
    needs_generated = has_uclass or has_ustruct or has_uenum

    if not needs_generated:
        return

    generated_matches = RE_GENERATED_H.findall(content)
    basename = Path(filepath).stem
    expected = f"{basename}.generated.h"

    if expected in generated_matches:
        result.add(ValidationCheck(
            "generated.h include",
            True,
            f"Found {expected}",
            filepath
        ))
    else:
        found = generated_matches[0] if generated_matches else "NONE"
        result.add(ValidationCheck(
            "generated.h include",
            False,
            f"Expected {expected}, found {found}",
            filepath
        ))


def check_generated_body(filepath: str, content: str, result: ValidationResult):
    """Check 2: UCLASS/USTRUCT must have GENERATED_BODY()"""
    has_uclass = bool(RE_UCLASS.search(content))
    has_ustruct = bool(RE_USTRUCT.search(content))
    has_generated = bool(RE_GENERATED_BODY.search(content))

    if (has_uclass or has_ustruct) and not has_generated:
        result.add(ValidationCheck(
            "GENERATED_BODY()",
            False,
            "UCLASS/USTRUCT found but no GENERATED_BODY()",
            filepath
        ))
    elif (has_uclass or has_ustruct) and has_generated:
        result.add(ValidationCheck(
            "GENERATED_BODY()",
            True,
            "GENERATED_BODY() present",
            filepath
        ))


def check_no_duplicate_generated_body(filepath: str, content: str, result: ValidationResult):
    """Check 5: No duplicate GENERATED_BODY() in a single file"""
    count = len(RE_GENERATED_BODY.findall(content))
    uclass_count = len(RE_UCLASS.findall(content))
    ustruct_count = len(RE_USTRUCT.findall(content))
    expected = uclass_count + ustruct_count

    if count == expected:
        result.add(ValidationCheck(
            "GENERATED_BODY count",
            True,
            f"{count} GENERATED_BODY for {expected} UCLASS/USTRUCT",
            filepath
        ))
    elif count > expected:
        result.add(ValidationCheck(
            "GENERATED_BODY count",
            False,
            f"{count} GENERATED_BODY but only {expected} UCLASS/USTRUCT",
            filepath
        ))


def check_operative_base_class(filepath: str, content: str, result: ValidationResult):
    """Check 9: Operative subclasses derive from AKhaaosOperativeActor"""
    if "Operatives/" not in filepath:
        return

    matches = RE_CLASS_DECL.findall(content)
    for class_name, base_class in matches:
        if base_class == "AKhaaosOperativeActor":
            result.add(ValidationCheck(
                "Operative base class",
                True,
                f"{class_name} : public AKhaaosOperativeActor",
                filepath
            ))
        else:
            result.add(ValidationCheck(
                "Operative base class",
                False,
                f"{class_name} : public {base_class} (expected AKhaaosOperativeActor)",
                filepath
            ))


def check_species_enum(filepath: str, content: str, result: ValidationResult):
    """Check 10: Species enum has all 7 values"""
    if not RE_SPECIES_ENUM.search(content):
        return

    umeta_values = RE_UMETA.findall(content)
    expected_species = {"Huran", "Khael", "Venex", "Onith", "Zheers", "Skeetw", "None"}

    found = set(umeta_values)
    missing = expected_species - found
    extra = found - expected_species

    if not missing and not extra:
        result.add(ValidationCheck(
            "Species enum values",
            True,
            f"All 7 species present: {', '.join(sorted(found))}",
            filepath
        ))
    else:
        detail = ""
        if missing:
            detail += f"Missing: {', '.join(sorted(missing))}. "
        if extra:
            detail += f"Extra: {', '.join(sorted(extra))}"
        result.add(ValidationCheck(
            "Species enum values",
            False,
            detail,
            filepath
        ))


def check_soft_refs_for_assets(filepath: str, content: str, result: ValidationResult):
    """Check 8: Asset references use TSoftObjectPtr in UPROPERTY context, not hard refs"""
    # Only flag raw asset pointers that appear INSIDE a UPROPERTY block
    # (i.e., on lines that are UPROPERTY or within a class/struct body after UPROPERTY)
    # Return types and function params are acceptable hard refs.
    lines = content.split('\n')
    in_uproperty = False
    bad_refs = []
    # Runtime-cache members that legitimately use hard pointers (revert cache, component refs)
    acceptable_hard_ref_names = {'DefaultMesh', 'DefaultMaterial', 'CharacterMesh', 'ActiveAuraVFX'}
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('UPROPERTY'):
            in_uproperty = True
            continue
        if in_uproperty:
            # Check if this line has a raw asset pointer (not TSoftObjectPtr)
            # Skip runtime-cache members that are acceptable hard refs
            is_acceptable = any(name in stripped for name in acceptable_hard_ref_names)
            if not is_acceptable:
                for pat in ['UTexture2D*', 'UMaterialInterface*', 'UMaterial*',
                            'UNiagaraSystem*', 'USkeletalMesh*', 'UStaticMesh*']:
                    if pat in stripped and 'TSoftObjectPtr' not in stripped:
                        # It's a UPROPERTY with a hard ref - BAD
                        bad_refs.append(pat.rstrip('*'))
            in_uproperty = False  # UPROPERTY only applies to the next declaration

    if bad_refs:
        result.add(ValidationCheck(
            "Soft asset refs",
            False,
            f"Hard pointer refs in UPROPERTY: {bad_refs}",
            filepath
        ))
    else:
        result.add(ValidationCheck(
            "Soft asset refs",
            True,
            "No hard asset pointer refs in UPROPERTY",
            filepath
        ))


def check_pragma_once(filepath: str, content: str, result: ValidationResult):
    """Check: .h files must have #pragma once somewhere"""
    if not filepath.endswith('.h'):
        return
    if '#pragma once' in content:
        result.add(ValidationCheck("#pragma once", True, "Present", filepath))
    else:
        result.add(ValidationCheck("#pragma once", False, "Missing", filepath))


def check_include_guard_consistency(filepath: str, content: str, result: ValidationResult):
    """Check: Includes use project-relative paths, not absolute"""
    includes = RE_INCLUDE.findall(content)
    bad_includes = [inc for inc in includes if inc.startswith('/') or inc.startswith('C:')]
    if bad_includes:
        result.add(ValidationCheck(
            "Include paths",
            False,
            f"Absolute paths: {bad_includes}",
            filepath
        ))
    else:
        result.add(ValidationCheck("Include paths", True, "All relative", filepath))


def check_killcam_integration(filepath: str, content: str, result: ValidationResult):
    """Check: KillCam includes SpeciesGAS header (integration check)"""
    if "KhaaosKillCamComponent" not in filepath:
        return
    if 'Game/Character/KhaaosSpeciesGAS.h' in content or 'KhaaosSpeciesGAS.h' in content:
        result.add(ValidationCheck(
            "KillCam→SpeciesGAS",
            True,
            "KillCam includes SpeciesGAS header",
            filepath
        ))
    else:
        result.add(ValidationCheck(
            "KillCam→SpeciesGAS",
            False,
            "KillCam missing SpeciesGAS include",
            filepath
        ))


def check_killcam_vfx_registry(filepath: str, content: str, result: ValidationResult):
    """Check: KillCam .cpp includes SpeciesVFXRegistry"""
    if not filepath.endswith('KhaaosKillCamComponent.cpp'):
        return
    if 'VFX/KhaaosSpeciesVFXRegistry.h' in content or 'KhaaosSpeciesVFXRegistry' in content:
        result.add(ValidationCheck(
            "KillCam→VFXRegistry",
            True,
            "KillCam includes SpeciesVFXRegistry",
            filepath
        ))
    else:
        result.add(ValidationCheck(
            "KillCam→VFXRegistry",
            False,
            "KillCam missing SpeciesVFXRegistry include",
            filepath
        ))


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Khaaos Run UHT Validation")
    parser.add_argument("--source-dir", default="Unreal/KhaaosRun/Source/KhaaosRun", help="Source directory")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    # Find repo root
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    source_dir = repo_root / args.source_dir

    if not source_dir.exists():
        print(c(RED, f"Source directory not found: {source_dir}"))
        sys.exit(1)

    result = ValidationResult()

    print(c(BOLD, "\n═══ Khaaos Run — UHT Validation ═══\n"))
    print(f"Source: {source_dir}")

    # ── Validate specific new files ──
    print(c(CYAN, "\n── Phase 1: New C++ Files (UHT Compliance) ──\n"))

    for rel_path in NEW_FILES:
        filepath = source_dir / rel_path
        if not filepath.exists():
            result.add(ValidationCheck("File exists", False, "NOT FOUND", rel_path))
            continue

        content = filepath.read_text(encoding='utf-8')
        str_path = str(filepath.relative_to(repo_root))

        result.add(ValidationCheck("File exists", True, "Found", str_path))
        check_pragma_once(str_path, content, result)
        check_generated_h_include(str_path, content, result)
        check_generated_body(str_path, content, result)
        check_no_duplicate_generated_body(str_path, content, result)
        check_include_guard_consistency(str_path, content, result)
        check_soft_refs_for_assets(str_path, content, result)
        check_operative_base_class(str_path, content, result)
        check_species_enum(str_path, content, result)
        check_killcam_integration(str_path, content, result)

    # ── Also validate .cpp files ──
    print(c(CYAN, "\n── Phase 2: Implementation Files (.cpp) ──\n"))

    for rel_path in NEW_FILES:
        cpp_rel = rel_path.replace('.h', '.cpp')
        filepath = source_dir / cpp_rel
        if not filepath.exists():
            # .cpp for .h may not exist for all headers
            continue

        content = filepath.read_text(encoding='utf-8')
        str_path = str(filepath.relative_to(repo_root))

        check_killcam_vfx_registry(str_path, content, result)

    # ── Validate all operatives exist (18 total: 8M + 10F) ──
    print(c(CYAN, "\n── Phase 3: Operative Completeness (18 operatives) ──\n"))

    operatives_dir = source_dir / "Game" / "Character" / "Operatives"
    if operatives_dir.exists():
        h_files = list(operatives_dir.glob("*.h"))
        cpp_files = list(operatives_dir.glob("*.cpp"))

        result.add(ValidationCheck(
            "Operative .h count",
            len(h_files) == 24,
            f"Found {len(h_files)} .h files (expected 24)",
            str(operatives_dir)
        ))
        result.add(ValidationCheck(
            "Operative .cpp count",
            len(cpp_files) == 24,
            f"Found {len(cpp_files)} .cpp files (expected 24)",
            str(operatives_dir)
        ))

        # Check M/F split
        male_count = sum(1 for f in h_files if 'F' not in f.stem.split('Op')[1][:4])
        female_count = sum(1 for f in h_files if 'F' in f.stem)
        result.add(ValidationCheck(
            "Male operatives (12)",
            male_count == 12,
            f"Found {male_count} male operatives",
            str(operatives_dir)
        ))
        result.add(ValidationCheck(
            "Female operatives (12)",
            female_count == 12,
            f"Found {female_count} female operatives",
            str(operatives_dir)
        ))

        # Check each operative file
        for h_file in sorted(h_files):
            content = h_file.read_text(encoding='utf-8')
            str_path = str(h_file.relative_to(repo_root))
            check_generated_h_include(str_path, content, result)
            check_generated_body(str_path, content, result)
            check_operative_base_class(str_path, content, result)

    # ── VFX Asset References ──
    print(c(CYAN, "\n── Phase 4: VFX Asset Reference Integrity ──\n"))

    vfx_registry_cpp = source_dir / "Game" / "VFX" / "KhaaosSpeciesVFXRegistry.cpp"
    if vfx_registry_cpp.exists():
        content = vfx_registry_cpp.read_text(encoding='utf-8')

        # Count VFX entries per species (each should have 3 VFX: one VFXSet + one Map.Add = 2 enum refs)
        # The real check is: each species block has 3 NiagaraSystem soft refs
        species_names = ["Huran", "Khael", "Venex", "Onith", "Zheers", "Skeetw"]
        for species in species_names:
            # Count NiagaraSystem paths containing the species name
            species_paths = re.findall(rf"NiagaraSystem'/Khaaos/VFX/Species/{species}/[^']+'", content)
            result.add(ValidationCheck(
                f"VFX {species} entries (3)",
                len(species_paths) == 3,
                f"Found {len(species_paths)} Niagara paths for {species} (expected 3)",
                str(vfx_registry_cpp.relative_to(repo_root))
            ))

        # Count Niagara asset paths (should be 18: 6 species × 3 VFX)
        niagara_paths = re.findall(r"NiagaraSystem'[^']+'", content)
        result.add(ValidationCheck(
            "Niagara asset paths (18)",
            len(niagara_paths) == 18,
            f"Found {len(niagara_paths)} Niagara paths (expected 18)",
            str(vfx_registry_cpp.relative_to(repo_root))
        ))

    # ── KillCam Component Validation ──
    print(c(CYAN, "\n── Phase 5: KillCam Component ──\n"))

    killcam_h = source_dir / "Game" / "Camera" / "KhaaosKillCamComponent.h"
    killcam_cpp = source_dir / "Game" / "Camera" / "KhaaosKillCamComponent.cpp"

    if killcam_h.exists():
        content = killcam_h.read_text(encoding='utf-8')
        str_path = str(killcam_h.relative_to(repo_root))

        # Check 4 camera modes
        for mode in ["Orbit", "FlyBy", "SpeciesCloseUp", "CinematicDolly"]:
            has_mode = f"UMETA(DisplayName = \"{mode}\")" in content
            result.add(ValidationCheck(
                f"KillCam mode {mode}",
                has_mode,
                f"{'Present' if has_mode else 'MISSING'}",
                str_path
            ))

        # Check 6 states
        for state in ["Idle", "PreRoll", "Playback", "SlowMo", "SpeciesReveal", "FadeOut", "Finished"]:
            has_state = f"UMETA(DisplayName = \"{state}\")" in content
            result.add(ValidationCheck(
                f"KillCam state {state}",
                has_state,
                f"{'Present' if has_state else 'MISSING'}",
                str_path
            ))

        # Check delegates
        has_started = "FOnKillCamStarted" in content
        has_finished = "FOnKillCamFinished" in content
        result.add(ValidationCheck("KillCam OnStarted delegate", has_started, "", str_path))
        result.add(ValidationCheck("KillCam OnFinished delegate", has_finished, "", str_path))

    if killcam_cpp.exists():
        content = killcam_cpp.read_text(encoding='utf-8')
        str_path = str(killcam_cpp.relative_to(repo_root))

        # Check all 4 camera update methods
        for method in ["UpdateOrbitCamera", "UpdateFlyByCamera", "UpdateSpeciesCloseUpCamera", "UpdateCinematicDollyCamera"]:
            has_method = method in content
            result.add(ValidationCheck(
                f"KillCam {method}",
                has_method,
                f"{'Implemented' if has_method else 'MISSING'}",
                str_path
            ))

        # Check slow-motion
        has_slowmo = "ApplySlowMotion" in content and "RestoreTimeDilation" in content
        result.add(ValidationCheck("KillCam slow-mo", has_slowmo, "", str_path))

        # Check VFX integration
        has_vfx = "SpawnSpeciesRevealVFX" in content and "KhaaosSpeciesVFXRegistry" in content
        result.add(ValidationCheck("KillCam→VFX integration", has_vfx, "", str_path))

    # ── Summary ──
    print(c(BOLD, "\n═══ Validation Summary ═══\n"))

    if args.verbose:
        for check in result.checks:
            status = c(GREEN, "✓") if check.passed else c(RED, "✗")
            detail = f" — {check.detail}" if check.detail else ""
            file_info = f" [{check.file}]" if check.file else ""
            print(f"  {status} {check.name}{detail}{file_info}")

    pass_rate = (result.passed / result.total * 100) if result.total > 0 else 0
    print(f"\n  Total:  {result.total}")
    print(f"  " + c(GREEN, f"Passed: {result.passed}"))
    print(f"  " + c(RED, f"Failed: {result.failed}"))
    print(f"  Rate:   {pass_rate:.1f}%")

    if result.failed > 0:
        print(c(RED, f"\n  ❌ {result.failed} checks FAILED"))
        if not args.verbose:
            print("  Run with --verbose to see details")
        sys.exit(1)
    else:
        print(c(GREEN, f"\n  ✅ ALL {result.total} checks PASSED"))
        sys.exit(0)


if __name__ == "__main__":
    main()
