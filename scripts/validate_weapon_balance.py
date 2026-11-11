#!/usr/bin/env python3
"""Recompute theoretical weapon metrics and verify their checked-in report.

This tool validates data/report consistency only. It does not certify gameplay
balance: accuracy, recoil, falloff, armor, latency, hit registration, and match
telemetry are outside the model.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WEAPONS_DIR = ROOT / "components_dev" / "weapons"
DEFAULT_REPORT = ROOT / "components_dev" / "weapon_balance_report.json"
REQUIRED_FIELDS = (
    "id", "name", "category", "rarity", "damage", "fire_rate",
    "headshot_multiplier", "pellet_count", "mag", "reload", "range",
)
METRIC_FIELDS = (
    "dps", "headshot_dps", "ttk_100hp", "mag_burst_damage",
    "sustain_dps", "range", "pellet_count",
)
EVIDENCE_SCOPE = (
    "THEORETICAL_CONTINUOUS_FIRE_ALL_PROJECTILES_HIT_NO_ARMOR_OR_MATCH_TELEMETRY"
)


class ValidationError(Exception):
    """Raised when weapon sources or the derived report are inconsistent."""


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Não foi possível ler JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValidationError(f"A raiz do JSON precisa ser um objeto: {path}")
    return value


def _number(source: dict[str, Any], field: str, weapon_id: str) -> float:
    value = source.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValidationError(f"{weapon_id}: campo numérico inválido: {field}")
    return float(value)


def calculate_metrics(weapon: dict[str, Any]) -> dict[str, Any]:
    """Use the same continuous-fire formula as KhaaosWeaponDataAsset::CalculateDPS."""
    weapon_id = str(weapon.get("id", "<sem id>"))
    missing = [field for field in REQUIRED_FIELDS if field not in weapon]
    if missing:
        raise ValidationError(f"{weapon_id}: campos ausentes: {', '.join(missing)}")

    damage = _number(weapon, "damage", weapon_id)
    fire_rate = _number(weapon, "fire_rate", weapon_id)
    headshot_multiplier = _number(weapon, "headshot_multiplier", weapon_id)
    pellet_count = _number(weapon, "pellet_count", weapon_id)
    magazine = _number(weapon, "mag", weapon_id)
    reload_seconds = _number(weapon, "reload", weapon_id)
    range_value = _number(weapon, "range", weapon_id)

    if damage <= 0 or fire_rate <= 0 or headshot_multiplier <= 0 or pellet_count <= 0:
        raise ValidationError(f"{weapon_id}: dano, cadência, multiplicador e pellets devem ser > 0")
    if magazine < 0 or reload_seconds < 0 or range_value < 0:
        raise ValidationError(f"{weapon_id}: pente, recarga e alcance não podem ser negativos")

    shots_per_second = fire_rate / 60.0
    dps = damage * pellet_count * shots_per_second
    magazine_damage = damage * pellet_count * magazine
    firing_seconds = magazine / shots_per_second if magazine > 0 else 0.0
    sustain_seconds = firing_seconds + reload_seconds
    sustain_dps = magazine_damage / sustain_seconds if sustain_seconds > 0 else dps

    return {
        "dps": round(dps, 2),
        "headshot_dps": round(dps * headshot_multiplier, 2),
        "ttk_100hp": round(100.0 / dps, 3),
        "mag_burst_damage": round(magazine_damage),
        "sustain_dps": round(sustain_dps, 2),
        "range": round(range_value),
        "pellet_count": round(pellet_count),
    }


def load_sources(weapons_dir: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest = _read_json(weapons_dir / "weapons_manifest.json")
    entries = manifest.get("weapons")
    if not isinstance(entries, list) or not entries:
        raise ValidationError("O manifesto precisa conter uma lista 'weapons' não vazia")
    manifest_ids = [entry.get("id") for entry in entries if isinstance(entry, dict)]
    if len(manifest_ids) != len(entries):
        raise ValidationError("O manifesto contém entradas inválidas")
    if any(not isinstance(weapon_id, str) or not weapon_id for weapon_id in manifest_ids):
        raise ValidationError("Todos os IDs do manifesto precisam ser strings não vazias")
    if len(set(manifest_ids)) != len(manifest_ids):
        raise ValidationError("O manifesto contém IDs duplicados")
    if manifest.get("weapon_count") != len(entries):
        raise ValidationError("weapon_count não corresponde à quantidade no manifesto")

    sources: dict[str, dict[str, Any]] = {}
    for weapon_id in manifest_ids:
        path = weapons_dir / f"{weapon_id}.json"
        source = _read_json(path)
        if source.get("id") != weapon_id:
            raise ValidationError(f"ID do manifesto não corresponde ao arquivo {path.name}")
        calculate_metrics(source)  # Validate required and numeric gameplay fields.
        sources[weapon_id] = source

    files = {path.stem for path in weapons_dir.glob("WPN_*.json") if path.name != "weapons_manifest.json"}
    if files != set(manifest_ids):
        missing = sorted(set(manifest_ids) - files)
        unlisted = sorted(files - set(manifest_ids))
        raise ValidationError(f"Arquivos e manifesto divergem; ausentes={missing}, não listados={unlisted}")
    return entries, sources


def build_report(
    weapons_dir: Path,
    prior_report: dict[str, Any] | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    manifest_entries, sources = load_sources(weapons_dir)
    previous_by_id = {
        entry.get("id"): entry
        for entry in (prior_report or {}).get("weapons", [])
        if isinstance(entry, dict) and entry.get("id")
    }
    rows: list[dict[str, Any]] = []
    for manifest_entry in manifest_entries:
        weapon_id = manifest_entry["id"]
        source = sources[weapon_id]
        previous = previous_by_id.get(weapon_id, {})
        row = {
            "id": weapon_id,
            "name": str(source["name"]),
            "category": str(source["category"]),
            "rarity": str(source["rarity"]),
            **calculate_metrics(source),
            "tier_rating": str(previous.get("tier_rating", "UNRATED")),
        }
        rows.append(row)

    dps_values = [row["dps"] for row in rows]
    tier_distribution: dict[str, int] = {}
    for row in rows:
        tier = row["tier_rating"]
        tier_distribution[tier] = tier_distribution.get(tier, 0) + 1

    now = generated_at or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {
        "generated_at": now,
        "evidence_scope": EVIDENCE_SCOPE,
        "weapons": rows,
        "balance_summary": {
            "max_dps": round(max(dps_values), 2),
            "min_dps": round(min(dps_values), 2),
            "dps_ratio_max_min": round(max(dps_values) / min(dps_values), 2),
            "avg_dps": round(sum(dps_values) / len(dps_values), 2),
            "weapon_count": len(rows),
            "tier_distribution": tier_distribution,
            "balance_status": "UNVERIFIED",
            "evidence_status": "NO_PLAYTEST_TELEMETRY",
        },
        "limitations": [
            "DPS pressupõe fogo contínuo e todos os projéteis/pellets acertando.",
            "TTK é uma aproximação de 100 HP: não modela armadura, precisão, recuo, falloff, tempo entre disparos, latência ou hit registration.",
            "Este relatório confere fórmulas e consistência dos arquivos; não certifica balanceamento nem paridade com outro jogo.",
        ],
    }


def validate_report(actual: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if actual.get("evidence_scope") != EVIDENCE_SCOPE:
        errors.append("evidence_scope ausente ou desatualizado")
    actual_rows = actual.get("weapons")
    expected_rows = expected.get("weapons")
    if not isinstance(actual_rows, list):
        return errors + ["lista 'weapons' ausente no relatório"]
    if len(actual_rows) != len(expected_rows):
        errors.append("quantidade de linhas no relatório não corresponde às fontes")
    actual_by_id: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(actual_rows):
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
            errors.append(f"linha de arma inválida no índice {index}")
            continue
        weapon_id = row["id"]
        if weapon_id in actual_by_id:
            errors.append(f"ID duplicado no relatório: {weapon_id}")
            continue
        actual_by_id[weapon_id] = row
    expected_by_id = {row["id"]: row for row in expected_rows}
    if set(actual_by_id) != set(expected_by_id):
        errors.append("IDs do relatório não correspondem ao manifesto e às fontes")

    for weapon_id, expected_row in expected_by_id.items():
        actual_row = actual_by_id.get(weapon_id)
        if actual_row is None:
            continue
        for field in ("name", "category", "rarity", "tier_rating"):
            if actual_row.get(field) != expected_row.get(field):
                errors.append(f"{weapon_id}: campo divergente: {field}")
        for field in METRIC_FIELDS:
            value = actual_row.get(field)
            wanted = expected_row[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isclose(float(value), float(wanted), abs_tol=0.01, rel_tol=0):
                errors.append(f"{weapon_id}: métrica divergente: {field} (esperado {wanted}, recebido {value})")

    actual_summary = actual.get("balance_summary")
    if not isinstance(actual_summary, dict):
        return errors + ["balance_summary ausente ou inválido"]
    expected_summary = expected.get("balance_summary", {})
    for field in ("max_dps", "min_dps", "dps_ratio_max_min", "avg_dps", "weapon_count", "tier_distribution"):
        if actual_summary.get(field) != expected_summary.get(field):
            errors.append(f"balance_summary divergente: {field}")
    if actual_summary.get("balance_status") != "UNVERIFIED":
        errors.append("balance_status precisa permanecer UNVERIFIED até haver telemetria de playtests")
    if actual_summary.get("evidence_status") != "NO_PLAYTEST_TELEMETRY":
        errors.append("evidence_status precisa indicar ausência de telemetria de playtests")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=ROOT)
    parser.add_argument("--write", action="store_true", help="Regerar components_dev/weapon_balance_report.json")
    parser.add_argument("--check", action="store_true", help="Conferir relatório versionado contra fontes (padrão)")
    args = parser.parse_args()
    if args.write and args.check:
        parser.error("use --write ou --check, não ambos")

    weapons_dir = args.repo_root / "components_dev" / "weapons"
    report_path = args.repo_root / "components_dev" / "weapon_balance_report.json"
    try:
        prior = _read_json(report_path) if report_path.exists() else {}
        expected = build_report(weapons_dir, prior_report=prior)
        if args.write:
            report_path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Relatório teórico atualizado: {report_path.relative_to(args.repo_root)}")
        else:
            actual = _read_json(report_path)
            errors = validate_report(actual, expected)
            if errors:
                for error in errors:
                    print(f"ERRO: {error}", file=sys.stderr)
                return 1
            print(f"Métricas reproduzíveis: {len(expected['weapons'])} armas; relatório consistente.")
            print("Balanceamento: NÃO CERTIFICADO — requer telemetria de playtests.")
        return 0
    except ValidationError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
