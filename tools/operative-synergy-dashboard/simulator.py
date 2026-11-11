"""Adaptador JSON sobre o simulador canônico em scripts/operative-synergy-sim.py."""
from __future__ import annotations

import importlib.util
import sys
from itertools import combinations
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts" / "operative-synergy-sim.py"
_spec = importlib.util.spec_from_file_location("khaaos_operative_synergy", SOURCE)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Não foi possível carregar o simulador canônico: {SOURCE}")
_model = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _model
_spec.loader.exec_module(_model)

OPERATIVES = _model.OPERATIVES
RULES = _model.RULES
DEFAULT_LINEUP = (
    "OP_MALE_RECON_ASIAN",
    "OP_FEMALE_SNIPER",
    "OP_FEMALE_DISRUPTOR_MENA",
    "OP_MALE_VANGUARD",
)
MAX_LINEUP = 4


def _round(value: float) -> float:
    return round(float(value), 3)


def _union_seconds(intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return 0.0
    ordered = sorted(intervals)
    start, end = ordered[0]
    total = 0.0
    for next_start, next_end in ordered[1:]:
        if next_start <= end:
            end = max(end, next_end)
        else:
            total += end - start
            start, end = next_start, next_end
    return _round(total + end - start)


def _intervals_json(intervals: list[tuple[float, float]]) -> list[dict[str, float]]:
    return [{"startSeconds": _round(start), "endSeconds": _round(end)} for start, end in intervals]


def _overlap_intervals(left: list[tuple[float, float]], right: list[tuple[float, float]]) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    for left_start, left_end in left:
        for right_start, right_end in right:
            start = max(left_start, right_start)
            end = min(left_end, right_end)
            if end > start:
                result.append((start, end))
    return result


def _timeline_entry(operative: Any, horizon: float) -> dict[str, Any]:
    interaction = float(operative.interaction_s)
    duration = float(operative.duration_s)
    activations: list[dict[str, Any]] = []
    cast_at = 0.0
    while cast_at < horizon:
        effect_end = min(horizon, cast_at + interaction)
        state_end = min(horizon, cast_at + duration)
        activations.append({
            "atSeconds": _round(cast_at),
            "effectEndSeconds": _round(effect_end),
            "stateEndSeconds": _round(state_end),
            "cooldownEndSeconds": _round(cast_at + float(operative.cooldown_s)),
            "isInstantEvent": duration <= 0 and interaction <= 0,
            "isAnalyticSignal": interaction > duration,
        })
        cast_at += float(operative.cooldown_s)
    return {
        "id": operative.operative_id,
        "name": operative.name,
        "ability": operative.ability,
        "effect": operative.effect,
        "details": operative.details,
        "cooldownSeconds": _round(operative.cooldown_s),
        "durationSeconds": _round(duration),
        "interactionWindowSeconds": _round(interaction),
        "activations": activations,
    }


def _pair_entry(left: Any, right: Any, horizon: float) -> dict[str, Any]:
    left_windows = _model.windows(left, horizon)
    right_windows = _model.windows(right, horizon)
    effects = {left.effect, right.effect}
    synergies: list[dict[str, Any]] = []
    pair_intervals: list[tuple[float, float]] = []
    for rule in RULES:
        if {rule.left_effect, rule.right_effect} <= effects:
            overlaps = _overlap_intervals(left_windows, right_windows)
            if overlaps:
                seconds = sum(end - start for start, end in overlaps)
                pair_intervals.extend(overlaps)
                synergies.append({
                    "label": rule.label,
                    "rationale": rule.rationale,
                    "overlapInstances": len(overlaps),
                    "pairSeconds": _round(seconds),
                    "intervals": _intervals_json(overlaps),
                })
    return {
        "leftId": left.operative_id,
        "rightId": right.operative_id,
        "leftName": left.name,
        "rightName": right.name,
        "synergies": synergies,
        "overlapInstances": sum(item["overlapInstances"] for item in synergies),
        "pairSeconds": _round(sum(item["pairSeconds"] for item in synergies)),
        "coveredSeconds": _union_seconds(pair_intervals),
        "intervals": _intervals_json(pair_intervals),
    }


def simulate(horizon_seconds: float, lineup_ids: list[str]) -> dict[str, Any]:
    """Return the full roster and pair model for a valid horizon/composition."""
    horizon = float(horizon_seconds)
    if not 0 < horizon <= 3600:
        raise ValueError("O horizonte precisa ser maior que 0 e no máximo 3600 segundos.")
    if not 2 <= len(lineup_ids) <= MAX_LINEUP:
        raise ValueError("Selecione de 2 a 4 operativos para a composição.")
    if len(set(lineup_ids)) != len(lineup_ids):
        raise ValueError("A composição não pode repetir o mesmo operativo.")
    try:
        lineup = [_model.BY_ID[operative_id] for operative_id in lineup_ids]
    except KeyError as error:
        raise ValueError(f"Operativo desconhecido: {error.args[0]}") from error

    timeline = [_timeline_entry(operative, horizon) for operative in OPERATIVES]
    pairs = [_pair_entry(left, right, horizon) for left, right in combinations(OPERATIVES, 2)]
    selected_ids = {operative.operative_id for operative in lineup}
    selected_pairs = [pair for pair in pairs if pair["leftId"] in selected_ids and pair["rightId"] in selected_ids]
    all_intervals = [
        (interval["startSeconds"], interval["endSeconds"])
        for pair in selected_pairs
        for interval in pair["intervals"]
    ]
    overlap_count = sum(pair["overlapInstances"] for pair in selected_pairs)
    pair_seconds = _round(sum(pair["pairSeconds"] for pair in selected_pairs))
    covered = _union_seconds(all_intervals)
    composition = {
        "ids": [operative.operative_id for operative in lineup],
        "operators": [operative.name for operative in lineup],
        "overlapInstances": overlap_count,
        "frequencyPerMinute": _round(overlap_count * 60 / horizon),
        "pairSeconds": pair_seconds,
        "coveredSeconds": covered,
        "synergies": [pair for pair in selected_pairs if pair["synergies"]],
    }
    return {
        "horizonSeconds": _round(horizon),
        "timeline": timeline,
        "pairs": pairs,
        "composition": composition,
        "limits": {
            "maxLineup": MAX_LINEUP,
            "signalWindowSeconds": _round(_model.SIGNAL_WINDOW_S),
            "authoritativeCombatResult": False,
        },
    }
