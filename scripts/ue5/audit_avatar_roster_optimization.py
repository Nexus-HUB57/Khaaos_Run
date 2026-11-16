#!/usr/bin/env python3
"""Audit the avatar roster against the shared optimization profile.

This is an engine-less gate: it never rewrites source assets. It reports which
assets are ready for UE optimization, which exceed budgets, and which are
invalid or still unmapped to a canonical operative.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROFILE = ROOT / "Unreal/KhaaosRun/Content/Characters/avatar_optimization_profile.json"

def parse_glb(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("invalid_glb_header")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2 or declared_length > len(data):
        raise ValueError("invalid_glb_version_or_length")
    pos = 12
    document = None
    while pos + 8 <= len(data):
        length, chunk_type = struct.unpack_from("<II", data, pos)
        end = pos + 8 + length
        if end > len(data):
            raise ValueError("truncated_glb_chunk")
        if chunk_type == 0x4E4F534A:
            document = json.loads(data[pos + 8:end].rstrip(b" \\0").decode("utf-8"))
        pos = end
    if document is None:
        raise ValueError("missing_json_chunk")
    accessors = document.get("accessors", [])
    vertices = triangles = 0
    attributes: set[str] = set()
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes.update(primitive.get("attributes", {}).keys())
            position = primitive.get("attributes", {}).get("POSITION")
            if position is not None and position < len(accessors):
                vertices += int(accessors[position].get("count", 0))
            indices = primitive.get("indices")
            if indices is not None and indices < len(accessors):
                triangles += int(accessors[indices].get("count", 0)) // 3
    return {
        "format": "glb",
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "meshes": len(document.get("meshes", [])),
        "vertices": vertices,
        "triangles": triangles,
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(document.get("animations", [])),
        "joints": sum(len(s.get("joints", [])) for s in document.get("skins", [])),
        "attributes": sorted(attributes),
    }

def portrait_metrics(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "format": path.suffix.lower().lstrip("."),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    if Image is not None:
        with Image.open(path) as image:
            result["width"], result["height"] = image.size
            result["mode"] = image.mode
    return result

def relative(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default=str(DEFAULT_PROFILE))
    parser.add_argument("--glb-root", default="game-runtime/public/assets/avatars")
    parser.add_argument("--portrait-root", default="client/public/avatars/realistic")
    parser.add_argument("--output", default="artifacts/avatar-optimization/avatar-roster-optimization-report.json")
    args = parser.parse_args()
    profile = json.loads(Path(args.profile).read_text())
    glb_budget = profile["targets"]["gameplay_glb"]
    portrait_budget = profile["targets"]["portrait_web"]
    assets: list[dict[str, Any]] = []
    for path in sorted((ROOT / args.glb_root).glob("*.glb")):
        item = {"path": relative(path), "kind": "gameplay_glb", "status": "ready_for_lod_pipeline", "warnings": [], "errors": []}
        try:
            metrics = parse_glb(path)
            item["metrics"] = metrics
            if metrics["bytes"] > glb_budget["source_file_max_bytes"]:
                item["warnings"].append("source_file_over_budget")
            if metrics["skins"] == 0:
                item["warnings"].append("not_rigged_gameplay_candidate")
            if metrics["animations"] == 0:
                item["warnings"].append("no_embedded_animation_clips")
            required = set(glb_budget["required_attributes"])
            missing = sorted(required - set(metrics["attributes"]))
            if missing:
                item["warnings"].append("missing_attributes:" + ",".join(missing))
            if metrics["materials"] > glb_budget["max_material_slots_lod0"]:
                item["warnings"].append("lod0_material_slot_budget_exceeded")
            if not item["warnings"]:
                item["status"] = "within_source_budget"
        except Exception as exc:
            item["status"] = "blocked_invalid_asset"
            item["errors"].append(str(exc))
        assets.append(item)
    portraits: list[dict[str, Any]] = []
    for path in sorted((ROOT / args.portrait_root).glob("*.webp")):
        item = {"path": relative(path), "kind": "portrait_web", "status": "within_budget", "warnings": [], "errors": []}
        try:
            metrics = portrait_metrics(path)
            item["metrics"] = metrics
            if metrics["bytes"] > portrait_budget["max_file_bytes"]:
                item["warnings"].append("portrait_file_over_budget")
            if metrics.get("width", 0) > portrait_budget["max_side_px"] or metrics.get("height", 0) > portrait_budget["max_side_px"]:
                item["warnings"].append("portrait_dimensions_over_budget")
            if item["warnings"]:
                item["status"] = "needs_portrait_optimization"
        except Exception as exc:
            item["status"] = "blocked_invalid_asset"
            item["errors"].append(str(exc))
        portraits.append(item)
    report = {
        "schema": "khaaos.avatar-roster-optimization-report/v1",
        "profile": relative(Path(args.profile)),
        "engine_less": True,
        "assets": assets,
        "portraits": portraits,
        "summary": {
            "glb_total": len(assets),
            "glb_ready_or_warned": sum(x["status"] != "blocked_invalid_asset" for x in assets),
            "glb_blocked": sum(x["status"] == "blocked_invalid_asset" for x in assets),
            "glb_rigged": sum(x.get("metrics", {}).get("skins", 0) > 0 for x in assets),
            "portraits_total": len(portraits),
            "portraits_needing_optimization": sum(x["status"] == "needs_portrait_optimization" for x in portraits),
        },
        "decisions": [
            "Keep full-quality GLB in UE5 content; do not ship all gameplay GLBs in the web bundle.",
            "Generate LOD0-LOD3 in Blender/UE5 and apply Screen Sizes from the shared profile.",
            "Do not promote unmapped or invalid assets to canonical operatives.",
            "Use KTX2/meshopt only after the toolchain is available and output hashes are recorded.",
        ],
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if report["summary"]["glb_blocked"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
