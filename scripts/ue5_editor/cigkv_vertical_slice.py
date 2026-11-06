"""UE5.8 Editor Python entrypoint for the CIGKV vertical slice.

This file is executed only by a licensed UnrealEditor-Cmd runner. It refuses to
report success when normalized FBX sources, the CIGKV map, or screenshots are
missing. Asset creation is intentionally editor-gated.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import unreal

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
SLICE_PATH = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_character_slice.json"
MATERIAL_PATH = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"
OUT = ROOT / "artifacts/cigkv-vertical-slice"
PROFILES = ("Low", "Medium", "High", "Ultra")


def require_file(path: Path):
    if not path.is_file():
        raise RuntimeError(f"arquivo obrigatório ausente: {path}")


def load_json(path: Path):
    require_file(path)
    return json.loads(path.read_text())


def log(message: str):
    unreal.log(f"[CIGKV_VERTICAL_SLICE] {message}")


def import_fbx(source: Path, destination: str):
    require_file(source)
    task = unreal.AssetImportTask()
    task.filename = str(source)
    task.destination_path = destination
    task.automated = True
    task.replace_existing = True
    task.options = unreal.FbxImportUI()
    task.options.import_mesh = True
    task.options.import_as_skeletal = True
    task.options.import_animations = True
    task.options.mesh_type_to_import = unreal.FBXImportType.FBXIT_SKELETAL_MESH
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    if not task.imported_object_paths:
        raise RuntimeError(f"FBX não importado: {source}")
    return task.imported_object_paths


def capture_profile(profile: str, map_path: str):
    OUT.mkdir(parents=True, exist_ok=True)
    screenshot = OUT / f"CIGKV_{profile}_third_person_combat.png"
    # The runner must be GPU-backed; null RHI is rejected by the workflow.
    unreal.SystemLibrary.execute_console_command(None, f"sg.ViewDistanceQuality {profile}")
    unreal.SystemLibrary.execute_console_command(None, f"sg.ShadowQuality {profile}")
    unreal.SystemLibrary.execute_console_command(None, f"sg.PostProcessQuality {profile}")
    unreal.SystemLibrary.execute_console_command(None, f"Open {map_path}")
    unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, str(screenshot), None, False)
    if not screenshot.is_file():
        raise RuntimeError(f"screenshot não gerado: {screenshot}")


def main():
    slice_data = load_json(SLICE_PATH)
    materials = load_json(MATERIAL_PATH)
    if unreal.SystemLibrary.get_engine_version().startswith("5.") is False:
        raise RuntimeError("engine UE5.x não detectada")

    imported = {}
    for character in slice_data["characters"]:
        normalized = ROOT / character["normalized_source"]
        imported[character["slot"]] = import_fbx(normalized, "/Game/Characters/CIGKV_VerticalSlice")
        log(f"importado {character['slot']} com alvo {character['canonical_skeleton']}")

    # Material creation is delegated to the versioned material recipe and the
    # project's master material factory; absence of the master is a hard error.
    master = unreal.EditorAssetLibrary.load_asset("/Game/Materials/CIGKV/M_CIGKV_Character_Master")
    if not master:
        raise RuntimeError("M_CIGKV_Character_Master ausente; criar a partir da receita antes do aceite")

    for profile in PROFILES:
        capture_profile(profile, slice_data["map"])

    report = {
        "schema": "khaaos.cigkv.vertical-slice.engine-report/v1",
        "status": "captured",
        "engine_version": unreal.SystemLibrary.get_engine_version(),
        "map": slice_data["map"],
        "profiles": list(PROFILES),
        "characters": imported,
        "material_recipe": str(MATERIAL_PATH.relative_to(ROOT)),
        "screenshots": sorted(str(path.relative_to(ROOT)) for path in OUT.glob("*.png")),
    }
    (OUT / "engine-report.json").write_text(json.dumps(report, indent=2) + "\n")
    log("vertical slice CIGKV capturado com sucesso")


if __name__ == "__main__":
    main()
