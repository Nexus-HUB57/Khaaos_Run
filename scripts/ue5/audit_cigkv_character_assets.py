#!/usr/bin/env python3
"""Audit CIGKV character source assets without pretending they are UE assets.

The audit is intentionally dependency-free so it can run in CI. It classifies
assets as structural_source, proxy_source, or production_candidate. It does not
replace Blender/Unreal review: topology, deformation, facial quality, skinning
and visual approval still require the licensed toolchain.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_character_slice.json"


def local(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else ROOT / candidate


def glb_audit(path: Path) -> dict:
    data = path.read_bytes()
    result = {"format": "glb", "bytes": len(data), "meshes": 0, "primitives": 0, "vertices": 0, "triangles": 0, "materials": 0, "textures": 0, "images": 0, "skins": 0, "animations": 0, "uv_sets": 0}
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("GLB header inválido")
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2 or length > len(data):
        raise ValueError(f"GLB não é glTF 2 válido: version={version}, length={length}")
    offset = 12
    document = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + chunk_length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.rstrip(b" \\0").decode("utf-8"))
        offset += 8 + chunk_length
    if document is None:
        raise ValueError("GLB sem JSON chunk")
    result.update({
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(document.get("animations", [])),
    })
    accessors = document.get("accessors", [])
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            result["primitives"] += 1
            indices = primitive.get("indices")
            if indices is not None and indices < len(accessors):
                result["triangles"] += int(accessors[indices].get("count", 0) / 3)
            position = primitive.get("attributes", {}).get("POSITION")
            if position is not None and position < len(accessors):
                result["vertices"] += accessors[position].get("count", 0)
            result["uv_sets"] += sum(1 for key in primitive.get("attributes", {}) if key.startswith("TEXCOORD_"))
    result["nodes"] = len(document.get("nodes", []))
    result["joints"] = sum(len(skin.get("joints", [])) for skin in document.get("skins", []))
    return result


def dae_audit(path: Path) -> dict:
    root = ET.parse(path).getroot()
    def tags(name: str):
        return root.findall(f".//{{*}}{name}")
    vertices = len(tags("float_array"))
    triangles = sum(int(item.attrib.get("count", "0")) for item in tags("triangles"))
    images = len(tags("image"))
    materials = len(tags("material"))
    controllers = len(tags("controller"))
    return {"format": "dae", "bytes": path.stat().st_size, "meshes": len(tags("geometry")), "primitives": len(tags("triangles")), "vertices": vertices, "triangles": triangles, "materials": materials, "textures": images, "images": images, "skins": controllers, "animations": len(tags("animation")), "uv_sets": len([x for x in tags("input") if x.attrib.get("semantic") == "TEXCOORD"]), "joints": len(tags("joints"))}


def obj_audit(path: Path) -> dict:
    vertices = faces = normals = uvs = 0
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith("v "): vertices += 1
        elif line.startswith("vn "): normals += 1
        elif line.startswith("vt "): uvs += 1
        elif line.startswith("f "): faces += 1
    return {"format": "obj", "bytes": path.stat().st_size, "meshes": 1, "primitives": 1, "vertices": vertices, "triangles": faces, "materials": 0, "textures": 0, "images": 0, "skins": 0, "animations": 0, "uv_sets": uvs, "normals": normals, "joints": 0}


def audit_source(path: Path, character: dict) -> dict:
    item = {"slot": character["slot"], "source": character["source"], "exists": path.is_file(), "warnings": [], "errors": []}
    if not path.is_file():
        item["errors"].append("source_missing")
        item["quality_class"] = "blocked"
        return item
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    item["sha256"] = digest
    expected = character.get("source_sha256")
    if expected and expected != digest:
        item["errors"].append("source_sha256_mismatch")
    try:
        if path.suffix.lower() == ".glb": metrics = glb_audit(path)
        elif path.suffix.lower() == ".dae": metrics = dae_audit(path)
        elif path.suffix.lower() == ".obj": metrics = obj_audit(path)
        else: raise ValueError(f"unsupported_format:{path.suffix}")
    except (OSError, ValueError, ET.ParseError, json.JSONDecodeError) as exc:
        item["errors"].append(str(exc))
        item["quality_class"] = "blocked"
        return item
    item["metrics"] = metrics
    if metrics.get("vertices", 0) < 5000:
        item["warnings"].append("proxy_or_low_detail_mesh_below_5000_vertices")
    if metrics.get("triangles", 0) < 5000:
        item["warnings"].append("proxy_or_low_detail_mesh_below_5000_triangles")
    if metrics.get("materials", 0) == 0:
        item["warnings"].append("no_materials_declared")
    if metrics.get("uv_sets", 0) == 0:
        item["warnings"].append("no_uv_set_detected")
    if path.suffix.lower() in {".glb", ".dae"} and metrics.get("skins", 0) == 0:
        item["warnings"].append("no_skeletal_skin_detected")
    if metrics.get("images", 0) == 0:
        item["warnings"].append("no_embedded_or_declared_texture_images")
    item["quality_class"] = "blocked" if item["errors"] else ("production_candidate" if not item["warnings"] else "proxy_source")
    return item


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--output", default="artifacts/cigkv-vertical-slice/asset-quality-report.json")
    parser.add_argument("--strict", action="store_true", help="falha somente quando houver erro estrutural ou fonte ausente")
    args = parser.parse_args()
    manifest_path = local(args.manifest)
    manifest = json.loads(manifest_path.read_text())
    assets = [audit_source(local(character["source"]), character) for character in manifest.get("characters", [])]
    report = {
        "schema": "khaaos.cigkv.character-asset-quality-report/v1",
        "engineless": True,
        "scope": "source_mesh_quality_not_ue5_acceptance",
        "manifest": str(manifest_path.relative_to(ROOT)),
        "assets": assets,
        "summary": {
            "total": len(assets),
            "blocked": sum(a["quality_class"] == "blocked" for a in assets),
            "proxy_source": sum(a["quality_class"] == "proxy_source" for a in assets),
            "production_candidate": sum(a["quality_class"] == "production_candidate" for a in assets),
            "warnings": sum(len(a["warnings"]) for a in assets),
        },
        "limitations": ["não mede silhueta, deformação, clipping, foot sliding, shader response ou GPU", "não cria .uasset/.umap", "aceite final requer Blender e UE5.8 licenciado"],
        "next_actions": ["substituir proxies por meshes hero com identidade canônica", "normalizar e exportar FBX com skinning/UV/materials", "validar retarget, sockets e screenshots no runner UE5.8"],
    }
    output = local(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if args.strict and report["summary"]["blocked"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
