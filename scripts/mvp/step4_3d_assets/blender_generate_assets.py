#!/usr/bin/env python3
"""
Khaaos Run — Step 4: Blender Headless Asset Generator
======================================================
Run with: blender --background --python blender_generate_assets.py

Creates production-quality placeholder meshes for the Khaaos Run MVP:
  - 1 Character (humanoid, T-pose, cube-based body parts)
  - 3 Weapons (Assault Rifle, Shotgun, Sniper DMR)
  - 7 Loot Items (MedKits, Shields, Ammo Boxes)

Exports all as FBX with proper scale (1 unit = 1 cm).
Generates UV maps and simple PBR materials.
"""

import bpy
import bmesh
import json
import math
import os
import sys
import time
from mathutils import Vector, Matrix

# ─── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUTPUT_BASE = os.path.join(REPO_ROOT, "mvp_output", "assets", "blender")

# Scale: 1 Blender unit = 1 cm (UE5 convention)
SCALE_FACTOR = 1.0

# ─── Utilities ────────────────────────────────────────────────────────────────

def clear_scene():
    """Delete all objects in the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Purge orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)


def create_pbr_material(name, base_color=(0.5, 0.5, 0.5, 1.0),
                         metallic=0.0, roughness=0.5, emissive=(0, 0, 0, 0)):
    """Create a simple PBR material with the given properties."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.blend_method = 'OPAQUE' if hasattr(mat, 'blend_method') else None

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Clear default nodes
    for node in nodes:
        nodes.remove(node)

    # Principled BSDF
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if 'Emissive Color' in bsdf.inputs:
        bsdf.inputs['Emissive Color'].default_value = emissive

    # Output
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (300, 0)

    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat


def add_box(name, location=(0, 0, 0), dimensions=(1, 1, 1), material=None):
    """Add a box mesh at location with given dimensions (W, D, H) in cm."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2)
    bpy.ops.object.transform_apply(scale=True)

    if material:
        obj.data.materials.append(material)

    # Generate UV map
    bpy.ops.object.modifier_add(type='UV_PROJECT')
    mod = obj.modifiers[-1]
    mod.use_image = False
    bpy.ops.object.modifier_apply(modifier=mod.name)

    return obj


def add_cylinder(name, location=(0, 0, 0), radius=1.0, depth=1.0,
                 vertices=16, material=None, rotation=(0, 0, 0)):
    """Add a cylinder mesh at location. Depth = height along Z."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=vertices,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name

    if material:
        obj.data.materials.append(material)

    return obj


def join_objects(objects, name="joined"):
    """Join multiple objects into one."""
    if not objects:
        return None

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()

    result = bpy.context.active_object
    result.name = name
    return result


def apply_smooth_shading(obj, angle=30):
    """Apply auto smooth with given angle."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    # Add edge split modifier for auto smooth
    mod = obj.modifiers.new(name="EdgeSplit", type='EDGE_SPLIT')
    mod.split_angle = math.radians(angle)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def export_fbx(obj, filepath):
    """Export object as FBX with proper settings for UE5."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.export_scene.fbx(
        filepath=filepath,
        use_selection=True,
        global_scale=SCALE_FACTOR,
        apply_scale_options='FBX_SCALE_ALL',
        axis_forward='-Z',
        axis_up='Y',
        use_mesh_modifiers=True,
        mesh_smooth_type='face',
        use_tspace=True,
        use_custom_normals=True,
        object_types={'MESH'},
        add_leaf_bones=False,
        bake_anim=False,
    )


# ─── Character Generator ─────────────────────────────────────────────────────

def generate_character():
    """Generate CHR_Zheers_Base: Simple humanoid in T-pose using cube-based body parts."""
    print("  Generating: CHR_Zheers_Base (Humanoid T-pose)")

    mat_skin = create_pbr_material("M_Zheers_Skin", base_color=(0.7, 0.55, 0.45, 1.0),
                                    metallic=0.0, roughness=0.7)
    mat_clothes = create_pbr_material("M_Zheers_Clothes", base_color=(0.25, 0.25, 0.28, 1.0),
                                       metallic=0.0, roughness=0.8)
    mat_boots = create_pbr_material("M_Zheers_Boots", base_color=(0.15, 0.12, 0.1, 1.0),
                                     metallic=0.0, roughness=0.6)

    parts = []

    # Head
    parts.append(add_box("Head", (0, 0, 170), (20, 20, 22), mat_skin))
    # Neck
    parts.append(add_box("Neck", (0, 0, 153), (10, 10, 8), mat_skin))
    # Upper Torso
    parts.append(add_box("UpperTorso", (0, 0, 130), (40, 25, 30), mat_clothes))
    # Lower Torso
    parts.append(add_box("LowerTorso", (0, 0, 102), (36, 22, 25), mat_clothes))

    # Left Arm
    parts.append(add_box("L_UpperArm", (-48, 0, 135), (12, 12, 35), mat_clothes))
    parts.append(add_box("L_Forearm", (-82, 0, 135), (10, 10, 35), mat_clothes))
    parts.append(add_box("L_Hand", (-107, 0, 135), (10, 5, 15), mat_skin))

    # Right Arm
    parts.append(add_box("R_UpperArm", (48, 0, 135), (12, 12, 35), mat_clothes))
    parts.append(add_box("R_Forearm", (82, 0, 135), (10, 10, 35), mat_clothes))
    parts.append(add_box("R_Hand", (107, 0, 135), (10, 5, 15), mat_skin))

    # Left Leg
    parts.append(add_box("L_UpperLeg", (-12, 0, 65), (14, 14, 45), mat_clothes))
    parts.append(add_box("L_LowerLeg", (-12, 0, 20), (12, 12, 45), mat_clothes))
    parts.append(add_box("L_Foot", (-12, 8, 4), (12, 28, 8), mat_boots))

    # Right Leg
    parts.append(add_box("R_UpperLeg", (12, 0, 65), (14, 14, 45), mat_clothes))
    parts.append(add_box("R_LowerLeg", (12, 0, 20), (12, 12, 45), mat_clothes))
    parts.append(add_box("R_Foot", (12, 8, 4), (12, 28, 8), mat_boots))

    # Join all parts
    character = join_objects(parts, "CHR_Zheers_Base")
    apply_smooth_shading(character, angle=45)

    # Compute mesh stats
    stats = get_mesh_stats(character)

    # Export
    out_dir = os.path.join(OUTPUT_BASE, "characters", "CHR_Zheers_Base")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(character, os.path.join(out_dir, "CHR_Zheers_Base.fbx"))

    return {
        "id": "CHR_Zheers_Base",
        "name": "Zheers Warrior Base",
        "category": "character",
        "format": "fbx",
        "vertices": stats["vertices"],
        "faces": stats["faces"],
        "triangles": stats["triangles"],
    }


# ─── Weapon Generators ───────────────────────────────────────────────────────

def generate_assault_rifle():
    """WPN_AssaultRifle_MK1: Assault rifle, 85cm total."""
    print("  Generating: WPN_AssaultRifle_MK1 (Assault Rifle)")

    mat_metal = create_pbr_material("M_AR_Metal", base_color=(0.2, 0.2, 0.22, 1.0),
                                     metallic=0.85, roughness=0.4)
    mat_polymer = create_pbr_material("M_AR_Polymer", base_color=(0.15, 0.15, 0.13, 1.0),
                                       metallic=0.1, roughness=0.6)
    mat_mag = create_pbr_material("M_AR_Mag", base_color=(0.25, 0.22, 0.15, 1.0),
                                   metallic=0.7, roughness=0.3)

    parts = []

    # Barrel (long, thin cylinder)
    parts.append(add_cylinder("AR_Barrel", (0, 22.5, 0), radius=1.25, depth=45, vertices=12, material=mat_metal))
    # Barrel shroud
    parts.append(add_cylinder("AR_Shroud", (0, 12.5, 0), radius=1.5, depth=25, vertices=12, material=mat_metal))
    # Upper receiver
    parts.append(add_box("AR_Receiver", (0, -5, 2), (5, 4, 22), mat_metal))
    # Stock
    parts.append(add_box("AR_Stock", (0, -23, 1), (4, 3, 20), mat_polymer))
    # Grip
    parts.append(add_box("AR_Grip", (0, -10, -6), (3, 3, 10), mat_polymer))
    # Magazine
    parts.append(add_box("AR_Magazine", (0, -8, -5), (2.5, 3, 15), mat_mag))
    # Muzzle brake
    parts.append(add_cylinder("AR_Muzzle", (0, 47, 0), radius=1.4, depth=3, vertices=12, material=mat_metal))
    # Front sight
    parts.append(add_box("AR_FrontSight", (0, 35, 2.5), (0.5, 0.5, 3), mat_metal))
    # Rear sight
    parts.append(add_box("AR_RearSight", (0, -2, 3.5), (0.5, 1, 2), mat_metal))

    weapon = join_objects(parts, "WPN_AssaultRifle_MK1")
    apply_smooth_shading(weapon, angle=60)

    stats = get_mesh_stats(weapon)
    out_dir = os.path.join(OUTPUT_BASE, "weapons", "WPN_AssaultRifle_MK1")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(weapon, os.path.join(out_dir, "WPN_AssaultRifle_MK1.fbx"))

    return {
        "id": "WPN_AssaultRifle_MK1",
        "name": "Assault Rifle MK1",
        "category": "weapon",
        "format": "fbx",
        "vertices": stats["vertices"],
        "faces": stats["faces"],
        "triangles": stats["triangles"],
    }


def generate_shotgun():
    """WPN_Shotgun_Breach: Break-action shotgun, 95cm total."""
    print("  Generating: WPN_Shotgun_Breach (Breach Shotgun)")

    mat_barrel = create_pbr_material("M_SG_Barrel", base_color=(0.35, 0.35, 0.38, 1.0),
                                      metallic=0.9, roughness=0.3)
    mat_wood = create_pbr_material("M_SG_Wood", base_color=(0.45, 0.3, 0.15, 1.0),
                                    metallic=0.0, roughness=0.75)
    mat_metal = create_pbr_material("M_SG_Metal", base_color=(0.25, 0.25, 0.28, 1.0),
                                     metallic=0.85, roughness=0.35)

    parts = []

    # Main barrel
    parts.append(add_cylinder("SG_Barrel", (0, 27.5, 0), radius=1.25, depth=55, vertices=12, material=mat_barrel))
    # Under barrel (magazine tube)
    parts.append(add_cylinder("SG_MagTube", (0, 22.5, -2), radius=1.0, depth=45, vertices=12, material=mat_barrel))
    # Receiver
    parts.append(add_box("SG_Receiver", (0, -3, 0), (5, 5, 15), mat_metal))
    # Wooden stock
    parts.append(add_box("SG_Stock", (0, -23, -1), (5, 4, 28), mat_wood))
    # Grip
    parts.append(add_box("SG_Grip", (0, -8, -6), (3, 3, 10), mat_wood))
    # Break lever
    parts.append(add_box("SG_Lever", (0, -5, -7), (2, 2, 5), mat_metal))
    # Trigger guard
    parts.append(add_cylinder("SG_TriggerGuard", (0, -6, -4), radius=1.5, depth=6, vertices=8,
                               material=mat_metal, rotation=(math.radians(90), 0, 0)))

    weapon = join_objects(parts, "WPN_Shotgun_Breach")
    apply_smooth_shading(weapon, angle=60)

    stats = get_mesh_stats(weapon)
    out_dir = os.path.join(OUTPUT_BASE, "weapons", "WPN_Shotgun_Breach")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(weapon, os.path.join(out_dir, "WPN_Shotgun_Breach.fbx"))

    return {
        "id": "WPN_Shotgun_Breach",
        "name": "Breach Shotgun",
        "category": "weapon",
        "format": "fbx",
        "vertices": stats["vertices"],
        "faces": stats["faces"],
        "triangles": stats["triangles"],
    }


def generate_sniper_dmr():
    """WPN_Sniper_DMR: Designated marksman rifle, 110cm total."""
    print("  Generating: WPN_Sniper_DMR (Sniper DMR)")

    mat_metal = create_pbr_material("M_DMR_Metal", base_color=(0.15, 0.17, 0.2, 1.0),
                                     metallic=0.85, roughness=0.35)
    mat_scope = create_pbr_material("M_DMR_Scope", base_color=(0.1, 0.1, 0.1, 1.0),
                                     metallic=0.9, roughness=0.2)
    mat_stock = create_pbr_material("M_DMR_Stock", base_color=(0.15, 0.25, 0.12, 1.0),
                                     metallic=0.0, roughness=0.7)
    mat_polymer = create_pbr_material("M_DMR_Polymer", base_color=(0.18, 0.18, 0.16, 1.0),
                                       metallic=0.1, roughness=0.6)

    parts = []

    # Long barrel
    parts.append(add_cylinder("DMR_Barrel", (0, 30, 0), radius=1.0, depth=60, vertices=12, material=mat_metal))
    # Barrel shroud/fluting
    parts.append(add_cylinder("DMR_Shroud", (0, 20, 0), radius=1.25, depth=40, vertices=12, material=mat_metal))
    # Receiver
    parts.append(add_box("DMR_Receiver", (0, -7, 1), (5, 4, 25), mat_metal))
    # Scope
    parts.append(add_cylinder("DMR_Scope", (0, -3, 5), radius=1.75, depth=18, vertices=16, material=mat_scope))
    # Scope front lens
    parts.append(add_cylinder("DMR_ScopeFront", (0, 6, 5), radius=1.8, depth=0.5, vertices=16, material=mat_scope))
    # Scope rear lens
    parts.append(add_cylinder("DMR_ScopeRear", (0, -12, 5), radius=1.8, depth=0.5, vertices=16, material=mat_scope))
    # Scope mount rings
    parts.append(add_box("DMR_Mount1", (0, -8, 3.5), (2, 1, 3), mat_metal))
    parts.append(add_box("DMR_Mount2", (0, 0, 3.5), (2, 1, 3), mat_metal))
    # Stock (adjustable)
    parts.append(add_box("DMR_Stock", (0, -28, 0), (4, 3, 25), mat_stock))
    # Grip
    parts.append(add_box("DMR_Grip", (0, -12, -6), (3, 3, 11), mat_polymer))
    # Magazine
    parts.append(add_box("DMR_Magazine", (0, -10, -4), (2.5, 3, 12), mat_metal))
    # Bipod legs (folded)
    parts.append(add_cylinder("DMR_BipodL", (1.5, 12, -6), radius=0.3, depth=15, vertices=6, material=mat_metal))
    parts.append(add_cylinder("DMR_BipodR", (-1.5, 12, -6), radius=0.3, depth=15, vertices=6, material=mat_metal))
    # Muzzle brake / suppressor
    parts.append(add_cylinder("DMR_Suppressor", (0, 62, 0), radius=1.25, depth=8, vertices=12, material=mat_metal))
    # Cheek rest
    parts.append(add_box("DMR_CheekRest", (0, -22, 3), (3, 2, 8), mat_stock))

    weapon = join_objects(parts, "WPN_Sniper_DMR")
    apply_smooth_shading(weapon, angle=60)

    stats = get_mesh_stats(weapon)
    out_dir = os.path.join(OUTPUT_BASE, "weapons", "WPN_Sniper_DMR")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(weapon, os.path.join(out_dir, "WPN_Sniper_DMR.fbx"))

    return {
        "id": "WPN_Sniper_DMR",
        "name": "DMR Sniper",
        "category": "weapon",
        "format": "fbx",
        "vertices": stats["vertices"],
        "faces": stats["faces"],
        "triangles": stats["triangles"],
    }


# ─── Loot Item Generators ────────────────────────────────────────────────────

def generate_medkit_small():
    """LOOT_MedKit_Small: Small box with red cross symbol."""
    print("  Generating: LOOT_MedKit_Small")

    mat = create_pbr_material("M_MedKit_Small", base_color=(1.0, 0.2, 0.2, 1.0),
                               metallic=0.0, roughness=0.6)
    # Emissive cross
    mat_cross = create_pbr_material("M_MedKit_Small_Cross", base_color=(1.0, 1.0, 1.0, 1.0),
                                     metallic=0.0, roughness=0.5,
                                     emissive=(1.0, 1.0, 1.0, 0.5))

    parts = []
    parts.append(add_box("MKs_Box", (0, 0, 0), (12, 8, 6), mat))
    # Cross vertical bar
    parts.append(add_box("MKs_CrossV", (0, 4.1, 0), (2, 0.2, 4), mat_cross))
    # Cross horizontal bar
    parts.append(add_box("MKs_CrossH", (0, 4.1, 0), (6, 0.2, 2), mat_cross))

    item = join_objects(parts, "LOOT_MedKit_Small")
    stats = get_mesh_stats(item)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_MedKit_Small")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(item, os.path.join(out_dir, "LOOT_MedKit_Small.fbx"))

    return {"id": "LOOT_MedKit_Small", "name": "Small Med Kit", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_medkit_medium():
    """LOOT_MedKit_Medium: Medium box with red cross symbol."""
    print("  Generating: LOOT_MedKit_Medium")

    mat = create_pbr_material("M_MedKit_Medium", base_color=(0.9, 0.15, 0.15, 1.0),
                               metallic=0.0, roughness=0.6)
    mat_cross = create_pbr_material("M_MedKit_Medium_Cross", base_color=(1.0, 1.0, 1.0, 1.0),
                                     metallic=0.0, roughness=0.5,
                                     emissive=(1.0, 1.0, 1.0, 0.5))

    parts = []
    parts.append(add_box("MKm_Box", (0, 0, 0), (18, 12, 8), mat))
    parts.append(add_box("MKm_CrossV", (0, 6.1, 0), (2, 0.2, 5), mat_cross))
    parts.append(add_box("MKm_CrossH", (0, 6.1, 0), (8, 0.2, 2), mat_cross))

    item = join_objects(parts, "LOOT_MedKit_Medium")
    stats = get_mesh_stats(item)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_MedKit_Medium")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(item, os.path.join(out_dir, "LOOT_MedKit_Medium.fbx"))

    return {"id": "LOOT_MedKit_Medium", "name": "Medium Med Kit", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_bandage():
    """LOOT_Bandage: Small white roll shape."""
    print("  Generating: LOOT_Bandage")

    mat = create_pbr_material("M_Bandage", base_color=(0.95, 0.95, 0.9, 1.0),
                               metallic=0.0, roughness=0.8)

    parts = []
    # Main roll
    parts.append(add_cylinder("Bandage_Roll", (0, 0, 0), radius=2.5, depth=5, vertices=12, material=mat))
    # Wrapper tab
    parts.append(add_box("Bandage_Tab", (2, 0, 0), (1.5, 3, 1), mat))

    item = join_objects(parts, "LOOT_Bandage")
    stats = get_mesh_stats(item)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_Bandage")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(item, os.path.join(out_dir, "LOOT_Bandage.fbx"))

    return {"id": "LOOT_Bandage", "name": "Bandage", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_shield_lv1():
    """LOOT_Shield_Lv1: Diamond/kite shield shape, blue."""
    print("  Generating: LOOT_Shield_Lv1")

    mat = create_pbr_material("M_Shield_Lv1", base_color=(0.2, 0.5, 1.0, 1.0),
                               metallic=0.6, roughness=0.3,
                               emissive=(0.1, 0.3, 0.8, 0.3))

    # Create diamond/kite shape manually
    bm = bmesh.new()
    s = 6.0
    verts = [
        bm.verts.new((0, 0, s * 1.5)),         # top
        bm.verts.new((-s * 0.8, 0, s * 0.5)),  # upper-left
        bm.verts.new((s * 0.8, 0, s * 0.5)),   # upper-right
        bm.verts.new((-s, 0, 0)),               # mid-left
        bm.verts.new((s, 0, 0)),                # mid-right
        bm.verts.new((-s * 0.6, 0, -s * 0.8)), # lower-left
        bm.verts.new((s * 0.6, 0, -s * 0.8)),  # lower-right
        bm.verts.new((0, 0, -s * 1.2)),         # bottom
        # Back face
        bm.verts.new((0, -s * 0.15, s * 1.5)),
        bm.verts.new((-s * 0.8, -s * 0.15, s * 0.5)),
        bm.verts.new((s * 0.8, -s * 0.15, s * 0.5)),
        bm.verts.new((-s, -s * 0.15, 0)),
        bm.verts.new((s, -s * 0.15, 0)),
        bm.verts.new((-s * 0.6, -s * 0.15, -s * 0.8)),
        bm.verts.new((s * 0.6, -s * 0.15, -s * 0.8)),
        bm.verts.new((0, -s * 0.15, -s * 1.2)),
    ]
    bmesh.ops.triangulate(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("LOOT_Shield_Lv1_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("LOOT_Shield_Lv1", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

    stats = get_mesh_stats(obj)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_Shield_Lv1")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(obj, os.path.join(out_dir, "LOOT_Shield_Lv1.fbx"))

    return {"id": "LOOT_Shield_Lv1", "name": "Shield Cell Lv1", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_shield_lv2():
    """LOOT_Shield_Lv2: Larger diamond/kite shield shape, purple."""
    print("  Generating: LOOT_Shield_Lv2")

    mat = create_pbr_material("M_Shield_Lv2", base_color=(0.4, 0.3, 1.0, 1.0),
                               metallic=0.6, roughness=0.3,
                               emissive=(0.2, 0.15, 0.6, 0.3))

    bm = bmesh.new()
    s = 8.0
    verts = [
        bm.verts.new((0, 0, s * 1.5)),
        bm.verts.new((-s * 0.8, 0, s * 0.5)),
        bm.verts.new((s * 0.8, 0, s * 0.5)),
        bm.verts.new((-s, 0, 0)),
        bm.verts.new((s, 0, 0)),
        bm.verts.new((-s * 0.6, 0, -s * 0.8)),
        bm.verts.new((s * 0.6, 0, -s * 0.8)),
        bm.verts.new((0, 0, -s * 1.2)),
        bm.verts.new((0, -s * 0.15, s * 1.5)),
        bm.verts.new((-s * 0.8, -s * 0.15, s * 0.5)),
        bm.verts.new((s * 0.8, -s * 0.15, s * 0.5)),
        bm.verts.new((-s, -s * 0.15, 0)),
        bm.verts.new((s, -s * 0.15, 0)),
        bm.verts.new((-s * 0.6, -s * 0.15, -s * 0.8)),
        bm.verts.new((s * 0.6, -s * 0.15, -s * 0.8)),
        bm.verts.new((0, -s * 0.15, -s * 1.2)),
    ]
    bmesh.ops.triangulate(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("LOOT_Shield_Lv2_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("LOOT_Shield_Lv2", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

    stats = get_mesh_stats(obj)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_Shield_Lv2")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(obj, os.path.join(out_dir, "LOOT_Shield_Lv2.fbx"))

    return {"id": "LOOT_Shield_Lv2", "name": "Shield Cell Lv2", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_ammo_box_556():
    """LOOT_AmmoBox_556: Olive drab ammo box with '5.56' marking."""
    print("  Generating: LOOT_AmmoBox_556")

    mat = create_pbr_material("M_AmmoBox_556", base_color=(0.6, 0.5, 0.2, 1.0),
                               metallic=0.1, roughness=0.7)
    mat_label = create_pbr_material("M_AmmoBox_556_Label", base_color=(0.9, 0.85, 0.7, 1.0),
                                     metallic=0.0, roughness=0.5)

    parts = []
    parts.append(add_box("A556_Box", (0, 0, 0), (15, 8, 10), mat))
    # Lid (slightly larger)
    parts.append(add_box("A556_Lid", (0, 0, 5.5), (15.2, 8.2, 1), mat))
    # Label area
    parts.append(add_box("A556_Label", (0, 4.2, 0), (8, 0.2, 4), mat_label))

    item = join_objects(parts, "LOOT_AmmoBox_556")
    stats = get_mesh_stats(item)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_AmmoBox_556")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(item, os.path.join(out_dir, "LOOT_AmmoBox_556.fbx"))

    return {"id": "LOOT_AmmoBox_556", "name": "5.56mm Ammo Box", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


def generate_ammo_box_762():
    """LOOT_AmmoBox_762: Brown ammo box with '7.62' marking."""
    print("  Generating: LOOT_AmmoBox_762")

    mat = create_pbr_material("M_AmmoBox_762", base_color=(0.5, 0.35, 0.15, 1.0),
                               metallic=0.1, roughness=0.7)
    mat_label = create_pbr_material("M_AmmoBox_762_Label", base_color=(0.9, 0.8, 0.6, 1.0),
                                     metallic=0.0, roughness=0.5)

    parts = []
    parts.append(add_box("A762_Box", (0, 0, 0), (15, 8, 10), mat))
    parts.append(add_box("A762_Lid", (0, 0, 5.5), (15.2, 8.2, 1), mat))
    parts.append(add_box("A762_Label", (0, 4.2, 0), (8, 0.2, 4), mat_label))

    item = join_objects(parts, "LOOT_AmmoBox_762")
    stats = get_mesh_stats(item)
    out_dir = os.path.join(OUTPUT_BASE, "loot", "LOOT_AmmoBox_762")
    os.makedirs(out_dir, exist_ok=True)
    export_fbx(item, os.path.join(out_dir, "LOOT_AmmoBox_762.fbx"))

    return {"id": "LOOT_AmmoBox_762", "name": "7.62mm Ammo Box", "category": "loot",
            "format": "fbx", "vertices": stats["vertices"], "faces": stats["faces"],
            "triangles": stats["triangles"]}


# ─── Mesh Statistics ─────────────────────────────────────────────────────────

def get_mesh_stats(obj):
    """Get vertex/face/triangle counts for an object."""
    mesh = obj.data
    verts = len(mesh.vertices)
    faces = len(mesh.polygons)
    tris = sum(1 for p in mesh.polygons if len(p.vertices) == 3)
    tris += sum(len(p.vertices) - 2 for p in mesh.polygons if len(p.vertices) > 3)
    return {"vertices": verts, "faces": faces, "triangles": tris}


# ─── Main Pipeline ──────────────────────────────────────────────────────────

def main():
    """Run the full Blender asset generation pipeline."""
    print("=" * 72)
    print("  Khaaos Run — Step 4: Blender Headless Asset Generator")
    print("=" * 72)
    print(f"  Blender: {bpy.app.version_string}")
    print(f"  Output:  {OUTPUT_BASE}")
    print()

    os.makedirs(OUTPUT_BASE, exist_ok=True)

    results = []
    total_verts = 0
    total_faces = 0

    # ── Character ──
    clear_scene()
    result = generate_character()
    results.append(result)
    total_verts += result["vertices"]
    total_faces += result["faces"]

    # ── Weapons ──
    for gen_func in [generate_assault_rifle, generate_shotgun, generate_sniper_dmr]:
        clear_scene()
        result = gen_func()
        results.append(result)
        total_verts += result["vertices"]
        total_faces += result["faces"]

    # ── Loot Items ──
    for gen_func in [generate_medkit_small, generate_medkit_medium, generate_bandage,
                     generate_shield_lv1, generate_shield_lv2,
                     generate_ammo_box_556, generate_ammo_box_762]:
        clear_scene()
        result = gen_func()
        results.append(result)
        total_verts += result["vertices"]
        total_faces += result["faces"]

    # ── Generate Report ──
    report = {
        "report_title": "Khaaos Run MVP — Step 4: Blender Asset Generation Report",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "blender_version": bpy.app.version_string,
        "pipeline_step": "step4_3d_assets_blender",
        "output_root": OUTPUT_BASE,
        "summary": {
            "total_assets": len(results),
            "character_count": sum(1 for r in results if r["category"] == "character"),
            "weapon_count": sum(1 for r in results if r["category"] == "weapon"),
            "loot_count": sum(1 for r in results if r["category"] == "loot"),
            "total_vertices": total_verts,
            "total_faces": total_faces,
            "total_triangles": sum(r["triangles"] for r in results),
            "mvp_requirement_met": len(results) >= 10,
        },
        "assets": results,
    }

    report_path = os.path.join(OUTPUT_BASE, "blender_asset_report.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    # ── Summary ──
    print()
    print("=" * 72)
    print("  BLENDER GENERATION COMPLETE")
    print("=" * 72)
    print(f"  Total assets:  {report['summary']['total_assets']}")
    print(f"    Characters:  {report['summary']['character_count']}")
    print(f"    Weapons:     {report['summary']['weapon_count']}")
    print(f"    Loot items:  {report['summary']['loot_count']}")
    print(f"  Total vertices: {total_verts:,}")
    print(f"  Total faces:    {total_faces:,}")
    print(f"  MVP requirement (10+): {'PASS' if report['summary']['mvp_requirement_met'] else 'FAIL'}")
    print(f"  Report: {report_path}")
    print()


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Check if running inside Blender
    try:
        bpy.context
        main()
    except NameError:
        print("ERROR: This script must be run inside Blender!")
        print("Usage: blender --background --python blender_generate_assets.py")
        sys.exit(1)
