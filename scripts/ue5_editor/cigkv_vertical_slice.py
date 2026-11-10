"""UE5.8 Editor automation for CIGKV avatar visual validation.

Requires a licensed GPU-backed Editor runner. Produces 4 quality profiles x 3
lighting scenarios x 2 tagged cameras, plus a machine-readable report.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import unreal

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
SLICE_PATH = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_character_slice.json"
MATERIAL_PATH = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"
MATRIX_PATH = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_visual_lighting_test_matrix.json"
CONFIG_REPORT = ROOT / "artifacts/cigkv-vertical-slice/material-configuration-report.json"
OUT = ROOT / "artifacts/cigkv-vertical-slice"
CAPTURE_OUT = ROOT / os.environ.get("CIGKV_CAPTURE_DIR", "artifacts/cigkv-vertical-slice/headless-render")


def require_file(path: Path):
    if not path.is_file():
        raise RuntimeError(f"arquivo obrigatório ausente: {path}")


def load_json(path: Path):
    require_file(path)
    return json.loads(path.read_text())


def log(message: str):
    unreal.log(f"[CIGKV_VERTICAL_SLICE] {message}")


def command(value: str):
    unreal.SystemLibrary.execute_console_command(None, value)


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


def apply_profile(settings: dict):
    for command_name, value in (
        ("sg.ViewDistanceQuality", settings["view_distance"]),
        ("sg.ShadowQuality", settings["shadow"]),
        ("sg.PostProcessQuality", settings["post_process"]),
        ("sg.TextureQuality", settings["texture_quality"]),
        ("r.Lumen.Reflections.Allow", int(settings["lumen"])),
        ("r.Nanite", int(settings["nanite"])),
    ):
        command(f"{command_name} {value}")


def find_camera(tag: str):
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if tag in [str(item) for item in actor.tags]:
            return actor
    raise RuntimeError(f"câmera com tag ausente: {tag}")


def capture_matrix(matrix: dict, map_path: str):
    CAPTURE_OUT.mkdir(parents=True, exist_ok=True)
    captures = []
    for profile, settings in matrix["profiles"].items():
        apply_profile(settings)
        for lighting in matrix["lighting_scenarios"]:
            for view in matrix["views"]:
                command(f"Open {map_path}")
                for lighting_command in lighting["console_commands"]:
                    command(lighting_command)
                camera = find_camera(view["camera_tag"])
                if hasattr(unreal.EditorLevelLibrary, "pilot_level_actor"):
                    unreal.EditorLevelLibrary.pilot_level_actor(camera)
                filename = CAPTURE_OUT / f"CIGKV_{profile}_{lighting['id']}_{view['id']}.png"
                unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, str(filename), None, False)
                if hasattr(unreal.EditorLevelLibrary, "eject_pilot_level_actor"):
                    unreal.EditorLevelLibrary.eject_pilot_level_actor()
                if not filename.is_file():
                    raise RuntimeError(f"screenshot não gerado: {filename}")
                captures.append({"profile": profile, "lighting": lighting["id"], "view": view["id"], "camera": str(camera.get_name()), "path": str(filename.relative_to(ROOT))})
                log(f"capturado {profile}/{lighting['id']}/{view['id']}")
    if len(captures) != matrix["expected_captures"]:
        raise RuntimeError(f"matriz incompleta: {len(captures)} de {matrix['expected_captures']}")
    return captures


def main():
    slice_data = load_json(SLICE_PATH)
    materials = load_json(MATERIAL_PATH)
    matrix = load_json(MATRIX_PATH)
    require_file(CONFIG_REPORT)
    configuration = load_json(CONFIG_REPORT)
    if configuration.get("status") != "pass":
        raise RuntimeError("relatório de configuração de materiais não está pass")
    if not unreal.SystemLibrary.get_engine_version().startswith("5."):
        raise RuntimeError("engine UE5.x não detectada")
    imported = {}
    for character in slice_data["characters"]:
        normalized = ROOT / character["normalized_source"]
        imported[character["slot"]] = import_fbx(normalized, "/Game/Characters/CIGKV_VerticalSlice")
    master = unreal.EditorAssetLibrary.load_asset("/Game/Materials/CIGKV/M_CIGKV_Character_Master")
    if not master:
        raise RuntimeError("M_CIGKV_Character_Master ausente")
    captures = capture_matrix(matrix, slice_data["map"])
    report = {
        "schema": "khaaos.cigkv.vertical-slice.engine-report/v2",
        "status": "captured",
        "engine_version": unreal.SystemLibrary.get_engine_version(),
        "map": slice_data["map"],
        "profiles": list(matrix["profiles"]),
        "lighting_scenarios": [item["id"] for item in matrix["lighting_scenarios"]],
        "views": [item["id"] for item in matrix["views"]],
        "characters": imported,
        "material_recipe": str(MATERIAL_PATH.relative_to(ROOT)),
        "material_configuration_report": str(CONFIG_REPORT.relative_to(ROOT)),
        "captures": captures,
        "screenshots": [item["path"] for item in captures],
    }
    (OUT / "engine-report.json").write_text(json.dumps(report, indent=2) + "\n")
    log(f"vertical slice capturado com sucesso: {len(captures)} imagens")


if __name__ == "__main__":
    main()
