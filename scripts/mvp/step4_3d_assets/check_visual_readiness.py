#!/usr/bin/env python3
"""Advisory preflight for Unreal visual-content readiness (no UE required).

This measures source OBJ/TGA files and Unreal import artifacts. It cannot judge
render quality or replace an editor build, cook, or in-engine visual review.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REPORT = ROOT / "mvp_output" / "assets" / "asset_report.json"
DEFAULT_ASSETS = ROOT / "mvp_output" / "assets"
DEFAULT_UNREAL_CONTENT = ROOT / "Unreal" / "KhaaosRun" / "Content"


def count_obj_geometry(path: Path) -> tuple[int, int]:
    vertices = 0
    faces = 0
    with path.open("r", encoding="utf-8", errors="replace") as source:
        for line in source:
            if line.startswith("v "):
                vertices += 1
            elif line.startswith("f "):
                faces += 1
    return vertices, faces


def read_tga_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        header = path.read_bytes()[:18]
    except OSError:
        return None
    if len(header) < 18:
        return None
    width = int.from_bytes(header[12:14], "little")
    height = int.from_bytes(header[14:16], "little")
    if width <= 0 or height <= 0:
        return None
    return width, height


def find_obj_for_asset(assets_dir: Path, asset_id: str) -> Path | None:
    matches = [
        path for path in assets_dir.rglob("*.obj")
        if asset_id.casefold() in path.name.casefold() or asset_id.casefold() in path.parent.name.casefold()
    ]
    if not matches:
        return None
    exact = [path for path in matches if path.stem.casefold() == asset_id.casefold()]
    if exact:
        return sorted(exact)[0]
    lod_zero = [path for path in matches if "lod0" in path.stem.casefold()]
    return sorted(lod_zero or matches)[0]


def build_readiness_report(
    asset_report_path: Path,
    assets_dir: Path,
    unreal_content_dir: Path,
    min_texture_dimension: int = 256,
) -> dict[str, Any]:
    source_report = json.loads(asset_report_path.read_text(encoding="utf-8"))
    assets = source_report.get("assets")
    if not isinstance(assets, list):
        raise ValueError("asset_report.json precisa conter a lista 'assets'")

    mesh_assets = [item for item in assets if item.get("category") in {"character", "weapon", "loot"}]
    mesh_rows: list[dict[str, Any]] = []
    missing_meshes: list[str] = []
    actual_vertices = 0
    actual_faces = 0
    target_polycount = 0

    for item in mesh_assets:
        asset_id = str(item.get("asset_id", "<sem id>"))
        target_polycount += int(item.get("target_polycount", 0) or 0)
        path = find_obj_for_asset(assets_dir, asset_id)
        if path is None:
            missing_meshes.append(asset_id)
            mesh_rows.append({"asset_id": asset_id, "source_obj": None, "vertices": None, "faces": None})
            continue
        vertices, faces = count_obj_geometry(path)
        actual_vertices += vertices
        actual_faces += faces
        mesh_rows.append({
            "asset_id": asset_id,
            "source_obj": path.relative_to(assets_dir).as_posix(),
            "vertices": vertices,
            "faces": faces,
        })

    tga_rows: list[dict[str, Any]] = []
    invalid_tgas: list[str] = []
    low_resolution_tgas: list[str] = []
    for path in sorted(assets_dir.rglob("*.tga")):
        dimensions = read_tga_dimensions(path)
        relative = path.relative_to(assets_dir).as_posix()
        if dimensions is None:
            invalid_tgas.append(relative)
            continue
        width, height = dimensions
        row = {"path": relative, "width": width, "height": height}
        tga_rows.append(row)
        if min(width, height) < min_texture_dimension:
            low_resolution_tgas.append(relative)

    unreal_files = list(unreal_content_dir.rglob("*")) if unreal_content_dir.exists() else []
    uasset_count = sum(path.is_file() and path.suffix.casefold() == ".uasset" for path in unreal_files)
    umap_count = sum(path.is_file() and path.suffix.casefold() == ".umap" for path in unreal_files)
    pending_import_count = sum(
        path.is_file() and "_pending_import" in path.name.casefold()
        for path in unreal_files
    )

    reported_vertices = int(source_report.get("summary", {}).get("total_vertices", 0) or 0)
    reported_faces = int(source_report.get("summary", {}).get("total_faces", 0) or 0)
    geometry_matches_report = not missing_meshes and actual_vertices == reported_vertices and actual_faces == reported_faces
    ue_artifacts_present = uasset_count > 0 and umap_count > 0 and pending_import_count == 0

    if not ue_artifacts_present:
        readiness_status = "BLOCKED_NO_IMPORTED_UE_CONTENT_OR_MAP"
    else:
        readiness_status = "UE_FILES_PRESENT_UNVALIDATED"

    warnings: list[str] = []
    if not geometry_matches_report:
        warnings.append("Geometria OBJ ausente ou contagens não correspondem ao asset_report.json.")
    if low_resolution_tgas:
        warnings.append(f"{len(low_resolution_tgas)} texturas TGA abaixo de {min_texture_dimension}px no menor lado.")
    if not ue_artifacts_present:
        warnings.append("Sem .uasset e .umap simultâneos ou ainda há marcadores pending_import.")
    else:
        warnings.append("Arquivos .uasset/.umap presentes não comprovam validade nem relação com os assets auditados.")
    warnings.append("Este preflight não mede renderização, materiais, LOD em execução, iluminação, cook, FPS ou qualidade percebida.")

    return {
        "report_version": 1,
        "readiness_status": readiness_status,
        "engine_visual_validation": False,
        "source_asset_report": asset_report_path.name,
        "source_geometry": {
            "mesh_count": len(mesh_assets),
            "actual_vertices": actual_vertices,
            "actual_faces": actual_faces,
            "declared_target_polycount_sum": target_polycount,
            "actual_vertices_to_declared_target_percent": round(actual_vertices / target_polycount * 100, 3) if target_polycount else None,
            "matches_asset_report_summary": geometry_matches_report,
            "missing_mesh_ids": missing_meshes,
            "meshes": mesh_rows,
        },
        "textures": {
            "tga_count": len(tga_rows),
            "minimum_dimension_threshold_px": min_texture_dimension,
            "below_threshold_count": len(low_resolution_tgas),
            "below_threshold_paths": low_resolution_tgas,
            "invalid_paths": invalid_tgas,
            "files": tga_rows,
        },
        "unreal_content": {
            "uasset_count": uasset_count,
            "umap_count": umap_count,
            "pending_import_count": pending_import_count,
            "content_directory_exists": unreal_content_dir.exists(),
        },
        "warnings": warnings,
        "limitations": [
            "Contagens de fonte não comprovam fidelidade visual; target_polycount pode ser meta ou orçamento e precisa de interpretação de design.",
            "UE_FILES_PRESENT_UNVALIDATED indica somente presença de extensões; não inspeciona payload, referências, build, cook ou qualidade visual.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--assets-dir", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--unreal-content", type=Path, default=DEFAULT_UNREAL_CONTENT)
    parser.add_argument("--min-texture-dimension", type=int, default=256)
    parser.add_argument("--output", type=Path, help="Opcional: salvar o resultado JSON neste caminho")
    parser.add_argument(
        "--require-unreal-files", action="store_true",
        help="Retornar código 2 se faltarem .uasset/.umap ou houver pending_import; não valida os arquivos",
    )
    args = parser.parse_args()
    if args.min_texture_dimension < 1:
        parser.error("--min-texture-dimension deve ser >= 1")
    try:
        report = build_readiness_report(
            args.asset_report, args.assets_dir, args.unreal_content, args.min_texture_dimension
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1

    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(f"Prontidão visual: {report['readiness_status']}")
    print(
        "Fonte: {actual_vertices} vértices/{actual_faces} faces; Unreal: {uasset_count} .uasset, "
        "{umap_count} .umap, {pending_import_count} pendências; TGAs baixos: {low_tga}.".format(
            actual_vertices=report["source_geometry"]["actual_vertices"],
            actual_faces=report["source_geometry"]["actual_faces"],
            uasset_count=report["unreal_content"]["uasset_count"],
            umap_count=report["unreal_content"]["umap_count"],
            pending_import_count=report["unreal_content"]["pending_import_count"],
            low_tga=report["textures"]["below_threshold_count"],
        )
    )
    if args.output:
        print(f"JSON gravado em: {args.output}")
    return 2 if args.require_unreal_files and report["readiness_status"].startswith("BLOCKED") else 0


if __name__ == "__main__":
    raise SystemExit(main())
