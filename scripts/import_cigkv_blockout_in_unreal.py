#!/usr/bin/env python3
"""Import the generated CIGKV GLB as a Static Mesh from inside Unreal Editor 5.8.

Run `python3 scripts/import_cigkv_blockout_in_unreal.py --dry-run` outside UE
for a local source preflight. Run this script from the UE Editor's Python
scripting environment (Python Editor Script Plugin) to create .uasset files.
Existing assets are never replaced by this script.
"""
from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROJECT_FILE = ROOT / "Unreal/KhaaosRun/KhaaosRun.uproject"
GLB_PATH = ROOT / "Unreal/KhaaosRun/Content/Maps/CIGKV/ReadmeVisualSlice/SM_CIGKV_ArmoryToProvingGrounds_Blockout.glb"
ASSET_NAME = "SM_CIGKV_ArmoryToProvingGrounds_Blockout"
DESTINATION = "/Game/Maps/CIGKV/ReadmeVisualSlice/Imported"
EXPECTED_ROTATION = [0.0, math.sqrt(0.5), math.sqrt(0.5), 0.0]
EXPECTED_MATERIALS = {
    "M_CIGKV_Concrete_Wet",
    "M_CIGKV_Steel_Rusted",
    "M_CIGKV_Asphalt_Damp",
    "M_CIGKV_Glass_Dirty",
    "M_CIGKV_Dirt_Weathered",
}
EXPECTED_OBJECT_PATH = f"{DESTINATION}/{ASSET_NAME}.{ASSET_NAME}"


def read_glb(path: Path = GLB_PATH) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"CIGKV GLB not found: {path}")
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError("GLB is truncated")
    magic, container_version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or container_version != 2 or declared_length != len(data):
        raise ValueError("Expected a complete glTF 2.0 binary container")
    json_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON" or 20 + json_length > len(data):
        raise ValueError("GLB JSON chunk is missing or invalid")
    gltf = json.loads(data[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    if gltf.get("asset", {}).get("version") != "2.0":
        raise ValueError("Expected glTF asset version 2.0")
    if len(gltf.get("meshes", [])) != 1 or len(gltf["meshes"][0].get("primitives", [])) != 5:
        raise ValueError("The CIGKV source contract expects one mesh with five material primitives")
    materials = {item.get("name") for item in gltf.get("materials", [])}
    if materials != EXPECTED_MATERIALS:
        raise ValueError(f"Unexpected GLB material set: {sorted(materials)}")
    nodes = gltf.get("nodes", [])
    if len(nodes) != 1 or nodes[0].get("name") != ASSET_NAME or nodes[0].get("mesh") != 0:
        raise ValueError("The GLB root node name or mesh reference has changed")
    rotation = nodes[0].get("rotation", [])
    if len(rotation) != 4 or any(not math.isclose(float(a), b, abs_tol=1e-7)
                                 for a, b in zip(rotation, EXPECTED_ROTATION)):
        raise ValueError("The GLB root rotation is not the validated Z-up to glTF Y-up transform")
    extras = gltf.get("asset", {}).get("extras", {})
    if extras.get("world_id") != "CIGKV" or extras.get("gameplay_approved") is not False:
        raise ValueError("The source is not marked as a non-gameplay CIGKV visual blockout")
    if extras.get("units") != "normalized_preview_coordinates_encoded_as_glTF_meters":
        raise ValueError("The source coordinate/unit warning is missing")
    return {
        "file": str(path),
        "bytes": len(data),
        "world_id": extras["world_id"],
        "mesh_name": nodes[0]["name"],
        "mesh_count": len(gltf["meshes"]),
        "primitive_count": len(gltf["meshes"][0]["primitives"]),
        "materials": sorted(materials),
        "node_rotation_xyzw": rotation,
        "coordinate_conversion_validated": True,
        "gameplay_approved": False,
    }


def import_in_editor(preflight: dict[str, Any]) -> dict[str, Any]:
    try:
        import unreal  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "This import step must run inside Unreal Editor 5.8 with Python Editor Script Plugin enabled. "
            "Outside UE, use --dry-run to validate the source package."
        ) from exc

    editor_project = Path(unreal.Paths.project_dir()).resolve()
    if (editor_project / "KhaaosRun.uproject").resolve() != PROJECT_FILE.resolve():
        raise RuntimeError(f"Open this repository's Unreal project before running the import: {PROJECT_FILE}")
    if unreal.EditorAssetLibrary.does_asset_exist(EXPECTED_OBJECT_PATH):
        raise RuntimeError(
            f"Refusing to overwrite an existing asset: {EXPECTED_OBJECT_PATH}. "
            "Choose a new destination or reimport it manually after reviewing the changes."
        )
    if not unreal.EditorAssetLibrary.make_directory(DESTINATION):
        raise RuntimeError(f"Could not create Unreal Content folder: {DESTINATION}")

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(GLB_PATH))
    task.set_editor_property("destination_path", DESTINATION)
    # The GLB's root node already uses the canonical SM_ name. Interchange may
    # ignore destination_name, so the source node remains the stable asset name.
    task.set_editor_property("destination_name", ASSET_NAME)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", False)
    task.set_editor_property("save", True)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported_objects = list(task.get_objects())
    static_meshes = [item for item in imported_objects if isinstance(item, unreal.StaticMesh)]
    if not static_meshes:
        # Resolve by the expected object path if the importer returned only paths.
        candidate = unreal.EditorAssetLibrary.load_asset(EXPECTED_OBJECT_PATH)
        if isinstance(candidate, unreal.StaticMesh):
            static_meshes = [candidate]
    if len(static_meshes) != 1:
        paths = list(task.get_editor_property("imported_object_paths"))
        raise RuntimeError(f"Expected exactly one Static Mesh; imported paths were: {paths}")

    mesh = static_meshes[0]
    material_slots = list(mesh.get_editor_property("static_materials"))
    if len(material_slots) != len(EXPECTED_MATERIALS):
        raise RuntimeError(
            f"Expected five material slots from the GLB, got {len(material_slots)}. "
            "Inspect the Interchange preview/import pipeline before accepting the asset."
        )
    unreal.log(f"CIGKV GLB import passed: {mesh.get_path_name()} ({len(material_slots)} material slots).")
    return {
        **preflight,
        "status": "imported_in_unreal_editor",
        "unreal_asset_path": mesh.get_path_name(),
        "material_slot_count": len(material_slots),
        "imported_object_paths": list(task.get_editor_property("imported_object_paths")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="validate the GLB without requiring Unreal Python")
    args, _unknown = parser.parse_known_args()
    preflight = read_glb()
    if args.dry_run:
        print(json.dumps({"status": "PASS", "mode": "source_preflight_only", **preflight,
                          "unreal_destination": DESTINATION,
                          "note": "No .uasset/.umap was created by dry-run."}, indent=2, ensure_ascii=False))
        return 0
    result = import_in_editor(preflight)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
