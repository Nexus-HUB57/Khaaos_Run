"""Configure LOD screen sizes and transition settings for Khael Vance.

Run inside Unreal Editor 5.8 with Python enabled:
    py "<project>/scripts/ue5/configure_khael_lods.py"

The script is intentionally idempotent and defaults to dry-run. To apply:
    py "<project>/scripts/ue5/configure_khael_lods.py" --apply

Optional overrides:
    --mesh /Game/Characters/CIGKV/Mesh/SK_CIGKV_Human_Hero_M01
    --material /Game/Materials/CIGKV/M_CIGKV_Character_Master
    --material /Game/Materials/CIGKV/MI_CIGKV_Human_Skin
    --material /Game/Materials/CIGKV/MI_CIGKV_Human_Cloth
    --material /Game/Materials/CIGKV/MI_CIGKV_Human_Hair

The generated Khael GLB/FBX must already be imported as a Skeletal Mesh before
running this script. This script does not create geometry or Unreal .uassets.
"""

from __future__ import annotations

import argparse
import math
import sys
from typing import Any, Iterable, List, Optional, Sequence, Tuple

import unreal


# Initial values from the Khaaos Run character performance brief.
# ScreenSize is the projected screen fraction used by Unreal's LOD selection.
LOD_SCREEN_SIZES: Tuple[float, ...] = (0.55, 0.25, 0.10, 0.03)
LOD_HYSTERESIS: Tuple[float, ...] = (0.02, 0.02, 0.015, 0.01)

DEFAULT_MESH = "/Game/Characters/CIGKV/Mesh/SK_CIGKV_Human_Hero_M01"
DEFAULT_MATERIALS: Tuple[str, ...] = (
    "/Game/Materials/CIGKV/M_CIGKV_Character_Master",
    "/Game/Materials/CIGKV/MI_CIGKV_Human_Skin",
    "/Game/Materials/CIGKV/MI_CIGKV_Human_Cloth",
    "/Game/Materials/CIGKV/MI_CIGKV_Human_Hair",
)


class LodConfigError(RuntimeError):
    """Raised when a required Unreal property cannot be configured safely."""


def log(message: str) -> None:
    unreal.log("[KhaelLOD] " + message)


def warn(message: str) -> None:
    unreal.log_warning("[KhaelLOD] " + message)


def load_asset(path: str) -> Optional[Any]:
    asset = unreal.EditorAssetLibrary.load_asset(path)
    if not asset:
        warn(f"Asset não encontrado: {path}")
    return asset


def set_property_if_supported(obj: Any, property_name: str, value: Any) -> bool:
    """Set a reflected UE property only when supported by this UE build."""
    try:
        obj.set_editor_property(property_name, value)
        return True
    except Exception as exc:  # UE Python wraps reflection failures inconsistently.
        warn(f"Propriedade não aplicada ({property_name}) em {obj}: {exc}")
        return False


def get_property_if_supported(obj: Any, property_name: str, default: Any = None) -> Any:
    try:
        return obj.get_editor_property(property_name)
    except Exception:
        return default


def property_matches(actual: Any, expected: Any) -> bool:
    if isinstance(expected, float):
        return (
            isinstance(actual, (int, float))
            and not isinstance(actual, bool)
            and math.isclose(float(actual), expected, rel_tol=0.0, abs_tol=1e-4)
        )
    return actual == expected


def set_and_verify_property(obj: Any, property_name: str, value: Any) -> None:
    if not set_property_if_supported(obj, property_name, value):
        raise LodConfigError(f"Não foi possível aplicar a propriedade obrigatória '{property_name}'.")
    actual = get_property_if_supported(obj, property_name, None)
    if actual is None or not property_matches(actual, value):
        raise LodConfigError(
            f"A propriedade '{property_name}' não confirmou o valor {value!r} após a gravação."
        )


def configure_lod_info(mesh: unreal.SkeletalMesh, apply: bool) -> int:
    """Configure LODInfo entries; return number of entries touched."""
    lod_info = get_property_if_supported(mesh, "lod_info")
    if lod_info is None:
        raise LodConfigError(
            "Skeletal Mesh não expõe 'lod_info'. Verifique a versão do Python API do UE5.8."
        )

    existing_count = len(lod_info)
    target_count = min(existing_count, len(LOD_SCREEN_SIZES))
    if existing_count < len(LOD_SCREEN_SIZES):
        warn(
            f"Mesh possui {existing_count} LOD(s); o script configurará somente "
            f"LOD0–LOD{target_count - 1}. Gere os LODs ausentes no editor."
        )

    for index in range(target_count):
        info = lod_info[index]
        screen_size = LOD_SCREEN_SIZES[index]
        hysteresis = LOD_HYSTERESIS[index]
        current_screen = get_property_if_supported(info, "screen_size")
        current_hysteresis = get_property_if_supported(info, "lod_hysteresis")
        log(
            f"LOD{index}: ScreenSize {current_screen} -> {screen_size}; "
            f"Hysteresis {current_hysteresis} -> {hysteresis}"
        )
        if apply:
            set_and_verify_property(info, "screen_size", screen_size)
            set_and_verify_property(info, "lod_hysteresis", hysteresis)

    if apply:
        # Reassign the array so UE versions that copy reflected arrays persist edits.
        if not set_property_if_supported(mesh, "lod_info", lod_info):
            raise LodConfigError("Não foi possível persistir SkeletalMesh.lod_info")
        persisted_lod_info = get_property_if_supported(mesh, "lod_info", None)
        if persisted_lod_info is None or len(persisted_lod_info) < target_count:
            raise LodConfigError("SkeletalMesh.lod_info não reteve as entradas LOD após a gravação")
        for index in range(target_count):
            info = persisted_lod_info[index]
            if not property_matches(get_property_if_supported(info, "screen_size"), LOD_SCREEN_SIZES[index]):
                raise LodConfigError(f"LOD{index}.screen_size não persistiu o valor solicitado")
            if not property_matches(get_property_if_supported(info, "lod_hysteresis"), LOD_HYSTERESIS[index]):
                raise LodConfigError(f"LOD{index}.lod_hysteresis não persistiu o valor solicitado")
    return target_count


def configure_mesh_transition_flags(mesh: unreal.SkeletalMesh, apply: bool) -> None:
    """Set transition-related mesh flags when exposed by the installed UE build."""
    for property_name, value in (
        ("enable_per_poly_skeletal_mesh_lod", True),
        ("support_uniformly_distributed_sampling", True),
    ):
        supported = get_property_if_supported(mesh, property_name, None) is not None
        if supported:
            log(f"Mesh flag {property_name} -> {value}")
            if apply:
                set_and_verify_property(mesh, property_name, value)
        else:
            # These fields differ between UE5 minor releases; not a fatal error.
            warn(f"Mesh flag opcional não exposta nesta versão: {property_name}")


def configure_material_dither(material: Any, apply: bool) -> bool:
    """Enable the material's built-in Dithered LOD Transition flag if available."""
    property_name = "dithered_lod_transition"
    current = get_property_if_supported(material, property_name, None)
    if current is None:
        warn(
            f"Material {material.get_name()} não expõe '{property_name}'. "
            "Ative 'Dithered LOD Transition' manualmente no Material Editor."
        )
        return False
    log(f"Material {material.get_name()}: Dithered LOD Transition {current} -> True")
    if apply:
        set_and_verify_property(material, property_name, True)
    return True


def save_asset(asset: Any, apply: bool) -> None:
    if not apply:
        return
    if not unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False):
        raise LodConfigError(f"Asset não pôde ser salvo: {asset.get_name()}")
    log(f"Salvo: {asset.get_path_name()}")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Aplicar e salvar alterações")
    parser.add_argument("--mesh", default=DEFAULT_MESH, help="Object path do Skeletal Mesh")
    parser.add_argument(
        "--material", action="append", dest="materials", default=None,
        help="Object path de material; pode ser repetido",
    )
    return parser.parse_args(list(argv))


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    apply = bool(args.apply)
    log("Modo: APPLY" if apply else "Modo: DRY-RUN (use --apply para salvar)")

    mesh = load_asset(args.mesh)
    if not mesh:
        return 2
    if not isinstance(mesh, unreal.SkeletalMesh):
        warn(f"Asset não é SkeletalMesh: {args.mesh}")
        return 2

    try:
        touched = configure_lod_info(mesh, apply)
        configure_mesh_transition_flags(mesh, apply)
        save_asset(mesh, apply)
    except LodConfigError as exc:
        warn(str(exc))
        return 3

    material_paths: Iterable[str] = args.materials or DEFAULT_MATERIALS
    material_count = 0
    for material_path in material_paths:
        material = load_asset(material_path)
        if not material:
            continue
        try:
            if configure_material_dither(material, apply):
                material_count += 1
                save_asset(material, apply)
        except LodConfigError as exc:
            warn(str(exc))
            return 3

    log(
        f"Concluído: {touched} LOD(s) configurados; "
        f"{material_count} material(is) processado(s)."
    )
    if not apply:
        log("Nenhuma alteração foi salva. Execute novamente com --apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
