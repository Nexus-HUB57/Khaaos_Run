#!/usr/bin/env python3
"""Simulador determinístico de janelas de sinergia para Khaaos Run.

Este utilitário não reproduz a física nem é autoridade do jogo. Ele agenda cada
habilidade no primeiro instante disponível (t=0 e depois a cada cooldown) e mede
sobreposições temporais de pares complementares. As regras de combinação e a
janela de 5 s para sinais instantâneos são heurísticas explícitas de análise.
Não estima vitória, dano real, geometria, linha de visão ou comportamento humano.
Usa somente a biblioteca padrão do Python.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from itertools import combinations
from typing import Iterable


@dataclass(frozen=True)
class Operative:
    operative_id: str
    name: str
    ability: str
    effect: str
    cooldown_s: float
    duration_s: float
    interaction_s: float
    details: str


# Dados espelhados do catálogo do runtime local. A grafia pública de Soraya segue
# a correção solicitada pelo usuário; o ID canônico não muda.
OPERATIVES: tuple[Operative, ...] = (
    Operative("OP_MALE_VANGUARD", "Khael Vance", "Ruptura de Viela", "mobility", 55, 2, 2, "velocidade x1.65; dash limitado a 8 m ou 2 s"),
    Operative("OP_MALE_BREACHER", "Draxen Korr", "Cunha de Forja", "damage_reduction", 55, 6, 6, "-20% de dano direto recebido"),
    Operative("OP_MALE_RECON_ASIAN", "Ren Tanaka", "Eco de Priadus", "recon", 60, 3, 3, "marca bots vivos até 28 m"),
    Operative("OP_MALE_MEDIC_AFRICAN", "Tariq Bakari", "Coágulo de Campo", "heal", 55, 0, 0, "cura instantânea de até 24 VL"),
    Operative("OP_MALE_HUNTER_INDIGENOUS", "Arani Yvy", "Sopro de Priadus", "ring_info", 60, 0, 5, "informa tempo até o próximo pulso"),
    Operative("OP_MALE_MARKSMAN_MENA", "Zayn Al-Mansoor", "Miragem de Ckesalth", "precision", 55, 6, 6, "fator de precisão x1.20"),
    Operative("OP_MALE_BERSERKER_PACIFIC", "Manoa Tuilagi", "Investida Quebramar", "mobility", 55, 3, 3, "velocidade x1.45"),
    Operative("OP_MALE_TECH_INDIAN", "Devan Sharma", "Eco de Confinamento", "ring_info", 60, 0, 5, "informa pulso e raio-alvo do Ring"),
    Operative("OP_FEMALE_VALKYRIE", "Nyra Vex", "Linha de Fuga Valkyrie", "mobility", 55, 4, 4, "velocidade x1.35"),
    Operative("OP_FEMALE_SNIPER", "Lyra Solis", "Linha de Miragem", "precision", 55, 6, 6, "fator de precisão x1.30"),
    Operative("OP_FEMALE_STEALTH_ASIAN", "Mei-Ling Zhou", "Véu Crepuscular", "concealment", 58, 4, 4, "bots perdem detecção visual"),
    Operative("OP_FEMALE_HEAVY_AFRICAN", "Amara Diallo", "Coluna de Comboio", "temporary_armor", 60, 6, 6, "até +15 de blindagem temporária"),
    Operative("OP_FEMALE_SURVIVOR_INDIGENOUS", "Kayaen Apinajé", "Véu de Esporos", "ring_resistance", 55, 5, 5, "-40% de dano do Ring"),
    Operative("OP_FEMALE_PILOT_EURO", "Freja Lindstrom", "Rota de Extração", "terminal_scan", 60, 4, 4, "marca terminal ZEX ativo mais próximo"),
    Operative("OP_FEMALE_DISRUPTOR_MENA", "Soraya Hadd", "Pulso de Desarme", "stun", 55, 2, 1.5, "stun de bots em até 9 m por 1.5 s"),
    Operative("OP_FEMALE_TACTICIAN_SOUTHASIAN", "Priya Nair", "Égide das Marés", "damage_reduction", 60, 4, 4, "-25% de dano direto recebido"),
)

BY_ID = {operative.operative_id: operative for operative in OPERATIVES}
BY_NAME = {operative.name.casefold(): operative for operative in OPERATIVES}
SIGNAL_WINDOW_S = 5.0


@dataclass(frozen=True)
class SynergyRule:
    left_effect: str
    right_effect: str
    label: str
    rationale: str


RULES: tuple[SynergyRule, ...] = (
    SynergyRule("recon", "precision", "Reconhecimento + precisão", "contatos marcados podem ser explorados durante a janela de precisão"),
    SynergyRule("stun", "precision", "Controle + precisão", "o stun de bots pode coincidir com a janela de disparos mais precisos"),
    SynergyRule("stun", "mobility", "Controle + mobilidade", "a interrupção pode coincidir com dash/rotação para reposicionamento"),
    SynergyRule("ring_info", "mobility", "Leitura do Ring + mobilidade", "o sinal do Ring pode coincidir com uma janela de deslocamento"),
    SynergyRule("ring_info", "ring_resistance", "Leitura do Ring + resistência", "informação do pulso pode coincidir com proteção contra dano do Ring"),
    SynergyRule("terminal_scan", "mobility", "Terminal + mobilidade", "o terminal marcado pode coincidir com uma janela de deslocamento"),
    SynergyRule("concealment", "mobility", "Furtividade + mobilidade", "reposicionamento pode coincidir com a perda de detecção visual dos bots"),
)


def windows(op: Operative, horizon_s: float) -> list[tuple[float, float]]:
    """Intervalos repetidos: duração real; sinais instantâneos usam 5 s de análise."""
    # interaction_s é a janela efetiva para combinar no modelo. No stun, por
    # exemplo, o estado dura 2 s, mas o bot fica interrompido por 1,5 s.
    window = op.interaction_s
    if window <= 0:
        return []
    intervals: list[tuple[float, float]] = []
    cast_at = 0.0
    while cast_at < horizon_s:
        end = min(horizon_s, cast_at + window)
        if end > cast_at:
            intervals.append((cast_at, end))
        cast_at += op.cooldown_s
    return intervals


def casts(op: Operative, horizon_s: float) -> list[float]:
    times: list[float] = []
    cast_at = 0.0
    while cast_at < horizon_s:
        times.append(cast_at)
        cast_at += op.cooldown_s
    return times


def overlap_seconds(left: Iterable[tuple[float, float]], right: Iterable[tuple[float, float]]) -> float:
    return sum(max(0.0, min(a1, b1) - max(a0, b0)) for a0, a1 in left for b0, b1 in right)


def pair_synergies(left: Operative, right: Operative, horizon_s: float) -> list[tuple[SynergyRule, float]]:
    result = []
    for rule in RULES:
        effects = {left.effect, right.effect}
        if {rule.left_effect, rule.right_effect} <= effects:
            seconds = overlap_seconds(windows(left, horizon_s), windows(right, horizon_s))
            if seconds > 0:
                result.append((rule, seconds))
    return result


def resolve_member(token: str) -> Operative:
    token = token.strip()
    operative = BY_ID.get(token) or BY_NAME.get(token.casefold())
    if operative is None:
        choices = ", ".join(op.operative_id for op in OPERATIVES)
        raise ValueError(f"Operativo desconhecido: {token!r}. IDs aceitos: {choices}")
    return operative


def print_lineup(lineup: list[Operative], horizon_s: float) -> None:
    print(f"\nCOMPOSIÇÃO — horizonte de {horizon_s:g} s")
    print("Agenda idealizada: cada habilidade é acionada em t=0 e novamente ao fim do cooldown.")
    print("Janelas de sinais instantâneos usam 5 s apenas como convenção analítica; não são duração do jogo.\n")
    print("HABILIDADES")
    for op in lineup:
        schedule = ", ".join(f"{t:g}s" for t in casts(op, horizon_s))
        duration = f"{op.duration_s:g}s" if op.duration_s else "instantânea"
        print(f"- {op.name} — {op.ability}: {op.details}; duração {duration}; cooldown {op.cooldown_s:g}s; ativações {schedule}.")

    results = []
    for left, right in combinations(lineup, 2):
        for rule, seconds in pair_synergies(left, right, horizon_s):
            results.append((seconds, left, right, rule))
    results.sort(key=lambda row: (-row[0], row[3].label, row[1].name, row[2].name))
    print("\nSINERGIAS MODELADAS")
    if not results:
        print("Nenhuma sobreposição de uma regra cadastrada nesta composição/horizonte.")
        return
    for seconds, left, right, rule in results:
        share = seconds / horizon_s * 100 if horizon_s else 0
        print(f"- {left.name} + {right.name} — {rule.label}: {seconds:.1f}s sobrepostos ({share:.1f}% do horizonte). {rule.rationale}.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Simula sobreposição de janelas de sinergia entre habilidades de operativos.")
    parser.add_argument("--lineup", default="OP_MALE_RECON_ASIAN,OP_FEMALE_SNIPER,OP_FEMALE_DISRUPTOR_MENA,OP_MALE_VANGUARD",
                        help="IDs ou nomes separados por vírgula; padrão: Ren Tanaka, Lyra Solis, Soraya Hadd e Khael Vance")
    parser.add_argument("--horizon", type=float, default=180, help="horizonte simulado em segundos (padrão: 180)")
    parser.add_argument("--all-pairs", action="store_true", help="comparar as 120 duplas possíveis do roster inteiro")
    parser.add_argument("--list-operatives", action="store_true", help="listar os IDs aceitos")
    args = parser.parse_args()

    if args.list_operatives:
        for op in OPERATIVES:
            print(f"{op.operative_id}\t{op.name}\t{op.ability}\tCD {op.cooldown_s:g}s")
        return 0
    if args.horizon <= 0:
        parser.error("--horizon precisa ser maior que zero")

    if args.all_pairs:
        print(f"DUPLAS — horizonte de {args.horizon:g} s; sobreposição de janelas, não previsão de dano/vitória")
        rows = []
        for left, right in combinations(OPERATIVES, 2):
            for rule, seconds in pair_synergies(left, right, args.horizon):
                rows.append((seconds, left, right, rule))
        rows.sort(key=lambda row: (-row[0], row[3].label, row[1].name, row[2].name))
        for seconds, left, right, rule in rows:
            print(f"{seconds:6.1f}s | {left.name} + {right.name} | {rule.label} | {rule.rationale}")
        return 0

    try:
        lineup = [resolve_member(token) for token in args.lineup.split(",") if token.strip()]
    except ValueError as error:
        parser.error(str(error))
    if len(lineup) < 2:
        parser.error("informe pelo menos dois operativos em --lineup")
    if len({op.operative_id for op in lineup}) != len(lineup):
        parser.error("a composição não pode repetir o mesmo operativo")
    print_lineup(lineup, args.horizon)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
