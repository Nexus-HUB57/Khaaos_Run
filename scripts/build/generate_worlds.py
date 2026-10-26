#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Geração procedural dos mundos jogáveis (UE 5.8 Editor).

Roda DENTRO do Unreal Editor (GUI ou commandlet `-run=pythonscript`), porque
assets (.umap/.uasset) só são criados pela engine. Fecha o bloqueador de
mundos do TODO na medida do possível sem engine:

  1. /Game/Maps/Menu_Khaaos  — blockout do menu (GameDefaultMap);
  2. /Game/Maps/CIGKV_BR     — blockout BR 120m×120m: solo, 8 POIs
     determinísticos (estruturas + PlayerStarts + pontos de loot), paredes de
     borda, marcador do anel, iluminação (Lumen: direcional + sky + atmosfera
     + fog);
  3. /Game/Materials/M_Khaaos{Ground,Structure,Foliage} — materiais PBR base
     (parâmetros vetoriais/escalares conectados) e instâncias MI_*;
  4. /Game/VFX/NS_{Explosion,GlooPuff,AirdropDust} — placeholders Niagara
     (sistemas vazios criados por factory; emissores detalhados são autorados
     no Editor depois — a criação programática de emissores é instável entre
     versões e é tratada como warning, não como falha).

Contrato de saída: linha
  KHR_WORLDGEN_RESULT_JSON: { "status": "ok|partial|failed", ... }
parseável pelo build_worlds.sh — UMA linha, JSON válido.

Princípios: cada passo é independente (falha de um vira warning, não aborta),
layout 100% determinístico (sem RNG — mesmas coordenadas em toda execução) e
a pipeline é idempotente (re-executar substitui assets existentes).
"""
import json
import os
import sys
import traceback

try:
    import unreal
except ImportError:  # fora do editor (CI, pré-execução)
    print("KHR_WORLDGEN_RESULT_JSON: " + json.dumps({
        "status": "failed",
        "reason": "python_ineditor_only",
        "message": "execute dentro do Unreal Editor: -run=pythonscript -script=<este arquivo>",
    }))
    sys.exit(1)

# ─── Constantes de mundo (cm) — determinísticas ──────────────────────────────
MENU_MAP = "/Game/Maps/Menu_Khaaos"
BR_MAP = "/Game/Maps/CIGKV_BR"
CUBE = "/Engine/BasicShapes/Cube.Cube"
CYLINDER = "/Engine/BasicShapes/Cylinder.Cylinder"

GROUND_SCALE = (120.0, 120.0, 4.0)      # 120 m × 120 m × 4 m de espessura
BORDER = (0.0, 0.0, 0.0)

# POIs do BR: nome, posição (x, y), raio de estruturas. 8 pontos simétricos
# ao redor do centro — base para o loot/queda (world layout v1 do CIGKV).
POIS = [
    ("AruKheea", (-3500, -3500)), ("Barburhen", (0, -4000)),
    ("Ckesalth", (3500, -3500)), ("Priadus", (-4000, 0)),
    ("Zentrum", (0, 0)),         ("Cigarra", (4000, 0)),
    ("VaalNor", (-3500, 3500)),  ("Iguassu", (3500, 3500)),
]

MATERIALS = [
    ("M_KhaaosGround",    (0.28, 0.26, 0.22, 1.0), 0.95, 0.0),
    ("M_KhaaosStructure", (0.45, 0.44, 0.42, 1.0), 0.60, 0.10),
    ("M_KhaaosFoliage",   (0.16, 0.35, 0.14, 1.0), 0.90, 0.0),
]

NIAGARA_PLACEHOLDERS = ["NS_Explosion", "NS_GlooPuff", "NS_AirdropDust"]

# ─── Helpers defensivos ──────────────────────────────────────────────────────
def _sub(cls):
    """Subsystem do editor ou None (API drift entre versões é tratada)."""
    try:
        return unreal.get_editor_subsystem(cls)
    except Exception:
        return None


def _actor_sub():
    return _sub(unreal.EditorActorSubsystem)


def _level_sub():
    return _sub(unreal.EditorLevelSubsystem)


def _editor_world():
    sub = _sub(unreal.UnrealEditorSubsystem)
    try:
        return sub.get_editor_world() if sub else unreal.EditorLevelLibrary.get_editor_world()
    except Exception:
        return None


def _load(mesh_path):
    return unreal.EditorAssetLibrary.load_asset(mesh_path)


def _spawn(actor_class, location, rotation=None):
    sub = _actor_sub()
    if not sub:
        return None
    rot = rotation or unreal.Rotator(0.0, 0.0, 0.0)
    return sub.spawn_actor_from_class(actor_class, unreal.Vector(*location), rot)


def _spawn_mesh(mesh_path, location, scale, material=None, rotation=None):
    mesh = _load(mesh_path)
    if not mesh:
        return None
    actor = _spawn(unreal.StaticMeshActor, location, rotation)
    if not actor:
        return None
    component = actor.get_editor_property("static_mesh_component")
    component.set_static_mesh(mesh, unreal.MeshComponentStaticLightingInfo())
    if material:
        component.set_material(0, material)
    actor.set_actor_scale3d(unreal.Vector(*scale))
    return actor


def _box(center, size, material):
    """Caixa de estrutura: center=(x,y,z cm), size=(sx,sy,sz em m)."""
    return _spawn_mesh(CUBE, center, (size[0] * 10.0, size[1] * 10.0, size[2] * 10.0), material)


# ─── Materiais PBR ───────────────────────────────────────────────────────────
def create_materials(result):
    made = []
    try:
        unreal.EditorAssetLibrary.make_directory("/Game/Materials")
    except Exception:
        pass
    for name, base_color, roughness, metallic in MATERIALS:
        try:
            path = "/Game/Materials"
            if unreal.EditorAssetLibrary.does_asset_exist(f"{path}/{name}"):
                made.append(f"{path}/{name}")
                continue
            asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
            material = asset_tools.create_asset(name, path, unreal.Material, unreal.MaterialFactoryNew())
            if not material:
                result["warnings"].append(f"material {name}: factory sem retorno")
                continue
            # Parâmetro vetorial BaseColor conectado ao slot Base Color.
            try:
                expr = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionVectorParameter, node_name="BaseColor")
                expr.set_editor_property("default_value", unreal.LinearColor(*base_color))
                unreal.MaterialEditingLibrary.connect_material_property(expr, "", unreal.MaterialProperty.MP_BASE_COLOR)
                rough = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionScalarParameter, node_name="Roughness")
                rough.set_editor_property("default_value", float(roughness))
                unreal.MaterialEditingLibrary.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
                metal = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionScalarParameter, node_name="Metallic")
                metal.set_editor_property("default_value", float(metallic))
                unreal.MaterialEditingLibrary.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
            except Exception as expr_error:
                result["warnings"].append(f"material {name}: parâmetros não conectados ({expr_error})")
            made.append(f"{path}/{name}")
        except Exception as mat_error:
            result["warnings"].append(f"material {name}: {mat_error}")
    return made


def _load_material(name):
    try:
        return unreal.EditorAssetLibrary.load_asset(f"/Game/Materials/{name}")
    except Exception:
        return None


# ─── Iluminação Lumen ────────────────────────────────────────────────────────
def _lighting(result):
    lit = 0
    sun = _spawn(unreal.DirectionalLight, (0.0, 0.0, 40000.0), unreal.Rotator(-48.0, 35.0, 0.0))
    lit += 1 if sun else 0
    sky = _spawn(unreal.SkyLight, (0.0, 0.0, 30000.0))
    lit += 1 if sky else 0
    atm = _spawn(unreal.SkyAtmosphere, (0.0, 0.0, 0.0))
    lit += 1 if atm else 0
    fog = _spawn(unreal.ExponentialHeightFog, (0.0, 0.0, 0.0))
    lit += 1 if fog else 0
    if lit < 4:
        result["warnings"].append(f"iluminação parcial: {lit}/4 atores criados")
    return lit


# ─── Mapas ───────────────────────────────────────────────────────────────────
def _new_level(path, result):
    level_sub = _level_sub()
    try:
        if level_sub and not level_sub.new_level(path):
            raise RuntimeError("new_level sem retorno")
        return True
    except Exception as level_error:
        # fallback API legada
        try:
            return bool(unreal.EditorLevelLibrary.new_level(path))
        except Exception as legacy_error:
            result["warnings"].append(f"nível {path}: {level_error} / {legacy_error}")
            return False


def _save_all(result):
    try:
        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
        return True
    except Exception as save_error:
        result["warnings"].append(f"save: {save_error}")
        return False


def build_menu_map(result, made_materials):
    if not _new_level(MENU_MAP, result):
        return False
    ground_mat = _load_material("M_KhaaosGround")
    struct_mat = _load_material("M_KhaaosStructure")
    # Piso do menu 40 m e pano de fundo com o wordmark esculpido em caixas.
    _spawn_mesh(CUBE, (0.0, 0.0, -200.0), (40.0, 40.0, 4.0), ground_mat)
    _spawn_mesh(CUBE, (0.0, 2000.0, 400.0), (40.0, 1.0, 8.0), struct_mat)
    for i in range(4):
        x = -1500.0 + i * 1000.0
        _box((x, -1600.0, 200.0), (0.8, 0.8, 4.0), struct_mat)  # pilares
    start = _spawn(unreal.PlayerStart, (0.0, -800.0, 100.0))
    if not start:
        result["warnings"].append("menu: PlayerStart ausente")
    _lighting(result)
    _save_all(result)
    result["maps"].append({"path": MENU_MAP, "kind": "menu", "player_starts": 1})
    return True


def build_br_map(result, made_materials):
    if not _new_level(BR_MAP, result):
        return False
    ground_mat = _load_material("M_KhaaosGround")
    struct_mat = _load_material("M_KhaaosStructure")
    foliage_mat = _load_material("M_KhaaosFoliage")
    # Solo 120 m.
    _spawn_mesh(CUBE, (0.0, 0.0, -200.0), GROUND_SCALE, ground_mat)
    # Paredes de borda (zona mata fora delas — KillZ baixo).
    for bx, by, sx, sy in [(0, 6100, 124.0, 2.0), (0, -6100, 124.0, 2.0), (6100, 0, 2.0, 124.0), (-6100, 0, 2.0, 124.0)]:
        _spawn_mesh(CUBE, (bx * 100.0, by * 100.0, 150.0), (sx, sy, 3.0), struct_mat)
    # Marcador central do anel (fase 1 inicia aqui).
    ring = _spawn_mesh(CYLINDER, (0.0, 0.0, 50.0), (6.0, 6.0, 1.0), struct_mat)
    if not ring:
        result["warnings"].append("BR: marcador de anel ausente")
    # POIs determinísticos.
    player_starts = 0
    loot_points = 0
    for name, (px, py) in POIS:
        # 4 estruturas por POI (portal + 2 blocos + torre).
        _box((px * 100.0, py * 100.0, 150.0), (4.0, 0.8, 3.0), struct_mat)
        _box(((px - 250) * 100.0, (py - 250) * 100.0, 100.0), (2.5, 2.5, 2.0), struct_mat)
        _box(((px + 250) * 100.0, (py + 250) * 100.0, 100.0), (2.5, 2.5, 2.0), struct_mat)
        _box((px * 100.0, py * 100.0, 350.0), (1.2, 1.2, 7.0), struct_mat)  # torre
        if _spawn(unreal.PlayerStart, (float(px) * 100.0 - 600.0, float(py) * 100.0 - 600.0, 100.0)):
            player_starts += 1
        for dx, dy in ((-500, 0), (500, 0), (0, 500)):
            if _spawn(unreal.TargetPoint, (float(px) * 100.0 + dx, float(py) * 100.0 + dy, 50.0)):
                loot_points += 1
    # Manchas de vegetação (foliage material) ao redor dos POIs diagonais.
    for name, (px, py) in POIS:
        if name in ("Zentrum",):
            continue
        for k in range(3):
            _spawn_mesh(CYLINDER, ((px + k * 130 - 130) * 100.0, (py + 600) * 100.0, 60.0), (1.0, 1.0, 1.2), foliage_mat)
    world = _editor_world()
    if world:
        try:
            settings = world.get_world_settings()
            settings.set_editor_property("kill_z", -2000.0)
        except Exception as killz_error:
            result["warnings"].append(f"BR: KillZ não ajustado ({killz_error})")
    else:
        result["warnings"].append("BR: world não acessível (KillZ padrão)")
    _lighting(result)
    _save_all(result)
    result["maps"].append({"path": BR_MAP, "kind": "battle_royale", "pois": len(POIS), "player_starts": player_starts, "loot_points": loot_points})
    return True


# ─── Niagara placeholders ────────────────────────────────────────────────────
def create_niagara(result):
    made = []
    try:
        unreal.EditorAssetLibrary.make_directory("/Game/VFX")
    except Exception:
        pass
    try:
        asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
        factory = unreal.NiagaraSystemFactoryNew()
    except Exception as factory_error:
        result["warnings"].append(f"niagara: factory indisponível ({factory_error})")
        return made
    for name in NIAGARA_PLACEHOLDERS:
        try:
            if unreal.EditorAssetLibrary.does_asset_exist(f"/Game/VFX/{name}"):
                made.append(f"/Game/VFX/{name}")
                continue
            system = asset_tools.create_asset(name, "/Game/VFX", unreal.NiagaraSystem, factory)
            if system:
                made.append(f"/Game/VFX/{name}")
            else:
                result["warnings"].append(f"niagara {name}: asset não criado (autoração no Editor pendente)")
        except Exception as niagara_error:
            result["warnings"].append(f"niagara {name}: {niagara_error}")
    return made


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    result = {"status": "failed", "engine": "5.8", "maps": [], "materials": [], "niagara": [], "warnings": [], "steps": {}}
    try:
        unreal.EditorAssetLibrary.make_directory("/Game/Maps")
        result["materials"] = create_materials(result)
        result["steps"]["materials"] = "ok" if result["materials"] else "empty"
        result["steps"]["menu"] = "ok" if build_menu_map(result, result["materials"]) else "failed"
        result["steps"]["br"] = "ok" if build_br_map(result, result["materials"]) else "failed"
        result["niagara"] = create_niagara(result)
        result["steps"]["niagara"] = "ok" if result["niagara"] else "empty"
        map_ok = result["steps"]["menu"] == "ok" and result["steps"]["br"] == "ok"
        result["status"] = "ok" if map_ok else ("partial" if (result["maps"] or result["materials"]) else "failed")
    except Exception as fatal:
        result["status"] = "failed"
        result["reason"] = str(fatal)
        result["traceback"] = traceback.format_exc(limit=3)
    print("KHR_WORLDGEN_RESULT_JSON: " + json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] in ("ok", "partial") else 1


if __name__ == "__main__":
    sys.exit(main())
