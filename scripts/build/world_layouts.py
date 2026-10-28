#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Layouts determinísticos dos mundos 2-5 (engine-less).

Fonte canônica dos metadados: ``shared/worlds.ts`` (bioma, sizeMeters,
POIs, hazard) e ``scripts/build/generate_worlds.py`` (POIs do CIGKV).
W1/Barburhen NÃO vive aqui — tem exportador próprio (export_barburhen_obj.py)
com OBJ OFICIAL no pacote Content/Barburhen. Este módulo cobre:

  W2 Priadus   — ilhas tropicais/offshore, hazard TSUNAMI_WAVE      (3500 m)
  W3 Ckesalth  — cordilheira vulcânica, hazard VOLCANIC_LAVA        (4000 m)
  W4 Arukheea  — fragmentos flutuantes, hazard KHAOS_GRAVITY        (4500 m)
  CIGKV        — simulação tática modular/domos, SAFE_TRAINING      (120 m blockout)

Convenções (herdadas do exportador Barburhen):
  - Unidade: 1 = 1 cm (convenção UE); W2-W4 usam blockout 500 m × 500 m;
    CIGKV usa 120 m × 120 m (mapa BR do generate_worlds.py, POIs em cm).
  - SEM RNG: mesmas coordenadas em toda execução (byte a byte).
  - Primitivas reutilizadas de export_barburhen_obj (box/cylinder).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_barburhen_obj import box, cylinder  # noqa: E402  (primitivas canônicas)

# ─── Constantes comuns (cm) ──────────────────────────────────────────────────
BLOCKOUT_SIZE = 50_000.0        # W2-W4: 500 m × 500 m (mesma convenção do W1)
BLOCKOUT_WALL_H = 3_000.0
BLOCKOUT_WALL_T = 200.0
CIGKV_SIZE = 12_000.0           # CIGKV: 120 m × 120 m (blockout do mapa BR)
CIGKV_WALL_H = 1_500.0
CIGKV_WALL_T = 150.0
CIGKV_THICKNESS = 400.0
RING_POST_H = 1_200.0
RING_POST_R = 120.0

# Raio inicial do anel por mundo (cm) — coerente com a 1ª fase de zona.
RING_START_CM = {
    "Priadus": 25_000.0,
    "Ckesalth": 25_000.0,
    "Arukheea": 25_000.0,
    "CIGKV": 5_500.0,           # 55 m num blockout de 120 m
}


def _border_walls(prefix, size, wall_h, wall_t):
    half = size / 2
    walls = {
        f"{prefix}_wall_north": (0, half + wall_t / 2, half + wall_t, wall_t / 2),
        f"{prefix}_wall_south": (0, -half - wall_t / 2, half + wall_t, wall_t / 2),
        f"{prefix}_wall_east": (half + wall_t / 2, 0, wall_t / 2, half + wall_t),
        f"{prefix}_wall_west": (-half - wall_t / 2, 0, wall_t / 2, half + wall_t),
    }
    return [(name, *box(cx, cy, wall_h / 2, sx, sy, wall_h / 2))
            for name, (cx, cy, sx, sy) in walls.items()]


def _ring_posts(radius_cm, count=4):
    posts = []
    for i in range(count):
        angle = 2.0 * math.pi * i / count
        px = radius_cm * math.cos(angle)
        py = radius_cm * math.sin(angle)
        posts.append((f"ring_post_{i:02d}", *cylinder(px, py, RING_POST_H / 2,
                                                      RING_POST_R, RING_POST_H)))
    return posts


def _ring_marker(radius_cm, segments=48):
    return [("ring_marker", *cylinder(0, 0, 30, radius_cm, 60, segments=segments))]


# ─── W2 Priadus — Ilhas Tropicais Submersíveis e Plataformas Offshore ────────

def build_priadus():
    """POIs (shared/worlds.ts): Central Atoll, North Lighthouse, East Coral
    Lab, West Shipwreck. Counterplay do tsunami: plataformas elevadas."""
    objects = [("terrain_ground",
                *box(0, 0, -200.0, BLOCKOUT_SIZE / 2, BLOCKOUT_SIZE / 2, 200.0))]
    objects += _border_walls("priadus", BLOCKOUT_SIZE, BLOCKOUT_WALL_H, BLOCKOUT_WALL_T)

    # Central Atoll (0,0): anel de recife + torre central do atoll
    objects.append(("atoll_tower", *cylinder(0, 0, 1_500, 500, 3_000)))
    objects.append(("atoll_deck", *box(0, 0, 120, 2_400, 2_400, 120)))
    for i in range(6):  # recife circular (determinístico)
        angle = 2.0 * math.pi * i / 6
        px, py = 3_400 * math.cos(angle), 3_400 * math.sin(angle)
        objects.append((f"atoll_reef_{i:02d}",
                        *cylinder(px, py, 80, 700, 160, segments=10)))
    # Plataformas de fuga do tsunami (elevadas — counterplay canônico)
    for i, (px, py) in enumerate([(0, 6_200), (6_200, 0), (0, -6_200), (-6_200, 0)]):
        objects.append((f"tsunami_refuge_{i:02d}",
                        *box(px, py, 1_200, 1_000, 1_000, 1_200)))
        objects.append((f"tsunami_refuge_pylon_{i:02d}",
                        *cylinder(px, py, 600, 260, 1_200)))

    # North Lighthouse (0, +16_000): farol alto + galeria + doca
    lx, ly = 0.0, 16_000.0
    objects.append(("lighthouse_tower", *cylinder(lx, ly, 4_500, 420, 9_000)))
    objects.append(("lighthouse_gallery", *cylinder(lx, ly, 9_200, 620, 400)))
    objects.append(("lighthouse_dock", *box(lx, ly - 1_600, 90, 900, 2_600, 90)))
    for i in range(3):  # quebra-mar em segmentos
        objects.append((f"lighthouse_breakwater_{i:02d}",
                        *box(lx - 2_800 + i * 2_800, ly + 2_600, 140, 1_400, 220, 140)))

    # East Coral Lab (+16_000, 0): domos de pesquisa + túneis de acesso
    ex, ey = 16_000.0, 0.0
    objects.append(("coral_lab_dome_main", *cylinder(ex, ey, 400, 1_100, 800, segments=10)))
    for i in range(2):
        objects.append((f"coral_lab_dome_{i:02d}",
                        *cylinder(ex + 1_700, ey - 1_400 + i * 2_800, 320,
                                  620, 640, segments=10)))
    objects.append(("coral_lab_walkway", *box(ex - 2_600, ey, 120, 3_000, 220, 120)))
    objects.append(("coral_lab_research_pier", *box(ex + 2_800, ey + 2_600, 90,
                                                    2_000, 500, 90)))

    # West Shipwreck (−16_000, 0): casco em 3 níveis + mastros
    wx, wy = -16_000.0, 0.0
    for i, (dx, h) in enumerate([(-1_800, 900), (0, 1_400), (1_800, 700)]):
        objects.append((f"shipwreck_hull_{i:02d}",
                        *box(wx + dx, wy, h / 2, 1_600, 700, h / 2)))
    for i, mx in enumerate((wx - 900, wx + 900)):
        objects.append((f"shipwreck_mast_{i:02d}", *cylinder(mx, wy, 1_800, 120, 3_600)))
    objects.append(("shipwreck_deck_slab", *box(wx, wy + 1_400, 1_200, 4_600, 500, 120)))

    # Plataformas offshore (4 quadrantes — desembarque/loot)
    for i, (px, py) in enumerate([(9_500, 9_500), (-9_500, 9_500),
                                  (9_500, -9_500), (-9_500, -9_500)]):
        objects.append((f"offshore_platform_{i:02d}",
                        *box(px, py, 900, 1_800, 1_800, 120)))
        for p in range(4):  # pernas da plataforma
            ax = px + (-700 if p % 2 == 0 else 700)
            ay = py + (-700 if p < 2 else 700)
            objects.append((f"offshore_pylon_{i:02d}_{p:02d}",
                            *cylinder(ax, ay, 450, 160, 900)))
    objects += _ring_marker(RING_START_CM["Priadus"])
    objects += _ring_posts(RING_START_CM["Priadus"])
    return objects


# ─── W3 Ckesalth — Cordilheira Vulcânica Ativa e Usinas de Obsidiana ─────────

def build_ckesalth():
    """POIs: Volcano Core, North Forge, East Obsidian Temple, West Lava Tube."""
    objects = [("terrain_ground",
                *box(0, 0, -200.0, BLOCKOUT_SIZE / 2, BLOCKOUT_SIZE / 2, 200.0))]
    objects += _border_walls("ckesalth", BLOCKOUT_SIZE, BLOCKOUT_WALL_H, BLOCKOUT_WALL_T)

    # Volcano Core (0,0): cone + borda da cratera + caldeira de KRC
    objects.append(("volcano_cone", *cylinder(0, 0, 1_500, 2_600, 3_000, segments=16)))
    objects.append(("volcano_crater_rim", *cylinder(0, 0, 3_050, 1_400, 100, segments=16)))
    objects.append(("volcano_crucible", *cylinder(0, 0, 2_400, 700, 300, segments=12)))
    for i in range(4):  # escoadouros de lava determinísticos (cardeais)
        angle = 2.0 * math.pi * i / 4
        px, py = 4_400 * math.cos(angle), 4_400 * math.sin(angle)
        objects.append((f"volcano_lava_flow_{i:02d}",
                        *box(px, py, 90, 1_600, 500, 90)))

    # North Forge (0, +16_000): galpões + chaminé + cadinho + esteiras
    fx, fy = 0.0, 16_000.0
    for i in range(3):
        objects.append((f"forge_hall_{i:02d}",
                        *box(fx + (i - 1) * 3_400, fy, 700, 2_400, 1_500, 700)))
    objects.append(("forge_chimney", *cylinder(fx + 3_400, fy + 2_600, 2_100, 320, 4_200)))
    objects.append(("forge_crucible", *cylinder(fx - 2_600, fy - 2_200, 500, 520, 1_000)))
    objects.append(("forge_conveyor", *box(fx, fy - 3_400, 420, 3_600, 240, 90)))
    for i in range(3):  # blocos de obsidiana brutos
        objects.append((f"forge_obsidian_stock_{i:02d}",
                        *box(fx - 1_000 + i * 1_000, fy + 3_200, 260, 500, 500, 260)))

    # East Obsidian Temple (+16_000, 0): pirâmide escalonada + obeliscos
    tx, ty = 16_000.0, 0.0
    for level, (half_w, z) in enumerate([(1_400, 150), (1_000, 450), (600, 700)]):
        objects.append((f"obsidian_temple_step_{level}",
                        *box(tx, ty, z, half_w, half_w, 150)))
    for i in range(4):  # obeliscos nos cantos
        angle = 2.0 * math.pi * i / 4 + math.pi / 4
        px, py = tx + 2_200 * math.cos(angle), ty + 2_200 * math.sin(angle)
        objects.append((f"obsidian_temple_obelisk_{i:02d}",
                        *cylinder(px, py, 900, 140, 1_800, segments=6)))

    # West Lava Tube (−16_000, 0): túnel em segmentos + poços de gêiser
    vx, vy = -16_000.0, 0.0
    for i in range(5):
        objects.append((f"lava_tube_segment_{i:02d}",
                        *box(vx + (i - 2) * 2_200, vy, 420, 2_000, 1_100, 420)))
    for i, (gx, gy) in enumerate([(vx - 4_400, vy + 3_000), (vx + 4_400, vy + 3_000),
                                  (vx, vy - 4_200)]):
        objects.append((f"lava_geyser_{i:02d}",
                        *cylinder(gx, gy, 180, 340, 360, segments=8)))

    # Campo de espinhos de obsidiana (grade determinística 5×3)
    for row in range(3):
        for col in range(5):
            sx = -8_000 + col * 4_000
            sy = -11_000 + row * 4_000
            h = 900.0 + ((row * 5 + col) % 3) * 300.0  # 9/12/15 m sem RNG
            objects.append((f"obsidian_spike_r{row}c{col}",
                            *cylinder(sx, sy, h / 2, 160, h, segments=6)))
    objects += _ring_marker(RING_START_CM["Ckesalth"])
    objects += _ring_posts(RING_START_CM["Ckesalth"])
    return objects


# ─── W4 Arukheea — Fragmentos Flutuantes no Vazio e Cidadelas Astrais ────────

def build_arukheea():
    """POIs: Nexus of Khaaos, North Astral Spire, East Void Sanctum,
    West Quantum Array. Colisão de fragmentos FLUTUANTES (AABBs no ar)."""
    objects = [("void_ground",
                *box(0, 0, -6_000.0, BLOCKOUT_SIZE / 2, BLOCKOUT_SIZE / 2, 200.0))]
    objects += _border_walls("arukheea", BLOCKOUT_SIZE, BLOCKOUT_WALL_H, BLOCKOUT_WALL_T)

    # Nexus of Khaaos (0,0): plataforma orbital + obeliscos orbitais
    objects.append(("nexus_platform", *box(0, 0, 2_400, 3_000, 3_000, 150)))
    for i in range(6):
        angle = 2.0 * math.pi * i / 6
        px, py = 3_800 * math.cos(angle), 3_800 * math.sin(angle)
        objects.append((f"nexus_obelisk_{i:02d}",
                        *cylinder(px, py, 2_400 + 700, 200, 1_400, segments=6)))
        objects.append((f"nexus_anchor_{i:02d}",
                        *cylinder(px, py, 1_200, 160, 200)))  # âncora de realidade
    objects.append(("nexus_core", *cylinder(0, 0, 3_200, 500, 700, segments=8)))

    # North Astral Spire (0, +16_000): agulha altíssima + degraus flutuantes
    sx, sy = 0.0, 16_000.0
    objects.append(("astral_spire", *cylinder(sx, sy, 5_400, 380, 10_800, segments=8)))
    for i in range(4):  # fragmentos de subida em espiral determinística
        angle = math.pi / 2 + i * math.pi / 4
        px, py = sx + 1_600 * math.cos(angle), sy + 1_600 * math.sin(angle)
        objects.append((f"spire_step_{i:02d}",
                        *box(px, py, 1_200 + i * 900, 700, 700, 100)))
    objects.append(("spire_crown", *cylinder(sx, sy, 11_100, 520, 400, segments=8)))

    # East Void Sanctum (+16_000, 0): cubos flutuantes em clusters
    ex, ey = 16_000.0, 0.0
    for i, (dx, dy, z) in enumerate([(0, 0, 2_600), (2_200, 800, 3_400),
                                     (-2_200, 800, 3_400), (0, 1_800, 4_200)]):
        objects.append((f"void_sanctum_cube_{i:02d}",
                        *box(ex + dx, ey + dy, z, 800, 800, 300)))
    objects.append(("void_sanctum_bridge", *box(ex - 2_600, ey, 2_600, 2_800, 220, 90)))
    objects.append(("void_sanctum_altar", *cylinder(ex, ey - 2_400, 2_480, 420, 160)))

    # West Quantum Array (−16_000, 0): antenas em fileira + câmara de carga
    qx, qy = -16_000.0, 0.0
    for i in range(5):
        objects.append((f"quantum_mast_{i:02d}",
                        *cylinder(qx + (i - 2) * 1_800, qy, 2_100, 110, 4_200, segments=6)))
        objects.append((f"quantum_dish_{i:02d}",
                        *box(qx + (i - 2) * 1_800, qy + 400, 4_300, 500, 500, 80)))
    objects.append(("quantum_chamber", *box(qx, qy - 3_200, 700, 2_000, 1_200, 700)))

    # Fragmentos flutuantes de travessia (grade 4×3, alturas alternadas)
    for row in range(3):
        for col in range(4):
            fx = -9_000 + col * 6_000
            fy = -9_000 + row * 9_000
            z = 1_800.0 + ((row + col) % 3) * 700.0
            objects.append((f"void_fragment_r{row}c{col}",
                            *box(fx, fy, z, 900, 700, 110)))
    objects += _ring_marker(RING_START_CM["Arukheea"])
    objects += _ring_posts(RING_START_CM["Arukheea"])
    return objects


# ─── CIGKV — Simulação Tática Modular e Domos de Treinamento (120 m) ─────────

CIGKV_POIS = [  # generate_worlds.py — 8 pontos determinísticos
    ("AruKheea", (-3_500, -3_500)), ("Barburhen", (0, -4_000)),
    ("Ckesalth", (3_500, -3_500)), ("Priadus", (-4_000, 0)),
    ("Zentrum", (0, 0)),         ("Cigarra", (4_000, 0)),
    ("VaalNor", (-3_500, 3_500)), ("Iguassu", (3_500, 3_500)),
]


def build_cigkv():
    """Mapa BR do CIGKV (blockout 120 m): 8 POIs modulares, domos, anel 55 m."""
    objects = [("terrain_ground",
                *box(0, 0, -CIGKV_THICKNESS / 2, CIGKV_SIZE / 2, CIGKV_SIZE / 2,
                     CIGKV_THICKNESS / 2))]
    objects += _border_walls("cigkv", CIGKV_SIZE, CIGKV_WALL_H, CIGKV_WALL_T)

    # Zentrum (0,0): torre de comando em níveis + praça
    objects.append(("zentrum_tower_base", *box(0, 0, 150, 900, 900, 150)))
    objects.append(("zentrum_tower_mid", *box(0, 0, 500, 600, 600, 400)))
    objects.append(("zentrum_tower_top", *cylinder(0, 0, 1_100, 300, 400, segments=8)))
    objects.append(("zentrum_plaza", *box(0, 0, 40, 2_200, 2_200, 40)))

    # 7 POIs satélites: compound modular determinístico (rotação por índice)
    for idx, (name, (px, py)) in enumerate(CIGKV_POIS):
        if name == "Zentrum":
            continue
        # módulos: padrão 3+1 rotacionado pelo índice (sem RNG)
        for m in range(3):
            angle = 2.0 * math.pi * m / 3 + idx * math.pi / 8
            mx = px + 700 * math.cos(angle)
            my = py + 700 * math.sin(angle)
            h = 600.0 + ((idx + m) % 3) * 200.0
            objects.append((f"poi_{name.lower()}_module_{m:02d}",
                            *box(mx, my, h / 2, 420, 420, h / 2)))
        objects.append((f"poi_{name.lower()}_dome",
                        *cylinder(px, py, 200, 500, 400, segments=8)))
        objects.append((f"poi_{name.lower()}_perimeter_{idx:02d}",
                        *box(px, py, 90, 2_000, 120, 90)))

    # Domos de treinamento blindados (4 cardeais médios)
    for i, (dx, dy) in enumerate([(0, 2_000), (2_000, 0), (0, -2_000), (-2_000, 0)]):
        objects.append((f"training_dome_{i:02d}",
                        *cylinder(dx, dy, 260, 620, 520, segments=10)))

    # Barreiras de combate urbano (grade 5×5 entre os POIs)
    for row in range(5):
        for col in range(5):
            if row == 2 and col == 2:
                continue  # Zentrum
            bx = -4_800 + col * 2_400
            by = -4_800 + row * 2_400
            objects.append((f"cq_barrier_r{row}c{col}",
                            *box(bx, by, 150, 500, 120, 150)))
    objects += _ring_marker(RING_START_CM["CIGKV"])
    objects += _ring_posts(RING_START_CM["CIGKV"])
    return objects


# ─── Registro dos mundos ─────────────────────────────────────────────────────

WORLD_BUILDERS = {
    "Priadus": build_priadus,
    "Ckesalth": build_ckesalth,
    "Arukheea": build_arukheea,
    "CIGKV": build_cigkv,
}

WORLD_META = {
    # world: (bioma, sizeMeters lógico, hazard, destino UE5)
    "Priadus": ("Ilhas Tropicais Submersíveis, Recifes Bioluminescentes e "
                "Plataformas Offshore", 3500, "TSUNAMI_WAVE",
                "/Game/Worlds/Priadus/Priadus_Map"),
    "Ckesalth": ("Cordilheira Vulcânica Ativa, Rios de Magma e Usinas de "
                 "Obsidiana", 4000, "VOLCANIC_LAVA",
                 "/Game/Worlds/Ckesalth/Ckesalth_Map"),
    "Arukheea": ("Fragmentos Flutuantes no Vazio, Anomalias Gravitacionais e "
                 "Cidadelas Astrais", 4500, "KHAOS_GRAVITY",
                 "/Game/Worlds/Arukheea/Arukheea_Map"),
    "CIGKV": ("Simulação Tática Modular & Domos de Treinamento", 2000,
              "SAFE_TRAINING", "/Game/Maps/CIGKV_BR"),
}


def terrain_size_cm(world):
    return CIGKV_SIZE if world == "CIGKV" else BLOCKOUT_SIZE


def validate_layout(world, objects):
    """Invariante geométrico: tudo dentro do terreno; malhas não vazias."""
    size = terrain_size_cm(world)
    for name, verts, tris in objects:
        if not verts or not tris:
            raise ValueError(f"{world}: objeto {name} sem vértices/triângulos")
        for (x, y, _z) in verts:
            # paredes de borda excedem half em `wall_t` — tolerância de 2 m
            if abs(x) > size / 2 + 200.0 or abs(y) > size / 2 + 200.0:
                raise ValueError(f"{world}: objeto {name} fora do terreno "
                                 f"({x:.0f}, {y:.0f} > {size / 2:.0f})")
    return True
