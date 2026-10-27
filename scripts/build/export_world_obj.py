#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Exportação OBJ determinística dos mundos 2-5 (engine-less).

Complementa ``export_barburhen_obj.py`` (W1, com OBJ OFICIAL no pacote
Content/Barburhen): gera a REGENERAÇÃO canônica de Priadus/Ckesalth/
Arukheea/CIGKV em ``mvp_output/assets/worlds/`` e (com ``--all-repo``)
escreve também o OBJ ao lado do pacote UE5 (Content/<World>/).

  - Layouts: scripts/build/world_layouts.py (determinísticos, sem RNG);
  - Unidade: 1 = 1 cm (convenção Unreal), header informativo;
  - Saída parseável pelo baker generalizado (bake_world_colliders.py).

Contrato de saída (linha única):
  KHR_WORLD_OBJ_RESULT_JSON: {"status":"ok", "worlds":[...], ...}
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import world_layouts  # noqa: E402

RESULT_MARKER = "KHR_WORLD_OBJ_RESULT_JSON: "
DEFAULT_OUT_DIR = os.path.join("mvp_output", "assets", "worlds")
REPO_CONTENT_DIR = os.path.join("Unreal", "KhaaosRun", "Content")


def write_obj(world, objects, path):
    """OBJ v1 idêntico em formato ao Barburhen (g/o + v/f)."""
    meta = world_layouts.WORLD_META[world]
    ring = world_layouts.RING_START_CM[world]
    lines = [
        f"# Khaaos Run — {world}_Map.obj (regeneração determinística)",
        f"# Bioma (shared/worlds.ts): {meta[0]}",
        f"# sizeMeters lógico: {meta[1]}; hazard: {meta[2]}",
        f"# Unidade: 1 = 1 cm (convenção Unreal). Blockout: "
        f"{world_layouts.terrain_size_cm(world) / 100:.0f} m × "
        f"{world_layouts.terrain_size_cm(world) / 100:.0f} m.",
        f"# Anel: raio inicial {ring:.0f} cm. Determinístico (sem RNG).",
    ]
    vertex_offset = 1
    for name, verts, tris in objects:
        lines.append(f"g {name}")
        lines.append(f"o {name}")
        for (x, y, z) in verts:
            lines.append(f"v {x:.2f} {y:.2f} {z:.2f}")
        for (a, b, c) in tris:
            lines.append(f"f {vertex_offset + a} {vertex_offset + b} "
                         f"{vertex_offset + c}")
        vertex_offset += len(verts)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return vertex_offset - 1


def export_world(world, out_dir=DEFAULT_OUT_DIR, also_content=False):
    objects = world_layouts.WORLD_BUILDERS[world]()
    world_layouts.validate_layout(world, objects)
    out_path = os.path.join(out_dir, f"{world}_Map.obj")
    total_verts = write_obj(world, objects, out_path)
    written = [out_path]
    if also_content:
        content_path = os.path.join(REPO_CONTENT_DIR, world, f"{world}_Map.obj")
        write_obj(world, objects, content_path)
        written.append(content_path)
    tris = sum(len(t) for _, _, t in objects)
    return {
        "world": world,
        "obj": os.path.abspath(out_path),
        "objects": len(objects),
        "vertices": total_verts,
        "triangles": tris,
        "written": written,
    }


def main(argv):
    result = {"script": "export_world_obj.py"}
    worlds = list(world_layouts.WORLD_BUILDERS)
    also_content = "--all-repo" in argv
    if "--selftest" in argv:
        try:
            selftest()
            result.update({"status": "ok", "mode": "selftest"})
        except Exception as exc:  # noqa: BLE001
            result.update({"status": "failed", "reason": str(exc)})
        print(RESULT_MARKER + json.dumps(result))
        return 0 if result["status"] == "ok" else 1
    try:
        selected = []
        for world in worlds:
            if f"--world={world.lower()}" in argv or f"--world={world}" in argv:
                selected.append(world)
        if not selected or "--all" in argv:
            selected = worlds
        entries = [export_world(w, also_content=also_content) for w in selected]
        result.update({"status": "ok", "worlds": entries})
    except Exception as exc:  # noqa: BLE001
        result.update({"status": "failed", "reason": str(exc)})
    print(RESULT_MARKER + json.dumps(result))
    return 0 if result["status"] == "ok" else 1


def selftest():
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        for world, builder in world_layouts.WORLD_BUILDERS.items():
            objects = builder()
            world_layouts.validate_layout(world, objects)
            assert len(objects) >= 20, f"{world}: layout muito pobre"

            # 1) Determinismo byte a byte
            path_a = os.path.join(tmp, f"{world}_a.obj")
            path_b = os.path.join(tmp, f"{world}_b.obj")
            write_obj(world, objects, path_a)
            write_obj(world, objects, path_b)
            with open(path_a, "rb") as fa, open(path_b, "rb") as fb:
                assert fa.read() == fb.read(), f"{world}: indeterminístico"

            # 2) Roundtrip: baker (parser do core) lê de volta o OBJ gerado
            import bake_barburhen_colliders as core
            groups, unit = core.parse_obj(path_a)
            assert unit == 1.0, f"{world}: header de unidade ausente/incorreto"
            assert len(groups) == len(objects), \
                f"{world}: grupos {len(groups)} != objetos {len(objects)}"
            tris_total = sum(len(g[2]) for g in groups)
            tris_source = sum(len(t) for _, _, t in objects)
            assert tris_total == tris_source, f"{world}: triângulos perdidos"

            # 3) Bake end-to-end do mundo no orçamento padrão
            manifest_path = os.path.join(tmp, f"{world}_colliders.json")
            manifest, stats = core.bake(path_a, manifest_path)
            assert manifest["version"] == 1
            assert stats["objects"] == len(objects)
            assert stats["collision_tris"] <= stats["source_tris"]


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
