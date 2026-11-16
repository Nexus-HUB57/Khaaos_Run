"""Generate LOD1-LOD3 GLBs for static avatar sources in Blender 4.x.

Usage:
  blender -b --python scripts/ue5/generate_static_avatar_lods_blender.py -- \
    --input-dir game-runtime/public/assets/avatars \
    --output-dir artifacts/avatar-optimization/generated-lods \
    --report artifacts/avatar-optimization/blender-lod-generation-report.json

The source GLBs are never modified. Each LOD is exported as a separate GLB so
that UE5 can import and assign it explicitly during Skeletal/Static Mesh setup.
This script is intentionally executed only in Blender; it fails closed outside
Blender instead of silently creating placeholder geometry.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import bpy
except ImportError as exc:  # pragma: no cover - only runs in Blender
    raise SystemExit("Este script precisa ser executado no Blender 4.x") from exc

LOD_RATIOS = {"LOD0": 1.0, "LOD1": 0.55, "LOD2": 0.30, "LOD3": 0.14}
STATIC_NAMES = ("avatar-f-03.glb", "avatar-m-01.glb", "avatar-m-02.glb", "avatar-m-04.glb")

def args_from_blender() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def triangle_count(objects) -> int:
    return sum(len(obj.data.polygons) for obj in objects)

def export_glb(path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects():
        obj.select_set(True)
    if not mesh_objects():
        raise RuntimeError("nenhuma mesh para exportar")
    bpy.context.view_layer.objects.active = mesh_objects()[0]
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
    )

def generate_one(source: Path, output_dir: Path) -> dict:
    reset()
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = mesh_objects()
    if len(objects) != 1:
        raise RuntimeError(f"esperada 1 mesh, encontrada {len(objects)}")
    source_triangles = triangle_count(objects)
    result = {"source": str(source), "source_triangles": source_triangles, "lods": {}}
    for lod, ratio in LOD_RATIOS.items():
        reset()
        bpy.ops.import_scene.gltf(filepath=str(source))
        objects = mesh_objects()
        if len(objects) != 1:
            raise RuntimeError(f"{lod}: esperada 1 mesh, encontrada {len(objects)}")
        if lod != "LOD0":
            modifier = objects[0].modifiers.new(name=f"Khaaos_{lod}_Decimate", type="DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = ratio
            bpy.context.view_layer.objects.active = objects[0]
            objects[0].select_set(True)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        triangles = triangle_count(objects)
        out = output_dir / f"{source.stem}_{lod}.glb"
        export_glb(out)
        result["lods"][lod] = {"ratio": ratio, "triangles": triangles, "output": str(out)}
    return result

def main() -> int:
    args = args_from_blender()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    report_path = Path(args.report).resolve()
    report = {"schema": "khaaos.static-avatar-blender-lod-report/v1", "blender_version": bpy.app.version_string, "sources": [], "errors": []}
    for name in STATIC_NAMES:
        source = input_dir / name
        if not source.is_file():
            report["errors"].append({"source": str(source), "error": "source_missing"})
            continue
        try:
            report["sources"].append(generate_one(source, output_dir))
        except Exception as exc:
            report["errors"].append({"source": str(source), "error": str(exc)})
    report["summary"] = {"sources": len(report["sources"]), "errors": len(report["errors"]), "lods_generated": sum(len(x["lods"]) for x in report["sources"])}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if report["errors"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
