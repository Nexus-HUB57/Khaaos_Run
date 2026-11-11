#!/usr/bin/env python3
"""Summarize descriptive weapon-playtest engagement telemetry from CSV."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

SCHEMA_V1 = (
    "engagement_id",
    "build_id",
    "scenario_id",
    "mode",
    "weapon_id",
    "target_armor_class",
    "distance_m",
    "shots_fired",
    "shots_hit",
    "damage_applied",
    "time_to_kill_ms",
    "eliminated",
    "server_rtt_ms",
)
GROUP_FIELDS = (
    "build_id",
    "mode",
    "scenario_id",
    "weapon_id",
    "target_armor_class",
)
STRING_FIELDS = (
    "engagement_id",
    "build_id",
    "scenario_id",
    "mode",
    "weapon_id",
    "target_armor_class",
)


class AnalysisError(ValueError):
    """An input CSV or CLI value violates the playtest schema."""


def _number(value: str, field: str, line_number: int, *, required: bool = True) -> float | None:
    text = value.strip()
    if not text and not required:
        return None
    if not text:
        raise AnalysisError(f"linha {line_number}: campo {field!r} está vazio")
    try:
        number = float(text)
    except ValueError as exc:
        raise AnalysisError(
            f"linha {line_number}: campo {field!r} não é numérico: {value!r}"
        ) from exc
    if not math.isfinite(number):
        raise AnalysisError(f"linha {line_number}: campo {field!r} deve ser finito")
    return number


def _integer(value: str, field: str, line_number: int) -> int:
    number = _number(value, field, line_number)
    assert number is not None
    if not number.is_integer():
        raise AnalysisError(f"linha {line_number}: campo {field!r} deve ser inteiro")
    return int(number)


def read_engagements(csv_path: str | Path) -> list[dict[str, Any]]:
    """Read and validate schema-v1 rows, failing on any malformed input."""
    path = Path(csv_path)
    engagements: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, strict=True)
            try:
                header = next(reader)
            except StopIteration as exc:
                raise AnalysisError(f"CSV sem cabeçalho ou conteúdo: {path}") from exc

            if len(header) != len(set(header)):
                raise AnalysisError("cabeçalho CSV contém nomes de coluna duplicados")
            if tuple(header) != SCHEMA_V1:
                missing = [field for field in SCHEMA_V1 if field not in header]
                unexpected = [field for field in header if field not in SCHEMA_V1]
                details = []
                if missing:
                    details.append("faltando: " + ", ".join(missing))
                if unexpected:
                    details.append("inesperadas: " + ", ".join(unexpected))
                if not details:
                    details.append("ordem diferente do schema v1 exigido")
                raise AnalysisError("cabeçalho CSV inválido (" + "; ".join(details) + ")")

            for line_number, values in enumerate(reader, start=2):
                if len(values) != len(SCHEMA_V1):
                    raise AnalysisError(
                        f"linha {line_number}: esperadas {len(SCHEMA_V1)} colunas, recebidas {len(values)}"
                    )
                raw = dict(zip(SCHEMA_V1, values))
                row: dict[str, Any] = {}

                for field in STRING_FIELDS:
                    value = raw[field].strip()
                    if not value:
                        raise AnalysisError(
                            f"linha {line_number}: dimensão {field!r} não pode ser vazia"
                        )
                    row[field] = value

                engagement_id = row["engagement_id"]
                if engagement_id in seen_ids:
                    raise AnalysisError(
                        f"linha {line_number}: engagement_id duplicado: {engagement_id!r}"
                    )
                seen_ids.add(engagement_id)

                row["distance_m"] = _number(raw["distance_m"], "distance_m", line_number)
                row["shots_fired"] = _integer(raw["shots_fired"], "shots_fired", line_number)
                row["shots_hit"] = _integer(raw["shots_hit"], "shots_hit", line_number)
                row["damage_applied"] = _number(raw["damage_applied"], "damage_applied", line_number)
                row["server_rtt_ms"] = _number(raw["server_rtt_ms"], "server_rtt_ms", line_number)

                for field in ("distance_m", "damage_applied", "server_rtt_ms"):
                    if row[field] < 0:
                        raise AnalysisError(f"linha {line_number}: campo {field!r} deve ser >= 0")
                if row["shots_fired"] <= 0:
                    raise AnalysisError(f"linha {line_number}: shots_fired deve ser > 0")
                if not 0 <= row["shots_hit"] <= row["shots_fired"]:
                    raise AnalysisError(
                        f"linha {line_number}: shots_hit deve estar entre 0 e shots_fired"
                    )

                eliminated = raw["eliminated"].strip()
                if eliminated not in ("true", "false"):
                    raise AnalysisError(
                        f"linha {line_number}: eliminated deve ser exatamente 'true' ou 'false'"
                    )
                row["eliminated"] = eliminated == "true"
                ttk = _number(raw["time_to_kill_ms"], "time_to_kill_ms", line_number, required=False)
                if row["eliminated"]:
                    if ttk is None or ttk <= 0:
                        raise AnalysisError(
                            f"linha {line_number}: TTK deve ser > 0 quando eliminated=true"
                        )
                elif ttk is not None:
                    raise AnalysisError(
                        f"linha {line_number}: TTK deve estar vazio quando eliminated=false"
                    )
                row["time_to_kill_ms"] = ttk
                engagements.append(row)
    except OSError as exc:
        raise AnalysisError(f"não foi possível ler CSV {path}: {exc}") from exc
    except csv.Error as exc:
        raise AnalysisError(f"CSV inválido em {path}: {exc}") from exc

    if not engagements:
        raise AnalysisError(f"CSV não contém engajamentos: {path}")
    return engagements


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2.0


def _nearest_rank(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[rank - 1]


def analyze(engagements: Iterable[dict[str, Any]], min_encounters: int) -> dict[str, Any]:
    """Return deterministic descriptive metrics by the specified grouping keys."""
    if min_encounters <= 0:
        raise AnalysisError("--min-encounters deve ser um inteiro positivo")

    groups: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in engagements:
        groups[tuple(row[field] for field in GROUP_FIELDS)].append(row)

    results = []
    for key in sorted(groups):
        rows = groups[key]
        n = len(rows)
        shots_fired = sum(row["shots_fired"] for row in rows)
        shots_hit = sum(row["shots_hit"] for row in rows)
        total_damage = sum(row["damage_applied"] for row in rows)
        ttks = [row["time_to_kill_ms"] for row in rows if row["eliminated"]]
        group_result: dict[str, Any] = dict(zip(GROUP_FIELDS, key))
        group_result.update(
            {
                "n": n,
                "sample_status": "SUFFICIENT_FOR_REVIEW" if n >= min_encounters else "INSUFFICIENT_SAMPLE",
                "hit_rate": shots_hit / shots_fired,
                "damage_per_shot": total_damage / shots_fired,
                "damage_per_hit": total_damage / shots_hit if shots_hit else None,
                "elim_rate": sum(row["eliminated"] for row in rows) / n,
                "ttk_median_ms": _median(ttks) if ttks else None,
                "ttk_p90_ms": _nearest_rank(ttks, 0.90),
                "mean_distance_m": sum(row["distance_m"] for row in rows) / n,
                "median_server_rtt_ms": _median([row["server_rtt_ms"] for row in rows]),
            }
        )
        results.append(group_result)

    return {
        "schema_version": 1,
        "min_encounters": min_encounters,
        "balance_status": "UNVERIFIED",
        "evidence_scope": "observed_playtest_descriptive_only",
        "groups": results,
    }


def _positive_integer(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("deve ser um inteiro positivo") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError("deve ser um inteiro positivo")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Resume métricas descritivas de CSV de playtests controlados. "
            "Não compara armas com metas nem certifica balanceamento."
        )
    )
    parser.add_argument("csv", help="arquivo CSV de entrada conforme schema v1")
    parser.add_argument(
        "--min-encounters",
        type=_positive_integer,
        required=True,
        help="limite de encontros por grupo para marcar SUFFICIENT_FOR_REVIEW",
    )
    parser.add_argument("--output", help="caminho opcional para gravar JSON (padrão: stdout)")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        report = analyze(read_engagements(args.csv), args.min_encounters)
        rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=False, allow_nan=False) + "\n"
        if args.output:
            Path(args.output).write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
    except (AnalysisError, OSError) as exc:
        print(f"erro: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
