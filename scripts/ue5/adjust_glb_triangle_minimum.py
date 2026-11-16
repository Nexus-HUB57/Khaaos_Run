#!/usr/bin/env python3
"""Raise a rigged GLB to a triangle-count floor without changing its surface.

Each selected triangle is split into three around its barycentric centroid.
New vertex attributes are interpolated from the original corners. Skin weights
are merged, ranked, truncated to the existing JOINTS_n/WEIGHTS_n capacity,
and renormalized. The source file is never modified.
"""
from __future__ import annotations

import argparse
import json
import math
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any

COMPONENTS = {
    5120: ("b", 1, -128, 127),
    5121: ("B", 1, 0, 255),
    5122: ("h", 2, -32768, 32767),
    5123: ("H", 2, 0, 65535),
    5125: ("I", 4, 0, 4294967295),
    5126: ("f", 4, None, None),
}
TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB header/chunks are truncated")
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("expected a complete glTF 2.0 binary file")
    offset = 12
    json_chunks = []
    bin_chunks = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("truncated GLB chunk header")
        size, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8 : offset + 8 + size]
        if len(payload) != size:
            raise ValueError("truncated GLB chunk")
        if kind == 0x4E4F534A:
            json_chunks.append(payload)
        elif kind == 0x004E4942:
            bin_chunks.append(payload)
        offset += 8 + size
    if len(json_chunks) != 1 or len(bin_chunks) != 1:
        raise ValueError("expected exactly one JSON and one BIN chunk")
    document = json.loads(json_chunks[0].rstrip(b" \0").decode("utf-8"))
    if len(document.get("buffers", [])) != 1:
        raise ValueError("expected one embedded GLB buffer")
    binary = bin_chunks[0]
    if document["buffers"][0].get("byteLength", 0) > len(binary):
        raise ValueError("buffer byteLength exceeds BIN chunk")
    return document, binary


def component_info(accessor: dict[str, Any]) -> tuple[str, int, int]:
    code, size, _, _ = COMPONENTS[accessor["componentType"]]
    return code, size, TYPE_WIDTH[accessor["type"]]


def read_accessor(document: dict[str, Any], binary: bytes, accessor_index: int) -> list[tuple[int | float, ...]]:
    accessor = document["accessors"][accessor_index]
    if "sparse" in accessor:
        raise ValueError("sparse accessors are not supported")
    view = document["bufferViews"][accessor["bufferView"]]
    if view.get("byteStride") is not None:
        raise ValueError("interleaved vertex data is not supported")
    code, size, width = component_info(accessor)
    fmt = "<" + code * width
    stride = size * width
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(accessor["count"])]


def normalized_value(value: int | float, accessor: dict[str, Any]) -> float:
    if not accessor.get("normalized", False):
        return float(value)
    _, _, low, high = COMPONENTS[accessor["componentType"]]
    if low is None or high is None:
        return float(value)
    if low < 0:
        return max(-1.0, float(value) / high)
    return float(value) / high


def encode_values(values: list[tuple[int | float, ...]], accessor: dict[str, Any]) -> bytes:
    code, _, width = component_info(accessor)
    fmt = "<" + code * width
    low, high = COMPONENTS[accessor["componentType"]][2:]
    out = bytearray()
    for row in values:
        if len(row) != width:
            raise ValueError("attribute width changed")
        encoded = []
        for value in row:
            if accessor.get("normalized", False) and code != "f":
                scale = high
                if low < 0:
                    value = round(max(-1.0, min(1.0, float(value))) * scale)
                else:
                    value = round(max(0.0, min(1.0, float(value))) * scale)
            elif code != "f":
                value = round(value)
            encoded.append(value)
        out.extend(struct.pack(fmt, *encoded))
    return bytes(out)


def vec_sub(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, ...]:
    return tuple(x - y for x, y in zip(a, b))


def cross(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, float, float]:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(v: tuple[float, ...]) -> float:
    return math.sqrt(sum(x * x for x in v))


def normalized(v: tuple[float, ...]) -> tuple[float, ...]:
    length = norm(v)
    if length < 1e-12:
        return tuple(0.0 for _ in v)
    return tuple(x / length for x in v)


def align4(buffer: bytearray) -> None:
    buffer.extend(b"\0" * ((-len(buffer)) % 4))


def add_view(document: dict[str, Any], binary: bytearray, payload: bytes, target: int) -> int:
    align4(binary)
    offset = len(binary)
    binary.extend(payload)
    views = document.setdefault("bufferViews", [])
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
    return len(views) - 1


def write_glb(path: Path, document: dict[str, Any], binary: bytearray) -> None:
    document["buffers"][0]["byteLength"] = len(binary)
    bin_payload = bytes(binary)
    bin_payload += b"\0" * ((-len(bin_payload)) % 4)
    json_payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_payload += b" " * ((-len(json_payload)) % 4)
    total_length = 12 + 8 + len(json_payload) + 8 + len(bin_payload)
    with path.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total_length))
        stream.write(struct.pack("<II", len(json_payload), 0x4E4F534A))
        stream.write(json_payload)
        stream.write(struct.pack("<II", len(bin_payload), 0x004E4942))
        stream.write(bin_payload)


def refine(document: dict[str, Any], binary: bytes, minimum_triangles: int) -> tuple[dict[str, Any], bytearray, dict[str, int | float]]:
    meshes = document.get("meshes", [])
    if len(meshes) != 1 or len(meshes[0].get("primitives", [])) != 1:
        raise ValueError("expected one mesh with one primitive")
    primitive = meshes[0]["primitives"][0]
    if primitive.get("mode", 4) != 4 or primitive.get("targets"):
        raise ValueError("only indexed TRIANGLES primitives without morph targets are supported")

    accessors = document["accessors"]
    attrs = primitive["attributes"]
    pos_id = attrs.get("POSITION")
    index_id = primitive.get("indices")
    if pos_id is None or index_id is None:
        raise ValueError("indexed positions are required")
    positions = read_accessor(document, binary, pos_id)
    indices = [int(row[0]) for row in read_accessor(document, binary, index_id)]
    if len(indices) % 3:
        raise ValueError("triangle index count is not divisible by three")
    original_triangles = len(indices) // 3
    difference = minimum_triangles - original_triangles
    if difference <= 0:
        raise ValueError(f"source already has {original_triangles} triangles; no adjustment is needed")
    if difference % 2:
        raise ValueError("centroid subdivision adds two triangles per face; target difference must be even")
    split_count = difference // 2

    vertex_count = accessors[pos_id]["count"]
    if any(index >= vertex_count for index in indices):
        raise ValueError("triangle index is outside POSITION accessor")
    normal_id = attrs.get("NORMAL")
    normals = read_accessor(document, binary, normal_id) if normal_id is not None else None

    candidates = []
    for face_id in range(original_triangles):
        tri = tuple(indices[face_id * 3 : face_id * 3 + 3])
        if len(set(tri)) != 3:
            continue
        p0, p1, p2 = (tuple(map(float, positions[i][:3])) for i in tri)
        area2 = norm(cross(vec_sub(p1, p0), vec_sub(p2, p0)))
        if area2 <= 1e-12:
            continue
        normal_spread = 0.0
        if normals is not None:
            ns = [normalized(tuple(map(float, normals[i][:3]))) for i in tri]
            normal_spread = max(norm(vec_sub(ns[a], ns[b])) for a in range(3) for b in range(a + 1, 3))
        candidates.append((normal_spread, -area2, face_id, tri))
    if len(candidates) < split_count:
        raise ValueError("not enough non-degenerate triangles to refine")
    selected_rows = sorted(candidates)[:split_count]
    selected = {row[2]: row[3] for row in selected_rows}
    selected_ids = sorted(selected)

    attribute_values = {name: read_accessor(document, binary, accessor_id) for name, accessor_id in attrs.items()}
    new_values: dict[str, list[tuple[int | float, ...]]] = {name: [] for name in attrs}
    joint_sets = sorted(int(name.split("_")[1]) for name in attrs if name.startswith("JOINTS_"))
    if joint_sets:
        for set_id in joint_sets:
            if f"WEIGHTS_{set_id}" not in attrs:
                raise ValueError(f"missing WEIGHTS_{set_id} for skin influences")

    for face_id in selected_ids:
        tri = selected[face_id]
        for name in attrs:
            if name.startswith("JOINTS_") or name.startswith("WEIGHTS_"):
                continue
            rows = [tuple(map(float, attribute_values[name][i])) for i in tri]
            width = len(rows[0])
            mean = tuple(sum(row[k] for row in rows) / 3.0 for k in range(width))
            if name == "NORMAL":
                mean = normalized(mean[:3])
            elif name == "TANGENT":
                xyz = normalized(mean[:3])
                mean = (*xyz, 1.0 if mean[3] >= 0 else -1.0)
            new_values[name].append(mean)

        if joint_sets:
            influence = defaultdict(float)
            for vertex_id in tri:
                for set_id in joint_sets:
                    joint_values = attribute_values[f"JOINTS_{set_id}"][vertex_id]
                    weight_values = attribute_values[f"WEIGHTS_{set_id}"][vertex_id]
                    weight_accessor = accessors[attrs[f"WEIGHTS_{set_id}"]]
                    for joint, weight in zip(joint_values, weight_values):
                        influence[int(joint)] += normalized_value(weight, weight_accessor) / 3.0
            ranked = sorted(((joint, weight) for joint, weight in influence.items() if weight > 0), key=lambda item: (-item[1], item[0]))
            ranked = ranked[: 4 * len(joint_sets)]
            total_weight = sum(weight for _, weight in ranked)
            if total_weight <= 0:
                raise ValueError("interpolated skin weights sum to zero")
            ranked = [(joint, weight / total_weight) for joint, weight in ranked]
            for chunk_id, set_id in enumerate(joint_sets):
                group = ranked[chunk_id * 4 : chunk_id * 4 + 4]
                group += [(0, 0.0)] * (4 - len(group))
                new_values[f"JOINTS_{set_id}"].append(tuple(j for j, _ in group))
                new_values[f"WEIGHTS_{set_id}"].append(tuple(w for _, w in group))

    rebuilt_indices: list[int] = []
    new_vertex_for_face = {face_id: vertex_count + i for i, face_id in enumerate(selected_ids)}
    for face_id in range(original_triangles):
        a, b, c = indices[face_id * 3 : face_id * 3 + 3]
        if face_id in new_vertex_for_face:
            m = new_vertex_for_face[face_id]
            rebuilt_indices.extend((a, b, m, b, c, m, c, a, m))
        else:
            rebuilt_indices.extend((a, b, c))

    output_binary = bytearray(binary)
    for name, accessor_id in attrs.items():
        accessor = accessors[accessor_id]
        combined = attribute_values[name] + new_values[name]
        payload = encode_values(combined, accessor)
        accessor["bufferView"] = add_view(document, output_binary, payload, 34962)
        accessor["byteOffset"] = 0
        accessor["count"] = len(combined)
        accessor.pop("sparse", None)
        if name != "POSITION":
            accessor.pop("min", None)
            accessor.pop("max", None)

    index_accessor = accessors[index_id]
    index_code, _, _, max_index_value = COMPONENTS[index_accessor["componentType"]]
    if max(rebuilt_indices) > max_index_value:
        raise ValueError("index component type cannot represent new vertices")
    index_payload = struct.pack("<" + index_code * len(rebuilt_indices), *rebuilt_indices)
    index_accessor["bufferView"] = add_view(document, output_binary, index_payload, 34963)
    index_accessor["byteOffset"] = 0
    index_accessor["count"] = len(rebuilt_indices)
    index_accessor["min"] = [min(rebuilt_indices)]
    index_accessor["max"] = [max(rebuilt_indices)]

    actual_triangles = len(rebuilt_indices) // 3
    if actual_triangles < minimum_triangles:
        raise AssertionError("triangle target was not reached")
    stats: dict[str, int | float] = {
        "triangles_before": original_triangles,
        "triangles_after": actual_triangles,
        "faces_split": split_count,
        "vertices_before": vertex_count,
        "vertices_after": vertex_count + split_count,
        "max_selected_normal_spread": max(row[0] for row in selected_rows),
    }
    return document, output_binary, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--minimum-triangles", type=int, default=5000)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("--output must differ from --input; the source is preserved")
    document, binary = read_glb(args.input)
    document, output_binary, stats = refine(document, binary, args.minimum_triangles)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_glb(args.output, document, output_binary)
    print(json.dumps({"input": str(args.input), "output": str(args.output), **stats}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
