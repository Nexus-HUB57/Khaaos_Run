#!/usr/bin/env python3
"""Compare declared weapon values without deciding which source is authoritative."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SPECS = (
    ("components_dev_json", "components_dev/weapons"),
    ("unreal_datatable_csv", "Unreal/KhaaosRun/Content/DataTables/DT_WeaponBalance.csv"),
    ("mvp_asset_manifest", "scripts/mvp/step4_3d_assets/asset_manifest_mvp.json"),
)
FIELDS = {
    "damage": ("damage", "Damage", "damage"),
    "fire_rate": ("fire_rate", "FireRate", "fire_rate_rpm"),
    "magazine_size": ("mag", "Mag", "magazine_size"),
    "reload": ("reload", "Reload", "reload_time_s"),
    "range": ("range", "Range", "effective_range_m"),
    "headshot_multiplier": ("headshot_multiplier", "Headshot", "headshot_multiplier"),
    "pellet_count": ("pellet_count", None, "pellet_count"),
}
SOURCE_IDS = tuple(spec[0] for spec in SOURCE_SPECS)


class AuditError(ValueError):
    """Raised when a declared source has malformed or ambiguous structure."""


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AuditError(f"não foi possível ler JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise AuditError(f"a raiz precisa ser um objeto JSON: {path}")
    return value


def _number(value: Any, *, source: str, weapon_id: str, field: str) -> int | float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise AuditError(f"{source}/{weapon_id}: {field} não pode ser booleano")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise AuditError(f"{source}/{weapon_id}: {field} não é numérico: {value!r}") from exc
    if not math.isfinite(number):
        raise AuditError(f"{source}/{weapon_id}: {field} precisa ser finito")
    return int(number) if number.is_integer() else number


def _extract_values(
    raw: dict[str, Any], source_id: str, weapon_id: str, *, nested: bool = False
) -> dict[str, int | float]:
    data = raw.get("gameplay", {}) if nested else raw
    if not isinstance(data, dict):
        raise AuditError(f"{source_id}/{weapon_id}: gameplay precisa ser um objeto")
    source_index = SOURCE_IDS.index(source_id)
    values: dict[str, int | float] = {}
    for report_field, source_keys in FIELDS.items():
        source_key = source_keys[source_index]
        if source_key is None or source_key not in data:
            continue
        number = _number(
            data[source_key], source=source_id, weapon_id=weapon_id, field=source_key
        )
        if number is not None:
            values[report_field] = number
    return values


def _indexed_records(
    entries: Any,
    source_id: str,
    path: Path,
    *,
    nested: bool = False,
) -> dict[str, dict[str, int | float]]:
    if not isinstance(entries, list):
        raise AuditError(f"{source_id}: lista de armas ausente ou inválida em {path}")
    indexed: dict[str, dict[str, int | float]] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise AuditError(f"{source_id}: entrada {index} não é objeto")
        weapon_id = entry.get("id")
        if not isinstance(weapon_id, str) or not weapon_id.strip():
            raise AuditError(f"{source_id}: entrada {index} sem id válido")
        if weapon_id in indexed:
            raise AuditError(f"{source_id}: ID duplicado: {weapon_id}")
        indexed[weapon_id] = _extract_values(entry, source_id, weapon_id, nested=nested)
    return indexed


def _load_components_json(weapons_dir: Path) -> tuple[dict[str, dict[str, int | float]], Path]:
    manifest_path = weapons_dir / "weapons_manifest.json"
    manifest = _read_json(manifest_path)
    entries = manifest.get("weapons")
    if not isinstance(entries, list) or not entries:
        raise AuditError(f"components_dev_json: manifesto vazio ou inválido: {manifest_path}")
    records: dict[str, dict[str, int | float]] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise AuditError(f"components_dev_json: entrada {index} não é objeto")
        weapon_id = entry.get("id")
        if not isinstance(weapon_id, str) or not weapon_id.strip():
            raise AuditError(f"components_dev_json: entrada {index} sem id válido")
        if weapon_id in records:
            raise AuditError(f"components_dev_json: ID duplicado: {weapon_id}")
        weapon_path = weapons_dir / f"{weapon_id}.json"
        weapon = _read_json(weapon_path)
        if weapon.get("id") != weapon_id:
            raise AuditError(f"components_dev_json: ID do manifesto diverge do arquivo {weapon_path}")
        records[weapon_id] = _extract_values(weapon, "components_dev_json", weapon_id)
    files = {path.stem for path in weapons_dir.glob("WPN_*.json") if path.name != "weapons_manifest.json"}
    if files != set(records):
        raise AuditError(
            f"components_dev_json: manifesto/arquivos divergem; "
            f"ausentes={sorted(set(records) - files)}, não listados={sorted(files - set(records))}"
        )
    return records, manifest_path


def _load_datatable(path: Path) -> dict[str, dict[str, int | float]]:
    required = {"WeaponID", "Damage", "FireRate", "Mag", "Reload", "Range", "Headshot"}
    records: dict[str, dict[str, int | float]] = {}
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            headers = set(reader.fieldnames or [])
            missing = sorted(required - headers)
            if missing:
                raise AuditError(f"unreal_datatable_csv: colunas ausentes: {', '.join(missing)}")
            for line_number, row in enumerate(reader, start=2):
                weapon_id = (row.get("WeaponID") or "").strip()
                if not weapon_id:
                    raise AuditError(f"unreal_datatable_csv: linha {line_number} sem WeaponID")
                if weapon_id in records:
                    raise AuditError(f"unreal_datatable_csv: ID duplicado: {weapon_id}")
                records[weapon_id] = _extract_values(
                    {
                        "damage": row.get("Damage"),
                        "fire_rate": row.get("FireRate"),
                        "mag": row.get("Mag"),
                        "reload": row.get("Reload"),
                        "range": row.get("Range"),
                        "headshot_multiplier": row.get("Headshot"),
                    },
                    "unreal_datatable_csv",
                    weapon_id,
                )
    except OSError as exc:
        raise AuditError(f"não foi possível ler CSV {path}: {exc}") from exc
    return records


def _sha256(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as exc:
        raise AuditError(f"não foi possível calcular SHA-256 de {path}: {exc}") from exc


def _sha256_many(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    try:
        for path in sorted(paths, key=lambda item: item.as_posix()):
            digest.update(path.as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    except OSError as exc:
        raise AuditError(f"não foi possível hashear o conjunto de fontes: {exc}") from exc
    return digest.hexdigest()


def build_report(repo_root: Path = ROOT) -> dict[str, Any]:
    weapons_dir = repo_root / "components_dev/weapons"
    datatable_path = repo_root / "Unreal/KhaaosRun/Content/DataTables/DT_WeaponBalance.csv"
    mvp_path = repo_root / "scripts/mvp/step4_3d_assets/asset_manifest_mvp.json"

    component_records, component_manifest = _load_components_json(weapons_dir)
    datatable_records = _load_datatable(datatable_path)
    mvp_manifest = _read_json(mvp_path)
    mvp_records = _indexed_records(
        mvp_manifest.get("weapons"), "mvp_asset_manifest", mvp_path, nested=True
    )
    by_source = {
        "components_dev_json": component_records,
        "unreal_datatable_csv": datatable_records,
        "mvp_asset_manifest": mvp_records,
    }
    all_ids = sorted(set().union(*(set(records) for records in by_source.values())))

    comparisons = []
    conflict_pair_count = 0
    for weapon_id in all_ids:
        source_values = {
            source_id: records[weapon_id]
            for source_id, records in by_source.items()
            if weapon_id in records
        }
        field_conflicts: dict[str, dict[str, int | float]] = {}
        for field in FIELDS:
            values = {
                source_id: weapons.get(field)
                for source_id, weapons in source_values.items()
                if field in weapons
            }
            if len(values) >= 2 and len(set(values.values())) > 1:
                field_conflicts[field] = values
                conflict_pair_count += 1
        comparisons.append(
            {
                "weapon_id": weapon_id,
                "present_in": list(source_values),
                "source_values": source_values,
                "field_conflicts": field_conflicts,
            }
        )

    content_root = repo_root / "Unreal/KhaaosRun/Content"
    weapon_content = content_root / "Weapons"
    data_table_content = content_root / "DataTables"
    uasset_count = sum(
        len(list(folder.rglob("*.uasset")))
        for folder in (weapon_content, data_table_content)
        if folder.exists()
    )
    pending_count = sum(
        1
        for folder in (weapon_content, data_table_content)
        if folder.exists()
        for path in folder.rglob("*")
        if path.is_file() and "pending_import" in path.name.lower()
    )

    source_paths = {
        "components_dev_json": component_manifest,
        "unreal_datatable_csv": datatable_path,
        "mvp_asset_manifest": mvp_path,
    }
    source_inventory = [
        {
            "source_id": source_id,
            "path": path.relative_to(repo_root).as_posix(),
            "record_count": len(by_source[source_id]),
            "sha256": _sha256(path),
        }
        for source_id, path in source_paths.items()
    ]
    component_files = [component_manifest, *sorted(weapons_dir.glob("WPN_*.json"))]
    source_inventory[0]["included_files"] = [
        path.relative_to(repo_root).as_posix() for path in component_files
    ]
    source_inventory[0]["sha256"] = _sha256_many(component_files)
    return {
        "report_schema_version": 1,
        "audit_status": "CONFLICTS_DETECTED" if conflict_pair_count else "NO_RAW_VALUE_CONFLICTS_DETECTED",
        "authority_status": "UNRESOLVED",
        "canonical_source": None,
        "runtime_loading_proven": False,
        "evidence_scope": "static_declarative_source_comparison_only",
        "sources": source_inventory,
        "runtime_content_evidence": {
            "weapon_and_datatable_uasset_count": uasset_count,
            "pending_import_marker_count": pending_count,
            "interpretation": (
                "NO_IMPORTED_WEAPON_DATA_ASSETS_FOUND_IN_SCANNED_FOLDERS"
                if uasset_count == 0
                else "UE_FILES_PRESENT_UNVALIDATED"
            ),
        },
        "weapon_id_count_union": len(all_ids),
        "conflicting_weapon_field_pairs": conflict_pair_count,
        "unmatched_ids": {
            source_id: sorted(set(all_ids) - set(records))
            for source_id, records in by_source.items()
        },
        "comparisons": comparisons,
        "limitations": [
            "A comparação preserva valores declarados; igualdade não prova carregamento em runtime.",
            "Os significados/unidades de dano, cadência e alcance não foram reconciliados por decisão de design.",
            "Para shotgun, dano por pellet versus dano total do disparo permanece ambíguo entre artefatos.",
            "A classe C++ define estrutura/fórmula; estes arquivos não provam qual Data Asset o mapa/build carrega.",
            "Nenhum arquivo de dados foi escolhido como autoridade; nenhum valor foi alterado.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=ROOT)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--write", action="store_true", help="atualizar o relatório JSON versionado")
    actions.add_argument("--check", action="store_true", help="verificar o relatório versionado (padrão)")
    args = parser.parse_args(argv)
    report_path = args.repo_root / "components_dev/weapon_source_audit_report.json"
    try:
        report = build_report(args.repo_root)
        rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if args.write:
            report_path.write_text(rendered, encoding="utf-8")
            print(f"Relatório de divergência de fontes atualizado: {report_path.relative_to(args.repo_root)}")
            print(f"Autoridade: NÃO RESOLVIDA; pares arma/campo divergentes: {report['conflicting_weapon_field_pairs']}.")
            return 0
        actual = _read_json(report_path)
        if actual != report:
            print(
                "ERRO: relatório de fontes desatualizado; revise as fontes e execute "
                "python3 scripts/audit_weapon_source_divergence.py --write",
                file=sys.stderr,
            )
            return 1
        print(
            f"Fontes comparadas: {len(report['sources'])}; "
            f"IDs de arma: {report['weapon_id_count_union']}; "
            f"pares divergentes: {report['conflicting_weapon_field_pairs']}; "
            "autoridade permanece NÃO RESOLVIDA."
        )
        return 0
    except AuditError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
