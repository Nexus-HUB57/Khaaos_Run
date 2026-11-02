#!/usr/bin/env python3
"""Validates CIGKV map JSON coordinate integrity before Unreal import/load.

Default mode is intentionally strict: the current legacy JSONs do not declare
coordinate_origin or world_bounds, so they are inspected but blocked from being
reported as Unreal-load-ready. Use --allow-legacy-contract only to audit them
against the provisional [0, map_size] bounds inferred from their current data.
That opt-in is diagnostic and never marks the files safe to load.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUTS = (
    ROOT / "config/levels/CIGKV_level_data.json",
    ROOT / "Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json",
)
AXES = ("x", "y", "z")
SUPPORTED_COORDINATE_SYSTEM = "UE5_LEFT_HANDED_Z_UP"
SUPPORTED_UNIT = "cm"
EPSILON = 1e-6


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _reject_nonstandard_constant(value: str) -> None:
    raise ValueError(f"constante JSON não padrão: {value}")


def _issue(severity: str, code: str, path: str, message: str) -> dict[str, str]:
    return {"severity": severity, "code": code, "path": path, "message": message}


def _vector(value: Any, axes: tuple[str, ...], path: str, errors: list[dict[str, str]]) -> dict[str, float] | None:
    if not isinstance(value, dict):
        errors.append(_issue("error", "invalid_vector", path, "esperado objeto com coordenadas nomeadas"))
        return None

    result: dict[str, float] = {}
    valid = True
    for axis in axes:
        if axis not in value:
            errors.append(_issue("error", "missing_coordinate", f"{path}.{axis}", f"coordenada {axis} ausente"))
            valid = False
        elif not _is_finite_number(value[axis]):
            errors.append(_issue("error", "invalid_coordinate", f"{path}.{axis}", "coordenada deve ser número finito; booleanos não são aceitos"))
            valid = False
        else:
            result[axis] = float(value[axis])
    return result if valid else None


def _inside_bounds(point: dict[str, float], bounds: dict[str, dict[str, float]], axes: tuple[str, ...]) -> bool:
    return all(bounds["min"][axis] - EPSILON <= point[axis] <= bounds["max"][axis] + EPSILON for axis in axes)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=_reject_nonstandard_constant)


def _validate_world_bounds(
    data: dict[str, Any],
    map_size: dict[str, float] | None,
    allow_legacy_contract: bool,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
) -> tuple[dict[str, dict[str, float]] | None, bool]:
    contract_complete = True
    raw_bounds = data.get("world_bounds")
    if raw_bounds is None:
        contract_complete = False
        issue = _issue(
            "warning" if allow_legacy_contract else "error",
            "missing_world_bounds",
            "$.world_bounds",
            "world_bounds ausente; o modo legado usa [0, map_size] apenas para diagnóstico",
        )
        (warnings if allow_legacy_contract else errors).append(issue)
        if map_size is None:
            return None, contract_complete
        return {"min": {axis: 0.0 for axis in AXES}, "max": dict(map_size)}, contract_complete

    if not isinstance(raw_bounds, dict):
        errors.append(_issue("error", "invalid_world_bounds", "$.world_bounds", "esperado objeto com min e max"))
        return None, False

    minimum = _vector(raw_bounds.get("min"), AXES, "$.world_bounds.min", errors)
    maximum = _vector(raw_bounds.get("max"), AXES, "$.world_bounds.max", errors)
    if minimum is None or maximum is None:
        return None, False

    bounds = {"min": minimum, "max": maximum}
    for axis in AXES:
        if minimum[axis] >= maximum[axis]:
            errors.append(_issue("error", "invalid_bounds_extent", f"$.world_bounds.{axis}", "limite mínimo deve ser menor que o máximo"))
        if map_size is not None:
            extent = maximum[axis] - minimum[axis]
            if not math.isclose(extent, map_size[axis], rel_tol=0.0, abs_tol=EPSILON):
                errors.append(_issue("error", "map_size_mismatch", f"$.world_bounds.{axis}", f"extensão {extent:g} não corresponde a map_size.{axis}={map_size[axis]:g}"))
    return bounds, contract_complete


def _validate_sectors(
    data: dict[str, Any],
    world_bounds: dict[str, dict[str, float]] | None,
    errors: list[dict[str, str]],
) -> dict[str, dict[str, dict[str, float]]]:
    raw_sectors = data.get("sectors")
    sectors: dict[str, dict[str, dict[str, float]]] = {}
    if not isinstance(raw_sectors, list) or not raw_sectors:
        errors.append(_issue("error", "invalid_sectors", "$.sectors", "sectors deve ser uma lista não vazia"))
        return sectors

    for index, sector in enumerate(raw_sectors):
        path = f"$.sectors[{index}]"
        if not isinstance(sector, dict):
            errors.append(_issue("error", "invalid_sector", path, "setor deve ser objeto"))
            continue
        name = sector.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(_issue("error", "invalid_sector_name", f"{path}.name", "nome de setor inválido"))
            continue
        if name in sectors:
            errors.append(_issue("error", "duplicate_sector", f"{path}.name", f"setor duplicado: {name}"))
            continue

        raw = sector.get("bounds")
        if not isinstance(raw, dict):
            errors.append(_issue("error", "invalid_sector_bounds", f"{path}.bounds", "bounds do setor ausentes ou inválidos"))
            continue
        bounds: dict[str, dict[str, float]] = {"min": {}, "max": {}}
        valid = True
        for axis in ("x", "y"):
            min_key, max_key = f"min_{axis}", f"max_{axis}"
            for key in (min_key, max_key):
                if key not in raw or not _is_finite_number(raw[key]):
                    errors.append(_issue("error", "invalid_sector_bound", f"{path}.bounds.{key}", "limite deve ser número finito"))
                    valid = False
            if min_key in raw and max_key in raw and _is_finite_number(raw[min_key]) and _is_finite_number(raw[max_key]):
                bounds["min"][axis] = float(raw[min_key])
                bounds["max"][axis] = float(raw[max_key])
                if bounds["min"][axis] >= bounds["max"][axis]:
                    errors.append(_issue("error", "invalid_sector_extent", f"{path}.bounds.{axis}", "limite mínimo deve ser menor que o máximo"))
                    valid = False
                if world_bounds and (
                    bounds["min"][axis] < world_bounds["min"][axis] - EPSILON
                    or bounds["max"][axis] > world_bounds["max"][axis] + EPSILON
                ):
                    errors.append(_issue("error", "sector_out_of_bounds", f"{path}.bounds.{axis}", f"bounds do setor {name} excedem os limites do mundo"))
        if valid:
            sectors[name] = bounds
    return sectors


def _validate_records(
    data: dict[str, Any],
    collection_name: str,
    axes: tuple[str, ...],
    world_bounds: dict[str, dict[str, float]] | None,
    sectors: dict[str, dict[str, dict[str, float]]],
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
    *,
    id_key: str = "id",
    coordinate_key: str | None = None,
    sector_required: bool = False,
    radius_key: str | None = None,
    check_duplicate_coordinates: bool = True,
    duplicate_coordinates_are_errors: bool = False,
) -> int:
    records = data.get(collection_name)
    if not isinstance(records, list) or not records:
        errors.append(_issue("error", "invalid_coordinate_collection", f"$.{collection_name}", "coleção deve ser uma lista não vazia"))
        return 0

    seen_ids: set[int] = set()
    seen_coordinates: dict[tuple[float, ...], int] = {}
    valid_count = 0
    for index, record in enumerate(records):
        path = f"$.{collection_name}[{index}]"
        if not isinstance(record, dict):
            errors.append(_issue("error", "invalid_coordinate_record", path, "registro deve ser objeto"))
            continue

        record_id = record.get(id_key)
        if not isinstance(record_id, int) or isinstance(record_id, bool) or record_id <= 0:
            errors.append(_issue("error", "invalid_record_id", f"{path}.{id_key}", "ID deve ser inteiro positivo"))
        elif record_id in seen_ids:
            errors.append(_issue("error", "duplicate_record_id", f"{path}.{id_key}", f"ID duplicado: {record_id}"))
        else:
            seen_ids.add(record_id)

        coordinate_object = record.get(coordinate_key) if coordinate_key else record
        coordinate_path = f"{path}.{coordinate_key}" if coordinate_key else path
        point = _vector(coordinate_object, axes, coordinate_path, errors)
        if point is None:
            continue
        valid_count += 1

        if world_bounds and not _inside_bounds(point, world_bounds, axes):
            errors.append(_issue("error", "coordinate_out_of_bounds", coordinate_path, f"coordenada {point} fora de world bounds"))

        key = tuple(point[axis] for axis in axes)
        if check_duplicate_coordinates:
            if key in seen_coordinates:
                severity_list = errors if duplicate_coordinates_are_errors else warnings
                severity = "error" if duplicate_coordinates_are_errors else "warning"
                severity_list.append(_issue(severity, "duplicate_coordinates", coordinate_path, f"coordenada duplicada no registro {seen_coordinates[key]}"))
            else:
                seen_coordinates[key] = index

        sector_name = record.get("sector")
        if sector_required and (not isinstance(sector_name, str) or not sector_name.strip()):
            errors.append(_issue("error", "missing_sector", f"{path}.sector", "setor do ponto é obrigatório"))
        elif sector_name is not None:
            sector_bounds = sectors.get(sector_name)
            if sector_bounds is None:
                errors.append(_issue("error", "unknown_sector", f"{path}.sector", f"setor desconhecido: {sector_name}"))
            elif not _inside_bounds(point, sector_bounds, ("x", "y")):
                errors.append(_issue("error", "point_outside_declared_sector", coordinate_path, f"ponto declarado em {sector_name}, mas fora dos bounds desse setor"))

        if radius_key:
            radius = record.get(radius_key)
            if not _is_finite_number(radius) or float(radius) <= 0:
                errors.append(_issue("error", "invalid_radius", f"{path}.{radius_key}", "raio deve ser número finito positivo"))
            elif world_bounds:
                r = float(radius)
                if (
                    point["x"] - r < world_bounds["min"]["x"] - EPSILON
                    or point["x"] + r > world_bounds["max"]["x"] + EPSILON
                    or point["y"] - r < world_bounds["min"]["y"] - EPSILON
                    or point["y"] + r > world_bounds["max"]["y"] + EPSILON
                ):
                    errors.append(_issue("error", "radius_out_of_bounds", f"{path}.{radius_key}", "a área circular excede os limites do mundo"))

        if "rotation" in record:
            rotation = record["rotation"]
            if not _is_finite_number(rotation) or not 0 <= float(rotation) < 360:
                errors.append(_issue("error", "invalid_rotation", f"{path}.rotation", "rotação deve ser finita e estar no intervalo [0, 360) graus"))

    return valid_count


def coordinate_projection(data: dict[str, Any]) -> dict[str, Any]:
    """Return only fields that define the spatial contract/layout for copy parity."""
    projection: dict[str, Any] = {
        key: data.get(key)
        for key in ("coordinate_system", "unit", "coordinate_origin", "world_bounds", "map_size")
        if key in data
    }
    projected_sectors = [
        {key: sector.get(key) for key in ("name", "bounds") if key in sector}
        for sector in data.get("sectors", []) if isinstance(sector, dict)
    ] if isinstance(data.get("sectors"), list) else data.get("sectors")
    if isinstance(projected_sectors, list):
        projected_sectors.sort(key=lambda sector: str(sector.get("name", "")))
    projection["sectors"] = projected_sectors
    for name in ("spawn_points", "zex_zones", "loot_spawn_points"):
        records = data.get(name)
        projection[name] = []
        if isinstance(records, list):
            for record in records:
                if not isinstance(record, dict):
                    projection[name].append(record)
                    continue
                keys = ("id", "x", "y", "z", "radius", "sector", "rotation")
                projection[name].append({key: record[key] for key in keys if key in record})
        projection[name].sort(key=lambda record: str(record.get("id", "")) if isinstance(record, dict) else json.dumps(record, sort_keys=True))
    phases = data.get("zone_phases")
    projected_phases = [
        {key: phase.get(key) for key in ("phase", "center") if key in phase}
        for phase in phases if isinstance(phase, dict)
    ] if isinstance(phases, list) else phases
    if isinstance(projected_phases, list):
        projected_phases.sort(key=lambda phase: str(phase.get("phase", "")) if isinstance(phase, dict) else json.dumps(phase, sort_keys=True))
    projection["zone_phases"] = projected_phases
    return projection


def validate_document(path: Path, allow_legacy_contract: bool = False) -> tuple[dict[str, Any], dict[str, Any] | None]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    result: dict[str, Any] = {
        "path": str(path), "sha256": None, "status": "FAIL", "coordinate_contract_complete": False,
        "safe_to_load_into_unreal": False, "counts": {}, "errors": errors, "warnings": warnings,
    }

    try:
        raw = path.read_bytes()
        result["sha256"] = hashlib.sha256(raw).hexdigest()
        data = json.loads(raw.decode("utf-8"), parse_constant=_reject_nonstandard_constant)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        errors.append(_issue("error", "json_load_failed", "$", f"não foi possível carregar JSON: {exc}"))
        return result, None

    if not isinstance(data, dict):
        errors.append(_issue("error", "invalid_root", "$", "raiz do JSON deve ser objeto"))
        return result, None

    if not isinstance(data.get("level_name"), str) or not data["level_name"].strip():
        errors.append(_issue("error", "missing_level_name", "$.level_name", "level_name deve ser texto não vazio"))
    if data.get("coordinate_system") != SUPPORTED_COORDINATE_SYSTEM:
        errors.append(_issue("error", "unsupported_coordinate_system", "$.coordinate_system", f"esperado {SUPPORTED_COORDINATE_SYSTEM}"))
    if data.get("unit") != SUPPORTED_UNIT:
        errors.append(_issue("error", "unsupported_unit", "$.unit", f"esperado unit={SUPPORTED_UNIT}; conversões automáticas não são feitas"))

    map_size_raw = data.get("map_size")
    map_size = _vector(map_size_raw, AXES, "$.map_size", errors)
    if map_size:
        for axis in AXES:
            if map_size[axis] <= 0:
                errors.append(_issue("error", "invalid_map_size", f"$.map_size.{axis}", "dimensão deve ser positiva"))

    origin_raw = data.get("coordinate_origin")
    origin: dict[str, float] | None = None
    contract_complete = True
    if origin_raw is None:
        contract_complete = False
        item = _issue(
            "warning" if allow_legacy_contract else "error", "missing_coordinate_origin", "$.coordinate_origin",
            "origem do frame não declarada; o relatório não presume alinhamento com o mapa Unreal",
        )
        (warnings if allow_legacy_contract else errors).append(item)
    else:
        origin = _vector(origin_raw, AXES, "$.coordinate_origin", errors)

    world_bounds, bounds_contract_complete = _validate_world_bounds(
        data, map_size, allow_legacy_contract, errors, warnings
    )
    contract_complete = contract_complete and bounds_contract_complete
    if origin and world_bounds and not _inside_bounds(origin, world_bounds, AXES):
        errors.append(_issue("error", "origin_out_of_bounds", "$.coordinate_origin", "origem declarada fica fora de world_bounds"))

    sectors = _validate_sectors(data, world_bounds, errors)
    result["counts"] = {
        name: len(data.get(name, [])) if isinstance(data.get(name), list) else None
        for name in ("sectors", "spawn_points", "zex_zones", "loot_spawn_points", "zone_phases")
    }
    _validate_records(data, "spawn_points", AXES, world_bounds, sectors, errors, warnings,
                      sector_required=True, duplicate_coordinates_are_errors=True)
    _validate_records(data, "zex_zones", ("x", "y"), world_bounds, sectors, errors, warnings,
                      sector_required=True, radius_key="radius")
    _validate_records(data, "loot_spawn_points", AXES, world_bounds, sectors, errors, warnings)
    _validate_records(data, "zone_phases", ("x", "y"), world_bounds, sectors, errors, warnings,
                      id_key="phase", coordinate_key="center", check_duplicate_coordinates=False)

    result["coordinate_contract_complete"] = contract_complete and origin is not None and "world_bounds" in data
    result["safe_to_load_into_unreal"] = result["coordinate_contract_complete"] and not errors
    result["status"] = "FAIL" if errors else ("PASS_WITH_WARNINGS" if warnings else "PASS")
    return result, data


def build_report(paths: list[Path], allow_legacy_contract: bool = False) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    documents: list[tuple[Path, dict[str, Any]]] = []
    for path in paths:
        report, data = validate_document(path, allow_legacy_contract)
        files.append(report)
        if data is not None:
            documents.append((path, data))

    parity_errors: list[dict[str, str]] = []
    if len(documents) > 1:
        reference_path, reference_data = documents[0]
        reference_projection = coordinate_projection(reference_data)
        for other_path, other_data in documents[1:]:
            if coordinate_projection(other_data) != reference_projection:
                parity_errors.append(_issue(
                    "error", "coordinate_copy_drift", str(other_path),
                    f"campos espaciais divergem da cópia de referência {reference_path}",
                ))

    all_errors = [issue for file in files for issue in file["errors"]] + parity_errors
    safe_to_load = bool(files) and not all_errors and all(file["safe_to_load_into_unreal"] for file in files)
    report_status = "FAIL" if all_errors else ("PASS_WITH_WARNINGS" if any(file["warnings"] for file in files) else "PASS")
    if len(paths) < 2:
        parity_status = "NOT_COMPARED"
    elif len(documents) < len(paths):
        parity_status = "INCOMPLETE"
    elif parity_errors:
        parity_status = "DIVERGED"
    else:
        parity_status = "MATCH"
    return {
        "validator": "validate_cigkv_map_coordinates",
        "status": report_status,
        "safe_to_load_into_unreal": safe_to_load,
        "legacy_bounds_assumption": "[0, map_size]" if allow_legacy_contract else None,
        "coordinate_copy_parity": parity_status,
        "cross_file_errors": parity_errors,
        "files": files,
    }


def _print_report(report: dict[str, Any]) -> None:
    for file_report in report["files"]:
        print(f"\n[{file_report['status']}] {file_report['path']}")
        print(f"  SHA-256: {file_report['sha256'] or 'indisponível'}")
        print(f"  Contagens: {file_report['counts']}")
        print(f"  Contrato completo: {'sim' if file_report['coordinate_contract_complete'] else 'não'}")
        for issue in file_report["errors"] + file_report["warnings"]:
            print(f"  {issue['severity'].upper()} {issue['code']} {issue['path']}: {issue['message']}")
    for issue in report["cross_file_errors"]:
        print(f"\nERROR {issue['code']} {issue['path']}: {issue['message']}")
    print(f"\nResultado: {report['status']}; cópias: {report['coordinate_copy_parity']}; "
          f"seguro para carregar no Unreal: {'sim' if report['safe_to_load_into_unreal'] else 'não'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida coordenadas e contrato espacial dos JSONs do mapa CIGKV.")
    parser.add_argument("--input", action="append", type=Path, help="JSON de mapa a validar; pode ser repetido. Default: as duas cópias CIGKV do repositório.")
    parser.add_argument("--report", type=Path, help="Opcional: salvar o relatório completo em JSON neste caminho.")
    parser.add_argument("--allow-legacy-contract", action="store_true",
                        help="Somente diagnóstico: rebaixa origem/world_bounds ausentes a avisos e usa [0,map_size]; nunca marca como seguro para Unreal.")
    args = parser.parse_args(argv)

    paths = args.input or list(DEFAULT_INPUTS)
    paths = list(dict.fromkeys(path.resolve() for path in paths))
    report = build_report(paths, allow_legacy_contract=args.allow_legacy_contract)
    _print_report(report)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Relatório JSON: {args.report}")

    if report["status"] == "FAIL":
        return 1
    if not report["safe_to_load_into_unreal"] and not args.allow_legacy_contract:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
