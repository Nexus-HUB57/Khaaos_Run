#!/usr/bin/env python3
"""Audit source assets for mobile buildings, bridges and vehicles.

This engine-less audit never treats JSON placeholders as Unreal binary assets and
never claims that an asset has been optimized or that a cook/FPS gate passed.
"""
from __future__ import annotations

import argparse
import json
import struct
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PROJECT_CONTENT = ROOT / "Unreal/KhaaosRun/Content"
POLICY_PATH = PROJECT_CONTENT / "Environment/MOBILE_ENVIRONMENT_ASSET_POLICY.json"
SCAN_ROOTS = [PROJECT_CONTENT, ROOT / "mvp_output/assets", ROOT / "Content/Assets"]


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def matching_names(value: str, categories: dict[str, Any]) -> list[str]:
    normalized = normalize(value)
    matches = [category for category, config in categories.items()
               if any(normalize(token) in normalized for token in config.get("name_tokens", []))]
    if "bridge" in matches:
        matches = [category for category in matches if category != "building"]
    if "vehicle" in matches:
        matches = [category for category in matches if category != "building"]
    return matches


def obj_metrics(path: Path) -> dict[str, Any]:
    vertices = faces = triangles = 0
    bounds = [[float("inf"), float("inf"), float("inf")], [float("-inf"), float("-inf"), float("-inf")]]
    objects: list[dict[str, Any]] = []
    current: dict[str, Any] = {"name": path.stem, "vertices": 0, "faces": 0, "triangles": 0}
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith(("o ", "g ")):
                if current["vertices"] or current["faces"] or current["name"] != path.stem:
                    objects.append(current)
                current = {"name": line[2:].strip() or path.stem, "vertices": 0, "faces": 0, "triangles": 0}
            if line.startswith("v "):
                values = line.split()[1:4]
                if len(values) == 3:
                    try:
                        xyz = [float(value) for value in values]
                    except ValueError:
                        continue
                    vertices += 1
                    current["vertices"] += 1
                    for axis in range(3):
                        bounds[0][axis] = min(bounds[0][axis], xyz[axis])
                        bounds[1][axis] = max(bounds[1][axis], xyz[axis])
            elif line.startswith("f "):
                count = len(line.split()) - 1
                if count >= 3:
                    faces += 1
                    triangles += count - 2
                    current["faces"] += 1
                    current["triangles"] += count - 2
    if current["vertices"] or current["faces"] or not objects:
        objects.append(current)
    merged_objects: dict[str, dict[str, Any]] = {}
    for object_record in objects:
        name = object_record["name"]
        target = merged_objects.setdefault(name, {"name": name, "vertices": 0, "faces": 0, "triangles": 0})
        for metric in ("vertices", "faces", "triangles"):
            target[metric] += object_record[metric]
    dimensions = [round(bounds[1][i] - bounds[0][i], 4) for i in range(3)] if vertices else None
    return {"vertices": vertices, "faces": faces, "triangles": triangles,
            "bounds_source_units": dimensions, "objects": list(merged_objects.values())}


def gltf_json(path: Path) -> dict[str, Any]:
    if path.suffix.lower() == ".glb":
        data = path.read_bytes()
        if len(data) < 20:
            raise ValueError("GLB header/chunk truncated")
        magic, version, declared_length = struct.unpack_from("<4sII", data)
        if magic != b"glTF" or version != 2 or declared_length > len(data):
            raise ValueError("invalid GLB v2 header")
        offset = 12
        while offset + 8 <= min(declared_length, len(data)):
            size, chunk_type = struct.unpack_from("<II", data, offset)
            start, end = offset + 8, offset + 8 + size
            if end > len(data):
                raise ValueError("GLB chunk exceeds file length")
            if chunk_type == 0x4E4F534A:
                return json.loads(data[start:end].decode("utf-8").rstrip(" \t\r\n\0"))
            offset = end
        raise ValueError("GLB JSON chunk not found")
    return json.loads(path.read_text(encoding="utf-8"))


def gltf_metrics(path: Path) -> dict[str, Any]:
    document = gltf_json(path)
    accessors = document.get("accessors", [])
    meshes = document.get("meshes", [])
    vertices = triangles = primitives = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            primitives += 1
            attributes = primitive.get("attributes", {})
            position_accessor = attributes.get("POSITION")
            if isinstance(position_accessor, int) and position_accessor < len(accessors):
                vertices += int(accessors[position_accessor].get("count", 0))
            index_accessor = primitive.get("indices")
            if isinstance(index_accessor, int) and index_accessor < len(accessors):
                index_count = int(accessors[index_accessor].get("count", 0))
                mode = int(primitive.get("mode", 4))
                triangles += index_count // 3 if mode == 4 else max(0, index_count - 2) if mode == 5 else 0
    return {
        "mesh_count": len(meshes), "primitive_count": primitives,
        "vertices": vertices if accessors else None,
        "triangles": triangles if accessors else None,
        "materials": len(document.get("materials", [])),
        "images": len(document.get("images", [])),
        "has_geometry_accessors": bool(accessors),
        "objects": [{"name": mesh.get("name", f"mesh_{index}"), "vertices": None, "faces": None, "triangles": None}
                    for index, mesh in enumerate(meshes)],
    }


def measure(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    try:
        if suffix == ".obj":
            return {"metrics_status": "measured_source", **obj_metrics(path)}
        if suffix in {".gltf", ".glb"}:
            return {"metrics_status": "measured_source", **gltf_metrics(path)}
        return {"metrics_status": "editor_measurement_required", "note": "FBX geometry metrics require a DCC or Unreal Editor importer."}
    except (OSError, ValueError, json.JSONDecodeError, struct.error) as error:
        return {"metrics_status": "source_parse_error", "error": str(error)}


def discover(roots: list[Path], policy: dict[str, Any]) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    categories = policy["categories"]
    found = {name: [] for name in categories}
    blockouts: list[dict[str, Any]] = []
    extensions = {str(value).lower() for value in policy.get("source_extensions", [])}
    excluded_tokens = [normalize(str(value).strip("*")) for value in policy.get("exclude_patterns", [])]
    seen: set[Path] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            relative = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
            item = {"path": relative, "format": path.suffix.lower(), "file_size_bytes": path.stat().st_size, **measure(path)}
            normalized_stem = normalize(path.stem)
            if any(token and token in normalized_stem for token in excluded_tokens):
                blockouts.append(item)
                continue
            by_category: dict[str, list[str]] = {}
            for category in matching_names(path.stem, categories):
                by_category.setdefault(category, []).append(path.stem)
            for object_record in item.get("objects", []):
                for category in matching_names(object_record.get("name", ""), categories):
                    by_category.setdefault(category, []).append(object_record["name"])
            for category, names in by_category.items():
                category_item = dict(item)
                category_item.pop("objects", None)
                category_item["matched_named_objects"] = [
                    {"name": name, **next((obj for obj in item.get("objects", []) if obj.get("name") == name), {})}
                    for name in sorted(set(names))
                ]
                found[category].append(category_item)
    return found, blockouts


def build_report(roots: list[Path], policy: dict[str, Any]) -> dict[str, Any]:
    found, blockouts = discover(roots, policy)
    native_assets = []
    for root in roots:
        content_root = root if root.name == "Content" else root
        if content_root.exists():
            native_assets.extend(str(p.relative_to(ROOT)) for pattern in ("*.uasset", "*.umap") for p in content_root.rglob(pattern))
    categories = {}
    for key, config in policy["categories"].items():
        sources = found[key]
        categories[key] = {
            "source_asset_count": len(sources),
            "named_object_count": sum(len(item["matched_named_objects"]) for item in sources),
            "status": "SOURCE_ASSETS_FOUND_EDITOR_VALIDATION_REQUIRED" if sources else "BLOCKED_NO_NAMED_SOURCE_ASSETS",
            "sources": sources,
            "mobile_policy": {
                "lod_triangle_fraction_targets": config["lod_triangle_fraction_targets"],
                "authoring": config["authoring"],
                "gameplay_invariants": config["gameplay_invariants"],
            },
        }
    missing = [name for name, record in categories.items() if record["source_asset_count"] == 0]
    return {
        "schema": "khaaos.mobile-environment-asset-audit/v1",
        "engine_target": policy["engine_target"],
        "render_target": policy["render_target"],
        "audit_mode": "engine_less_source_audit",
        "overall_status": "BLOCKED_SOURCE_ASSETS_MISSING" if missing else "SOURCE_READY_EDITOR_VALIDATION_REQUIRED",
        "optimization_claimed": False,
        "cook_performed": False,
        "device_fps_measured": False,
        "native_unreal_asset_count": len(native_assets),
        "native_unreal_assets": sorted(native_assets),
        "source_roots": [str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path) for path in roots],
        "categories": categories,
        "world_blockout_sources": blockouts,
        "missing_source_categories": missing,
        "required_gates": policy["validation_gates"],
    }


def self_test() -> None:
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="khaaos-mobile-env-assets-") as temporary:
        root = Path(temporary)
        fixtures = [
            (root / "Buildings/SM_Ruin_Building.obj", "o SM_Ruin_Building\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n"),
            (root / "Bridges/SM_Bridge_Deck.obj", "o SM_Bridge_Deck\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n"),
            (root / "Vehicles/SM_Vehicle_Buggy.obj", "o SM_Vehicle_Buggy\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n"),
            (root / "Maps/Arukheea_WorldBlockout.obj", "o SM_WorldBlockout\nv 0 0 0\n"),
            (root / "Worlds/Priadus_Map.obj", "g lighthouse_tower\no lighthouse_tower\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\ng void_sanctum_bridge\no void_sanctum_bridge\nv 2 0 0\nv 3 0 0\nv 3 1 0\nf 4 5 6\n"),
        ]
        for path, contents in fixtures:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents, encoding="utf-8")
        gltf = root / "Vehicles/SM_Vehicle_Imported.gltf"
        gltf.write_text(json.dumps({"asset": {"version": "2.0"}, "meshes": [{"name": "SM_Vehicle_Imported", "primitives": []}]}), encoding="utf-8")
        report = build_report([root], policy)
        expected = {"building": 2, "bridge": 2, "vehicle": 2}
        actual = {name: item["source_asset_count"] for name, item in report["categories"].items()}
        assert actual == expected, (actual, expected)
        assert len(report["world_blockout_sources"]) == 1
        assert report["categories"]["building"]["sources"][0]["matched_named_objects"][0]["triangles"] == 2
        assert report["categories"]["bridge"]["sources"][0]["matched_named_objects"][0]["triangles"] == 1
        assert report["optimization_claimed"] is False
        assert report["cook_performed"] is False
    print("PASS: mobile environment asset audit fixtures")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run deterministic fixture tests")
    parser.add_argument("--strict", action="store_true", help="return non-zero when category source or native Unreal assets are missing")
    parser.add_argument("--output", type=Path, help="write JSON report to this path instead of stdout")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    report = build_report(SCAN_ROOTS, policy)
    rendered = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(rendered, end="")
    if args.strict and (report["missing_source_categories"] or not report["native_unreal_asset_count"]):
        print("BLOCKED: missing source category assets and/or Unreal binary assets; no editor/cook validation is possible.", file=__import__("sys").stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
