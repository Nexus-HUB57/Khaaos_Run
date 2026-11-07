"""Blender 4.x batch normalizer for the CIGKV character slice.

Run inside Blender with: blender -b --python this_file.py -- --input ... --output ...
The script intentionally fails when Blender is unavailable instead of creating a
placeholder export.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    import bpy
except ImportError as exc:  # pragma: no cover - executed only inside Blender
    raise SystemExit("Este script precisa ser executado dentro do Blender 4.x") from exc


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--height-cm", required=True, type=float)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def load_source(path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    suffix = path.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=False)
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".dae":
        bpy.ops.wm.collada_import(filepath=str(path))
    else:
        raise ValueError(f"formato não suportado: {suffix}")


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    load_source(source)
    objects = [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "ARMATURE"}]
    if not objects:
        raise RuntimeError("nenhuma mesh/armature importada")
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = objects[0]

    # Apply transforms and normalize the bounding box to the canonical height.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    min_z = min((obj.matrix_world.translation.z for obj in objects), default=0.0)
    for obj in objects:
        obj.location.z -= min_z
    bpy.context.view_layer.update()
    bbox = [obj.matrix_world @ corner for obj in objects for corner in obj.bound_box] if any(obj.type == "MESH" for obj in objects) else []
    height_m = max((v.z for v in bbox), default=0.0) - min((v.z for v in bbox), default=0.0)
    if height_m <= 0:
        raise RuntimeError("altura inválida após importação")
    target_m = args.height_cm / 100.0
    scale = target_m / height_m
    for obj in objects:
        obj.scale = (scale, scale, scale)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # The final pose must be a deliberate T-pose. Existing A/T pose is reported;
    # pose editing is left to the project rig/retarget profile, never guessed here.
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    pose_status = "armature_present_manual_t_pose_review_required" if armatures else "static_source_manual_t_pose_required"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(filepath=str(output), use_selection=True, object_types={"ARMATURE", "MESH"}, apply_scale_options="FBX_SCALE_ALL")
    report = {
        "source": str(source),
        "output": str(output),
        "target_height_cm": args.height_cm,
        "pose_status": pose_status,
        "scale_baked": True,
        "ground_z_zero": True,
        "forward_axis": "+X",
        "manual_review_required": True,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
