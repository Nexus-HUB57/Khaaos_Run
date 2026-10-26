#!/usr/bin/env python3
"""Package and validate the first CIGKV FPS combat slice.

This script is intentionally usable without Unreal installed. It always performs
static integration checks and creates a deterministic ZIP package. If UE5.8 is
available (UE5_ROOT/RUNUAT/UNREAL_EDITOR), --run-engine can additionally invoke
RunUAT/UnrealEditor; otherwise the report explicitly records a skipped engine
validation instead of claiming that a cook/build happened.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "Unreal" / "KhaaosRun"
UPROJECT = PROJECT / "KhaaosRun.uproject"
DEFAULT_OUTPUT = ROOT / "artifacts" / "ue5" / "KhaaosRun-CIGKV-FPS-slice.zip"

REQUIRED_FILES = [
    PROJECT / "KhaaosRun.uproject",
    PROJECT / "Config" / "DefaultEngine.ini",
    PROJECT / "Config" / "DefaultCIGKV.ini",
    PROJECT / "Content" / "Maps" / "CIGKV" / "CIGKV_level_data.json",
    PROJECT / "Content" / "Maps" / "CIGKV" / "CIGKV_visual_profile.json",
    PROJECT / "Source" / "KhaaosRun" / "Game" / "Combat" / "KhaaosProjectile.h",
    PROJECT / "Source" / "KhaaosRun" / "Game" / "Data" / "KhaaosWeaponDataAsset.h",
]
ASSET_ROOTS = [
    PROJECT / "Content" / "Maps" / "CIGKV",
    PROJECT / "Content" / "Weapons",
    PROJECT / "Content" / "VFX",
    PROJECT / "Content" / "Audio" / "SFX",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def find_engine_tools() -> dict[str, str | None]:
    root = os.environ.get("UE5_ROOT")
    candidates = []
    if root:
        base = Path(root)
        candidates.extend([base / "Engine" / "Build" / "BatchFiles" / "RunUAT.sh", base / "Engine" / "Build" / "BatchFiles" / "RunUAT.bat"])
    for name in ("RunUAT.sh", "RunUAT.bat", "UnrealEditor", "UnrealEditor-Cmd"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))
    runuat = next((str(p) for p in candidates if p.name.lower().startswith("runuat") and p.exists()), None)
    editor = os.environ.get("UNREAL_EDITOR") or next((str(p) for p in candidates if "editor" in p.name.lower() and p.exists()), None)
    return {"ue5_root": root, "runuat": runuat, "editor": editor}


def collect_files() -> list[Path]:
    files: set[Path] = set()
    for root in ASSET_ROOTS:
        if root.exists():
            files.update(p for p in root.rglob("*") if p.is_file())
    for path in REQUIRED_FILES:
        if path.exists():
            files.add(path)
    return sorted(files)


def static_validate(files: list[Path]) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    if not UPROJECT.exists():
        errors.append(f"missing project: {UPROJECT}")
    else:
        try:
            project = json.loads(UPROJECT.read_text(encoding="utf-8"))
            if project.get("EngineAssociation") != "5.8":
                errors.append("KhaaosRun.uproject EngineAssociation is not 5.8")
            plugins = {p.get("Name") for p in project.get("Plugins", [])}
            for required in ("EnhancedInput", "Niagara", "Iris"):
                if required not in plugins:
                    errors.append(f"missing required UE plugin: {required}")
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"invalid uproject: {exc}")
    for path in REQUIRED_FILES:
        if not path.exists():
            errors.append(f"missing required integration file: {path.relative_to(ROOT)}")
    visual = PROJECT / "Content" / "Maps" / "CIGKV" / "CIGKV_visual_profile.json"
    if visual.exists():
        try:
            profile = json.loads(visual.read_text(encoding="utf-8"))
            if profile.get("engine_target") != "UE5.8":
                errors.append("visual profile engine_target is not UE5.8")
            if profile.get("status") != "editor_import_required":
                warnings.append("visual profile status changed; confirm the Editor assets exist")
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"invalid visual profile: {exc}")
    pending = [p.relative_to(ROOT).as_posix() for p in files if p.name.startswith(".") and "pending_import" in p.name]
    if pending:
        warnings.append(f"{len(pending)} placeholder import markers are packaged; binary UE assets are not present in this checkout")
    return errors, warnings, {"pending_import_markers": pending, "asset_file_count": len(files)}


def package(files: list[Path], output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            rel = path.relative_to(ROOT).as_posix()
            archive_name = f"payload/{rel}"
            archive.write(path, archive_name)
            manifest_entries.append({"path": rel, "sha256": sha256(path), "bytes": path.stat().st_size})
        manifest = {
            "schema": "khaaos.ue5.first-world.package/v1",
            "engine_target": "UE5.8",
            "world": "CIGKV",
            "slice": "FPS combat and ballistics",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "files": manifest_entries,
        }
        archive.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return {"path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output), "manifest_entries": len(manifest_entries)}


def run_engine_check(tools: dict[str, str | None], output: Path) -> dict:
    if not tools["runuat"] and not tools["editor"]:
        return {"status": "skipped_no_engine", "reason": "UE5.8 RunUAT/UnrealEditor was not found in this environment"}
    # Only execute when explicitly requested; static packaging must remain safe.
    if tools["runuat"]:
        cmd = [tools["runuat"], "BuildCookRun", f"-project={UPROJECT}", "-noP4", "-nocompileeditor", "-utf8output", "-skipbuildeditor", "-stage", "-pak", f"-archivedirectory={output.parent / 'cook'}"]
    else:
        cmd = [tools["editor"], str(UPROJECT), "-run=ResavePackages", "-unattended", "-nop4", "-NullRHI", "-TestExit=Automation Test Queue Empty"]
    result = subprocess.run(cmd, cwd=PROJECT, text=True, capture_output=True, timeout=1800)
    return {"status": "passed" if result.returncode == 0 else "failed", "returncode": result.returncode, "command": cmd, "stdout_tail": result.stdout[-4000:], "stderr_tail": result.stderr[-4000:]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--run-engine", action="store_true", help="Run UE5.8 validation when tools are installed")
    parser.add_argument("--report", type=Path, help="Write the JSON report to this path")
    args = parser.parse_args()
    files = collect_files()
    errors, warnings, static = static_validate(files)
    result = {"static_validation": {"status": "passed" if not errors else "failed", "errors": errors, "warnings": warnings, **static}}
    if errors:
        result["package"] = {"status": "not_created"}
        exit_code = 1
    else:
        result["package"] = {"status": "created", **package(files, args.output)}
        result["engine_validation"] = run_engine_check(find_engine_tools(), args.output) if args.run_engine else {"status": "not_requested"}
        exit_code = 0 if result["engine_validation"]["status"] not in ("failed",) else 2
    report_path = args.report or args.output.with_suffix(".report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
