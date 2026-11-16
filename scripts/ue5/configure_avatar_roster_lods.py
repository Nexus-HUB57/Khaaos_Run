"""Configure LOD screen sizes for the full avatar roster in Unreal Engine 5.8.

Run inside Unreal Editor with Python enabled:
  py scripts/ue5/configure_avatar_roster_lods.py --mesh /Game/.../SK_A --mesh /Game/.../SK_B

Dry-run is the default. Add --apply only after the imported Skeletal Meshes and
LOD entries have been reviewed in the editor. This script changes reflected UE
assets only; it does not generate geometry, textures, .uasset files, or FBX.
"""
from __future__ import annotations

import argparse
import math
import sys
from typing import Any, Optional, Sequence

import unreal

LOD_SCREEN_SIZES = (0.55, 0.25, 0.10, 0.03)
LOD_HYSTERESIS = (0.02, 0.02, 0.015, 0.01)

class LodConfigError(RuntimeError):
    pass

def log(message: str) -> None:
    unreal.log("[AvatarRosterLOD] " + message)

def warn(message: str) -> None:
    unreal.log_warning("[AvatarRosterLOD] " + message)

def get_prop(obj: Any, name: str, default: Any = None) -> Any:
    try:
        return obj.get_editor_property(name)
    except Exception:
        return default

def set_prop(obj: Any, name: str, value: Any) -> bool:
    try:
        obj.set_editor_property(name, value)
        return True
    except Exception as exc:
        warn(f"Falha em {name} ({obj}): {exc}")
        return False

def matches(actual: Any, expected: Any) -> bool:
    if isinstance(expected, float):
        return isinstance(actual, (int, float)) and math.isclose(float(actual), expected, abs_tol=1e-4)
    return actual == expected

def set_verify(obj: Any, name: str, value: Any) -> None:
    if not set_prop(obj, name, value):
        raise LodConfigError(f"propriedade não suportada: {name}")
    if not matches(get_prop(obj, name), value):
        raise LodConfigError(f"propriedade não persistiu: {name}={value!r}")

def configure_mesh(mesh: Any, apply: bool) -> dict[str, Any]:
    lod_info = get_prop(mesh, "lod_info")
    if lod_info is None:
        raise LodConfigError("Skeletal Mesh sem propriedade lod_info")
    count = min(len(lod_info), len(LOD_SCREEN_SIZES))
    result = {"mesh": mesh.get_path_name(), "lod_count": len(lod_info), "configured": count, "warnings": []}
    if len(lod_info) < len(LOD_SCREEN_SIZES):
        result["warnings"].append(f"only_{len(lod_info)}_lods_present_generate_missing_lods_in_editor")
    for index in range(count):
        info = lod_info[index]
        desired_screen = LOD_SCREEN_SIZES[index]
        desired_hysteresis = LOD_HYSTERESIS[index]
        log(f"{mesh.get_path_name()} LOD{index}: screen={desired_screen} hysteresis={desired_hysteresis}")
        if apply:
            set_verify(info, "screen_size", desired_screen)
            set_verify(info, "lod_hysteresis", desired_hysteresis)
    if apply:
        set_verify(mesh, "lod_info", lod_info)
        saved = get_prop(mesh, "lod_info")
        if saved is None or len(saved) < count:
            raise LodConfigError("lod_info não persistiu")
    return result

def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mesh", action="append", required=True, help="Object path de Skeletal Mesh; repetir para cada avatar")
    parser.add_argument("--apply", action="store_true", help="Salvar alterações; sem isso executa dry-run")
    args = parser.parse_args(list(argv if argv is not None else sys.argv[1:]))
    log("modo=" + ("APPLY" if args.apply else "DRY-RUN"))
    failures = 0
    results = []
    for path in args.mesh:
        mesh = unreal.EditorAssetLibrary.load_asset(path)
        if not mesh:
            warn(f"asset não encontrado: {path}")
            failures += 1
            continue
        if not isinstance(mesh, unreal.SkeletalMesh):
            warn(f"asset não é SkeletalMesh: {path}")
            failures += 1
            continue
        try:
            result = configure_mesh(mesh, args.apply)
            results.append(result)
            if args.apply and not unreal.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False):
                raise LodConfigError("save_loaded_asset falhou")
        except LodConfigError as exc:
            warn(f"{path}: {exc}")
            failures += 1
    log(f"concluído: {len(results)} meshes processadas; failures={failures}")
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
