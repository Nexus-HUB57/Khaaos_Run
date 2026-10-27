#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Baking engine-less de colliders complexos (mundos 2-5).

Generalização do ``bake_barburhen_colliders.py`` (W1) para os mundos
Priadus/Ckesalth/Arukheea/CIGKV: consome o OBJ da REGENERAÇÃO canônica
(``export_world_obj.py``) ou um OBJ informado, e produz o manifesto de
colisão ``<World>_colliders.json``:

  - por OBJETO do OBJ: AABB + trimesh decimado (clusterização por grade
    quantizada até caber no orçamento de triângulos);
  - contrato de import UE5 por mundo (UseComplexAsSimple + AABBs para
    broadphase SpatialGrid).

Fonte padrão: ``mvp_output/assets/worlds/<World>_Map.obj`` (regeneração).
W1/Barburhen mantém fluxo PRÓPRIO (OBJ oficial do pacote) — não passe
--world barburhen aqui.

Contrato de saída (linha única):
  KHR_WORLD_COLLIDERS_RESULT_JSON: {"status":"ok", ...}
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bake_barburhen_colliders as core  # noqa: E402  (parser/decimação canônicos)
import world_layouts  # noqa: E402

RESULT_MARKER = "KHR_WORLD_COLLIDERS_RESULT_JSON: "
DEFAULT_OBJ_DIR = os.path.join("mvp_output", "assets", "worlds")
REPO_CONTENT_DIR = os.path.join("Unreal", "KhaaosRun", "Content")

SUPPORTED_WORLDS = ("Priadus", "Ckesalth", "Arukheea", "CIGKV")


def import_contract(world):
    """Contrato de import UE5 por mundo (espelha o padrão Barburhen)."""
    destination = world_layouts.WORLD_META[world][3]
    return {
        "destination": destination,
        "collision_complexity": "UseComplexAsSimple",
        "material": "/Game/Materials/M_KhaaosStructure",
        "unit": "auto",  # preenchido pelo header do OBJ (cm → 1)
        "note": "AABBs por objeto alimentam broadphase (SpatialGrid) e "
                "validação de gameplay; o trimesh decimado é a colisão "
                "complexa da StaticMesh.",
    }


def default_obj_path(world):
    return os.path.join(DEFAULT_OBJ_DIR, f"{world}_Map.obj")


def default_out_path(world):
    return os.path.join(REPO_CONTENT_DIR, world, f"{world}_colliders.json")


def bake_world(world, obj_path=None, out_path=None,
               cluster_cm=core.DEFAULT_CLUSTER_CM, max_tris=core.DEFAULT_MAX_TRIS):
    """Bake completo de um mundo; retorna (manifest, stats)."""
    if world not in SUPPORTED_WORLDS:
        raise ValueError(f"mundo não suportado pelo baker generalizado: {world}")
    obj_path = obj_path or default_obj_path(world)
    out_path = out_path or default_out_path(world)
    manifest, stats = core.bake(obj_path, out_path, cluster_cm, max_tris)
    contract = import_contract(world)
    manifest["source_obj"] = os.path.basename(obj_path)
    manifest["world"] = world
    manifest["biome"] = world_layouts.WORLD_META[world][0]
    manifest["hazard"] = world_layouts.WORLD_META[world][2]
    manifest["logical_size_meters"] = world_layouts.WORLD_META[world][1]
    manifest["ring_start_radius_cm"] = world_layouts.RING_START_CM[world]
    manifest["import"] = contract
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write("\n")
    return manifest, stats


def main(argv):
    result = {"script": "bake_world_colliders.py"}
    if "--selftest" in argv:
        try:
            selftest()
            result.update({"status": "ok", "mode": "selftest"})
        except Exception as exc:  # noqa: BLE001
            result.update({"status": "failed", "reason": str(exc)})
        print(RESULT_MARKER + json.dumps(result))
        return 0 if result["status"] == "ok" else 1
    try:
        world = None
        for candidate in SUPPORTED_WORLDS:
            if f"--world={candidate.lower()}" in argv:
                world = candidate
        if world is None:
            raise ValueError("use --world=<priadus|ckesalth|arukheea|cigkv> "
                             "(Barburhen usa bake_barburhen_colliders.py)")
        rest = [a for a in argv if a.startswith("--") is False]
        obj_path = rest[0] if rest else None
        out_path = rest[1] if len(rest) > 1 else None
        if not os.path.isfile(obj_path or default_obj_path(world)):
            raise FileNotFoundError(
                f"OBJ de {world} não encontrado — rode export_world_obj.py "
                f"({default_obj_path(world)})")
        _, stats = bake_world(world, obj_path, out_path)
        result.update({"status": "ok", "world": world,
                       "manifest": os.path.abspath(out_path or default_out_path(world)),
                       **stats})
    except Exception as exc:  # noqa: BLE001
        result.update({"status": "failed", "reason": str(exc)})
    print(RESULT_MARKER + json.dumps(result))
    return 0 if result["status"] == "ok" else 1


def selftest():
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        # 1) Bake determinístico byte a byte por mundo
        from export_world_obj import write_obj
        for world in SUPPORTED_WORLDS:
            objects = world_layouts.WORLD_BUILDERS[world]()
            world_layouts.validate_layout(world, objects)
            # MESMO basename em dirs distintos — basename entra no manifesto.
            dir_a = os.path.join(tmp, "a")
            dir_b = os.path.join(tmp, "b")
            os.makedirs(dir_a, exist_ok=True)
            os.makedirs(dir_b, exist_ok=True)
            obj_a = os.path.join(dir_a, f"{world}_Map.obj")
            obj_b = os.path.join(dir_b, f"{world}_Map.obj")
            write_obj(world, objects, obj_a)
            write_obj(world, objects, obj_b)
            out_a = os.path.join(dir_a, f"{world}_colliders.json")
            out_b = os.path.join(dir_b, f"{world}_colliders.json")
            bake_world(world, obj_a, out_a)
            bake_world(world, obj_b, out_b)
            with open(out_a, "rb") as fa, open(out_b, "rb") as fb:
                assert fa.read() == fb.read(), f"{world}: bake indeterminístico"

            manifest = json.load(open(out_a, encoding="utf-8"))
            assert manifest["world"] == world
            assert manifest["import"]["collision_complexity"] == "UseComplexAsSimple"
            assert manifest["import"]["destination"] == world_layouts.WORLD_META[world][3]
            assert manifest["version"] == core.MANIFEST_VERSION
            # AABBs coerentes: dentro do terreno (com tolerância de borda)
            size = world_layouts.terrain_size_cm(world) / 2 + 200.0
            for obj in manifest["objects"]:
                assert abs(obj["aabb_min"][0]) <= size and abs(obj["aabb_max"][0]) <= size
                assert abs(obj["aabb_min"][1]) <= size and abs(obj["aabb_max"][1]) <= size
                assert obj["aabb_max"][2] > obj["aabb_min"][2]

        # 2) Orçamento apertado: cluster cresce, tris nunca excedem o cap
        marker = dict((n, (v, t)) for n, v, t in
                      world_layouts.build_priadus())["atoll_tower"]
        squeezed = core.bake_object("atoll_tower", marker[0], marker[1], 25.0, 48)
        assert len(squeezed["collision"]["triangles"]) <= 48
        assert squeezed["collision"]["cluster_cm"] >= 25.0

        # 3) Mundo não suportado rejeitado explicitamente
        try:
            bake_world("Barburhen")
            raise AssertionError("Barburhen não deveria ser aceito aqui")
        except ValueError:
            pass


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
