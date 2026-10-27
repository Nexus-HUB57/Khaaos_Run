#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Baking engine-less de colliders complexos de Barburhen.

Fase 1 do roadmap: consome ``Barburhen_Map.obj`` (export_barburhen_obj.py)
e produz o manifesto de colisão ``Barburhen_colliders.json``:

  - por OBJETO do OBJ: AABB + trimesh de colisão DECIMADO (clusterização de
    vértices por grade quantizada até caber no orçamento de triângulos);
  - contrato de import UE5: ``/Game/Worlds/Barburhen/Barburhen_Map`` com
    ``Use Complex Collision As Simple`` (a física exata da malha sem custo
    de convex-decomposition no editor) + AABBs por objeto para broadphase
    (SpatialGrid / gameplay).
  - guia UCX para objetos que futuramente migrem para colisão simplificada.

Sem RNG e sem engine: decimação determinística (mesma entrada → mesmo
manifesto, byte a byte) e selftest embutido (padrão fix_ue1021_includes.py).

Contrato de saída (linha única):
  KHR_BARBURHEN_COLLIDERS_RESULT_JSON: {"status":"ok", ...}
"""
import json
import os
import sys

DEFAULT_CLUSTER_CM = 25.0     # grade inicial de quantização (25 cm)
DEFAULT_MAX_TRIS = 96         # orçamento de triângulos por objeto
MIN_CLUSTER_CM = 12.5         # piso de quantização (não degrada além disso)

MANIFEST_VERSION = 1
# Fonte padrão: o OBJ OFICIAL do pacote Barburhen (Content/Barburhen) — 1 unidade
# = 1 metro (header do arquivo). Fallback: regeneração determinística mvp_output.
DEFAULT_OBJ_PATHS = (
    os.path.join("Unreal", "KhaaosRun", "Content", "Barburhen", "Barburhen_Map.obj"),
    os.path.join("mvp_output", "assets", "worlds", "Barburhen_Map.obj"),
)
DEFAULT_OUT_PATH = os.path.join("Unreal", "KhaaosRun", "Content", "Barburhen", "Barburhen_colliders.json")
IMPORT_CONTRACT = {
    "destination": "/Game/Worlds/Barburhen/Barburhen_Map",
    "collision_complexity": "UseComplexAsSimple",
    "material": "/Game/Materials/M_KhaaosStructure",
    "unit": "auto",  # preenchido pelo header do OBJ (m → scale_to_ue_cm=100)
    "note": "AABBs por objeto alimentam broadphase (SpatialGrid) e validação de gameplay; o trimesh decimado é a colisão complexa da StaticMesh.",
}


# ─── Parser OBJ (subconjunto: v / f / g / o / usemtl; índices relativos e absolutos) ──

def detect_unit_cm(lines):
    """Header do OBJ fala a unidade: 'Unit: 1 = 1 meter' → 100 cm; cm → 1."""
    head = "\n".join(lines[:12]).lower()
    if "1 = 1 meter" in head or "unit: 1 = 1 m" in head or "1 = 1 metro" in head:
        return 100.0
    if "1 = 1 cm" in head or "1 = 1 centimeter" in head:
        return 1.0
    return None


def parse_obj(path):
    """Retorna ([(grupo, [vértices locais], [triângulos locais])], unit_cm).

    Granularidade de objeto: `g`/`o` OU `usemtl` (OBJs do pacote Barburhen
    agrupam por material sem `g` — cada troca de usemtl abre um objeto).
    Índices de face são GLOBAIS (1-based) ou negativos (relativos ao total
    lido até então); cada grupo materializa o bloco contíguo de vértices
    entre a sua abertura e a do próximo.
    """
    all_vertices = []
    groups = []  # [name, first_vertex_index, faces_globais]
    current = None
    raw_lines = []

    def open_group(name):
        nonlocal current
        if current is not None and current[0] == name:
            return  # mesmo objeto com faces intercaladas
        current = [name, len(all_vertices), []]
        groups.append(current)

    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            raw_lines.append(raw.rstrip("\n"))
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "v":
                all_vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
            elif parts[0] in ("g", "o"):
                open_group(parts[1] if len(parts) > 1 else "default")
            elif parts[0] == "usemtl":
                open_group(parts[1] if len(parts) > 1 else "default")
            elif parts[0] == "f":
                if current is None:
                    open_group("default")
                idx = []
                for ref in parts[1:]:
                    token = ref.split("/")[0]
                    i = int(token)
                    if i < 0:
                        i = len(all_vertices) + i + 1
                    idx.append(i - 1)  # 0-based global
                # triangulação em leque (cobre quads de terceiros)
                for k in range(1, len(idx) - 1):
                    current[2].append((idx[0], idx[k], idx[k + 1]))
            # mtllib/s/… ignorados deliberadamente

    unit_cm = detect_unit_cm(raw_lines)
    result = []
    for pos, (name, first, faces) in enumerate(groups):
        last = groups[pos + 1][1] if pos + 1 < len(groups) else len(all_vertices)
        local_verts = all_vertices[first:last]
        needed = faces
        min_needed = min((min(t) for t in needed), default=first)
        if min_needed < first:
            local_verts = all_vertices[min_needed:last]
            shift = min_needed
        else:
            shift = first
        local_tris = [(a - shift, b - shift, c - shift) for (a, b, c) in needed]
        if local_verts and local_tris:
            result.append((name, local_verts, local_tris))
    return result, unit_cm


# ─── Decimação determinística por clusterização de vértices ─────────────────

def quantize(value, size):
    return round(value / size) * size


def decimate(vertices, triangles, cluster_cm, max_tris):
    """Clusteriza vértices numa grade `cluster_cm` e reconstrói triângulos.

    Determinístico: quantização por arredondamento; triângulos degenerados
    (índices repetidos após o merge) são descartados; a ordem de saída segue
    a ordem de entrada (sem sorting dependente de hash).
    """
    remap = {}
    new_vertices = []
    for (x, y, z) in vertices:
        key = (quantize(x, cluster_cm), quantize(y, cluster_cm), quantize(z, cluster_cm))
        idx = remap.get(key)
        if idx is None:
            idx = len(new_vertices)
            remap[key] = idx
            new_vertices.append(key)
    new_tris = []
    for (a, b, c) in triangles:
        qa, qb, qc = remap.get(_key_of(vertices[a], cluster_cm), a), \
                     remap.get(_key_of(vertices[b], cluster_cm), b), \
                     remap.get(_key_of(vertices[c], cluster_cm), c)
        if qa == qb or qb == qc or qa == qc:
            continue
        new_tris.append((qa, qb, qc))
    return new_vertices, new_tris


def _key_of(vertex, size):
    return (quantize(vertex[0], size), quantize(vertex[1], size), quantize(vertex[2], size))


def aabb_of(vertices):
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    zs = [v[2] for v in vertices]
    return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]


def bake_object(name, vertices, triangles, cluster_cm, max_tris):
    """Colisão final de um objeto: aumenta a grade até caber no orçamento."""
    size = cluster_cm
    coll_verts, coll_tris = decimate(vertices, triangles, size, max_tris)
    while len(coll_tris) > max_tris:
        size = size * 2  # dobra a célula (25 → 50 → 100 cm…)
        coll_verts, coll_tris = decimate(vertices, triangles, size, max_tris)
    coll_verts = [[round(c, 2) for c in v] for v in coll_verts]
    mn, mx = aabb_of(vertices)
    return {
        "name": name,
        "aabb_min": [round(v, 2) for v in mn],
        "aabb_max": [round(v, 2) for v in mx],
        "source": {"vertices": len(vertices), "triangles": len(triangles)},
        "collision": {
            "mode": "complex_as_simple",
            "cluster_cm": size,
            "vertices": coll_verts,
            "triangles": coll_tris,
        },
    }


def bake(obj_path, out_path, cluster_cm=DEFAULT_CLUSTER_CM, max_tris=DEFAULT_MAX_TRIS):
    groups, unit_cm = parse_obj(obj_path)
    if not groups:
        raise ValueError("OBJ sem grupos: " + obj_path)
    baked = []
    for name, verts, tris in groups:
        if not verts or not tris:
            continue
        baked.append(bake_object(name, verts, tris, cluster_cm, max_tris))
    contract = dict(IMPORT_CONTRACT)
    contract["unit"] = "cm" if unit_cm == 1.0 else "m"
    contract["scale_to_ue_cm"] = unit_cm if unit_cm else 100.0
    manifest = {
        "version": MANIFEST_VERSION,
        "source_obj": os.path.basename(obj_path),
        "unit": contract["unit"],
        "scale_to_ue_cm": contract["scale_to_ue_cm"],
        "import": contract,
        "objects": baked,
        "ucx_guidance": {
            "convention": "UCX_<MeshName>_<N> (convexos simples por peça)",
            "when": "peças que migrarem de complex-as-simple para convexos (perf)",
        },
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write("\n")
    stats = {
        "objects": len(baked),
        "source_tris": sum(o["source"]["triangles"] for o in baked),
        "collision_tris": sum(len(o["collision"]["triangles"]) for o in baked),
    }
    return manifest, stats


def default_obj_path():
    """OBJ OFICIAL (Content/Barburhen) quando presente; fallback regeneração."""
    for candidate in DEFAULT_OBJ_PATHS:
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError(
        "OBJ do Barburhen não encontrado: rode export_barburhen_obj.py ou restaure %s" % DEFAULT_OBJ_PATHS[0])


def main():
    result = {"script": "bake_barburhen_colliders.py"}
    try:
        try:
            obj_path = sys.argv[1] if len(sys.argv) > 1 else default_obj_path()
        except FileNotFoundError as exc:
            result.update({"status": "failed", "reason": str(exc)})
            print("KHR_BARBURHEN_COLLIDERS_RESULT_JSON: " + json.dumps(result))
            return 1
        out_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT_PATH
        _, stats = bake(obj_path, out_path)
        result.update({"status": "ok", "manifest": os.path.abspath(out_path), **stats})
    except Exception as exc:  # noqa: BLE001
        result.update({"status": "failed", "reason": str(exc)})
    print("KHR_BARBURHEN_COLLIDERS_RESULT_JSON: " + json.dumps(result))
    return 0 if result["status"] == "ok" else 1


# ─── Selftest ────────────────────────────────────────────────────────────────

def selftest():
    import tempfile

    # 1) Parser: OBJ sintético com face de 4 vértices (leque) e índice negativo
    with tempfile.TemporaryDirectory() as tmp:
        obj_path = os.path.join(tmp, "t.obj")
        with open(obj_path, "w", encoding="utf-8") as fh:
            fh.write("g quad\nv 0 0 0\nv 100 0 0\nv 100 100 0\nv 0 100 0\nf -4 -3 -2 -1\n")
        groups, unit = parse_obj(obj_path)
        assert unit is None, unit
        assert len(groups) == 1 and groups[0][0] == "quad"
        assert len(groups[0][1]) == 4 and len(groups[0][2]) == 2, groups[0][2]

        # 1b) Agrupamento por usemtl (pacote oficial Barburhen) + unidade metro
        obj_m = os.path.join(tmp, "m.obj")
        with open(obj_m, "w", encoding="utf-8") as fh:
            fh.write("# Unit: 1 = 1 meter\nv 0 0 0\nv 2 0 0\nv 2 2 0\nv 0 2 0\n"
                     "usemtl Sector_Park\nf 1 2 3\nusemtl Sector_Urban\nf 2 3 4\n")
        groups_m, unit_m = parse_obj(obj_m)
        assert unit_m == 100.0, unit_m
        assert [g[0] for g in groups_m] == ["Sector_Park", "Sector_Urban"], groups_m

        # 2) Decimação: grade 25 cm funde vértices a 1 cm de distância
        verts = [(0, 0, 0), (1, 0, 0), (100, 0, 0), (100, 100, 0), (0, 100, 0)]
        tris = [(0, 1, 2), (0, 2, 3), (0, 3, 4)]
        dv, dt = decimate(verts, tris, 25.0, 96)
        assert len(dv) == 4, dv  # (0,0) e (1,0) colapsam
        assert len(dt) == 2, dt  # triângulo degenerado descartado

        # 3) Orçamento: grade cresce até caber (cilindro 48 seg com orçamento 48)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import export_barburhen_obj as exporter
        marker = dict((n, (v, t)) for n, v, t in exporter.build_objects())["park_ring_marker"]
        baked = bake_object("park_ring_marker", marker[0], marker[1], 25.0, 96)
        assert len(baked["collision"]["triangles"]) <= 96
        assert baked["collision"]["cluster_cm"] >= 25.0
        squeezed = bake_object("park_ring_marker", marker[0], marker[1], 25.0, 48)
        assert len(squeezed["collision"]["triangles"]) <= 48
        assert squeezed["collision"]["cluster_cm"] > 25.0, squeezed["collision"]["cluster_cm"]

        # 4) Pipeline completa sobre o OBJ real do exportador: bounds/consistência
        obj_real = os.path.join(tmp, "Barburhen_Map.obj")
        json_path = os.path.join(tmp, "Barburhen_colliders.json")
        exporter.write_obj(exporter.build_objects(), obj_real)
        manifest, stats = bake(obj_real, json_path)
        assert manifest["version"] == 1 and manifest["import"]["collision_complexity"] == "UseComplexAsSimple"
        assert stats["objects"] == len(exporter.build_objects())
        # Low-poly esparso NÃO reduz (vértices distantes) — nunca cresce;
        # redução real é provada no caso denso abaixo.
        assert stats["collision_tris"] <= stats["source_tris"], "decimação cresceu"

        # Caso denso: malha 20×20 (400 vértices a 2 cm entre si) colapsa
        dense_verts = [(float(i % 20) * 2.0, float(i // 20) * 2.0, 0.0) for i in range(400)]
        dense_tris = []
        for row in range(19):
            for col in range(19):
                a = row * 20 + col
                dense_tris.append((a, a + 1, a + 21))
                dense_tris.append((a, a + 21, a + 20))
        dense_v, dense_t = decimate(dense_verts, dense_tris, 25.0, 96)
        assert len(dense_v) < len(dense_verts), "denso não colapsou"
        assert len(dense_t) < len(dense_tris), "triângulos densos não reduziram"

        for obj in manifest["objects"]:
            mn, mx = obj["aabb_min"], obj["aabb_max"]
            assert mn[0] <= mx[0] and mn[1] <= mx[1] and mn[2] <= mx[2]
            for tri in obj["collision"]["triangles"]:
                assert len(tri) == 3 and len(set(tri)) == 3, "triângulo degenerado no manifesto"
        # marcador do anel: AABB cobre o raio canônico
        ring = next(o for o in manifest["objects"] if o["name"] == "park_ring_marker")
        assert abs(max(abs(ring["aabb_min"][0]), abs(ring["aabb_max"][0])) - 25000.0) < 1.0

        # 5) Determinismo byte a byte
        json2 = os.path.join(tmp, "again.json")
        bake(obj_real, json2)
        with open(json_path, "rb") as f1, open(json2, "rb") as f2:
            assert f1.read() == f2.read(), "baking não determinístico"

    print("BARBURHEN_COLLIDERS_SELFTEST_OK")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    sys.exit(main())
