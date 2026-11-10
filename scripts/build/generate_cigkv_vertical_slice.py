#!/usr/bin/env python3
"""Generate an engine-less, README-contract-driven CIGKV visual blockout.

Outputs a PBR GLB, OBJ/MTL, top-down SVG and provenance JSON. The GLB serializes
normalized preview coordinates as glTF meters and rotates the source Z-up basis
to glTF Y-up. It is not a playable level or approved gameplay scale; final
import/cook remains an UE5.8 Editor task.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import struct
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "Unreal/KhaaosRun/Content/Maps/CIGKV/ReadmeVisualSlice/scene_manifest.json"
DEFAULT_OUTPUT = DEFAULT_MANIFEST.parent
ASSET = "SM_CIGKV_ArmoryToProvingGrounds_Blockout"
MTL_ASSET = "M_CIGKV_ArmoryToProvingGrounds_Blockout.mtl"
GLTF_ZUP_TO_YUP_ROTATION = [0.0, math.sqrt(0.5), math.sqrt(0.5), 0.0]
MATERIALS = [
    {"name": "M_CIGKV_Concrete_Wet", "color": [0.32, 0.34, 0.36, 1.0], "metallic": 0.0, "roughness": 0.58},
    {"name": "M_CIGKV_Steel_Rusted", "color": [0.20, 0.15, 0.11, 1.0], "metallic": 0.72, "roughness": 0.62},
    {"name": "M_CIGKV_Asphalt_Damp", "color": [0.08, 0.09, 0.10, 1.0], "metallic": 0.0, "roughness": 0.68},
    {"name": "M_CIGKV_Glass_Dirty", "color": [0.12, 0.19, 0.22, 1.0], "metallic": 0.05, "roughness": 0.28},
    {"name": "M_CIGKV_Dirt_Weathered", "color": [0.22, 0.20, 0.16, 1.0], "metallic": 0.0, "roughness": 0.92},
]
MAT_INDEX = {material["name"]: index for index, material in enumerate(MATERIALS)}


def read_contract(path: Path) -> dict[str, Any]:
    contract = json.loads(path.read_text(encoding="utf-8"))
    if contract.get("$schema") != "khaaos.readme-visual-slice/v1":
        raise ValueError("unsupported or missing visual-slice schema")
    if contract.get("world_id") != "CIGKV" or contract.get("status") != "visual_reference_only_not_gameplay":
        raise ValueError("CIGKV contract must be explicitly visual-only")
    sectors = {sector["id"]: sector for sector in contract.get("sectors", [])}
    for sector_id in ("armory_hub", "proving_grounds"):
        if sector_id not in sectors:
            raise ValueError(f"missing canonical sector {sector_id}")
    selected = [sectors["armory_hub"], sectors["proving_grounds"]]
    if any(not isinstance(sector.get("fraction"), (int, float)) for sector in selected):
        raise ValueError("selected sectors need canonical fractions")
    if not math.isclose(sum(float(s["fraction"]) for s in sectors.values() if isinstance(s.get("fraction"), (int, float))), 1.0):
        raise ValueError("canonical sector fractions must sum to 1")
    if not (math.isclose(float(sectors["armory_hub"]["fraction"]), 1 / 8)
            and math.isclose(float(sectors["proving_grounds"]["fraction"]), 3 / 8)):
        raise ValueError("slice sectors no longer match the README 1/8 + 3/8 composition")
    return contract


class Geometry:
    """Triangle buffers grouped by material for GLB and OBJ export."""

    def __init__(self) -> None:
        self.groups: list[dict[str, list[Any]]] = [
            {"positions": [], "normals": [], "indices": []} for _ in MATERIALS
        ]

    def box(self, material: str, center: tuple[float, float, float], size: tuple[float, float, float]) -> None:
        group = self.groups[MAT_INDEX[material]]
        cx, cy, cz = center
        sx, sy, sz = size
        x0, x1 = cx - sx / 2, cx + sx / 2
        y0, y1 = cy - sy / 2, cy + sy / 2
        z0, z1 = cz - sz / 2, cz + sz / 2
        faces = [
            (((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), (0, 0, 1)),
            (((x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)), (0, 0, -1)),
            (((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)), (1, 0, 0)),
            (((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)), (-1, 0, 0)),
            (((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)), (0, 1, 0)),
            (((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)), (0, -1, 0)),
        ]
        start = len(group["positions"]) // 3
        for face_number, (vertices, normal) in enumerate(faces):
            base = start + face_number * 4
            for vertex in vertices:
                group["positions"].extend(vertex)
                group["normals"].extend(normal)
            group["indices"].extend((base, base + 1, base + 2, base, base + 2, base + 3))


def make_geometry(contract: dict[str, Any]) -> tuple[Geometry, dict[str, Any]]:
    geometry = Geometry()
    # The two canonical sectors retain their 1:3 area ratio. These values are
    # normalized illustration dimensions, not map bounds or UE gameplay units.
    width, depth = 1000.0, 500.0
    armory_fraction = float(next(s["fraction"] for s in contract["sectors"] if s["id"] == "armory_hub"))
    urban_fraction = float(next(s["fraction"] for s in contract["sectors"] if s["id"] == "proving_grounds"))
    ratio = armory_fraction / (armory_fraction + urban_fraction)
    boundary_x = width * ratio

    concrete = "M_CIGKV_Concrete_Wet"
    steel = "M_CIGKV_Steel_Rusted"
    asphalt = "M_CIGKV_Asphalt_Damp"
    glass = "M_CIGKV_Glass_Dirty"
    dirt = "M_CIGKV_Dirt_Weathered"

    # The 1/8 + 3/8 slice occupies one half of the canonical world; the Park is
    # intentionally outside this vertical slice and is not represented here.
    geometry.box(concrete, (boundary_x / 2, depth / 2, -4), (boundary_x, depth, 8))
    geometry.box(asphalt, (boundary_x + (width - boundary_x) / 2, depth / 2, -4), (width - boundary_x, depth, 8))
    geometry.box(asphalt, (boundary_x + 14, depth / 2, 1), (28, depth, 2))

    # Armory Hall, visually neutral: static racks/stations are props only.
    hall_x, hall_y = boundary_x / 2, depth / 2
    hall_w, hall_d, hall_h = boundary_x * 0.72, depth * 0.62, 78.0
    geometry.box(concrete, (hall_x, hall_y, hall_h / 2), (hall_w, hall_d, hall_h))
    geometry.box(steel, (hall_x, hall_y, hall_h + 4), (hall_w + 14, hall_d + 14, 8))
    # Long roof light slots and entry apron create a readable hall silhouette.
    for y_offset in (-hall_d * 0.31, 0, hall_d * 0.31):
        geometry.box(glass, (hall_x, hall_y + y_offset, hall_h + 9), (hall_w * 0.76, 16, 2))
    geometry.box(asphalt, (boundary_x - 14, hall_y, 1), (30, 106, 2))
    # Eight repeated rack modules and four equipment islands are an illustrative
    # composition only; no items, interactions or loadout rules are encoded.
    for row_y in (hall_y - 52, hall_y + 52):
        for column in range(4):
            x = hall_x - 63 + column * 42
            geometry.box(steel, (x, row_y, 12), (8, 34, 24))
            geometry.box(steel, (x, row_y, 26), (30, 5, 3))
    for x_offset in (-42, 42):
        for y_offset in (-24, 24):
            geometry.box(concrete, (hall_x + x_offset, hall_y + y_offset, 15), (28, 20, 30))

    # Ten sample buildings (within the guide's visual range of 8–12), with 2–4
    # floors; all are silhouettes, not authored interiors or destructible actors.
    x_positions = [boundary_x + 74 + i * 133 for i in range(5)]
    y_positions = [120.0, 380.0]
    floors = [2, 3, 4, 3, 2, 3, 2, 4, 3, 2]
    footprints = [(82, 78), (90, 74), (78, 92), (92, 82), (76, 88),
                  (88, 82), (80, 72), (86, 90), (94, 76), (78, 86)]
    building_centers: list[tuple[float, float]] = []
    building_index = 0
    for y in y_positions:
        for x in x_positions:
            idx = building_index
            floors_count = floors[idx]
            height = 22.0 * floors_count
            bw, bd = footprints[idx]
            building_centers.append((x, y))
            geometry.box(concrete, (x, y, height / 2), (bw, bd, height))
            # Roof slab, asymmetric parapets, and corroded structural edges.
            geometry.box(steel, (x, y, height + 2), (bw + 5, bd + 5, 4))
            geometry.box(dirt, (x - bw * 0.27, y - bd * 0.27, height + 5), (bw * 0.22, bd * 0.18, 2))
            # Recessed-looking window panels on the north and south facades.
            for floor in range(floors_count):
                z = 12 + floor * 22
                for wx in (-bw * 0.25, bw * 0.25):
                    geometry.box(glass, (x + wx, y - bd / 2 - 1, z), (bw * 0.18, 2, 8))
                    geometry.box(glass, (x + wx, y + bd / 2 + 1, z), (bw * 0.18, 2, 8))
            # One damaged-looking corner volume: geometry detail only, no physics.
            geometry.box(dirt, (x + bw * 0.42, y + bd * 0.40, 8), (bw * 0.2, bd * 0.2, 16))
            building_index += 1

    # Three connected underground-passage proxy segments. They sit beneath the
    # normalized ground plane and have no collision, navigation or gameplay logic.
    tunnel_xs = [boundary_x + 150, boundary_x + 360, boundary_x + 570]
    for x in tunnel_xs:
        geometry.box(steel, (x, depth / 2, -22), (14, 158, 4))
        geometry.box(dirt, (x - 13, depth / 2, -32), (5, 158, 22))
        geometry.box(dirt, (x + 13, depth / 2, -32), (5, 158, 22))
        geometry.box(dirt, (x, depth / 2, -44), (31, 158, 4))

    choices = {
        "building_count": building_index,
        "building_floors": floors,
        "tunnel_proxy_count": len(tunnel_xs),
        "armory_rack_proxy_count": 8,
        "armory_station_proxy_count": 4,
        "choice_status": "visual-only sample values; not gameplay specifications",
    }
    return geometry, {
        "normalized_dimensions": [width, depth],
        "armory_hub_world_fraction": armory_fraction,
        "proving_grounds_world_fraction": urban_fraction,
        "armory_width_fraction_of_slice": ratio,
        "proving_grounds_width_fraction_of_slice": 1 - ratio,
        "selected_world_fraction": armory_fraction + urban_fraction,
        "excluded_sector_ids": ["abandoned_park"],
        "illustrative_choices": choices,
        "building_centers": building_centers,
        "tunnel_centers_x": tunnel_xs,
    }


def _append_bytes(buffer: bytearray, data: bytes) -> tuple[int, int]:
    while len(buffer) % 4:
        buffer.append(0)
    offset = len(buffer)
    buffer.extend(data)
    return offset, len(data)


def write_glb(path: Path, geometry: Geometry, metadata: dict[str, Any], source_contract: str) -> None:
    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    primitives: list[dict[str, Any]] = []

    for material_index, group in enumerate(geometry.groups):
        if not group["indices"]:
            continue
        positions = group["positions"]
        normals = group["normals"]
        indices = group["indices"]
        pos_data = struct.pack("<" + "f" * len(positions), *positions)
        normal_data = struct.pack("<" + "f" * len(normals), *normals)
        index_data = struct.pack("<" + "I" * len(indices), *indices)
        pos_offset, pos_length = _append_bytes(binary, pos_data)
        normal_offset, normal_length = _append_bytes(binary, normal_data)
        index_offset, index_length = _append_bytes(binary, index_data)

        pos_view = len(buffer_views)
        buffer_views.extend([
            {"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_length, "target": 34962},
            {"buffer": 0, "byteOffset": normal_offset, "byteLength": normal_length, "target": 34962},
            {"buffer": 0, "byteOffset": index_offset, "byteLength": index_length, "target": 34963},
        ])
        pos_accessor = len(accessors)
        xs, ys, zs = positions[0::3], positions[1::3], positions[2::3]
        accessors.extend([
            {"bufferView": pos_view, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": pos_view + 1, "componentType": 5126, "count": len(normals) // 3, "type": "VEC3"},
            {"bufferView": pos_view + 2, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        ])
        primitives.append({
            "attributes": {"POSITION": pos_accessor, "NORMAL": pos_accessor + 1},
            "indices": pos_accessor + 2,
            "material": material_index,
            "mode": 4,
        })

    material_defs = []
    for material in MATERIALS:
        material_defs.append({
            "name": material["name"],
            "pbrMetallicRoughness": {
                "baseColorFactor": material["color"],
                "metallicFactor": material["metallic"],
                "roughnessFactor": material["roughness"],
            },
            "doubleSided": True,
        })

    gltf = {
        "asset": {"version": "2.0", "generator": "generate_cigkv_vertical_slice.py", "extras": {
            "engine_target": "UE5.8",
            "world_id": "CIGKV",
            "units": "normalized_preview_coordinates_encoded_as_glTF_meters",
            "source_axis_convention": "right-handed; +X east, +Y north, +Z height",
            "gltf_axis_convention": "right-handed; +Y up, +Z forward; linear distances in meters",
            "node_axis_conversion_xyzw": GLTF_ZUP_TO_YUP_ROTATION,
            "source_contract": source_contract,
            "gameplay_approved": False,
            "note": "Visual blockout only; normalized dimensions are not approved gameplay bounds or scale.",
            **metadata,
        }},
        "scene": 0,
        "scenes": [{"name": "CIGKV_ArmoryHub_to_ProvingGrounds", "nodes": [0]}],
        "nodes": [{"name": ASSET, "mesh": 0, "rotation": GLTF_ZUP_TO_YUP_ROTATION}],
        "meshes": [{"name": ASSET, "primitives": primitives}],
        "materials": material_defs,
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_chunk = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    while len(json_chunk) % 4:
        json_chunk += b" "
    while len(binary) % 4:
        binary.append(0)
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    glb = struct.pack("<4sII", b"glTF", 2, total_length)
    glb += struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
    glb += struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    path.write_bytes(glb)


def write_obj(path: Path, geometry: Geometry) -> None:
    mtl_name = MTL_ASSET
    mtl_path = path.parent / mtl_name
    lines = [f"# {ASSET}", "# Visual-only normalized units; not gameplay bounds.", f"mtllib {mtl_name}"]
    vertex_offset = 1
    normal_offset = 1
    for material, group in zip(MATERIALS, geometry.groups):
        if not group["indices"]:
            continue
        lines.append(f"usemtl {material['name']}")
        positions, normals, indices = group["positions"], group["normals"], group["indices"]
        for i in range(0, len(positions), 3):
            lines.append(f"v {positions[i]:.5f} {positions[i+1]:.5f} {positions[i+2]:.5f}")
        for i in range(0, len(normals), 3):
            lines.append(f"vn {normals[i]:.5f} {normals[i+1]:.5f} {normals[i+2]:.5f}")
        for i in range(0, len(indices), 3):
            refs = [f"{vertex_offset + indices[i + j]}//{normal_offset + indices[i + j]}" for j in range(3)]
            lines.append("f " + " ".join(refs))
        vertex_offset += len(positions) // 3
        normal_offset += len(normals) // 3
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    mtl_lines = ["# Source PBR approximations for UE material authoring; no textures included."]
    for material in MATERIALS:
        r, g, b, _ = material["color"]
        mtl_lines += [
            f"newmtl {material['name']}",
            f"Kd {r:.4f} {g:.4f} {b:.4f}",
            f"Pm {material['metallic']:.4f}",
            f"Pr {material['roughness']:.4f}",
            "illum 2",
            "",
        ]
    mtl_path.write_text("\n".join(mtl_lines), encoding="utf-8")


def verify_obj(path: Path, mtl_path: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if f"mtllib {mtl_path.name}" not in lines:
        raise ValueError(f"OBJ does not reference its generated material library: {mtl_path.name}")
    if not mtl_path.is_file():
        raise ValueError(f"OBJ material library is missing: {mtl_path}")
    material_names = {line[7:].strip() for line in mtl_path.read_text(encoding="utf-8").splitlines() if line.startswith("newmtl ")}
    used_materials = {line[7:].strip() for line in lines if line.startswith("usemtl ")}
    if not used_materials or not used_materials.issubset(material_names):
        raise ValueError("OBJ references undefined MTL materials")
    return {
        "vertex_count": sum(line.startswith("v ") for line in lines),
        "normal_count": sum(line.startswith("vn ") for line in lines),
        "face_count": sum(line.startswith("f ") for line in lines),
        "used_material_count": len(used_materials),
        "mtl_file": mtl_path.name,
        "material_links_valid": True,
    }


def write_svg(path: Path, contract: dict[str, Any], metadata: dict[str, Any]) -> None:
    width, height = 1200, 790
    panel_x, panel_y, panel_w, panel_h = 80, 170, 1040, 520
    armory_width = panel_w * metadata["armory_width_fraction_of_slice"]
    proving_width = panel_w - armory_width
    armory_name = next(s["name"] for s in contract["sectors"] if s["id"] == "armory_hub")
    proving_name = next(s["name"] for s in contract["sectors"] if s["id"] == "proving_grounds")
    park_name = next(s["name"] for s in contract["sectors"] if s["id"] == "abandoned_park")
    building_centers = metadata["building_centers"]
    tunnel_xs = metadata["tunnel_centers_x"]
    sx = panel_w / 1000
    sy = panel_h / 500
    pieces = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        '<title id="title">CIGKV — slice visual Armory Hub até Proving Grounds</title>',
        '<desc id="desc">Blockout top-down normalizado. Armory Hub representa um quarto e Proving Grounds três quartos do slice selecionado; Parque Abandonado fica fora do escopo. Não é mapa jogável.</desc>',
        '<rect width="1200" height="790" fill="#10171d"/>',
        '<text x="80" y="65" fill="#f0f4f5" font-family="sans-serif" font-size="30" font-weight="700">CIGKV · Armory Hub → Proving Grounds</text>',
        '<text x="80" y="105" fill="#aab6bc" font-family="sans-serif" font-size="17">Visual blockout · composição setorial normalizada · sem escala de gameplay</text>',
        f'<rect x="{panel_x}" y="{panel_y}" width="{armory_width:.2f}" height="{panel_h}" fill="#59656c" stroke="#d6e1e5" stroke-width="2"/>',
        f'<rect x="{panel_x + armory_width:.2f}" y="{panel_y}" width="{proving_width:.2f}" height="{panel_h}" fill="#303b43" stroke="#d6e1e5" stroke-width="2"/>',
        f'<line x1="{panel_x + armory_width:.2f}" y1="{panel_y}" x2="{panel_x + armory_width:.2f}" y2="{panel_y + panel_h}" stroke="#c8ff3d" stroke-width="4"/>',
    ]

    # Hall footprint, entry apron, rows of loadout racks and station islands.
    hall_x = panel_x + armory_width * 0.5
    hall_y = panel_y + panel_h * 0.5
    hall_w, hall_h = armory_width * 0.72, panel_h * 0.62
    pieces.append(f'<rect x="{hall_x-hall_w/2:.2f}" y="{hall_y-hall_h/2:.2f}" width="{hall_w:.2f}" height="{hall_h:.2f}" rx="8" fill="#737c80" stroke="#dbe2e5" stroke-width="3"/>')
    for row in (-52, 52):
        for col in range(4):
            x = hall_x + (-63 + col * 42) * sx
            y = hall_y + row * sy
            pieces.append(f'<rect x="{x-8:.2f}" y="{y-20:.2f}" width="16" height="40" fill="#985d36" stroke="#141b20" stroke-width="2"/>')
    for dx in (-42, 42):
        for dy in (-24, 24):
            x, y = hall_x + dx * sx, hall_y + dy * sy
            pieces.append(f'<rect x="{x-13:.2f}" y="{y-10:.2f}" width="26" height="20" fill="#c8ff3d" stroke="#172027" stroke-width="2"/>')

    # Ten building footprints, matching the documented 8–12 visual range.
    for index, (x, y) in enumerate(building_centers, start=1):
        sx_pos = panel_x + x * sx
        sy_pos = panel_y + (500 - y) * sy
        bw, bh = 82 * sx, 78 * sy
        pieces.append(f'<rect x="{sx_pos-bw/2:.2f}" y="{sy_pos-bh/2:.2f}" width="{bw:.2f}" height="{bh:.2f}" fill="#68747a" stroke="#d3dcdf" stroke-width="2"/>')
        pieces.append(f'<text x="{sx_pos:.2f}" y="{sy_pos+5:.2f}" fill="#e5ecef" font-family="sans-serif" font-size="12" text-anchor="middle">B{index:02d}</text>')

    # Tunnel traces are dashed and labeled as subsurface visual proxies.
    for x in tunnel_xs:
        sx_pos = panel_x + x * sx
        pieces.append(f'<line x1="{sx_pos:.2f}" y1="{panel_y+panel_h*0.31:.2f}" x2="{sx_pos:.2f}" y2="{panel_y+panel_h*0.69:.2f}" stroke="#c5a275" stroke-width="5" stroke-dasharray="10 9" opacity="0.95"/>')

    pieces += [
        f'<text x="{panel_x + armory_width/2:.2f}" y="{panel_y-18}" fill="#f2f5f6" font-family="sans-serif" font-size="18" text-anchor="middle">{html.escape(armory_name)} · 1/8</text>',
        f'<text x="{panel_x + armory_width + proving_width/2:.2f}" y="{panel_y-18}" fill="#f2f5f6" font-family="sans-serif" font-size="18" text-anchor="middle">{html.escape(proving_name)} · 3/8</text>',
        '<text x="80" y="735" fill="#b6c1c6" font-family="sans-serif" font-size="15">Racks/estações, 10 edifícios e 3 túneis-proxy são escolhas visuais; sem gameplay, colisão ou navegação.</text>',
        f'<text x="80" y="762" fill="#8b999f" font-family="sans-serif" font-size="14">Fora deste slice: {html.escape(park_name)} (4/8). A proporção exibida entre os setores incluídos mantém 1:3; nenhuma coordenada real é definida.</text>',
        '</svg>',
    ]
    path.write_text("\n".join(pieces) + "\n", encoding="utf-8")


def verify_glb(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError("GLB is unexpectedly short")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValueError("invalid GLB header or length")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError("first GLB chunk must be JSON")
    gltf = json.loads(data[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    if not gltf.get("meshes") or not gltf["meshes"][0].get("primitives"):
        raise ValueError("GLB contains no mesh primitives")
    nodes = gltf.get("nodes", [])
    if len(nodes) != 1 or nodes[0].get("mesh") != 0:
        raise ValueError("GLB must contain one root node referencing the blockout mesh")
    rotation = nodes[0].get("rotation")
    if not isinstance(rotation, list) or len(rotation) != 4 or any(
        not math.isclose(float(actual), expected, abs_tol=1e-7)
        for actual, expected in zip(rotation, GLTF_ZUP_TO_YUP_ROTATION)
    ):
        raise ValueError("GLB root transform is missing the Z-up to glTF Y-up rotation")
    qx, qy, qz, qw = (float(value) for value in rotation)

    def cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
        return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

    def rotate(vector: tuple[float, float, float]) -> tuple[float, float, float]:
        qv = (qx, qy, qz)
        q_cross_v = cross(qv, vector)
        inner = tuple(q_cross_v[i] + qw * vector[i] for i in range(3))
        outer = cross(qv, inner)
        return tuple(vector[i] + 2 * outer[i] for i in range(3))

    expected_axes = [((0.0, 0.0, 1.0), (0.0, 1.0, 0.0)),
                     ((0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
                     ((1.0, 0.0, 0.0), (-1.0, 0.0, 0.0))]
    if any(any(not math.isclose(actual, expected, abs_tol=1e-6)
               for actual, expected in zip(rotate(source), target))
           for source, target in expected_axes):
        raise ValueError("GLB root rotation does not map source up/north/east to glTF axes")
    extras = gltf.get("asset", {}).get("extras", {})
    if extras.get("gameplay_approved") is not False or extras.get("units") != "normalized_preview_coordinates_encoded_as_glTF_meters":
        raise ValueError("GLB must declare normalized, non-gameplay glTF meter coordinates")
    return {"bytes": len(data), "version": version, "mesh_count": len(gltf["meshes"]),
            "primitive_count": len(gltf["meshes"][0]["primitives"]), "material_count": len(gltf.get("materials", [])),
            "axis_conversion_valid": True, "units": extras["units"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="regerar em diretório temporário e comparar byte a byte")
    args = parser.parse_args()

    contract = read_contract(args.manifest)
    geometry, metadata = make_geometry(contract)
    temporary = tempfile.TemporaryDirectory() if args.check else None
    output_dir = Path(temporary.name) if temporary else args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    glb_path = output_dir / f"{ASSET}.glb"
    obj_path = output_dir / f"{ASSET}.obj"
    mtl_path = output_dir / MTL_ASSET
    svg_path = output_dir / "T_CIGKV_ArmoryToProvingGrounds_TopDown.svg"
    report_path = output_dir / "CIGKV_ArmoryToProvingGrounds_Blockout.json"

    source_contract = str(args.manifest.resolve().relative_to(ROOT.resolve())) if args.manifest.resolve().is_relative_to(ROOT.resolve()) else str(args.manifest)
    write_glb(glb_path, geometry, metadata, source_contract)
    write_obj(obj_path, geometry)
    obj_stats = verify_obj(obj_path, mtl_path)
    write_svg(svg_path, contract, metadata)
    glb_stats = verify_glb(glb_path)
    report = {
        "schema": "khaaos.cigkv-vertical-slice/v1",
        "world_id": "CIGKV",
        "slice": "Armory Hub to Proving Grounds",
        "asset_name": ASSET,
        "engine_target": "UE5.8",
        "status": "generated_source_visual_blockout",
        "source_contract": source_contract,
        "units": "glTF meters; normalized preview magnitudes, not approved gameplay dimensions",
        "coordinate_conversion": {
            "source_basis": "right-handed; +X east, +Y north, +Z height",
            "gltf_basis": "right-handed; +Y up, +Z forward",
            "root_rotation_xyzw": GLTF_ZUP_TO_YUP_ROTATION,
            "verified": True,
        },
        "not_a_gameplay_map": True,
        "not_a_uasset_or_umap": True,
        "proportion": {
            "armory_hub_world_fraction": metadata["armory_hub_world_fraction"],
            "proving_grounds_world_fraction": metadata["proving_grounds_world_fraction"],
            "selected_world_fraction": metadata["selected_world_fraction"],
            "armory_share_of_slice": metadata["armory_width_fraction_of_slice"],
            "proving_grounds_share_of_slice": metadata["proving_grounds_width_fraction_of_slice"],
            "excluded_sector_ids": metadata["excluded_sector_ids"],
        },
        "illustrative_choices": metadata["illustrative_choices"],
        "pbr_materials": MATERIALS,
        "artifacts": {
            "glb": glb_path.name,
            "obj": obj_path.name,
            "mtl": mtl_path.name,
            "top_down_svg": svg_path.name,
        },
        "glb_validation": glb_stats,
        "obj_validation": obj_stats,
        "editor_follow_up": [
            "Import the GLB in UE5.8 Editor as a source blockout and confirm the Y-up conversion in the preview.",
            "Replace flat PBR factors with licensed high-resolution material textures and calibrated instances.",
            "Resolve canonical gameplay bounds, scale, collision, navigation, destruction and streaming with the game team before making the level playable.",
            "Create .uasset/.umap and run Editor cook/playtest; this sandbox has no UE5.8 Editor installation.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.check:
        generated = [glb_path, obj_path, mtl_path, svg_path, report_path]
        differences = []
        for candidate in generated:
            committed_candidate = args.output_dir / candidate.name
            if not committed_candidate.is_file():
                differences.append(f"missing: {committed_candidate}")
            elif candidate.read_bytes() != committed_candidate.read_bytes():
                differences.append(f"out of date: {committed_candidate}")
        if differences:
            print("FAIL — CIGKV visual slice artifacts are missing or stale:")
            for difference in differences:
                print(f"  - {difference}")
            print("Run `npm run build:cigkv:vertical-slice` to regenerate them.")
            return 1
        print("PASS — CIGKV visual-slice artifacts reproduce byte-for-byte from the README contract.")
        return 0
    print(json.dumps({"status": "PASS", "artifacts": [str(p) for p in (glb_path, obj_path, mtl_path, svg_path, report_path)], "glb_validation": glb_stats, "obj_validation": obj_stats}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
