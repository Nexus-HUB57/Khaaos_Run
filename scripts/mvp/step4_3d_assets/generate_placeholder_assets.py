#!/usr/bin/env python3
"""
Khaaos Run — Step 4: Placeholder 3D Asset Generator
====================================================
Generates placeholder 3D assets using basic Python (no Blender required).
Creates FBX/OBJ/DAE placeholder meshes, materials, metadata, and VFX placeholders
for the Khaaos Run MVP (10+ assets: Character + 3 Weapons + 7 Loot Items).

Output: /home/z/my-project/Khaaos_Run/repo/mvp_output/assets/
"""

import json
import math
import os
import struct
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# ─── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_BASE = REPO_ROOT / "mvp_output" / "assets"

# Scale: 1 unit = 1 cm (UE5 convention)
UNIT_SCALE = 1.0

# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

@dataclass
class MeshData:
    """Simple mesh: vertices (x,y,z), faces (triangles as index triplets), normals, uvs."""
    name: str
    vertices: List[Tuple[float, float, float]] = field(default_factory=list)
    faces: List[Tuple[int, int, int]] = field(default_factory=list)
    normals: List[Tuple[float, float, float]] = field(default_factory=list)
    uvs: List[Tuple[float, float]] = field(default_factory=list)

@dataclass
class AssetSpec:
    """Definition of a single placeholder asset."""
    asset_id: str
    name: str
    category: str           # character | weapon | loot | vfx
    subcategory: str        # e.g. assault_rifle, health, shield, ammo
    priority: str = "P0"
    dimensions_cm: Tuple[float, float, float] = (100, 100, 100)  # W x D x H
    lod_levels: int = 3
    collision_type: str = "box"  # box | capsule | convex | none
    target_polycount: int = 1000
    color_rgb: Tuple[float, float, float] = (0.5, 0.5, 0.5)
    description: str = ""
    dependencies: List[str] = field(default_factory=list)


# ─── Geometry Generators ─────────────────────────────────────────────────────

def generate_box(w: float, d: float, h: float) -> MeshData:
    """Generate a box mesh centered at origin. Dimensions in cm."""
    hw, hd, hh = w / 2, d / 2, h / 2
    verts = [
        (-hw, -hd, -hh), ( hw, -hd, -hh), ( hw,  hd, -hh), (-hw,  hd, -hh),  # bottom
        (-hw, -hd,  hh), ( hw, -hd,  hh), ( hw,  hd,  hh), (-hw,  hd,  hh),  # top
    ]
    faces = [
        (0, 2, 1), (0, 3, 2),   # bottom
        (4, 5, 6), (4, 6, 7),   # top
        (0, 1, 5), (0, 5, 4),   # front
        (2, 3, 7), (2, 7, 6),   # back
        (0, 4, 7), (0, 7, 3),   # left
        (1, 2, 6), (1, 6, 5),   # right
    ]
    normals = [
        ( 0,  0, -1), ( 0,  0, -1), ( 0,  0, -1), ( 0,  0, -1),
        ( 0,  0,  1), ( 0,  0,  1), ( 0,  0,  1), ( 0,  0,  1),
        ( 0, -1,  0), ( 0, -1,  0), ( 0, -1,  0), ( 0, -1,  0),
        ( 0,  1,  0), ( 0,  1,  0), ( 0,  1,  0), ( 0,  1,  0),
        (-1,  0,  0), (-1,  0,  0), (-1,  0,  0), (-1,  0,  0),
        ( 1,  0,  0), ( 1,  0,  0), ( 1,  0,  0), ( 1,  0,  0),
    ]
    uvs = [
        (0, 0), (1, 0), (1, 1), (0, 1),
        (0, 0), (1, 0), (1, 1), (0, 1),
        (0, 0), (1, 0), (1, 1), (0, 1),
        (0, 0), (1, 0), (1, 1), (0, 1),
        (0, 0), (1, 0), (1, 1), (0, 1),
        (0, 0), (1, 0), (1, 1), (0, 1),
    ]
    mesh = MeshData(name="box", vertices=verts, faces=faces, normals=normals, uvs=uvs)
    return mesh


def generate_capsule(radius: float, height: float, segments: int = 12) -> MeshData:
    """Generate a capsule mesh (cylinder + hemispherical caps). For character."""
    verts = []
    faces = []
    uvs = []

    r = radius
    half_h = height / 2

    # Cylinder body
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        # bottom ring
        verts.append((x, y, -half_h))
        # top ring
        verts.append((x, y, half_h))
        u = i / segments
        uvs.append((u, 0))
        uvs.append((u, 1))

    # Side faces
    for i in range(segments):
        curr_b = i * 2
        curr_t = i * 2 + 1
        next_b = ((i + 1) % segments) * 2
        next_t = ((i + 1) % segments) * 2 + 1
        faces.append((curr_b, next_b, curr_t))
        faces.append((next_b, next_t, curr_t))

    # Top cap vertex
    top_idx = len(verts)
    verts.append((0, 0, half_h + r))
    uvs.append((0.5, 1.0))

    # Top hemisphere ring
    for j in range(1, 4):
        phi = math.pi / 2 * (j / 4)
        ring_start = len(verts)
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            x = r * math.cos(phi) * math.cos(angle)
            y = r * math.cos(phi) * math.sin(angle)
            z = half_h + r * math.sin(phi)
            verts.append((x, y, z))
            uvs.append((i / segments, 1.0 - phi / (math.pi / 2)))

    # Connect top cylinder ring to first hemisphere ring
    hemi_rings = 3
    for i in range(segments):
        curr = i * 2 + 1  # top cylinder vertex
        next_v = ((i + 1) % segments) * 2 + 1
        ring1_curr = top_idx + 1 + i
        ring1_next = top_idx + 1 + ((i + 1) % segments)
        faces.append((curr, next_v, ring1_curr))
        faces.append((next_v, ring1_next, ring1_curr))

    # Connect hemisphere rings
    for j in range(hemi_rings - 1):
        for i in range(segments):
            curr = top_idx + 1 + j * segments + i
            next_v = top_idx + 1 + j * segments + ((i + 1) % segments)
            curr_up = top_idx + 1 + (j + 1) * segments + i
            next_up = top_idx + 1 + (j + 1) * segments + ((i + 1) % segments)
            faces.append((curr, next_v, curr_up))
            faces.append((next_v, next_up, curr_up))

    # Top cap fan
    last_ring_start = top_idx + 1 + (hemi_rings - 1) * segments
    for i in range(segments):
        curr = last_ring_start + i
        next_v = last_ring_start + ((i + 1) % segments)
        faces.append((curr, next_v, top_idx))

    # Bottom cap (mirror)
    bot_idx = len(verts)
    verts.append((0, 0, -half_h - r))
    uvs.append((0.5, 0.0))

    for j in range(1, 4):
        phi = math.pi / 2 * (j / 4)
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            x = r * math.cos(phi) * math.cos(angle)
            y = r * math.cos(phi) * math.sin(angle)
            z = -(half_h + r * math.sin(phi))
            verts.append((x, y, z))
            uvs.append((i / segments, phi / (math.pi / 2)))

    # Connect bottom cylinder ring to first hemisphere ring
    for i in range(segments):
        curr = i * 2  # bottom cylinder vertex
        next_v = ((i + 1) % segments) * 2
        ring1_curr = bot_idx + 1 + i
        ring1_next = bot_idx + 1 + ((i + 1) % segments)
        faces.append((curr, ring1_curr, next_v))
        faces.append((next_v, ring1_curr, ring1_next))

    for j in range(hemi_rings - 1):
        for i in range(segments):
            curr = bot_idx + 1 + j * segments + i
            next_v = bot_idx + 1 + j * segments + ((i + 1) % segments)
            curr_up = bot_idx + 1 + (j + 1) * segments + i
            next_up = bot_idx + 1 + (j + 1) * segments + ((i + 1) % segments)
            faces.append((curr, curr_up, next_v))
            faces.append((next_v, curr_up, next_up))

    last_ring_start = bot_idx + 1 + (hemi_rings - 1) * segments
    for i in range(segments):
        curr = last_ring_start + i
        next_v = last_ring_start + ((i + 1) % segments)
        faces.append((curr, bot_idx, next_v))

    # Compute normals
    normals = []
    for v in verts:
        length = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
        if length > 0:
            normals.append((v[0]/length, v[1]/length, v[2]/length))
        else:
            normals.append((0, 0, 1))

    return MeshData(name="capsule", vertices=verts, faces=faces, normals=normals, uvs=uvs)


def generate_cylinder(radius: float, height: float, segments: int = 8) -> MeshData:
    """Generate a cylinder mesh centered at origin."""
    verts = []
    faces = []
    uvs = []
    normals = []

    half_h = height / 2

    # Bottom center
    verts.append((0, 0, -half_h))
    normals.append((0, 0, -1))
    uvs.append((0.5, 0.5))

    # Bottom ring
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        verts.append((x, y, -half_h))
        normals.append((math.cos(angle), math.sin(angle), 0))
        uvs.append((i / segments, 0))

    # Top ring
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        verts.append((x, y, half_h))
        normals.append((math.cos(angle), math.sin(angle), 0))
        uvs.append((i / segments, 1))

    # Top center
    top_center = len(verts)
    verts.append((0, 0, half_h))
    normals.append((0, 0, 1))
    uvs.append((0.5, 0.5))

    # Bottom cap faces
    for i in range(segments):
        curr = 1 + i
        next_v = 1 + ((i + 1) % segments)
        faces.append((0, next_v, curr))

    # Side faces
    for i in range(segments):
        b_curr = 1 + i
        b_next = 1 + ((i + 1) % segments)
        t_curr = 1 + segments + i
        t_next = 1 + segments + ((i + 1) % segments)
        faces.append((b_curr, b_next, t_curr))
        faces.append((b_next, t_next, t_curr))

    # Top cap faces
    for i in range(segments):
        curr = 1 + segments + i
        next_v = 1 + segments + ((i + 1) % segments)
        faces.append((curr, next_v, top_center))

    return MeshData(name="cylinder", vertices=verts, faces=faces, normals=normals, uvs=uvs)


def generate_humanoid_tpose() -> MeshData:
    """Generate a simple humanoid T-pose using box primitives.
    Character: CHR_Zheers_Base, humanoid, 180cm, T-pose."""
    parts = []
    # Head: 20x20x22 cm, positioned at top
    head = generate_box(20, 20, 22)
    head_offset = (0, 0, 170)  # center of head at 170cm
    parts.append((head, head_offset))

    # Neck: 10x10x8
    neck = generate_box(10, 10, 8)
    parts.append((neck, (0, 0, 155)))

    # Torso (upper): 40x25x30
    upper_torso = generate_box(40, 25, 30)
    parts.append((upper_torso, (0, 0, 130)))

    # Torso (lower): 36x22x25
    lower_torso = generate_box(36, 22, 25)
    parts.append((lower_torso, (0, 0, 102)))

    # Left upper arm: 12x12x35 (T-pose: extends left)
    l_upper_arm = generate_box(12, 12, 35)
    parts.append((l_upper_arm, (-48, 0, 135)))

    # Left forearm: 10x10x35
    l_forearm = generate_box(10, 10, 35)
    parts.append((l_forearm, (-82, 0, 135)))

    # Right upper arm
    r_upper_arm = generate_box(12, 12, 35)
    parts.append((r_upper_arm, (48, 0, 135)))

    # Right forearm
    r_forearm = generate_box(10, 10, 35)
    parts.append((r_forearm, (82, 0, 135)))

    # Left hand: 10x5x15
    l_hand = generate_box(10, 5, 15)
    parts.append((l_hand, (-107, 0, 135)))

    # Right hand
    r_hand = generate_box(10, 5, 15)
    parts.append((r_hand, (107, 0, 135)))

    # Left upper leg: 14x14x45
    l_upper_leg = generate_box(14, 14, 45)
    parts.append((l_upper_leg, (-12, 0, 65)))

    # Left lower leg: 12x12x45
    l_lower_leg = generate_box(12, 12, 45)
    parts.append((l_lower_leg, (-12, 0, 20)))

    # Right upper leg
    r_upper_leg = generate_box(14, 14, 45)
    parts.append((r_upper_leg, (12, 0, 65)))

    # Right lower leg
    r_lower_leg = generate_box(12, 12, 45)
    parts.append((r_lower_leg, (12, 0, 20)))

    # Left foot: 12x28x8
    l_foot = generate_box(12, 28, 8)
    parts.append((l_foot, (-12, 8, 4)))

    # Right foot
    r_foot = generate_box(12, 28, 8)
    parts.append((r_foot, (12, 8, 4)))

    # Merge all parts
    merged = merge_meshes(parts)
    merged.name = "CHR_Zheers_Base"
    return merged


def generate_assault_rifle() -> MeshData:
    """WPN_AssaultRifle_MK1: Assault rifle, 85cm total length."""
    parts = []

    # Barrel: 2.5cm diameter, 45cm long
    barrel = generate_cylinder(1.25, 45, 8)
    parts.append((barrel, (0, 22.5, 0)))

    # Barrel shroud: 3cm diameter, 25cm long
    shroud = generate_cylinder(1.5, 25, 8)
    parts.append((shroud, (0, 12.5, 0)))

    # Upper receiver: 5x4x22
    receiver = generate_box(5, 4, 22)
    parts.append((receiver, (0, -5, 2)))

    # Stock: 4x3x20
    stock = generate_box(4, 3, 20)
    parts.append((stock, (0, -23, 1)))

    # Grip/pistol grip: 3x3x10
    grip = generate_box(3, 3, 10)
    parts.append((grip, (0, -10, -6)))

    # Magazine: 2.5x3x15
    magazine = generate_box(2.5, 3, 15)
    parts.append((magazine, (0, -8, -5)))

    # Muzzle brake: 2.8cm diameter, 3cm long
    muzzle = generate_cylinder(1.4, 3, 8)
    parts.append((muzzle, (0, 47, 0)))

    merged = merge_meshes(parts)
    merged.name = "WPN_AssaultRifle_MK1"
    return merged


def generate_shotgun() -> MeshData:
    """WPN_Shotgun_Breach: Break-action shotgun, 95cm total length."""
    parts = []

    # Barrel: 2.5cm diameter, 55cm long (long barrel for break-action)
    barrel = generate_cylinder(1.25, 55, 8)
    parts.append((barrel, (0, 27.5, 0)))

    # Barrel (under): 2cm diameter, 45cm (magazine tube)
    under_barrel = generate_cylinder(1.0, 45, 8)
    parts.append((under_barrel, (0, 22.5, -2)))

    # Receiver: 5x5x15
    receiver = generate_box(5, 5, 15)
    parts.append((receiver, (0, -3, 0)))

    # Wooden stock: 5x4x28
    stock = generate_box(5, 4, 28)
    parts.append((stock, (0, -23, -1)))

    # Grip: 3x3x10
    grip = generate_box(3, 3, 10)
    parts.append((grip, (0, -8, -6)))

    # Break lever: 2x2x5
    lever = generate_box(2, 2, 5)
    parts.append((lever, (0, -5, -7)))

    merged = merge_meshes(parts)
    merged.name = "WPN_Shotgun_Breach"
    return merged


def generate_sniper_dmr() -> MeshData:
    """WPN_Sniper_DMR: Designated marksman rifle, 110cm total length."""
    parts = []

    # Long barrel: 2cm diameter, 60cm long
    barrel = generate_cylinder(1.0, 60, 8)
    parts.append((barrel, (0, 30, 0)))

    # Barrel fluting/shroud: 2.5cm diameter, 40cm
    shroud = generate_cylinder(1.25, 40, 8)
    parts.append((shroud, (0, 20, 0)))

    # Receiver: 5x4x25
    receiver = generate_box(5, 4, 25)
    parts.append((receiver, (0, -7, 1)))

    # Scope: 3.5cm diameter, 18cm long, mounted on top
    scope = generate_cylinder(1.75, 18, 8)
    parts.append((scope, (0, -3, 5)))

    # Scope mount rings: 2x1x3 each
    mount1 = generate_box(2, 1, 3)
    parts.append((mount1, (0, -8, 3.5)))
    mount2 = generate_box(2, 1, 3)
    parts.append((mount2, (0, 0, 3.5)))

    # Stock: 4x3x25
    stock = generate_box(4, 3, 25)
    parts.append((stock, (0, -28, 0)))

    # Grip: 3x3x11
    grip = generate_box(3, 3, 11)
    parts.append((grip, (0, -12, -6)))

    # Magazine: 2.5x3x12
    magazine = generate_box(2.5, 3, 12)
    parts.append((magazine, (0, -10, -4)))

    # Bipod legs: 1cm diameter, 15cm long, folded forward
    bipod_l = generate_cylinder(0.3, 15, 6)
    parts.append((bipod_l, (1.5, 12, -6)))
    bipod_r = generate_cylinder(0.3, 15, 6)
    parts.append((bipod_r, (-1.5, 12, -6)))

    # Muzzle brake / suppressor: 2.5cm diameter, 8cm
    muzzle = generate_cylinder(1.25, 8, 8)
    parts.append((muzzle, (0, 62, 0)))

    merged = merge_meshes(parts)
    merged.name = "WPN_Sniper_DMR"
    return merged


def generate_loot_box(w: float, d: float, h: float, name: str) -> MeshData:
    """Generate a simple box mesh for loot items."""
    mesh = generate_box(w, d, h)
    mesh.name = name
    return mesh


def generate_shield_shape(scale: float, name: str) -> MeshData:
    """Generate a diamond/kite shield shape for shield loot items."""
    s = scale
    verts = [
        (0, 0, s*1.5),       # top
        (-s*0.8, 0, s*0.5),  # upper-left
        (s*0.8, 0, s*0.5),   # upper-right
        (-s, 0, 0),          # mid-left
        (s, 0, 0),           # mid-right
        (-s*0.6, 0, -s*0.8), # lower-left
        (s*0.6, 0, -s*0.8),  # lower-right
        (0, 0, -s*1.2),      # bottom
        # Back face (slight thickness)
        (0, -s*0.15, s*1.5),
        (-s*0.8, -s*0.15, s*0.5),
        (s*0.8, -s*0.15, s*0.5),
        (-s, -s*0.15, 0),
        (s, -s*0.15, 0),
        (-s*0.6, -s*0.15, -s*0.8),
        (s*0.6, -s*0.15, -s*0.8),
        (0, -s*0.15, -s*1.2),
    ]
    faces = [
        # Front face
        (0, 2, 1), (1, 2, 3), (3, 2, 4), (3, 4, 5), (5, 4, 6), (5, 6, 7),
        # Back face
        (8, 9, 10), (9, 11, 10), (11, 12, 10), (11, 13, 12), (13, 14, 12), (13, 15, 14),
        # Sides
        (0, 8, 10), (0, 10, 2),
        (1, 9, 8), (1, 8, 0),
        (2, 10, 12), (2, 12, 4),
        (3, 11, 9), (3, 9, 1),
        (4, 12, 14), (4, 14, 6),
        (5, 13, 11), (5, 11, 3),
        (6, 14, 15), (6, 15, 7),
        (7, 15, 13), (7, 13, 5),
    ]
    normals = [(0, 1, 0)] * 7 + [(0, -1, 0)] * 7 + [(0, 0, 0)] * 2
    # Fill in proper side normals
    for i in range(len(normals), len(verts)):
        normals.append((0, 0, 1))
    uvs = [(i / 8, 0) for i in range(8)] + [(i / 8, 1) for i in range(8)]

    return MeshData(name=name, vertices=verts, faces=faces, normals=normals, uvs=uvs)


# ─── Mesh Utilities ──────────────────────────────────────────────────────────

def merge_meshes(parts: List[Tuple[MeshData, Tuple[float, float, float]]]) -> MeshData:
    """Merge multiple meshes with offsets into a single mesh."""
    all_verts = []
    all_faces = []
    all_normals = []
    all_uvs = []
    offset = 0

    for mesh, (ox, oy, oz) in parts:
        for v in mesh.vertices:
            all_verts.append((v[0] + ox, v[1] + oy, v[2] + oz))
        for f in mesh.faces:
            all_faces.append((f[0] + offset, f[1] + offset, f[2] + offset))
        all_normals.extend(mesh.normals)
        all_uvs.extend(mesh.uvs)
        offset += len(mesh.vertices)

    return MeshData(
        name="merged",
        vertices=all_verts,
        faces=all_faces,
        normals=all_normals,
        uvs=all_uvs,
    )


# ─── Export Formats ──────────────────────────────────────────────────────────

def export_obj(mesh: MeshData, filepath: Path) -> None:
    """Export mesh as Wavefront OBJ."""
    with open(filepath, 'w') as f:
        f.write(f"# Khaaos Run Placeholder Asset: {mesh.name}\n")
        f.write(f"# Generated by generate_placeholder_assets.py\n\n")
        f.write(f"o {mesh.name}\n\n")

        for v in mesh.vertices:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        f.write("\n")

        for n in mesh.normals:
            f.write(f"vn {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
        f.write("\n")

        for uv in mesh.uvs:
            f.write(f"vt {uv[0]:.6f} {uv[1]:.6f}\n")
        f.write("\n")

        for face in mesh.faces:
            i0, i1, i2 = face[0] + 1, face[1] + 1, face[2] + 1
            if len(mesh.uvs) >= max(i0, i1, i2) and len(mesh.normals) >= max(i0, i1, i2):
                f.write(f"f {i0}/{i0}/{i0} {i1}/{i1}/{i1} {i2}/{i2}/{i2}\n")
            else:
                f.write(f"f {i0} {i1} {i2}\n")


def export_dae(mesh: MeshData, filepath: Path) -> None:
    """Export mesh as COLLADA DAE (for character skeletal mesh)."""
    # Build positions string
    pos_arr = []
    for v in mesh.vertices:
        pos_arr.extend([f"{v[0]:.6f}", f"{v[1]:.6f}", f"{v[2]:.6f}"])
    positions = " ".join(pos_arr)

    # Build normals string
    norm_arr = []
    for n in mesh.normals:
        norm_arr.extend([f"{n[0]:.6f}", f"{n[1]:.6f}", f"{n[2]:.6f}"])
    normals_str = " ".join(norm_arr) if norm_arr else "0 0 1 " * len(mesh.vertices)

    # Build UV string
    uv_arr = []
    for uv in mesh.uvs:
        uv_arr.extend([f"{uv[0]:.6f}", f"{uv[1]:.6f}"])
    uvs_str = " ".join(uv_arr) if uv_arr else "0 0 " * len(mesh.vertices)

    # Build triangles
    tri_arr = []
    for f in mesh.faces:
        tri_arr.extend([str(f[0]), str(f[1]), str(f[2])])
    triangles = " ".join(tri_arr)

    vert_count = len(mesh.vertices)
    face_count = len(mesh.faces)

    dae_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor>
      <author>Khaaos Run MVP Pipeline</author>
      <authoring_tool>generate_placeholder_assets.py</authoring_tool>
    </contributor>
    <created>{time.strftime('%Y-%m-%dT%H:%M:%S')}</created>
    <modified>{time.strftime('%Y-%m-%dT%H:%M:%S')}</modified>
    <unit name="centimeter" meter="0.01"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="{mesh.name}" name="{mesh.name}" type="NODE">
        <instance_geometry url="#{mesh.name}-geom"/>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <library_geometries>
    <geometry id="{mesh.name}-geom" name="{mesh.name}">
      <mesh>
        <source id="{mesh.name}-positions">
          <float_array id="{mesh.name}-positions-array" count="{vert_count * 3}">{positions}</float_array>
          <technique_common>
            <accessor source="#{mesh.name}-positions-array" count="{vert_count}" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{mesh.name}-normals">
          <float_array id="{mesh.name}-normals-array" count="{vert_count * 3}">{normals_str}</float_array>
          <technique_common>
            <accessor source="#{mesh.name}-normals-array" count="{vert_count}" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{mesh.name}-uvs">
          <float_array id="{mesh.name}-uvs-array" count="{vert_count * 2}">{uvs_str}</float_array>
          <technique_common>
            <accessor source="#{mesh.name}-uvs-array" count="{vert_count}" stride="2">
              <param name="S" type="float"/>
              <param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="{mesh.name}-vertices">
          <input semantic="POSITION" source="#{mesh.name}-positions"/>
          <input semantic="NORMAL" source="#{mesh.name}-normals"/>
        </vertices>
        <triangles count="{face_count}">
          <input semantic="VERTEX" source="#{mesh.name}-vertices" offset="0"/>
          <input semantic="NORMAL" source="#{mesh.name}-normals" offset="1"/>
          <input semantic="TEXCOORD" source="#{mesh.name}-uvs" offset="2" set="0"/>
          <p>{triangles}</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>
"""
    with open(filepath, 'w') as f:
        f.write(dae_content)


def export_fbx_simple(mesh: MeshData, filepath: Path) -> None:
    """Export a simplified ASCII FBX 7.x file.

    NOTE: This is a minimal placeholder FBX. For production, use Blender or
    Autodesk FBX SDK. This placeholder contains enough structure for UE5
    to recognize it as a valid mesh import target.
    """
    vert_count = len(mesh.vertices)
    face_count = len(mesh.faces)

    # Vertices flat array
    verts_flat = []
    for v in mesh.vertices:
        verts_flat.extend([v[0], v[1], v[2]])

    # Face indices (triangulated)
    faces_flat = []
    for f in mesh.faces:
        faces_flat.extend([f[0], f[1], f[2]])

    # Normals flat array
    norms_flat = []
    for n in mesh.normals:
        norms_flat.extend([n[0], n[1], n[2]])

    # UV flat array
    uvs_flat = []
    for uv in mesh.uvs:
        uvs_flat.extend([uv[0], uv[1]])

    timestamp = int(time.time())

    fbx = f"""; Khaaos Run Placeholder FBX - {mesh.name}
; Generated by generate_placeholder_assets.py
; FBX 7.1.0 format (ASCII)

FBXHeaderExtension:  {{
    FBXHeaderVersion: 1003
    FBXVersion: 7100
    Creator: "Khaaos Run MVP Asset Pipeline"
    CreationTimeStamp:  {{
        Version: 1000
        Year: {time.strftime('%Y')}
        Month: {time.strftime('%m')}
        Day: {time.strftime('%d')}
        Hour: {time.strftime('%H')}
        Minute: {time.strftime('%M')}
        Second: {time.strftime('%S')}
    }}
}}
GlobalSettings:  {{
    Version: 1000
    Properties70:  {{
        P: "UnitScaleFactor", "double", "Number", "",1.0
        P: "UpAxis", "int", "Integer", "",2
        P: "FrontAxis", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
    }}
}}

Definitions:  {{
    Version: 100
    Count: 3
    ObjectType: "Model" {{
        Count: 1
    }}
    ObjectType: "Geometry" {{
        Count: 1
    }}
    ObjectType: "Material" {{
        Count: 1
    }}
}}

Objects:  {{
    Geometry: 1, "Geometry::{mesh.name}", "Mesh" {{
        Properties70:  {{
            P: "Path", "KString", "XRefUrl", "", ""
        }}
        Vertices: *{vert_count * 3} {{
            a: {",".join(f"{v:.6f}" for v in verts_flat)}
        }}
        PolygonVertexIndex: *{face_count * 3} {{
            a: {",".join(str(i) for i in faces_flat)}
        }}
        GeometryVersion: 124
        LayerElementNormal: 0 {{
            Version: 101
            Name: ""
            MappingInformationType: "ByVertice"
            ReferenceInformationType: "Direct"
            Normals: *{vert_count * 3} {{
                a: {",".join(f"{n:.6f}" for n in norms_flat)}
            }}
            NormalsW: *{vert_count} {{
                a: {",".join(["1"] * vert_count)}
            }}
        }}
        LayerElementUV: 0 {{
            Version: 101
            Name: "UVMap"
            MappingInformationType: "ByVertice"
            ReferenceInformationType: "Direct"
            UV: *{len(mesh.uvs) * 2} {{
                a: {",".join(f"{u:.6f}" for u in uvs_flat)}
            }}
        }}
        Layer: 0 {{
            Version: 100
            LayerElement:  {{
                Type: "LayerElementNormal"
                TypedIndex: 0
            }}
            LayerElement:  {{
                Type: "LayerElementUV"
                TypedIndex: 0
            }}
        }}
    }}
    Model: 2, "Model::{mesh.name}", "Mesh" {{
        Version: 232
        Properties70:  {{
            P: "RotationActive", "bool", "", "",1
        }}
        C: "Geometry",1, "Geometry::{mesh.name}"
    }}
    Material: 3, "Material::M_{mesh.name}", "" {{
        Version: 102
        ShadingModel: "lambert"
        MultiLayer: 0
    }}
}}

Connections:  {{
    C: "OO",2,0
    C: "OO",3,2
}}

Takes:  {{
    Current: ""
}}
"""
    with open(filepath, 'w') as f:
        f.write(fbx)


# ─── Material & Metadata Generators ──────────────────────────────────────────

def generate_material(asset_id: str, category: str, color: Tuple[float, float, float]) -> Dict:
    """Generate PBR material definition as JSON."""
    r, g, b = color
    return {
        "material_id": f"M_{asset_id}",
        "material_instance_id": f"MI_{asset_id}_Default",
        "shader": "Unlit" if category == "vfx" else "PBR",
        "properties": {
            "base_color": {"r": r, "g": g, "b": b, "a": 1.0},
            "roughness": 0.5 if category != "vfx" else 1.0,
            "metallic": 0.8 if category == "weapon" else 0.0,
            "emissive": {"r": 0.0, "g": 0.0, "b": 0.0, "a": 0.0},
            "opacity": 1.0,
            "two_sided": False,
        },
        "textures": {
            "diffuse": f"T_{asset_id}_D",
            "normal": f"T_{asset_id}_N",
            "orm": f"T_{asset_id}_ORM",
            "emissive": f"T_{asset_id}_E",
        },
        "blend_mode": "Opaque",
        "shading_model": "Default" if category != "vfx" else "Unlit",
    }


def generate_metadata(spec: AssetSpec, mesh: MeshData) -> Dict:
    """Generate comprehensive metadata JSON for an asset."""
    return {
        "asset_id": spec.asset_id,
        "name": spec.name,
        "category": spec.category,
        "subcategory": spec.subcategory,
        "priority": spec.priority,
        "description": spec.description,
        "version": "1.0.0",
        "author": "Khaaos Run MVP Pipeline",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dimensions_cm": {
            "width": spec.dimensions_cm[0],
            "depth": spec.dimensions_cm[1],
            "height": spec.dimensions_cm[2],
        },
        "mesh_stats": {
            "vertex_count": len(mesh.vertices),
            "face_count": len(mesh.faces),
            "triangle_count": len(mesh.faces),
            "uv_channels": 1,
        },
        "lod_info": {
            "lod_count": spec.lod_levels,
            "lod_levels": [
                {
                    "level": i,
                    "target_triangles": max(4, len(mesh.faces) // (4 ** i)),
                    "screen_size": round(1.0 / (2 ** i), 4),
                }
                for i in range(spec.lod_levels)
            ],
        },
        "collision": {
            "type": spec.collision_type,
            "complexity": "simple",
            "cook_mode": "auto",
        },
        "import_settings": {
            "scale": 1.0,
            "forward_axis": "Y",
            "up_axis": "Z",
            "convert_units": True,
            "auto_generate_collision": True,
            "skeletal_mesh": spec.category == "character",
        },
        "dependencies": spec.dependencies,
        "target_polycount": spec.target_polycount,
        "naming_convention": "UE5",
    }


# ─── VFX Placeholder Generator ───────────────────────────────────────────────

def generate_vfx_placeholder(vfx_id: str, vfx_type: str, description: str) -> Dict:
    """Generate VFX placeholder metadata and texture description."""
    return {
        "id": vfx_id,
        "type": "niagara",
        "category": "vfx",
        "description": description,
        "priority": "P0",
        "subsystem": "Niagara",
        "textures_required": [
            f"T_{vfx_id}_D",
            f"T_{vfx_id}_N",
        ],
        "parameters": {
            "lifetime": 0.5,
            "spawn_rate": 100,
            "particle_count": 50,
        } if "MuzzleFlash" in vfx_id else {
            "lifetime": 1.0,
            "spawn_rate": 30,
            "particle_count": 20,
        },
        "material": f"M_{vfx_id}",
        "dependencies": [],
    }


def create_vfx_texture_placeholder(filepath: Path, size: int = 64) -> None:
    """Create a minimal TGA placeholder texture for VFX."""
    # TGA header: 18 bytes for uncompressed RGB
    # Format: id_length(B) color_map_type(B) image_type(B)
    #         color_map_first(H) color_map_length(H) color_map_entry_size(B)
    #         x_origin(H) y_origin(H) width(H) height(H)
    #         pixel_depth(B) image_descriptor(B)
    header = struct.pack(
        '<BBBHHBHHHHBB',
        0,          # ID length
        0,          # Color map type
        2,          # Image type (uncompressed RGB)
        0,          # Color map first entry index
        0,          # Color map length
        0,          # Color map entry size
        0,          # X origin
        0,          # Y origin
        size,       # Width
        size,       # Height
        24,         # Pixel depth (24-bit RGB)
        0,          # Image descriptor
    )
    # Generate a simple gradient pixel data
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            r = int(255 * x / size)
            g = int(255 * y / size)
            b = 128
            pixels.extend([b, g, r])  # BGR order for TGA

    with open(filepath, 'wb') as f:
        f.write(header)
        f.write(bytes(pixels))


# ─── Asset Definitions ──────────────────────────────────────────────────────

def get_all_asset_specs() -> List[AssetSpec]:
    """Define all MVP placeholder assets."""
    return [
        # ── Character ──
        AssetSpec(
            asset_id="CHR_Zheers_Base",
            name="Zheers Warrior Base",
            category="character",
            subcategory="humanoid",
            priority="P0",
            dimensions_cm=(60, 40, 180),
            lod_levels=4,
            collision_type="capsule",
            target_polycount=80000,
            color_rgb=(0.7, 0.65, 0.6),
            description="Base humanoid character, 180cm, T-pose. Skeletal mesh for UE5 Mannequin skeleton.",
        ),
        # ── Weapons ──
        AssetSpec(
            asset_id="WPN_AssaultRifle_MK1",
            name="Assault Rifle MK1",
            category="weapon",
            subcategory="assault_rifle",
            priority="P0",
            dimensions_cm=(5, 85, 18),
            lod_levels=3,
            collision_type="box",
            target_polycount=12000,
            color_rgb=(0.2, 0.2, 0.22),
            description="Assault rifle, 85cm. 5.56mm, 30-round magazine, auto/semi fire modes.",
            dependencies=["VFX_MuzzleFlash_Assault", "SFX_WeaponFire_Assault"],
        ),
        AssetSpec(
            asset_id="WPN_Shotgun_Breach",
            name="Breach Shotgun",
            category="weapon",
            subcategory="shotgun",
            priority="P0",
            dimensions_cm=(5, 95, 18),
            lod_levels=3,
            collision_type="box",
            target_polycount=8000,
            color_rgb=(0.45, 0.3, 0.15),
            description="Break-action shotgun, 95cm. 12 gauge, 2-round capacity, high pellet spread.",
            dependencies=["VFX_MuzzleFlash_Shotgun", "SFX_WeaponFire_Shotgun"],
        ),
        AssetSpec(
            asset_id="WPN_Sniper_DMR",
            name="DMR Sniper",
            category="weapon",
            subcategory="sniper",
            priority="P0",
            dimensions_cm=(5, 110, 20),
            lod_levels=3,
            collision_type="box",
            target_polycount=10000,
            color_rgb=(0.15, 0.25, 0.12),
            description="Designated marksman rifle, 110cm. 7.62mm, 10-round, scope + bipod.",
            dependencies=["VFX_MuzzleFlash_Sniper", "SFX_WeaponFire_Sniper"],
        ),
        # ── Loot Items ──
        AssetSpec(
            asset_id="LOOT_MedKit_Small",
            name="Small Med Kit",
            category="loot",
            subcategory="health",
            priority="P0",
            dimensions_cm=(12, 8, 6),
            lod_levels=1,
            collision_type="box",
            target_polycount=500,
            color_rgb=(1.0, 0.2, 0.2),
            description="Small medical kit. Heals 25 HP over 3s. Red cross symbol.",
        ),
        AssetSpec(
            asset_id="LOOT_MedKit_Medium",
            name="Medium Med Kit",
            category="loot",
            subcategory="health",
            priority="P0",
            dimensions_cm=(18, 12, 8),
            lod_levels=1,
            collision_type="box",
            target_polycount=600,
            color_rgb=(0.9, 0.15, 0.15),
            description="Medium medical kit. Heals 50 HP over 5s. Red cross symbol.",
        ),
        AssetSpec(
            asset_id="LOOT_Bandage",
            name="Bandage",
            category="loot",
            subcategory="health",
            priority="P0",
            dimensions_cm=(8, 5, 3),
            lod_levels=1,
            collision_type="box",
            target_polycount=200,
            color_rgb=(0.95, 0.95, 0.9),
            description="Bandage wrap. Heals 10 HP over 1.5s. Quick use.",
        ),
        AssetSpec(
            asset_id="LOOT_Shield_Lv1",
            name="Shield Cell Lv1",
            category="loot",
            subcategory="shield",
            priority="P0",
            dimensions_cm=(10, 10, 14),
            lod_levels=1,
            collision_type="convex",
            target_polycount=400,
            color_rgb=(0.2, 0.5, 1.0),
            description="Shield cell level 1. Restores 25 shield over 2s. Diamond shape.",
        ),
        AssetSpec(
            asset_id="LOOT_Shield_Lv2",
            name="Shield Cell Lv2",
            category="loot",
            subcategory="shield",
            priority="P0",
            dimensions_cm=(12, 12, 16),
            lod_levels=1,
            collision_type="convex",
            target_polycount=500,
            color_rgb=(0.4, 0.3, 1.0),
            description="Shield cell level 2. Restores 50 shield over 3s. Diamond shape.",
        ),
        AssetSpec(
            asset_id="LOOT_AmmoBox_556",
            name="5.56mm Ammo Box",
            category="loot",
            subcategory="ammo",
            priority="P0",
            dimensions_cm=(15, 8, 10),
            lod_levels=1,
            collision_type="box",
            target_polycount=300,
            color_rgb=(0.6, 0.5, 0.2),
            description="5.56x45mm ammunition box. Contains 30 rounds. Olive drab color.",
        ),
        AssetSpec(
            asset_id="LOOT_AmmoBox_762",
            name="7.62mm Ammo Box",
            category="loot",
            subcategory="ammo",
            priority="P0",
            dimensions_cm=(15, 8, 10),
            lod_levels=1,
            collision_type="box",
            target_polycount=300,
            color_rgb=(0.5, 0.35, 0.15),
            description="7.62x51mm ammunition box. Contains 20 rounds. Brown color.",
        ),
    ]


def get_vfx_specs() -> List[Dict]:
    """Define VFX placeholder specs."""
    return [
        generate_vfx_placeholder("VFX_MuzzleFlash_Assault", "muzzle_flash", "Muzzle flash for assault rifle. Bright flash + smoke trails."),
        generate_vfx_placeholder("VFX_MuzzleFlash_Shotgun", "muzzle_flash", "Muzzle flash for shotgun. Wide flash + smoke cloud."),
        generate_vfx_placeholder("VFX_MuzzleFlash_Sniper", "muzzle_flash", "Muzzle flash for sniper DMR. Sharp flash + suppressor trail."),
        generate_vfx_placeholder("VFX_BulletImpact_Concrete", "impact_decal", "Bullet impact on concrete. Sparks + dust + decal."),
        generate_vfx_placeholder("VFX_BulletImpact_Metal", "impact_decal", "Bullet impact on metal. Bright sparks + ricochet."),
        generate_vfx_placeholder("VFX_BulletImpact_Dirt", "impact_decal", "Bullet impact on dirt. Dust puff + small debris."),
    ]


# ─── Mesh Generation Dispatch ───────────────────────────────────────────────

def generate_mesh_for_spec(spec: AssetSpec) -> MeshData:
    """Generate the appropriate mesh based on asset spec."""
    if spec.asset_id == "CHR_Zheers_Base":
        return generate_humanoid_tpose()
    elif spec.asset_id == "WPN_AssaultRifle_MK1":
        return generate_assault_rifle()
    elif spec.asset_id == "WPN_Shotgun_Breach":
        return generate_shotgun()
    elif spec.asset_id == "WPN_Sniper_DMR":
        return generate_sniper_dmr()
    elif spec.asset_id in ("LOOT_Shield_Lv1", "LOOT_Shield_Lv2"):
        scale = 6 if spec.asset_id == "LOOT_Shield_Lv1" else 8
        return generate_shield_shape(scale, spec.asset_id)
    elif spec.asset_id.startswith("LOOT_"):
        w, d, h = spec.dimensions_cm
        return generate_loot_box(w, d, h, spec.asset_id)
    else:
        # Fallback: simple box
        w, d, h = spec.dimensions_cm
        return generate_box(w, d, h)


# ─── Main Pipeline ──────────────────────────────────────────────────────────

def main() -> None:
    """Run the full placeholder asset generation pipeline."""
    print("=" * 72)
    print("  Khaaos Run — Step 4: Placeholder 3D Asset Generator")
    print("=" * 72)
    print(f"  Output: {OUTPUT_BASE}")
    print()

    # Create output directories
    dirs = ["characters", "weapons", "loot", "vfx", "materials", "metadata"]
    for d in dirs:
        (OUTPUT_BASE / d).mkdir(parents=True, exist_ok=True)

    # ── Generate Assets ──
    specs = get_all_asset_specs()
    vfx_specs = get_vfx_specs()
    report_entries = []
    total_verts = 0
    total_faces = 0

    for spec in specs:
        print(f"  Generating: {spec.asset_id} ({spec.category}/{spec.subcategory})")

        # Generate mesh
        mesh = generate_mesh_for_spec(spec)
        total_verts += len(mesh.vertices)
        total_faces += len(mesh.faces)

        # Determine category subdirectory
        # Map category to directory name (singular/plural conventions)
        cat_dir_map = {"character": "characters", "weapon": "weapons", "loot": "loot", "vfx": "vfx"}
        cat_dir = cat_dir_map.get(spec.category, spec.category)
        asset_dir = OUTPUT_BASE / cat_dir / spec.asset_id
        asset_dir.mkdir(parents=True, exist_ok=True)

        # Export mesh formats
        if spec.category == "character":
            # Character: DAE (COLLADA for skeletal) + OBJ
            export_dae(mesh, asset_dir / f"{spec.asset_id}.dae")
            export_obj(mesh, asset_dir / f"{spec.asset_id}.obj")
        else:
            # Weapons/Loot: OBJ + FBX
            export_obj(mesh, asset_dir / f"{spec.asset_id}.obj")
            export_fbx_simple(mesh, asset_dir / f"{spec.asset_id}.fbx")

        # Generate material
        material = generate_material(spec.asset_id, spec.category, spec.color_rgb)
        mat_dir = OUTPUT_BASE / "materials" / spec.asset_id
        mat_dir.mkdir(parents=True, exist_ok=True)
        with open(mat_dir / f"M_{spec.asset_id}.json", 'w') as f:
            json.dump(material, f, indent=2)

        # Generate metadata
        metadata = generate_metadata(spec, mesh)
        meta_dir = OUTPUT_BASE / "metadata" / spec.asset_id
        meta_dir.mkdir(parents=True, exist_ok=True)
        with open(meta_dir / f"{spec.asset_id}_metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)

        # File sizes
        obj_file = asset_dir / f"{spec.asset_id}.obj"
        obj_size = obj_file.stat().st_size if obj_file.exists() else 0

        report_entries.append({
            "asset_id": spec.asset_id,
            "name": spec.name,
            "category": spec.category,
            "priority": spec.priority,
            "format": "DAE+OBJ" if spec.category == "character" else "OBJ+FBX",
            "vertices": len(mesh.vertices),
            "faces": len(mesh.faces),
            "target_polycount": spec.target_polycount,
            "dimensions_cm": spec.dimensions_cm,
            "lod_levels": spec.lod_levels,
            "collision_type": spec.collision_type,
            "file_size_bytes": obj_size,
            "status": "generated",
        })

    # ── Generate VFX Placeholders ──
    print()
    for vfx in vfx_specs:
        print(f"  Generating VFX: {vfx['id']}")

        vfx_dir = OUTPUT_BASE / "vfx" / vfx["id"]
        vfx_dir.mkdir(parents=True, exist_ok=True)

        # VFX metadata
        with open(vfx_dir / f"{vfx['id']}_vfx.json", 'w') as f:
            json.dump(vfx, f, indent=2)

        # VFX material
        vfx_mat = generate_material(vfx["id"], "vfx", (1.0, 0.9, 0.5))
        mat_dir = OUTPUT_BASE / "materials" / vfx["id"]
        mat_dir.mkdir(parents=True, exist_ok=True)
        with open(mat_dir / f"M_{vfx['id']}.json", 'w') as f:
            json.dump(vfx_mat, f, indent=2)

        # Placeholder textures (TGA)
        for tex_name in vfx["textures_required"]:
            create_vfx_texture_placeholder(vfx_dir / f"{tex_name}.tga", size=64)

        report_entries.append({
            "asset_id": vfx["id"],
            "name": vfx["id"],
            "category": "vfx",
            "priority": vfx["priority"],
            "format": "TGA+JSON",
            "vertices": 0,
            "faces": 0,
            "target_polycount": 0,
            "dimensions_cm": (0, 0, 0),
            "lod_levels": 0,
            "collision_type": "none",
            "file_size_bytes": sum(
                (vfx_dir / f"{t}.tga").stat().st_size
                for t in vfx["textures_required"]
                if (vfx_dir / f"{t}.tga").exists()
            ),
            "status": "generated",
        })

    # ── Generate Asset Report ──
    report = {
        "report_title": "Khaaos Run MVP — Step 4: 3D Asset Generation Report",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pipeline_step": "step4_3d_assets",
        "output_root": str(OUTPUT_BASE),
        "summary": {
            "total_assets": len(specs) + len(vfx_specs),
            "mesh_assets": len(specs),
            "vfx_assets": len(vfx_specs),
            "character_count": sum(1 for s in specs if s.category == "character"),
            "weapon_count": sum(1 for s in specs if s.category == "weapon"),
            "loot_count": sum(1 for s in specs if s.category == "loot"),
            "vfx_count": len(vfx_specs),
            "p0_count": sum(1 for e in report_entries if e["priority"] == "P0"),
            "total_vertices": total_verts,
            "total_faces": total_faces,
            "mvp_requirement_met": len(specs) >= 10,
        },
        "assets": report_entries,
        "validation": {
            "minimum_assets_required": 10,
            "minimum_assets_found": len(specs),
            "requirement_satisfied": len(specs) >= 10,
            "all_p0_generated": all(
                e["status"] == "generated"
                for e in report_entries
                if e["priority"] == "P0"
            ),
        },
    }

    report_path = OUTPUT_BASE / "asset_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    # ── Summary ──
    print()
    print("=" * 72)
    print("  GENERATION COMPLETE")
    print("=" * 72)
    print(f"  Total assets generated: {report['summary']['total_assets']}")
    print(f"    Characters:  {report['summary']['character_count']}")
    print(f"    Weapons:     {report['summary']['weapon_count']}")
    print(f"    Loot items:  {report['summary']['loot_count']}")
    print(f"    VFX:         {report['summary']['vfx_count']}")
    print(f"  Total vertices: {total_verts:,}")
    print(f"  Total faces:    {total_faces:,}")
    print(f"  P0 assets:      {report['summary']['p0_count']}")
    print(f"  MVP requirement (10+): {'PASS' if report['validation']['requirement_satisfied'] else 'FAIL'}")
    print(f"  Report: {report_path}")
    print()

    return None


if __name__ == "__main__":
    main()
