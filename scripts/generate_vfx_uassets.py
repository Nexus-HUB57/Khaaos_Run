#!/usr/bin/env python3
"""
Generate Niagara VFX .uasset.json placeholder files for the 27 VFX systems in Khaaos_Run.

These structured JSON+binary placeholder files can be imported by the UE5 Python
scripting plugin to create real NiagaraSystem assets in the Unreal Editor.

Usage:
    python scripts/generate_vfx_uassets.py

Output:
    - Unreal/KhaaosRun/Content/VFX/Niagara_VFX_Manifest.json
    - Unreal/KhaaosRun/Content/VFX/{Category}/VFX_*.{name}.uasset.json
    - scripts/import_vfx_to_ue5.py
"""

import json
import os
import hashlib
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = REPO_ROOT / "Unreal" / "KhaaosRun" / "Content" / "VFX"
SCRIPTS_DIR = REPO_ROOT / "scripts"

# ─── Species VFX Configurations ───────────────────────────────────────────────────

SPECIES_VFX_CONFIGS = {
    "Huran": {
        "description": "Water particles - amphibious species",
        "primary_color": [0.1, 0.4, 0.9, 1.0],  # Blue
        "secondary_color": [0.2, 0.6, 1.0, 0.8],  # Light blue
        "emitter_types": ["Splash", "Ripple", "Bubble"],
        "particle_count_range": [50, 300],
        "lifetime_range": [0.5, 3.0],
        "size_range": [5.0, 30.0],
        "velocity_range": [50.0, 200.0],
        "gpu_sim_settings": {
            "capacity": 1024,
            "spawn_rate": 100.0,
            "bounds_scale": 1.5,
            "random_seed": 42,
        },
    },
    "Khael": {
        "description": "Ice particles - mystic species",
        "primary_color": [0.9, 0.95, 1.0, 1.0],  # White/cyan
        "secondary_color": [0.5, 0.85, 0.95, 0.9],  # Cyan
        "emitter_types": ["Crystal", "Frost", "Shatter"],
        "particle_count_range": [30, 200],
        "lifetime_range": [0.3, 2.5],
        "size_range": [3.0, 20.0],
        "velocity_range": [30.0, 150.0],
        "gpu_sim_settings": {
            "capacity": 512,
            "spawn_rate": 60.0,
            "bounds_scale": 2.0,
            "random_seed": 73,
        },
    },
    "Venex": {
        "description": "Cyber particles - cyborg species",
        "primary_color": [0.0, 1.0, 0.3, 1.0],  # Neon green
        "secondary_color": [1.0, 0.5, 0.0, 0.9],  # Orange
        "emitter_types": ["Circuit", "Pulse", "Grid"],
        "particle_count_range": [100, 500],
        "lifetime_range": [0.1, 1.5],
        "size_range": [2.0, 15.0],
        "velocity_range": [100.0, 400.0],
        "gpu_sim_settings": {
            "capacity": 2048,
            "spawn_rate": 200.0,
            "bounds_scale": 3.0,
            "random_seed": 99,
        },
    },
    "Onith": {
        "description": "Toxic particles - reptile species",
        "primary_color": [0.2, 0.8, 0.1, 1.0],  # Green
        "secondary_color": [0.5, 0.1, 0.8, 0.85],  # Purple
        "emitter_types": ["Smoke", "Bubble", "Drip"],
        "particle_count_range": [40, 250],
        "lifetime_range": [1.0, 5.0],
        "size_range": [10.0, 50.0],
        "velocity_range": [20.0, 80.0],
        "gpu_sim_settings": {
            "capacity": 768,
            "spawn_rate": 50.0,
            "bounds_scale": 2.0,
            "random_seed": 13,
        },
    },
    "Zheers": {
        "description": "Radiation particles - humanoid species",
        "primary_color": [0.9, 0.9, 0.1, 1.0],  # Yellow
        "secondary_color": [0.3, 0.9, 0.1, 0.8],  # Green
        "emitter_types": ["Glow", "Mutation", "RadiationPulse"],
        "particle_count_range": [60, 350],
        "lifetime_range": [0.5, 4.0],
        "size_range": [8.0, 40.0],
        "velocity_range": [40.0, 160.0],
        "gpu_sim_settings": {
            "capacity": 1024,
            "spawn_rate": 80.0,
            "bounds_scale": 2.5,
            "random_seed": 37,
        },
    },
    "Skeetw": {
        "description": "Fog/bio particles - avian species",
        "primary_color": [0.9, 0.9, 0.95, 1.0],  # White
        "secondary_color": [0.5, 0.9, 0.2, 0.75],  # Lime
        "emitter_types": ["Mist", "Feather", "Glow"],
        "particle_count_range": [30, 150],
        "lifetime_range": [1.0, 6.0],
        "size_range": [15.0, 60.0],
        "velocity_range": [10.0, 60.0],
        "gpu_sim_settings": {
            "capacity": 512,
            "spawn_rate": 30.0,
            "bounds_scale": 3.0,
            "random_seed": 57,
        },
    },
}

# ─── 27 Niagara VFX Systems ───────────────────────────────────────────────────────

VFX_SYSTEMS = [
    # ── Combat VFX (7) ────────────────────────────────────────────────────────
    {
        "name": "VFX_MuzzleFlash_Assault",
        "category": "Combat",
        "subcategory": "MuzzleFlash",
        "species": None,
        "description": "Assault rifle muzzle flash - bright flash with smoke wisps",
        "emitters": [
            {"name": "Flash", "spawn_rate": 500.0, "lifetime": 0.08, "size": 15.0, "color": [1.0, 0.8, 0.3, 1.0], "velocity": 200.0},
            {"name": "Smoke", "spawn_rate": 30.0, "lifetime": 0.5, "size": 8.0, "color": [0.5, 0.5, 0.5, 0.5], "velocity": 40.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_MuzzleFlash", "sort_order": 10},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 500.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 2.0},
        "significance_rank": 0,
    },
    {
        "name": "VFX_MuzzleFlash_Sniper",
        "category": "Combat",
        "subcategory": "MuzzleFlash",
        "species": None,
        "description": "Sniper muzzle flash - intense directed flash with shockwave ring",
        "emitters": [
            {"name": "Flash", "spawn_rate": 800.0, "lifetime": 0.05, "size": 25.0, "color": [1.0, 0.9, 0.5, 1.0], "velocity": 400.0},
            {"name": "ShockRing", "spawn_rate": 100.0, "lifetime": 0.15, "size": 30.0, "color": [1.0, 0.7, 0.2, 0.6], "velocity": 150.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_MuzzleFlash_Sniper", "sort_order": 10},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 800.0, "bounds_scale": 1.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 2.0},
        "significance_rank": 0,
    },
    {
        "name": "VFX_MuzzleFlash_Shotgun",
        "category": "Combat",
        "subcategory": "MuzzleFlash",
        "species": None,
        "description": "Shotgun muzzle flash - wide cone flash with debris sparks",
        "emitters": [
            {"name": "Flash", "spawn_rate": 600.0, "lifetime": 0.1, "size": 20.0, "color": [1.0, 0.6, 0.2, 1.0], "velocity": 300.0},
            {"name": "Sparks", "spawn_rate": 200.0, "lifetime": 0.3, "size": 3.0, "color": [1.0, 0.9, 0.3, 0.8], "velocity": 250.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_MuzzleFlash_Shotgun", "sort_order": 10},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 600.0, "bounds_scale": 1.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "ConeVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 2.0},
        "significance_rank": 0,
    },
    {
        "name": "VFX_BulletImpact_Metal",
        "category": "Combat",
        "subcategory": "Impact",
        "species": None,
        "description": "Bullet impact on metal - sparks + dent decal",
        "emitters": [
            {"name": "Sparks", "spawn_rate": 300.0, "lifetime": 0.4, "size": 2.0, "color": [1.0, 0.7, 0.1, 1.0], "velocity": 180.0},
            {"name": "Flash", "spawn_rate": 500.0, "lifetime": 0.05, "size": 10.0, "color": [1.0, 0.9, 0.5, 1.0], "velocity": 50.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Impact_Metal", "sort_order": 5},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 300.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "CullByAge"],
        "pool_config": {"max_pool_size": 32, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_BulletImpact_Concrete",
        "category": "Combat",
        "subcategory": "Impact",
        "species": None,
        "description": "Bullet impact on concrete - dust puff + debris",
        "emitters": [
            {"name": "Dust", "spawn_rate": 80.0, "lifetime": 0.8, "size": 20.0, "color": [0.7, 0.65, 0.6, 0.5], "velocity": 30.0},
            {"name": "Debris", "spawn_rate": 100.0, "lifetime": 0.6, "size": 4.0, "color": [0.6, 0.55, 0.5, 1.0], "velocity": 100.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Impact_Concrete", "sort_order": 5},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 100.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 32, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_BulletImpact_Dirt",
        "category": "Combat",
        "subcategory": "Impact",
        "species": None,
        "description": "Bullet impact on dirt - soil spray + small dust cloud",
        "emitters": [
            {"name": "DirtSpray", "spawn_rate": 120.0, "lifetime": 0.5, "size": 8.0, "color": [0.5, 0.35, 0.2, 0.8], "velocity": 80.0},
            {"name": "DustCloud", "spawn_rate": 40.0, "lifetime": 1.2, "size": 30.0, "color": [0.6, 0.5, 0.35, 0.3], "velocity": 15.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Impact_Dirt", "sort_order": 5},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 120.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 32, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Loot_Pickup",
        "category": "Combat",
        "subcategory": "Loot",
        "species": None,
        "description": "Loot pickup sparkle effect - rarity-colored glow",
        "emitters": [
            {"name": "Sparkle", "spawn_rate": 60.0, "lifetime": 1.0, "size": 5.0, "color": [1.0, 0.9, 0.3, 1.0], "velocity": 30.0},
            {"name": "Glow", "spawn_rate": 20.0, "lifetime": 2.0, "size": 25.0, "color": [1.0, 0.8, 0.2, 0.3], "velocity": 0.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Loot_Pickup", "sort_order": 3},
        "gpu_sim_settings": {"capacity": 128, "spawn_rate": 60.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    # ── Zone VFX (3) ──────────────────────────────────────────────────────────
    {
        "name": "VFX_Zone_Fog",
        "category": "Zone",
        "subcategory": "Environment",
        "species": None,
        "description": "Safe zone fog wall - dense rolling fog particles",
        "emitters": [
            {"name": "FogWall", "spawn_rate": 50.0, "lifetime": 4.0, "size": 80.0, "color": [0.4, 0.4, 0.5, 0.15], "velocity": 10.0},
            {"name": "Wisps", "spawn_rate": 20.0, "lifetime": 3.0, "size": 40.0, "color": [0.5, 0.5, 0.55, 0.1], "velocity": 25.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Zone_Fog", "sort_order": 0},
        "gpu_sim_settings": {"capacity": 2048, "spawn_rate": 50.0, "bounds_scale": 5.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Turbulence", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 4, "auto_release_threshold": 10.0},
        "significance_rank": 0,
    },
    {
        "name": "VFX_Zone_Rain",
        "category": "Zone",
        "subcategory": "Environment",
        "species": None,
        "description": "Zone rain effect - directional rain with splashes",
        "emitters": [
            {"name": "Rain", "spawn_rate": 2000.0, "lifetime": 0.5, "size": 0.5, "color": [0.7, 0.75, 0.9, 0.4], "velocity": 800.0},
            {"name": "Splash", "spawn_rate": 200.0, "lifetime": 0.2, "size": 3.0, "color": [0.8, 0.85, 1.0, 0.3], "velocity": 50.0},
        ],
        "render_settings": {"type": "Ribbon", "material": "M_VFX_Rain_Ribbon", "sort_order": 0},
        "gpu_sim_settings": {"capacity": 4096, "spawn_rate": 2000.0, "bounds_scale": 10.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "CullByAge"],
        "pool_config": {"max_pool_size": 2, "auto_release_threshold": 10.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Zone_Storm",
        "category": "Zone",
        "subcategory": "Environment",
        "species": None,
        "description": "Zone storm effect - heavy rain + lightning + wind debris",
        "emitters": [
            {"name": "HeavyRain", "spawn_rate": 3000.0, "lifetime": 0.3, "size": 0.5, "color": [0.5, 0.55, 0.7, 0.5], "velocity": 1200.0},
            {"name": "Lightning", "spawn_rate": 5.0, "lifetime": 0.1, "size": 100.0, "color": [1.0, 1.0, 1.0, 1.0], "velocity": 0.0},
            {"name": "Debris", "spawn_rate": 100.0, "lifetime": 2.0, "size": 5.0, "color": [0.4, 0.35, 0.3, 0.7], "velocity": 300.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Storm", "sort_order": 0},
        "gpu_sim_settings": {"capacity": 8192, "spawn_rate": 3000.0, "bounds_scale": 15.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Turbulence", "CullByAge"],
        "pool_config": {"max_pool_size": 2, "auto_release_threshold": 10.0},
        "significance_rank": 1,
    },
    # ── Species VFX - Huran (3) ──────────────────────────────────────────────
    {
        "name": "VFX_Huran_Splash",
        "category": "Species",
        "subcategory": "Huran",
        "species": "Huran",
        "description": "Huran water splash - amphibious movement splash particles",
        "emitters": [
            {"name": "Splash", "spawn_rate": 150.0, "lifetime": 0.8, "size": 12.0, "color": [0.1, 0.4, 0.9, 0.8], "velocity": 120.0},
            {"name": "Spray", "spawn_rate": 80.0, "lifetime": 0.5, "size": 4.0, "color": [0.2, 0.6, 1.0, 0.6], "velocity": 200.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Water_Splash", "sort_order": 3},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 150.0, "bounds_scale": 1.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Huran_Ripple",
        "category": "Species",
        "subcategory": "Huran",
        "species": "Huran",
        "description": "Huran water ripple - expanding concentric ring on water surface",
        "emitters": [
            {"name": "Ripple", "spawn_rate": 20.0, "lifetime": 2.0, "size": 40.0, "color": [0.15, 0.45, 0.85, 0.4], "velocity": 0.0},
        ],
        "render_settings": {"type": "Mesh", "material": "M_VFX_Water_Ripple", "sort_order": 2},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 20.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "ScaleByLife", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Huran_Bubble",
        "category": "Species",
        "subcategory": "Huran",
        "species": "Huran",
        "description": "Huran bubble emitter - rising underwater/underfoot bubbles",
        "emitters": [
            {"name": "Bubbles", "spawn_rate": 40.0, "lifetime": 3.0, "size": 6.0, "color": [0.3, 0.6, 1.0, 0.5], "velocity": 40.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Bubble", "sort_order": 2},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 40.0, "bounds_scale": 1.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Buoyancy", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    # ── Species VFX - Khael (3) ──────────────────────────────────────────────
    {
        "name": "VFX_Khael_Crystal",
        "category": "Species",
        "subcategory": "Khael",
        "species": "Khael",
        "description": "Khael ice crystal formation - growing/shattering crystal shards",
        "emitters": [
            {"name": "CrystalShard", "spawn_rate": 30.0, "lifetime": 1.5, "size": 15.0, "color": [0.9, 0.95, 1.0, 0.9], "velocity": 60.0},
            {"name": "Sparkle", "spawn_rate": 50.0, "lifetime": 0.8, "size": 2.0, "color": [0.5, 0.85, 0.95, 1.0], "velocity": 40.0},
        ],
        "render_settings": {"type": "Mesh", "material": "M_VFX_Ice_Crystal", "sort_order": 3},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 50.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "ScaleByLife", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Khael_Frost",
        "category": "Species",
        "subcategory": "Khael",
        "species": "Khael",
        "description": "Khael frost aura - cold mist emanating from character",
        "emitters": [
            {"name": "FrostMist", "spawn_rate": 25.0, "lifetime": 2.5, "size": 30.0, "color": [0.85, 0.92, 1.0, 0.2], "velocity": 15.0},
            {"name": "IceParticles", "spawn_rate": 40.0, "lifetime": 1.0, "size": 3.0, "color": [0.7, 0.9, 1.0, 0.7], "velocity": 30.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Frost_Mist", "sort_order": 2},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 40.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Turbulence", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Khael_Shatter",
        "category": "Species",
        "subcategory": "Khael",
        "species": "Khael",
        "description": "Khael ice shatter burst - explosive crystal fragment burst",
        "emitters": [
            {"name": "ShardBurst", "spawn_rate": 200.0, "lifetime": 1.0, "size": 8.0, "color": [0.9, 0.95, 1.0, 1.0], "velocity": 200.0},
            {"name": "IceDust", "spawn_rate": 100.0, "lifetime": 1.5, "size": 4.0, "color": [0.8, 0.9, 1.0, 0.5], "velocity": 80.0},
        ],
        "render_settings": {"type": "Mesh", "material": "M_VFX_Ice_Shatter", "sort_order": 5},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 200.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 3.0},
        "significance_rank": 0,
    },
    # ── Species VFX - Venex (3) ──────────────────────────────────────────────
    {
        "name": "VFX_Venex_Circuit",
        "category": "Species",
        "subcategory": "Venex",
        "species": "Venex",
        "description": "Venex circuit trace - neon circuit board pattern on surface",
        "emitters": [
            {"name": "CircuitTrace", "spawn_rate": 60.0, "lifetime": 1.5, "size": 3.0, "color": [0.0, 1.0, 0.3, 0.8], "velocity": 100.0},
            {"name": "NodePulse", "spawn_rate": 20.0, "lifetime": 2.0, "size": 8.0, "color": [1.0, 0.5, 0.0, 0.6], "velocity": 0.0},
        ],
        "render_settings": {"type": "Ribbon", "material": "M_VFX_Cyber_Circuit", "sort_order": 3},
        "gpu_sim_settings": {"capacity": 1024, "spawn_rate": 60.0, "bounds_scale": 3.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Venex_Pulse",
        "category": "Species",
        "subcategory": "Venex",
        "species": "Venex",
        "description": "Venex neural pulse - expanding cyber ring pulse effect",
        "emitters": [
            {"name": "PulseRing", "spawn_rate": 15.0, "lifetime": 1.5, "size": 50.0, "color": [0.0, 1.0, 0.3, 0.5], "velocity": 0.0},
            {"name": "DataBits", "spawn_rate": 100.0, "lifetime": 0.8, "size": 1.5, "color": [0.0, 0.8, 0.2, 1.0], "velocity": 150.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Cyber_Pulse", "sort_order": 4},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 100.0, "bounds_scale": 3.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "ScaleByLife", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 3.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Venex_Grid",
        "category": "Species",
        "subcategory": "Venex",
        "species": "Venex",
        "description": "Venex holographic grid - wireframe grid projection",
        "emitters": [
            {"name": "GridLines", "spawn_rate": 80.0, "lifetime": 2.0, "size": 2.0, "color": [0.0, 0.8, 0.2, 0.3], "velocity": 0.0},
            {"name": "GridNodes", "spawn_rate": 40.0, "lifetime": 3.0, "size": 4.0, "color": [0.0, 1.0, 0.3, 0.5], "velocity": 0.0},
        ],
        "render_settings": {"type": "Mesh", "material": "M_VFX_Cyber_Grid", "sort_order": 1},
        "gpu_sim_settings": {"capacity": 1024, "spawn_rate": 80.0, "bounds_scale": 4.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "CullByAge"],
        "pool_config": {"max_pool_size": 4, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    # ── Species VFX - Onith (3) ──────────────────────────────────────────────
    {
        "name": "VFX_Onith_Smoke",
        "category": "Species",
        "subcategory": "Onith",
        "species": "Onith",
        "description": "Onith toxic smoke - poisonous green/purple smoke cloud",
        "emitters": [
            {"name": "ToxicSmoke", "spawn_rate": 35.0, "lifetime": 4.0, "size": 40.0, "color": [0.2, 0.8, 0.1, 0.15], "velocity": 20.0},
            {"name": "PurpleWisps", "spawn_rate": 15.0, "lifetime": 3.0, "size": 20.0, "color": [0.5, 0.1, 0.8, 0.1], "velocity": 10.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Toxic_Smoke", "sort_order": 1},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 35.0, "bounds_scale": 3.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Turbulence", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 1,
    },
    {
        "name": "VFX_Onith_Bubble",
        "category": "Species",
        "subcategory": "Onith",
        "species": "Onith",
        "description": "Onith toxic bubble - venom bubble that pops on contact",
        "emitters": [
            {"name": "VenomBubble", "spawn_rate": 10.0, "lifetime": 5.0, "size": 15.0, "color": [0.3, 0.9, 0.1, 0.6], "velocity": 25.0},
            {"name": "DripTrail", "spawn_rate": 30.0, "lifetime": 1.5, "size": 2.0, "color": [0.2, 0.7, 0.05, 0.4], "velocity": 40.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Toxic_Bubble", "sort_order": 2},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 30.0, "bounds_scale": 1.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Onith_Drip",
        "category": "Species",
        "subcategory": "Onith",
        "species": "Onith",
        "description": "Onith venom drip - dripping poison from surfaces/character",
        "emitters": [
            {"name": "VenomDrip", "spawn_rate": 20.0, "lifetime": 2.0, "size": 3.0, "color": [0.4, 0.85, 0.05, 0.8], "velocity": 60.0},
            {"name": "SplatPool", "spawn_rate": 5.0, "lifetime": 8.0, "size": 25.0, "color": [0.25, 0.75, 0.0, 0.3], "velocity": 0.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Venom_Drip", "sort_order": 1},
        "gpu_sim_settings": {"capacity": 128, "spawn_rate": 20.0, "bounds_scale": 1.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "CullByAge"],
        "pool_config": {"max_pool_size": 16, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    # ── Species VFX - Zheers (3) ──────────────────────────────────────────────
    {
        "name": "VFX_Zheers_Glow",
        "category": "Species",
        "subcategory": "Zheers",
        "species": "Zheers",
        "description": "Zheers radiation glow - persistent yellow/green radioactive aura",
        "emitters": [
            {"name": "RadGlow", "spawn_rate": 15.0, "lifetime": 3.0, "size": 35.0, "color": [0.9, 0.9, 0.1, 0.12], "velocity": 5.0},
            {"name": "GlowParticles", "spawn_rate": 30.0, "lifetime": 2.0, "size": 4.0, "color": [0.3, 0.9, 0.1, 0.6], "velocity": 20.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Radiation_Glow", "sort_order": 1},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 30.0, "bounds_scale": 2.5},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Turbulence", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Zheers_Mutation",
        "category": "Species",
        "subcategory": "Zheers",
        "species": "Zheers",
        "description": "Zheers mutation burst - DNA helix particle burst on adapt trigger",
        "emitters": [
            {"name": "DNAHelix", "spawn_rate": 80.0, "lifetime": 1.5, "size": 6.0, "color": [0.9, 0.85, 0.1, 0.9], "velocity": 100.0},
            {"name": "MutationFlash", "spawn_rate": 200.0, "lifetime": 0.3, "size": 20.0, "color": [0.3, 0.9, 0.1, 0.7], "velocity": 50.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Mutation_Burst", "sort_order": 4},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 200.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 4, "auto_release_threshold": 3.0},
        "significance_rank": 0,
    },
    {
        "name": "VFX_Zheers_RadiationPulse",
        "category": "Species",
        "subcategory": "Zheers",
        "species": "Zheers",
        "description": "Zheers radiation pulse wave - expanding radiation ring",
        "emitters": [
            {"name": "RadWave", "spawn_rate": 10.0, "lifetime": 2.0, "size": 60.0, "color": [0.9, 0.9, 0.05, 0.3], "velocity": 0.0},
            {"name": "RadParticles", "spawn_rate": 50.0, "lifetime": 1.0, "size": 3.0, "color": [0.3, 0.85, 0.05, 0.5], "velocity": 80.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Radiation_Pulse", "sort_order": 3},
        "gpu_sim_settings": {"capacity": 512, "spawn_rate": 50.0, "bounds_scale": 3.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "ScaleByLife", "InitialVelocity", "CullByAge"],
        "pool_config": {"max_pool_size": 4, "auto_release_threshold": 5.0},
        "significance_rank": 1,
    },
    # ── Species VFX - Skeetw (2) ──────────────────────────────────────────────
    {
        "name": "VFX_Skeetw_Mist",
        "category": "Species",
        "subcategory": "Skeetw",
        "species": "Skeetw",
        "description": "Skeetw fog mist - avian species atmospheric fog trail",
        "emitters": [
            {"name": "FogTrail", "spawn_rate": 20.0, "lifetime": 4.0, "size": 50.0, "color": [0.9, 0.9, 0.95, 0.08], "velocity": 8.0},
            {"name": "LimeWisps", "spawn_rate": 10.0, "lifetime": 3.0, "size": 25.0, "color": [0.5, 0.9, 0.2, 0.05], "velocity": 12.0},
        ],
        "render_settings": {"type": "Sprite", "material": "M_VFX_Fog_Mist", "sort_order": 0},
        "gpu_sim_settings": {"capacity": 256, "spawn_rate": 20.0, "bounds_scale": 3.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "Turbulence", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
    {
        "name": "VFX_Skeetw_Feather",
        "category": "Species",
        "subcategory": "Skeetw",
        "species": "Skeetw",
        "description": "Skeetw feather trail - drifting feather particles during glide",
        "emitters": [
            {"name": "FeatherDrop", "spawn_rate": 15.0, "lifetime": 5.0, "size": 10.0, "color": [0.95, 0.95, 0.98, 0.7], "velocity": 20.0},
            {"name": "GlowDust", "spawn_rate": 25.0, "lifetime": 2.0, "size": 3.0, "color": [0.5, 0.9, 0.2, 0.4], "velocity": 10.0},
        ],
        "render_settings": {"type": "Mesh", "material": "M_VFX_Feather", "sort_order": 2},
        "gpu_sim_settings": {"capacity": 128, "spawn_rate": 25.0, "bounds_scale": 2.0},
        "module_stack": ["SpawnRate", "Lifetime", "InitialSize", "InitialColor", "InitialVelocity", "GravityForce", "Turbulence", "Drag", "CullByAge"],
        "pool_config": {"max_pool_size": 8, "auto_release_threshold": 5.0},
        "significance_rank": 2,
    },
]


def compute_checksum(data: str) -> str:
    """Compute SHA-256 checksum for validation."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()[:16]


def generate_vfx_uasset_json(vfx: dict) -> dict:
    """Generate a structured .uasset.json companion file for a Niagara VFX system."""
    now = datetime.now(timezone.utc).isoformat()

    species_config = None
    if vfx.get("species") and vfx["species"] in SPECIES_VFX_CONFIGS:
        species_config = SPECIES_VFX_CONFIGS[vfx["species"]]

    spec = {
        "asset_type": "NiagaraSystem",
        "asset_class": "UNiagaraSystem",
        "asset_name": vfx["name"],
        "version": 1,
        "generated_at": now,
        "generator": "generate_vfx_uassets.py",

        "niagara_system_spec": {
            "description": vfx["description"],
            "category": vfx["category"],
            "subcategory": vfx["subcategory"],
            "species": vfx.get("species"),

            # Emitter configurations
            "emitters": [
                {
                    "emitter_name": f"Emitter_{e['name']}",
                    "spawn_rate": e["spawn_rate"],
                    "lifetime": e["lifetime"],
                    "initial_size": e["size"],
                    "initial_color": {
                        "r": e["color"][0],
                        "g": e["color"][1],
                        "b": e["color"][2],
                        "a": e["color"][3],
                    },
                    "initial_velocity": e["velocity"],
                    "emitter_type": "GPU",
                }
                for e in vfx["emitters"]
            ],

            # Module stack
            "module_stack": vfx["module_stack"],

            # Render settings
            "render_settings": vfx["render_settings"],

            # GPU simulation settings
            "gpu_simulation_settings": vfx["gpu_sim_settings"],

            # Pool configuration
            "pool_config": vfx["pool_config"],

            # Significance rank for distance-based culling
            "significance_rank": vfx["significance_rank"],
        },

        # Species-specific configuration (if applicable)
        "species_vfx_config": species_config,

        "ue5_import_metadata": {
            "content_path": f"VFX/{vfx['category']}/{vfx['subcategory']}/{vfx['name']}",
            "package_name": f"/Game/VFX/{vfx['category']}/{vfx['subcategory']}/{vfx['name']}",
            "asset_registry_type": "NiagaraSystem",
            "import_script": "import_vfx_to_ue5.py",
        }
    }

    return spec


def generate_vfx_manifest(systems: list) -> dict:
    """Generate the Niagara_VFX_Manifest.json with all 27 VFX systems."""
    categories = {}
    for s in systems:
        key = s["category"]
        if key not in categories:
            categories[key] = 0
        categories[key] += 1

    species_counts = {}
    for s in systems:
        if s.get("species"):
            species_counts[s["species"]] = species_counts.get(s["species"], 0) + 1

    return {
        "manifest_version": "1.0.0",
        "project": "Khaaos_Run",
        "engine_version": "5.8",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_vfx_systems": len(systems),
        "categories": categories,
        "species_vfx_counts": species_counts,
        "vfx_systems": [
            {
                "name": s["name"],
                "category": s["category"],
                "subcategory": s["subcategory"],
                "species": s.get("species"),
                "description": s["description"],
                "emitter_count": len(s["emitters"]),
                "render_type": s["render_settings"]["type"],
                "uasset_json_path": f"VFX/{s['category']}/{s['subcategory']}/{s['name']}.uasset.json",
            }
            for s in systems
        ]
    }


def generate_import_vfx_script(systems: list) -> str:
    """Generate the UE5 Python import script for Niagara VFX systems."""
    lines = [
        '#!/usr/bin/env python3',
        '"""',
        'UE5 Python import script for Khaaos_Run Niagara VFX Systems.',
        '',
        'Run inside UE5 Editor Python console or via command line:',
        '  python import_vfx_to_ue5.py',
        '',
        'Requires: unreal module (UE5 Python scripting plugin enabled)',
        '           Niagara plugin must be enabled in the project.',
        '"""',
        '',
        'import unreal',
        'import json',
        'import os',
        '',
        '# UE5 asset utilities',
        'editor_asset_lib = unreal.EditorAssetLibrary',
        '',
        '# Base content path',
        'CONTENT_BASE = "/Game/VFX"',
        '',
        '',
        'def load_vfx_spec(json_path: str) -> dict:',
        '    """Load a .uasset.json spec file."""',
        '    with open(json_path, "r") as f:',
        '        return json.load(f)',
        '',
        '',
        'def create_niagara_system(spec: dict) -> bool:',
        '    """Create a NiagaraSystem asset from a JSON spec.',
        '',
        '    Note: Full Niagara system creation requires the Niagara Editor module.',
        '    This script creates a placeholder Niagara system and logs the',
        '    required emitter/module configuration for manual setup or future automation.',
        '    """',
        '    spec_data = spec["niagara_system_spec"]',
        '    asset_name = spec["asset_name"]',
        '    cat = spec_data["category"]',
        '    subcat = spec_data["subcategory"]',
        '    package_path = f"{CONTENT_BASE}/{cat}/{subcat}"',
        '    full_path = f"{package_path}/{asset_name}"',
        '',
        '    # Check if asset already exists',
        '    if editor_asset_lib.does_asset_exist(full_path):',
        '        unreal.log_warning(f"Asset already exists: {full_path}, skipping")',
        '        return True',
        '',
        '    try:',
        '        # Create the NiagaraSystem asset',
        '        asset = editor_asset_lib.create_asset(',
        '            asset_name, package_path, unreal.NiagaraSystem, None',
        '        )',
        '        if not asset:',
        '            unreal.log_error(f"Failed to create Niagara system: {full_path}")',
        '            return False',
        '',
        '        # Configure GPU simulation settings',
        '        gpu_sim = spec_data["gpu_simulation_settings"]',
        '        niagara_sim = asset.get_editor_property("gpu_computation_setting") if hasattr(asset, "get_editor_property") else None',
        '',
        '        # Log emitter configuration for manual setup',
        '        for emitter_conf in spec_data["emitters"]:',
        '            unreal.log(f"  Emitter: {emitter_conf[\'emitter_name\']}")',
        '            unreal.log(f"    Spawn Rate: {emitter_conf[\'spawn_rate\']}")',
        '            unreal.log(f"    Lifetime: {emitter_conf[\'lifetime\']}")',
        '            unreal.log(f"    Size: {emitter_conf[\'initial_size\']}")',
        '            unreal.log(f"    Color: {emitter_conf[\'initial_color\']}")',
        '',
        '        # Save the asset',
        '        editor_asset_lib.save_asset(full_path, only_if_is_dirty=False)',
        '        unreal.log(f"Created NiagaraSystem: {full_path}")',
        '        return True',
        '',
        '    except Exception as e:',
        '        unreal.log_error(f"Error creating {full_path}: {e}")',
        '        return False',
        '',
        '',
        'def register_vfx_with_manager(vfx_name: str, asset_path: str) -> None:',
        '    """Register a VFX with the KhaaosVFXManager subsystem.',
        '',
        '    This should be called during game initialization to populate',
        '    the VFXRegistry in UKhaaosVFXManager.',
        '    """',
        '    unreal.log(f"Register VFX: {vfx_name} -> {asset_path}")',
        '    # In practice, this calls:',
        '    # VFXManager = world.GetSubsystem(UKhaaosVFXManager)',
        '    # VFXManager.RegisterVFX(vfx_name, NiagaraSystem)',
        '',
        '',
        'def import_all_vfx_systems(json_dir: str) -> dict:',
        '    """Import all Niagara VFX systems from .uasset.json files."""',
        '    results = {"total": 0, "success": 0, "failed": 0, "errors": []}',
        '',
        '    for root, dirs, files in os.walk(json_dir):',
        '        for fname in files:',
        '            if not fname.endswith(".uasset.json"):',
        '                continue',
        '            fpath = os.path.join(root, fname)',
        '            try:',
        '                spec = load_vfx_spec(fpath)',
        '                if create_niagara_system(spec):',
        '                    results["success"] += 1',
        '                    # Register with VFX manager',
        '                    register_vfx_with_manager(',
        '                        spec["asset_name"],',
        '                        spec["ue5_import_metadata"]["package_name"]',
        '                    )',
        '                else:',
        '                    results["failed"] += 1',
        '                    results["errors"].append(fpath)',
        '            except Exception as e:',
        '                results["failed"] += 1',
        '                results["errors"].append(f"{fpath}: {e}")',
        '            results["total"] += 1',
        '',
        '    unreal.log(f"VFX Import Complete: {results[\'success\']}/{results[\'total\']} successful")',
        '    return results',
        '',
        '',
        'if __name__ == "__main__":',
        '    # Path to the VFX content directory',
        '    vfx_content_dir = os.path.join(',
        '        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),',
        '        "Unreal", "KhaaosRun", "Content", "VFX"',
        '    )',
        '    import_all_vfx_systems(vfx_content_dir)',
    ]

    return "\n".join(lines)


def main():
    """Main entry point - generate all VFX .uasset.json files and manifests."""
    systems = VFX_SYSTEMS
    print(f"Generating {len(systems)} Niagara VFX .uasset.json files...")

    # Ensure directories exist
    for s in systems:
        out_dir = CONTENT_DIR / s["category"] / s["subcategory"]
        out_dir.mkdir(parents=True, exist_ok=True)

    # Generate .uasset.json for each VFX system
    generated_files = []
    for vfx in systems:
        spec = generate_vfx_uasset_json(vfx)
        output_path = CONTENT_DIR / vfx["category"] / vfx["subcategory"] / f"{vfx['name']}.uasset.json"

        with open(output_path, "w") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)

        # Compute checksum
        with open(output_path, "r") as f:
            checksum = compute_checksum(f.read())
        spec["checksum"] = checksum

        # Rewrite with checksum
        with open(output_path, "w") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)

        generated_files.append(str(output_path))
        print(f"  Created: {vfx['category']}/{vfx['subcategory']}/{vfx['name']}.uasset.json")

    # Generate Niagara_VFX_Manifest.json
    manifest = generate_vfx_manifest(systems)
    manifest_path = CONTENT_DIR / "Niagara_VFX_Manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"  Created: Niagara_VFX_Manifest.json ({len(systems)} systems)")

    # Generate UE5 Python import script
    import_script = generate_import_vfx_script(systems)
    import_path = SCRIPTS_DIR / "import_vfx_to_ue5.py"
    with open(import_path, "w") as f:
        f.write(import_script)
    print(f"  Created: scripts/import_vfx_to_ue5.py")

    print(f"\nDone! Generated {len(generated_files)} .uasset.json files + manifest + import script")
    return generated_files


if __name__ == "__main__":
    main()
