#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Regeneração determinística do mapa Barburhen (W1/C1) em OBJ.

Fase 1 do roadmap de auditoria: fonte de verdade secundária do mundo
Barburhen. O OBJ OFICIAL vive em ``Unreal/KhaaosRun/Content/Barburhen/``
(pacote com DataTables/README — METROS); este exportador produz uma
REGENERAÇÃO canônica em ``mvp_output/assets/worlds/`` para:
  - fallback quando o asset oficial estiver ausente (o baker e o importer
    preferem o oficial automaticamente);
  - fixture determinística dos selftests (sem RNG — byte a byte).

Layout canônico (BarburhenTypes.h — origem = centro do Parque Abandonado):
  AbandonedPark      centro (0, 0)                — 3/8 da área
  UrbanCommercial    quadrantes NO e SE            — 2/8
  Industrial         quadrantes NE e SO            — 3/8 (desembarque)
  ExtractionStation  borda leste (estação do ZU)   — extração
  Anel: raio inicial 25 000 cm (250 m), fecha no Parque (600 s).

Unidade: 1 unidade OBJ = 1 cm (convenção UE). Sem RNG: mesmas coordenadas
em toda execução (determinismo auditável + selftest).

Contrato de saída (linha única, parseável):
  KHR_BARBURHEN_OBJ_RESULT_JSON: {"status":"ok", ...}
"""
import json
import math
import os
import sys

# ─── Constantes canônicas (cm) — coerentes com BarburhenTypes.h ──────────────
TERRAIN_SIZE = 50_000.0        # 500 m × 500 m
TERRAIN_THICKNESS = 400.0      # 4 m de espessura
RING_START_RADIUS = 25_000.0   # BarburhenWorldConfig.RingStartRadius
RING_CLOSE_SECONDS = 600.0     # RingCloseDurationSeconds (documentação no OBJ)

# Setores (frações da área — BarburhenTypes.h)
SECTOR_FRACTIONS = {
    "UrbanCommercial": "2/8",
    "Industrial": "3/8",
    "AbandonedPark": "3/8",
    "ExtractionStation": "extração",
}

# Malha base: caixa unitária (triângulos CCW vistos de fora).
_BOX_TRIS = [
    (0, 2, 1), (0, 3, 2),          # baixo (-Z)
    (4, 5, 6), (4, 6, 7),          # topo (+Z)
    (0, 1, 5), (0, 5, 4),          # face -Y
    (2, 3, 7), (2, 7, 6),          # face +Y
    (1, 2, 6), (1, 6, 5),          # face +X
    (3, 0, 4), (3, 4, 7),          # face -X
]


def box(cx, cy, cz, sx, sy, sz):
    """Vértices + triângulos de uma caixa (centro, meia-dimensões)."""
    x0, x1 = cx - sx, cx + sx
    y0, y1 = cy - sy, cy + sy
    z0, z1 = cz - sz, cz + sz
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    return verts, _BOX_TRIS


def cylinder(cx, cy, cz, radius, height, segments=12):
    """Cilindro de n segmentos (para torres/tanques determinísticos)."""
    verts = []
    for level in (cz - height, cz + height):
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            verts.append((cx + radius * math.cos(angle),
                          cy + radius * math.sin(angle),
                          level))
    top0 = len(verts) - segments  # anel superior
    bot0 = 0                      # anel inferior
    tris = []
    for i in range(segments):
        j = (i + 1) % segments
        tris.append((bot0 + i, bot0 + j, top0 + j))
        tris.append((bot0 + i, top0 + j, top0 + i))
    return verts, tris


# ─── Construção do mundo ─────────────────────────────────────────────────────

def build_objects():
    """Lista de (nome_do_grupo, vértices, triângulos) — DETERMINÍSTICA."""
    objects = []

    # Terreno (uma laje; setores são sobreposições de uso do solo)
    objects.append(("terrain_ground",
                    *box(0, 0, -TERRAIN_THICKNESS / 2,
                         TERRAIN_SIZE / 2, TERRAIN_SIZE / 2, TERRAIN_THICKNESS / 2)))

    # Paredes de borda (limite jogável 500 m × 500 m)
    wall_h, wall_t = 3_000.0, 200.0
    half = TERRAIN_SIZE / 2
    for name, (cx, cy, sx, sy) in {
        "border_wall_north": (0, half + wall_t / 2, half + wall_t, wall_t / 2),
        "border_wall_south": (0, -half - wall_t / 2, half + wall_t, wall_t / 2),
        "border_wall_east": (half + wall_t / 2, 0, wall_t / 2, half + wall_t),
        "border_wall_west": (-half - wall_t / 2, 0, wall_t / 2, half + wall_t),
    }.items():
        objects.append((name, *box(cx, cy, wall_h / 2, sx, sy, wall_h / 2)))

    # ── Parque Abandonado (centro, 3/8) — pavilhões e canteiros antigos ──────
    park_objects = [
        ("park_pavilion_a", box(-1_200, 900, 300, 900, 500, 300)),
        ("park_pavilion_b", box(1_100, -1_000, 260, 700, 700, 260)),
        ("park_colonnade", box(0, 1_800, 250, 2_200, 180, 250)),
        ("park_fountain_base", cylinder(0, 0, 60, 600, 120)),
        ("park_ring_marker", cylinder(0, 0, 30, RING_START_RADIUS, 60, segments=48)),
    ]
    for i, (name, (v, t)) in enumerate(park_objects):
        objects.append((name, v, t))
        del i
    # Canteiros do parque (4, simétricos)
    for idx, (px, py) in enumerate([(-2_400, -2_400), (2_400, -2_400),
                                    (-2_400, 2_400), (2_400, 2_400)]):
        objects.append((f"park_planter_{idx}",
                        *box(px, py, 100, 300, 300, 100)))

    # ── Urbano Comercial (NO e SE, 2/8) — quarteirões determinísticos ────────
    urban_blocks = {
        "urban_nw": (-14_000, 14_000),
        "urban_se": (14_000, -14_000),
    }
    for base_name, (bx, by) in urban_blocks.items():
        for row in range(3):
            for col in range(3):
                # Alturas escalonadas determinísticas (sem RNG): padrão 12/18/9 m
                heights = (1_200.0, 1_800.0, 900.0)
                h = heights[(row + col) % 3]
                cx = bx + col * 2_600
                cy = by + row * 2_600
                objects.append((f"{base_name}_block_r{row}c{col}",
                                *box(cx, cy, h / 2, 1_000, 1_000, h / 2)))

    # ── Industrial (NE e SO, 3/8 — desembarque) — galpões, tanques, esteiras ─
    industrial_zones = {
        "ind_ne": (14_000, 14_000),
        "ind_sw": (-14_000, -14_000),
    }
    for base_name, (bx, by) in industrial_zones.items():
        for w in range(3):  # galpões
            wx = bx + (w - 1) * 5_200
            objects.append((f"{base_name}_warehouse_{w}",
                            *box(wx, by, 800, 2_200, 1_400, 800)))
        for t in range(2):  # tanques
            tx = bx - 3_000 + t * 6_000
            ty = by + 3_800
            objects.append((f"{base_name}_tank_{t}",
                            *cylinder(tx, ty, 900, 1_100, 1_800)))
        objects.append((f"{base_name}_conveyor",
                        *box(bx, by - 3_800, 500, 4_000, 260, 100)))
        objects.append((f"{base_name}_chimney",
                        *cylinder(bx + 4_200, by + 3_600, 2_400, 350, 4_800)))

    # ── Estação de Extração (borda leste — desembarque do trem ZU) ───────────
    ex_x = 20_500
    objects.append(("extraction_platform",
                    *box(ex_x, 0, 150, 2_000, 8_000, 150)))
    objects.append(("extraction_rail_a",
                    *box(ex_x + 300, -6_000, 40, 120, 6_500, 40)))
    objects.append(("extraction_rail_b",
                    *box(ex_x + 900, -6_000, 40, 120, 6_500, 40)))
    objects.append(("extraction_crane_tower",
                    *cylinder(ex_x, 5_500, 2_500, 300, 5_000)))
    objects.append(("extraction_crane_arm",
                    *box(ex_x + 1_400, 5_500, 5_100, 2_800, 200, 150)))
    objects.append(("extraction_warehouse",
                    *box(ex_x, -5_000, 700, 1_800, 1_200, 700)))
    for idx in range(3):  # contêineres do pátio
        objects.append((f"extraction_container_{idx}",
                        *box(ex_x - 1_400, -2_000 + idx * 1_400, 260,
                             500, 600, 260)))

    # ── Marcações do anel (4 postes cardeais no raio inicial) ────────────────
    for name, (px, py) in {
        "ring_post_north": (0, RING_START_RADIUS),
        "ring_post_south": (0, -RING_START_RADIUS),
        "ring_post_east": (RING_START_RADIUS, 0),
        "ring_post_west": (-RING_START_RADIUS, 0),
    }.items():
        objects.append((name, *cylinder(px, py, 600, 120, 1_200)))

    return objects


# ─── Exportação OBJ ──────────────────────────────────────────────────────────

def write_obj(objects, path):
    """OBJ v1: grupos nomeados, v/f apenas (normais ficam a cargo da engine)."""
    lines = [
        "# Khaaos Run — Barburhen_Map.obj (W1/C1)",
        "# Unidade: 1 = 1 cm (convenção Unreal). Origem = centro do Parque Abandonado.",
        f"# Anel: raio inicial {RING_START_RADIUS:.0f} cm, fechamento {RING_CLOSE_SECONDS:.0f} s",
        f"# Setores (BarburhenTypes.h): " + ", ".join(
            f"{k}={v}" for k, v in SECTOR_FRACTIONS.items()),
        "# Determinístico: gerado por export_barburhen_obj.py (sem RNG).",
    ]
    vertex_offset = 1
    for name, verts, tris in objects:
        lines.append(f"g {name}")
        lines.append(f"o {name}")
        for (x, y, z) in verts:
            lines.append(f"v {x:.2f} {y:.2f} {z:.2f}")
        for (a, b, c) in tris:
            lines.append(f"f {vertex_offset + a} {vertex_offset + b} {vertex_offset + c}")
        vertex_offset += len(verts)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return vertex_offset - 1


def main():
    result = {"script": "export_barburhen_obj.py"}
    try:
        objects = build_objects()
        out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
            "mvp_output", "assets", "worlds", "Barburhen_Map.obj")
        total_verts = write_obj(objects, out)
        tri_total = sum(len(t) for _, _, t in objects)
        result.update({
            "status": "ok",
            "obj": os.path.abspath(out),
            "objects": len(objects),
            "vertices": total_verts,
            "triangles": tri_total,
        })
    except Exception as exc:  # noqa: BLE001 — contrato único de falha
        result.update({"status": "failed", "reason": str(exc)})
    print("KHR_BARBURHEN_OBJ_RESULT_JSON: " + json.dumps(result))
    return 0 if result["status"] == "ok" else 1


# ─── Selftest (sem engine, CI-friendly) ──────────────────────────────────────

def selftest():
    """Asserções determinísticas sobre o layout exportado."""
    objects = build_objects()
    names = [n for n, _, _ in objects]
    counts = {}
    for name, verts, tris in objects:
        counts[name] = counts.get(name, 0) + 1
        # caixa: 8 vértices / 12 triângulos; cilindro 12 seg: 24/24; 48 seg: 96/96
        assert len(verts) > 0 and len(tris) > 0, f"{name} vazio"
        for tri in tris:
            assert len(tri) == 3, f"{name}: triângulo sem 3 índices"
            assert all(0 <= i < len(verts) for i in tri), f"{name}: índice fora de faixa"

    # Setores canônicos presentes
    for required in ["terrain_ground", "park_ring_marker", "park_pavilion_a",
                     "urban_nw_block_r0c0", "urban_se_block_r2c2",
                     "ind_ne_warehouse_0", "ind_sw_chimney",
                     "extraction_platform", "extraction_rail_a",
                     "border_wall_north", "ring_post_east"]:
        assert counts.get(required, 0) == 1, f"objeto ausente: {required}"

    # Sem duplicidade de nomes (grupos são a chave do collider baking)
    assert len(names) == len(set(names)), "grupos duplicados no OBJ"

    # Determinismo: duas execuções produzem bytes idênticos
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        p1 = os.path.join(tmp, "a.obj")
        p2 = os.path.join(tmp, "b.obj")
        write_obj(objects, p1)
        write_obj(objects, p2)
        with open(p1, "rb") as f1, open(p2, "rb") as f2:
            assert f1.read() == f2.read(), "exportação não determinística"

    # Escala: marcador do anel no raio canônico (25 m de gasoduto… 250 m)
    marker = dict((n, (v, t)) for n, v, t in objects)["park_ring_marker"]
    max_xy = max(math.hypot(v[0], v[1]) for v in marker[0])
    assert abs(max_xy - RING_START_RADIUS) < 1.0, \
        f"marcador do anel fora do raio canônico: {max_xy}"

    print("BARBURHEN_OBJ_SELFTEST_OK")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    sys.exit(main())
