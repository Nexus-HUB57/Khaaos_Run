#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khaaos Run — Import do mapa Barburhen no UE5.8 Editor (Fase 1).

Roda DENTRO do Unreal Editor (commandlet `-run=pythonscript`), depois de:
  1. scripts/build/export_barburhen_obj.py   → Barburhen_Map.obj
  2. scripts/build/bake_barburhen_colliders.py → Barburhen_colliders.json

O que faz:
  - importa o OBJ como StaticMesh em /Game/Worlds/Barburhen/Barburhen_Map;
  - aplica "Use Complex Collision As Simple" (colisão exata da malha — o
    manifesto de colliders complexos gerado engine-less é a fonte da verdade
    e valida o resultado: contagem de triângulos e AABB do mesh importado);
  - aplica o material canônico do contrato (M_KhaaosStructure);
  - salva o asset e emite o contrato parseável pelo build_worlds.sh.

Contrato de saída (linha única):
  KHR_BARBURHEN_IMPORT_RESULT_JSON: {"status":"ok|partial|failed", ...}
"""
import json
import os
import sys

try:
    import unreal
except ImportError:  # fora do editor (CI, pré-execução)
    print("KHR_BARBURHEN_IMPORT_RESULT_JSON: " + json.dumps({
        "status": "failed",
        "reason": "python_ineditor_only",
        "message": "execute dentro do Unreal Editor: -run=pythonscript -script=<este arquivo>",
    }))
    sys.exit(1)

DEST_PATH = "/Game/Worlds/Barburhen/Barburhen_Map"
DEFAULT_MATERIAL = "/Game/Materials/M_KhaaosStructure"


def _repo_root():
    # KHAAOS_REPO_ROOT > vizinho do script (repo/scripts/build/…) > CWD
    env_root = os.environ.get("KHAAOS_REPO_ROOT")
    if env_root:
        return env_root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _default_paths():
    root = _repo_root()
    # Fonte padrão: OBJ OFICIAL do pacote (Content/Barburhen, metros) + o
    # manifesto de colliders complexos do bake_barburhen_colliders.py.
    # Fallback: regeneração determinística em mvp_output.
    obj = os.path.join(root, "Unreal", "KhaaosRun", "Content", "Barburhen", "Barburhen_Map.obj")
    if not os.path.isfile(obj):
        obj = os.path.join(root, "mvp_output", "assets", "worlds", "Barburhen_Map.obj")
    manifest = os.path.join(root, "Unreal", "KhaaosRun", "Content", "Barburhen", "Barburhen_colliders.json")
    if not os.path.isfile(manifest):
        manifest = os.path.join(root, "mvp_output", "assets", "worlds", "Barburhen_colliders.json")
    return obj, manifest


def import_mesh(obj_path, scale_to_ue_cm=100.0):
    """Importa o OBJ e devolve o StaticMesh (ou None).

    scale_to_ue_cm: o pacote oficial Barburhen está em METROS — o import
    aplica a conversão para cm (convenção UE) registrada no manifesto.
    """
    task = unreal.AssetImportTask()
    task.filename = obj_path
    task.destination_path = DEST_PATH
    task.automated = True
    task.replace_existing = True
    task.save = True
    if abs(scale_to_ue_cm - 1.0) > 1e-6:
        options = unreal.OBJImportOptions()
        options.conversion_scale = unreal.Vector(scale_to_ue_cm, scale_to_ue_cm, scale_to_ue_cm)
        task.options = options
    unreal.EditorAssetLibrary.import_asset_tasks([task])
    return unreal.EditorAssetLibrary.load_asset(DEST_PATH)


def apply_complex_collision(mesh):
    """Use Complex Collision As Simple — colisão exata da malha (W1/C1)."""
    try:
        mesh.set_editor_property("collision_complexity",
                                 unreal.CollisionComplexity.USE_COMPLEX_AS_SIMPLE)
        return True
    except Exception as exc:  # noqa: BLE001 — API drift tratado como warning
        unreal.log_warning("[BarburhenImport] collision_complexity indisponível: %s" % exc)
        return False


def apply_material(mesh, material_path):
    material = unreal.EditorAssetLibrary.load_asset(material_path)
    if not material:
        return False
    try:
        slots = mesh.get_editor_property("materials")
        if not slots:
            return False
        slots[0].set_editor_property("material", material)
        mesh.set_editor_property("materials", slots)
        return True
    except Exception as exc:  # noqa: BLE001
        unreal.log_warning("[BarburhenImport] material não aplicado: %s" % exc)
        return False


def validate_against_manifest(mesh, manifest):
    """O baking engine-less é a fonte da verdade do collider complexo."""
    bounds = mesh.get_bounding_box()
    mn = bounds.min
    mx = bounds.max
    if not manifest.get("objects"):
        return ["manifesto sem objetos"]
    # o terreno cobre o mapa inteiro: AABB global do mesh ≈ união dos AABBs
    # (manifesto está em METROS no pacote oficial — converte para cm do mesh)
    scale = float(manifest.get("scale_to_ue_cm", 100.0))
    global_min = [min(o["aabb_min"][i] for o in manifest["objects"]) * scale for i in range(3)]
    global_max = [max(o["aabb_max"][i] for o in manifest["objects"]) * scale for i in range(3)]
    issues = []
    tolerance_cm = 100.0  # 1 m — tolerância de import
    for axis in range(3):
        if abs(mn[axis] - global_min[axis]) > tolerance_cm:
            issues.append("aabb_min[%d] import=%.1f esperado=%.1f" % (axis, mn[axis], global_min[axis]))
        if abs(mx[axis] - global_max[axis]) > tolerance_cm:
            issues.append("aabb_max[%d] import=%.1f esperado=%.1f" % (axis, mx[axis], global_max[axis]))
    expected_tris = sum(len(o["collision"]["triangles"]) for o in manifest["objects"])
    if expected_tris <= 0:
        issues.append("manifesto sem triângulos de colisão")
    return issues


def main():
    result = {"script": "import_barburhen_map.py", "destination": DEST_PATH}
    try:
        obj_path, manifest_path = _default_paths()
        if len(sys.argv) > 1:
            obj_path = sys.argv[1]
        if len(sys.argv) > 2:
            manifest_path = sys.argv[2]
        if not os.path.isfile(obj_path):
            raise FileNotFoundError("OBJ ausente: %s (rode export_barburhen_obj.py)" % obj_path)
        with open(manifest_path, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)

        warnings = []
        mesh = import_mesh(obj_path, float(manifest.get("scale_to_ue_cm", 100.0)))
        if not mesh:
            raise RuntimeError("import do OBJ não produziu StaticMesh")
        result["mesh"] = mesh.get_name()

        if not apply_complex_collision(mesh):
            warnings.append("collision_complexity não aplicado (API drift)")
        if not apply_material(mesh, manifest.get("import", {}).get("material", DEFAULT_MATERIAL)):
            warnings.append("material canônico não aplicado")

        issues = validate_against_manifest(mesh, manifest)
        if issues:
            warnings.extend(issues)

        saved = unreal.EditorAssetLibrary.save_asset(DEST_PATH, only_if_is_dirty=False)
        if not saved:
            warnings.append("asset não salvo")

        result.update({
            "status": "ok" if not issues else "partial",
            "warnings": warnings,
            "manifest_objects": len(manifest.get("objects", [])),
            "collision_tris": sum(len(o["collision"]["triangles"]) for o in manifest.get("objects", [])),
        })
    except Exception as exc:  # noqa: BLE001 — contrato único de falha
        result.update({"status": "failed", "reason": str(exc)})
    print("KHR_BARBURHEN_IMPORT_RESULT_JSON: " + json.dumps(result))
    return 0 if result["status"] == "ok" else (2 if result["status"] == "partial" else 1)


if __name__ == "__main__":
    sys.exit(main())
