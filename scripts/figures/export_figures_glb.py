#!/usr/bin/env python3
"""Exporta as 6 figuras de alistamento como malhas GLB (glTF 2.0 binário).

Cada figura recebe um manequim low-poly em A-pose (padrão de captura/retopo),
com cores por vértice derivadas da ficha da figura (shared/figures.ts):
pele, traje tático e detalhes. Unidade: metros (convenção glTF; no UE5 o
importador converte para cm). Malha é placeholder de rig — substituível por
scan/retopo real sem trocar nomes de asset.

Saída: client/public/figures/glb/FIG_<id>.glb + figures_glb_manifest.json
"""
import json
import hashlib
import math
import os
import struct

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO, "client/public/figures/glb")

# Ficha das figuras (espelha shared/figures.ts) + parâmetros de malha
FIGURES = [
    dict(id="kane", name="Idris Kane", sex="m", age=31,
         skin=(0.45, 0.30, 0.19), suit=(0.16, 0.18, 0.22), accent=(0.85, 0.55, 0.10),
         height=1.82, shoulder=0.52, hip=0.34, note="Afro-brasileiro"),
    dict(id="puri", name="Yara Puri", sex="f", age=27,
         skin=(0.52, 0.35, 0.22), suit=(0.13, 0.30, 0.24), accent=(0.20, 0.75, 0.70),
         height=1.70, shoulder=0.42, hip=0.38, note="Indígena amazônica"),
    dict(id="voss", name="Leandro Voss", sex="m", age=34,
         skin=(0.62, 0.48, 0.34), suit=(0.25, 0.28, 0.32), accent=(0.75, 0.45, 0.25),
         height=1.80, shoulder=0.51, hip=0.34, note="Levantina"),
    dict(id="okada", name="Mei Okada", sex="f", age=26,
         skin=(0.78, 0.62, 0.48), suit=(0.18, 0.20, 0.45), accent=(0.85, 0.25, 0.55),
         height=1.68, shoulder=0.41, hip=0.37, note="Nikkei"),
    dict(id="hald", name="Soren Hald", sex="m", age=29,
         skin=(0.85, 0.68, 0.55), suit=(0.55, 0.60, 0.65), accent=(0.20, 0.70, 0.85),
         height=1.79, shoulder=0.50, hip=0.33, note="Norte-europeia"),
    dict(id="okonkwo", name="Nia Okonkwo", sex="f", age=33,
         skin=(0.38, 0.24, 0.15), suit=(0.14, 0.14, 0.16), accent=(0.70, 0.40, 0.85),
         height=1.72, shoulder=0.42, hip=0.39, note="África Ocidental"),
]


# ---------- primitivas ----------
def column(p0, length, direction, section0, section1, color):
    """Coluna com seção retangular (largura XZ) de p0 na direção unitária `direction`.

    section0/section1 = (largura_x, profundidade_z) na base e no topo.
    Usada para pernas (reta para baixo), tronco e braços (A-pose, inclinados).
    """
    dx, dy, dz = direction
    ln = math.sqrt(dx * dx + dy * dy + dz * dz)
    dx, dy, dz = dx / ln, dy / ln, dz / ln
    # u = eixo lateral (perpendicular a direction no plano XZ/XY), v = z-up
    if abs(dy) > 0.9:  # coluna vertical: lateral = X
        ux, uy, uz = 1.0, 0.0, 0.0
    else:
        ux, uy, uz = -dy, dx, 0.0
        ln2 = math.sqrt(ux * ux + uy * uy) or 1.0
        ux, uy = ux / ln2, uy / ln2
    vx, vy, vz = 0.0, 0.0, 1.0
    cx0, cy0, cz0 = p0
    ax0, az0 = section0[0] / 2, section0[1] / 2
    ax1, az1 = section1[0] / 2, section1[1] / 2
    corners = []
    for t, (ax, az) in ((0, (ax0, az0)), (length, (ax1, az1))):
        bx, by, bz = cx0 + dx * t, cy0 + dy * t, cz0 + dz * t
        corners.append([
            (bx - ux * ax, by - uy * ax, bz - az),
            (bx + ux * ax, by + uy * ax, bz - az),
            (bx - ux * ax, by - uy * ax, bz + az),
            (bx + ux * ax, by + uy * ax, bz + az),
        ])
    verts = corners[0] + corners[1]
    quads = [(0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5), (0, 2, 3, 1), (4, 5, 7, 6)]
    faces = []
    for a, b, c, d in quads:
        faces += [(a, b, c), (a, c, d)]
    return verts, faces, color


def hexahedron(cx, cy, cz, wx0, wy0, wx1, wy1, h, color, tilt_rad=0.0, axis="x"):
    """Compat: coluna vertical em (cx,cy,cz) com seção (wx,wy) e altura h ao longo de Y."""
    return column((cx, cy, cz), h, (0.0, 1.0, 0.0), (wx0, wy0), (wx1, wy1), color)


def icosphere(cx, cy, cz, r, color, subdiv=1):
    """Icosfera por subdivisão de icosaedro (subdiv 1 → 42 verts / 80 faces)."""
    t = (1 + 5 ** 0.5) / 2
    base = [
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    ]
    verts = [(x / math.sqrt(x * x + y * y + z * z),
              y / math.sqrt(x * x + y * y + z * z),
              z / math.sqrt(x * x + y * y + z * z)) for x, y, z in base]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
             (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
             (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
             (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(subdiv):
        cache, new_faces = {}, []
        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key in cache:
                return cache[key]
            va, vb = verts[a], verts[b]
            m = tuple((va[i] + vb[i]) / 2 for i in range(3))
            n = math.sqrt(sum(c * c for c in m))
            cache[key] = len(verts)
            verts.append((m[0] / n, m[1] / n, m[2] / n))
            return cache[key]
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    out_v = [(cx + x * r, cy + y * r, cz + z * r) for x, y, z in verts]
    return out_v, faces, color


class MeshBuilder:
    def __init__(self):
        self.pos, self.nrm, self.col, self.idx = [], [], [], []

    def add(self, verts, faces, color):
        base = len(self.pos)
        self.pos += verts
        self.col += [color] * len(verts)
        for a, b, c in faces:
            self.idx += [base + a, base + b, base + c]

    def build(self):
        # normais suavizadas por vértice (média das faces adjacentes)
        normals = [[0.0, 0.0, 0.0] for _ in self.pos]
        for i in range(0, len(self.idx), 3):
            a, b, c = (self.idx[i], self.idx[i + 1], self.idx[i + 2])
            pa, pb, pc = self.pos[a], self.pos[b], self.pos[c]
            u = [pb[k] - pa[k] for k in range(3)]
            v = [pc[k] - pa[k] for k in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            ln = math.sqrt(sum(x * x for x in n)) or 1.0
            n = [x / ln for x in n]
            for k in (a, b, c):
                normals[k] = [normals[k][j] + n[j] for j in range(3)]
        normals = [tuple((lambda l: [x / (math.sqrt(sum(y * y for y in l)) or 1.0) for x in l])(nr)) for nr in normals]
        return self.pos, normals, self.col, self.idx


def build_mannequin(f):
    """Manequim A-pose: pernas, pelve, tronco, braços, pescoço, cabeça, mãos, pés.

    Proporções: pernas 0.47h + tronco 0.30h + pescoço 0.05h + cabeça ~0.18h ≈ h.
    """
    mb = MeshBuilder()
    h = f["height"]
    leg_h = h * 0.47
    torso_h = h * 0.30
    head_r = h * 0.09
    hip_y = leg_h
    suit, skin, accent = f["suit"], f["skin"], f["accent"]
    boot = tuple(c * 0.55 for c in suit)
    hand = tuple(min(1, c * 1.05) for c in skin)
    s = f["sex"]
    sh_w = f["shoulder"]
    hip_w = f["hip"]

    # pernas (coxa + canela), leve abertura; seção (largura_x, profundidade_z)
    for side in (-1, 1):
        off = side * hip_w * 0.24
        mb.add(*column((off, 0, 0), leg_h * 0.52, (0, 1, 0),
                       (hip_w * 0.42, hip_w * 0.40), (hip_w * 0.30, hip_w * 0.28), suit))
        mb.add(*column((off, leg_h * 0.52, 0), leg_h * 0.48, (0, 1, 0),
                       (hip_w * 0.30, hip_w * 0.28), (hip_w * 0.22, hip_w * 0.20), suit))
        # pé (avança para frente: direção levemente +z)
        mb.add(*column((off, 0.005, -0.02), 0.09, (0, 1, 0),
                       (hip_w * 0.24, 0.30), (hip_w * 0.26, 0.32), boot))

    # pelve
    mb.add(*column((0, hip_y - 0.02, 0), 0.14, (0, 1, 0),
                   (hip_w * 1.05, 0.26), (hip_w * 0.95, 0.24), boot))
    # tronco (afunila para ombros)
    top_w = sh_w if s == "m" else sh_w * 0.94
    waist = (hip_w * 0.95) if s == "m" else (hip_w * 1.02)
    shoulder_y = hip_y + torso_h
    mb.add(*column((0, hip_y + 0.10, 0), torso_h - 0.10, (0, 1, 0),
                   (waist, 0.24), (top_w, 0.22), suit))
    # colete/acento (placa frontal fina)
    mb.add(*column((0, hip_y + torso_h * 0.45, 0.125), torso_h * 0.5, (0, 1, 0),
                   (top_w * 0.62, 0.05), (top_w * 0.5, 0.04), accent))

    # braços em A-pose (20° de abertura a partir do ombro)
    arm_len = h * 0.21
    fore_len = h * 0.20
    theta = math.radians(20)
    for side in (-1, 1):
        sx = side * (top_w / 2 + 0.02)
        d = (side * math.sin(theta), -math.cos(theta), 0.0)
        shoulder = (sx, shoulder_y - 0.03, 0.0)
        elbow = (shoulder[0] + d[0] * arm_len, shoulder[1] + d[1] * arm_len, 0.0)
        wrist = (elbow[0] + d[0] * fore_len, elbow[1] + d[1] * fore_len, 0.0)
        mb.add(*column(shoulder, arm_len, d, (0.13, 0.13), (0.10, 0.10), suit))
        mb.add(*column(elbow, fore_len, d, (0.10, 0.10), (0.075, 0.075), suit))
        # mão na ponta
        mb.add(*icosphere(wrist[0] + d[0] * 0.045, wrist[1] + d[1] * 0.045, 0,
                          0.045, hand, 1))

    # pescoço + cabeça + cabelo
    neck_y = shoulder_y
    mb.add(*column((0, neck_y - 0.02, 0), 0.07, (0, 1, 0), (0.11, 0.11), (0.09, 0.09), skin))
    head_cy = neck_y + 0.05 + head_r * 0.9
    mb.add(*icosphere(0, head_cy, 0, head_r, skin, 1))
    hair = tuple(c * 0.25 for c in skin)
    mb.add(*icosphere(0, head_cy + head_r * 0.22, -0.008, head_r * 0.95, hair, 1))

    return mb.build()


# ---------- writer GLB ----------
def write_glb(path, pos, nrm, col, idx, name):
    pos_f = [v for p in pos for v in p]
    nrm_f = [v for n in nrm for v in n]
    col_f = [v for c in col for v in (c[0], c[1], c[2], 1.0)]
    idx_u32 = list(idx)
    bin_parts = [
        struct.pack(f"<{len(pos_f)}f", *pos_f),
        struct.pack(f"<{len(nrm_f)}f", *nrm_f),
        struct.pack(f"<{len(col_f)}f", *col_f),
        struct.pack(f"<{len(idx_u32)}I", *idx_u32),
    ]
    offsets, total = [], 0
    for part in bin_parts:
        offsets.append(total)
        total += len(part)
    pad = (4 - total % 4) % 4
    bin_data = b"".join(bin_parts) + b"\x00" * pad
    bv = lambda off, ln: dict(buffer=0, byteOffset=off, byteLength=ln)
    gltf = {
        "asset": {"version": "2.0",
                  "generator": "Khaaos Run figures_glb_export (placeholder de alistamento)"},
        "scene": 0,
        "scenes": [{"nodes": [0], "name": f"FIG_{name}"}],
        "nodes": [{"mesh": 0, "name": f"FIG_{name}", "translation": [0, 0, 0]}],
        "meshes": [{"name": f"FIG_{name}", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "materials": [{
            "name": "M_KhaaosFigure", "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.05, "roughnessFactor": 0.8}}],
        "bufferViews": [
            {**bv(offsets[0], len(bin_parts[0])), "target": 34962},
            {**bv(offsets[1], len(bin_parts[1])), "target": 34962},
            {**bv(offsets[2], len(bin_parts[2])), "target": 34962},
            {**bv(offsets[3], len(bin_parts[3])), "target": 34963},
        ],
        "accessors": [
            dict(bufferView=0, componentType=5126, count=len(pos), type="VEC3",
                 min=[round(min(p[i] for p in pos), 6) for i in range(3)],
                 max=[round(max(p[i] for p in pos), 6) for i in range(3)]),
            dict(bufferView=1, componentType=5126, count=len(nrm), type="VEC3"),
            dict(bufferView=2, componentType=5126, count=len(col), type="VEC4"),
            dict(bufferView=3, componentType=5125, count=len(idx), type="SCALAR"),
        ],
        "buffers": [{"byteLength": len(bin_data)}],
    }
    json_str = json.dumps(gltf, separators=(",", ":")).encode()
    json_pad = (4 - len(json_str) % 4) % 4
    json_str += b" " * json_pad
    total_len = 12 + 8 + len(json_str) + 8 + len(bin_data)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total_len))
        f.write(struct.pack("<II", len(json_str), 0x4E4F534A))
        f.write(json_str)
        f.write(struct.pack("<II", len(bin_data), 0x004E4942))
        f.write(bin_data)


os.makedirs(OUT_DIR, exist_ok=True)
manifest = {"manifest_version": "1.0.0", "source": "shared/figures.ts",
            "unit": "metro (glTF padrão; UE5 converte para cm no import)",
            "pose": "A-pose (placeholder de rig/retopo — substituível sem trocar nome de asset)",
            "format": "glTF 2.0 binário (GLB) com COLOR_0 por vértice",
            "generated": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "figures": []}
for f in FIGURES:
    pos, nrm, col, idx = build_mannequin(f)
    fname = f"FIG_{f['id']}.glb"
    path = os.path.join(OUT_DIR, fname)
    write_glb(path, pos, nrm, col, idx, f["id"])
    with open(path, "rb") as fh:
        blob = fh.read()
    xs, ys, zs = zip(*pos)
    manifest["figures"].append({
        "id": f["id"], "name": f["name"], "sex": f["sex"], "age": f["age"],
        "origin": f["note"], "file": fname,
        "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
        "vertices": len(pos), "triangles": len(idx) // 3,
        "height_m": round(max(ys) - min(ys), 3),
        "bbox_m": {"x": round(max(xs) - min(xs), 3), "y": round(max(ys) - min(ys), 3),
                   "z": round(max(zs) - min(zs), 3)},
        "palette": {"skin": "#%02X%02X%02X" % tuple(int(c * 255) for c in f["skin"]),
                    "suit": "#%02X%02X%02X" % tuple(int(c * 255) for c in f["suit"]),
                    "accent": "#%02X%02X%02X" % tuple(int(c * 255) for c in f["accent"])},
    })
    print(f"{fname}: {len(pos)} verts, {len(idx)//3} tris, {len(blob)} bytes")

with open(os.path.join(OUT_DIR, "figures_glb_manifest.json"), "w") as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print("manifest:", os.path.join(OUT_DIR, "figures_glb_manifest.json"))
