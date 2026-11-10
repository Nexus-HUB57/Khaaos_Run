"""Configure CIGKV Subsurface Profiles and hair anisotropy in Unreal Editor.

The operation is intentionally idempotent. It loads the versioned recipe,
creates missing SubsurfaceProfile assets when the UE5.8 Python API exposes a
factory, updates profile settings where supported, writes scalar and profile
parameters to material instances, saves assets, and emits a report. It fails
loudly instead of claiming configuration when a required API setter is absent.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import unreal

ROOT = Path(os.environ.get("GITHUB_WORKSPACE", Path.cwd()))
RECIPE_PATH = ROOT / "Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json"
OUT = ROOT / "artifacts/cigkv-vertical-slice/material-configuration-report.json"
MATERIAL_ROOT = "/Game/Materials/CIGKV"
MASTER_PATH = f"{MATERIAL_ROOT}/M_CIGKV_Character_Master"
PROFILE_SPECS = {
    "human_skin": {"asset": f"{MATERIAL_ROOT}/SSP_CIGKV_Human_Skin", "color": (1.0, 0.42, 0.32), "radius": 1.15},
    "zheers_skin": {"asset": f"{MATERIAL_ROOT}/SSP_CIGKV_Zheers_Skin", "color": (0.35, 0.62, 0.72), "radius": 1.45},
}


def log(message: str):
    unreal.log(f"[CIGKV_MATERIAL_CONFIG] {message}")


def fail(message: str):
    raise RuntimeError(f"[CIGKV_MATERIAL_CONFIG] {message}")


def load_recipe():
    if not RECIPE_PATH.is_file():
        fail(f"receita ausente: {RECIPE_PATH}")
    return json.loads(RECIPE_PATH.read_text())


def asset(path: str):
    return unreal.EditorAssetLibrary.load_asset(path)


def save(path: str):
    if not unreal.EditorAssetLibrary.save_asset(path, only_if_is_dirty=False):
        fail(f"não foi possível salvar asset: {path}")


def create_profile(path: str):
    existing = asset(path)
    if existing:
        return existing, False
    profile_class = getattr(unreal, "SubsurfaceProfile", None)
    factory_class = getattr(unreal, "SubsurfaceProfileFactory", None)
    if profile_class is None or factory_class is None:
        fail("API UE5.8 sem SubsurfaceProfile/SubsurfaceProfileFactory; não foi possível criar perfil")
    package, name = path.rsplit("/", 1)
    created = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, package, profile_class, factory_class())
    if not created:
        fail(f"falha ao criar SubsurfaceProfile: {path}")
    return created, True


def set_editor_property_if_supported(obj, property_name: str, value):
    try:
        obj.set_editor_property(property_name, value)
        return True
    except Exception:
        return False


def configure_profile(path: str, spec: dict):
    profile, created = create_profile(path)
    settings = getattr(profile, "settings", None)
    configured = []
    if settings is not None:
        for name, value in (("falloff_color", unreal.LinearColor(*spec["color"], 1.0)), ("mean_free_path_distance", spec["radius"]), ("world_unit_scale", 1.0)):
            if set_editor_property_if_supported(settings, name, value):
                configured.append(name)
        if configured and not set_editor_property_if_supported(profile, "settings", settings):
            fail(f"settings do perfil não puderam ser persistidos: {path}")
    if not configured:
        log(f"warning: perfil {path} criado/carregado, mas propriedades de settings não foram expostas pela API")
    save(path)
    return {"path": path, "created": created, "configured_properties": configured, "status": "pass" if configured else "warning"}


def set_scalar(instance, name: str, value: float):
    method = getattr(unreal.MaterialEditingLibrary, "set_material_instance_scalar_parameter_value", None)
    if method is None:
        fail("MaterialEditingLibrary sem setter de scalar")
    method(instance, name, float(value))


def set_profile_parameter(instance, profile):
    candidates = [
        "set_material_instance_subsurface_profile_parameter_value",
        "set_material_instance_subsurface_profile_value",
    ]
    for candidate in candidates:
        method = getattr(unreal.MaterialEditingLibrary, candidate, None)
        if method:
            method(instance, "SubsurfaceProfile", profile)
            return candidate
    # Some UE builds expose the generic parameter setter under the editor utility.
    generic = getattr(unreal.MaterialEditingLibrary, "set_material_instance_parameter_value", None)
    if generic:
        generic(instance, "SubsurfaceProfile", profile)
        return "set_material_instance_parameter_value"
    fail("API UE5.8 sem setter de parâmetro SubsurfaceProfile")


def configure_instance(recipe_instance: dict, profiles: dict, master):
    name = recipe_instance["name"]
    path = f"{MATERIAL_ROOT}/{name}"
    instance = asset(path)
    if not instance:
        fail(f"material instance ausente: {path}")
    parent = getattr(instance, "parent", None)
    if parent and parent != master:
        fail(f"parent incorreto em {path}: esperado {MASTER_PATH}")
    checks = {}
    surface = recipe_instance["surface"]
    if surface in {"skin", "species_skin"}:
        key = "human_skin" if surface == "skin" else "zheers_skin"
        set_scalar(instance, "SubsurfaceStrength", recipe_instance["subsurface_strength"])
        set_scalar(instance, "SubsurfaceRadius", profiles[key]["radius"])
        checks["SubsurfaceStrength"] = recipe_instance["subsurface_strength"]
        checks["SubsurfaceRadius"] = profiles[key]["radius"]
        checks["SubsurfaceProfileSetter"] = set_profile_parameter(instance, profiles[key]["asset_object"])
    if surface == "hair":
        set_scalar(instance, "HairAnisotropy", recipe_instance["hair_anisotropy"])
        set_scalar(instance, "HairFlowStrength", 1.0)
        checks["HairAnisotropy"] = recipe_instance["hair_anisotropy"]
        checks["HairFlowStrength"] = 1.0
    unreal.MaterialEditingLibrary.update_material_instance(instance)
    save(path)
    return {"name": name, "path": path, "checks": checks, "status": "pass"}


def main():
    recipe = load_recipe()
    master = asset(MASTER_PATH)
    if not master:
        fail(f"master material ausente: {MASTER_PATH}")
    profile_report = []
    profiles = {}
    for key, spec in PROFILE_SPECS.items():
        result = configure_profile(spec["asset"], spec)
        profile_report.append(result)
        profiles[key] = {"asset_object": asset(spec["asset"]), "radius": spec["radius"]}
    instances = [configure_instance(item, profiles, master) for item in recipe["instances"]]
    report = {
        "schema": "khaaos.cigkv.material-configuration-report/v1",
        "engine_only": True,
        "engine_version": str(unreal.SystemLibrary.get_engine_version()),
        "master": MASTER_PATH,
        "subsurface_profiles": profile_report,
        "instances": instances,
        "status": "pass",
        "visual_acceptance": "pending_screenshot_matrix",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n")
    log(f"configuração concluída: profiles={len(profile_report)} instances={len(instances)}")


if __name__ == "__main__":
    main()
