#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Splice do Lote 4 em shared/character-studio.ts:
1. tipo OperativeFaction + campo opcional `faction` em OperativeArchetype;
2. bloco KHAAOS_MILITIA_ARCHETYPES + ALL_KHAAOS_OPERATIVE_ARCHETYPES inserido
   logo após o fechamento do array KHAAOS_OPERATIVE_ARCHETYPES;
3. buildOperativePromptBundle passa a buscar no roster combinado.

Idempotente: remove inserções anteriores antes de reaplicar.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
STUDIO = REPO / "shared/character-studio.ts"
BLOCK = (REPO / "scripts/lote4_milicias/militia_block.ts").read_text(encoding="utf-8")

FACTION_TYPE = 'export type OperativeGender = "MASCULINO" | "FEMININO";'
FACTION_TYPE_NEW = (
    'export type OperativeGender = "MASCULINO" | "FEMININO";\n\n'
    '/**\n * Facção do operante: os 16 militares canônicos são MILITAR (implícito);\n'
    ' * o Lote 4 declara MILICIA_URBANA (MIL-01..08) e GANGUE_URBANA (GNG-01..08).\n'
    ' */\n'
    'export type OperativeFaction = "MILITAR" | "MILICIA_URBANA" | "GANGUE_URBANA";'
)

ROLE_LINE = "  roleTitle: string;"
ROLE_LINE_NEW = (
    "  roleTitle: string;\n"
    "  /** Facção do operante (ausente = MILITAR, os 16 canônicos). */\n"
    "  faction?: OperativeFaction;"
)

def main():
    src = STUDIO.read_text(encoding="utf-8")

    # ── desfaz inserções anteriores (idempotência) ──
    if 'export type OperativeFaction = ' in src:
        src = src.replace(FACTION_TYPE_NEW, FACTION_TYPE)
        assert 'export type OperativeFaction = ' not in src, "falha ao remover tipo"
    if ROLE_LINE_NEW.replace(ROLE_LINE + "\n", "") and "  /** Facção do operante (ausente = MILITAR, os 16 canônicos). */" in src:
        src = src.replace(ROLE_LINE_NEW, ROLE_LINE)
        assert "os 16 canônicos). */" not in src
    # remove bloco anterior
    m_start = src.find("/**\n * Lote 4 — Milícias e Gangues Urbanas")
    if m_start != -1:
        m_end = src.find("];\n", src.find("ALL_KHAAOS_OPERATIVE_ARCHETYPES", m_start))
        assert m_end != -1
        src = src[:m_start] + src[m_end + 3:]
        assert "Lote 4 — Milícias" not in src

    # ── 1. tipo + campo ──
    assert src.count(FACTION_TYPE) == 1
    src = src.replace(FACTION_TYPE, FACTION_TYPE_NEW)
    assert src.count(ROLE_LINE) == 1, src.count(ROLE_LINE)
    src = src.replace(ROLE_LINE, ROLE_LINE_NEW)

    # ── 2. bloco após o fechamento do array canônico ──
    # acha "export const WORLD_BACKDROP_PROMPTS" e insere antes
    marker = src.index("export const WORLD_BACKDROP_PROMPTS")
    # recua para o comentário/blank anterior imediatamente antes do export
    head = src[:marker].rstrip("\n") + "\n\n"
    tail = src[marker:]
    src = head + BLOCK + "\n" + tail

    # ── 3. prompt bundle busca no roster combinado ──
    # apenas dentro de buildOperativePromptBundle (as 4 referências do lookup)
    fn_start = src.index("export function buildOperativePromptBundle")
    fn_end = src.index("}\n", src.index("return {", fn_start))
    fn = src[fn_start:fn_end]
    assert fn.count("KHAAOS_OPERATIVE_ARCHETYPES") == 4, fn.count("KHAAOS_OPERATIVE_ARCHETYPES")
    fn = fn.replace("KHAAOS_OPERATIVE_ARCHETYPES", "ALL_KHAAOS_OPERATIVE_ARCHETYPES")
    src = src[:fn_start] + fn + src[fn_end:]

    STUDIO.write_text(src, encoding="utf-8")
    print("spliced:", STUDIO)
    print("KHAAOS_MILITIA_ARCHETYPES presentes:", src.count("export const KHAAOS_MILITIA_ARCHETYPES"))
    print("ALL_KHAAOS no bundle:", "ALL_KHAAOS_OPERATIVE_ARCHETYPES" in src[fn_start:])

if __name__ == "__main__":
    sys.exit(main())
