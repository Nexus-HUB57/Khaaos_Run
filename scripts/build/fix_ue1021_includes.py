#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Khaaos Run — UE1021 include canonicalizer + CI guard (engine-less).

Histórico: regenerações de código do UE5.8 (UHT/HeaderTool e scaffolds de
novos artefatos) costumam emitir includes de projeto SEM o caminho do módulo
(`#include "KhaaosRingManager.h"`), o que quebra o preflight com UE1021 e
depois o build real. Este fixer restaura a forma canônica adotada pelo
projeto — `#include "Game/<SubDir>/Header.h"` (caminho a partir da raiz do
módulo dono) — e, no modo --check, funciona como GUARD de CI: falha quando
qualquer include deixaria de estar canônico, pegando a regeneração antes do
build.

Regras (idempotentes):
  1. Só reescreve include cujo header EXISTE no projeto (basename único).
     Includes de engine/thirdparty cujo basename não existe em Source/ são
     intocados — o build resolve via IncludePaths dos módulos.
  2. Includes que já resolvem NÃO são tocados:
     - forma canônica atual (caminho a partir da raiz de QUALQUER módulo);
     - include relativo ao diretório do próprio arquivo;
     - caminho relativo explícito (`./` ou `../`).
  3. `.generated.h` NUNCA é tocado: UHT grava o arquivo gerado ao lado do
     header dono, o include citado procura o diretório do próprio arquivo
     primeiro, e o preflight aceita ambas as formas (mesma convenção dos
     PRs #137/#138 — campanha UE1021 não mexeu em .generated.h).
  4. Basename ambíguo (mesmo header em 2+ módulos/subdirs sem desempate pelo
     módulo do arquivo que inclui) → NÃO reescreve (reporta como aviso).
  5. Nunca altera comentários/strings — apenas a diretiva `#include "..."`.

Modos:
  --fix ROOT      aplica reescritas (padrão de desenvolvimento; idempotente)
  --check ROOT    CI guard: exit 0 se tudo canônico; exit 2 listando o que
                  uma regeneração quebrou (sem escrever nada)
  --selftest      fixture sintética em tempdir + asserções embutidas
                  (usada pelo próprio guard como regression check)

ROOT é a pasta que contém KhaaosRun.uproject (ex.: Unreal/KhaaosRun).
Dependências: apenas stdlib (roda em qualquer runner sem pip install).
"""

import argparse
import os
import re
import shutil
import sys
import tempfile

INCLUDE_RE = re.compile(r'^(\s*)#include\s+"([^"]+)"(\s.*)?$')
SOURCE_EXT = (".cpp", ".h", ".hpp", ".cc", ".cxx")
HEADER_EXT = (".h", ".hpp")
# Módulos do projeto (raízes sob Source/). Manter em sync com KhaaosRun.uproject.
MODULE_DIRS = ("KhaaosRun", "KhaaosRunEditor", "KhaaosEAC", "KhaaosRunServer")


def is_source_file(name):
    return name.endswith(SOURCE_EXT)


def is_header_file(name):
    return name.endswith(HEADER_EXT)


def build_header_index(source_root):
    """basename → {canonical_include: abs_path}; canônico = caminho a partir
    da raiz do módulo dono (Source/<Module>/...)."""
    index = {}
    for module in MODULE_DIRS:
        module_root = os.path.join(source_root, module)
        if not os.path.isdir(module_root):
            continue
        for dirpath, _dirnames, filenames in os.walk(module_root):
            for filename in filenames:
                if not is_header_file(filename):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, filename), module_root)
                canonical = rel.replace(os.sep, "/")
                index.setdefault(filename, {})[canonical] = os.path.join(dirpath, filename)
    return index


def build_canonical_set(index):
    """Conjunto de todas as formas canônicas válidas (para reconhecer
    includes que já resolvem)."""
    canonical = set()
    for variants in index.values():
        canonical.update(variants.keys())
    return canonical


def choose_canonical(basename, including_file, source_root, index):
    """Resolve o canônico de um basename. Retorna (canonical|None, ambíguo?)."""
    variants = index.get(basename)
    if not variants:
        return None, False
    if len(variants) == 1:
        return next(iter(variants)), False
    # Desempate: header do MESMO módulo do arquivo que inclui (abs_path fala
    # por si — canônico é module-relative, sem prefixo do módulo).
    for module in MODULE_DIRS:
        module_prefix = os.path.join(source_root, module) + os.sep
        if including_file.startswith(module_prefix):
            for canonical, abs_path in variants.items():
                if abs_path.startswith(module_prefix):
                    return canonical, False
            break
    return None, True


def canonicalize_includes_in_text(text, file_path, source_root, index, canonical_set):
    """Retorna (novo_texto, reescritas[], avisos[])."""
    rewrites = []
    warnings = []
    out_lines = []
    for line in text.splitlines(keepends=True):
        eol = "\r\n" if line.endswith("\r\n") else ("\n" if line.endswith("\n") else "")
        body = line[: len(line) - len(eol)] if eol else line
        match = INCLUDE_RE.match(body)
        if not match:
            out_lines.append(line)
            continue
        indent, target, trailing = match.group(1), match.group(2), match.group(3) or ""

        # Regras de "já resolve" — não tocar.
        if target.startswith("./") or target.startswith("../"):
            out_lines.append(line)
            continue
        if target in canonical_set:
            out_lines.append(line)
            continue
        file_dir = os.path.dirname(file_path)
        if os.path.isfile(os.path.join(file_dir, target)):
            out_lines.append(line)
            continue

        base = target
        if base.endswith(".generated.h"):
            out_lines.append(line)  # regra 3 — UHT/same-dir, convenção intocada
            continue

        if not is_header_file(base):
            out_lines.append(line)
            continue

        basename = os.path.basename(base)
        canonical, ambiguous = choose_canonical(basename, file_path, source_root, index)
        if canonical is None:
            if ambiguous:
                warnings.append(f"{basename}: basename ambíguo no projeto — include intocado")
            # basename inexistente no projeto → engine/thirdparty, intocado.
            out_lines.append(line)
            continue

        desired = canonical
        if target == desired:
            out_lines.append(line)
            continue
        rewrites.append(f'"{target}" → "{desired}"')
        out_lines.append(f"{indent}#include \"{desired}\"{trailing}{eol}")
    return "".join(out_lines), rewrites, warnings


def iter_source_files(source_root):
    for dirpath, dirnames, filenames in os.walk(source_root):
        dirnames[:] = [d for d in dirnames if d not in ("Intermediate", "Binaries", "Saved", ".vs")]
        for filename in filenames:
            if is_source_file(filename):
                yield os.path.join(dirpath, filename)


def process(root, apply_changes):
    source_root = os.path.join(root, "Source")
    if not os.path.isdir(source_root):
        print(f"ERRO: Source/ não encontrado em {root}", file=sys.stderr)
        return 1, []
    index = build_header_index(source_root)
    canonical_set = build_canonical_set(index)
    total_rewrites = []
    for file_path in sorted(iter_source_files(source_root)):
        with open(file_path, "r", encoding="utf-8", errors="surrogateescape") as handle:
            text = handle.read()
        new_text, rewrites, _warnings = canonicalize_includes_in_text(
            text, file_path, source_root, index, canonical_set
        )
        if not rewrites:
            continue
        rel = os.path.relpath(file_path, root)
        if apply_changes:
            with open(file_path, "w", encoding="utf-8", errors="surrogateescape", newline="") as handle:
                handle.write(new_text)
        total_rewrites.append((rel, rewrites))
    return 0, total_rewrites


# ─── Selftest ────────────────────────────────────────────────────────────────

SELFTEST_FILES = {
    "KhaaosRun.uproject": "{}",
    # Header canônico do projeto (dono do .generated.h no MESMO dir).
    "Source/KhaaosRun/Game/Ring/KhaaosRingManager.h": (
        '#pragma once\n'
        '#include "KhaaosRingManager.generated.h"\n'  # same-dir/UHT → intocado
    ),
    # Ambiguidade: mesmo basename em dois módulos (editor em subdiretório).
    "Source/KhaaosRun/Game/Combat/Dual.h": "#pragma once\n",
    "Source/KhaaosRunEditor/Sub/Dual.h": "#pragma once\n",
    # Codegen UE: consumidor em SUBDIR DIFERENTE dos headers — é aqui que a
    # regeneração quebra (same-dir não salva): basename e subcaminho não
    # canônicos, engine, e formas já corretas.
    "Source/KhaaosRun/Game/AI/KhaaosTestConsumer.cpp": (
        '#include "KhaaosRingManager.h"\n'           # → Game/Ring/... (basename, outro dir)
        '#include "Game/Ring/KhaaosRingManager.h"\n'  # já canônico → intocado
        '#include "Engine/Engine.h"\n'               # engine (não existe no projeto) → intocado
        '#include "Dual.h"\n'                        # ambíguo → desempata p/ o módulo Game/Combat
        '#include "Combat/Dual.h"\n'                 # subcaminho não canônico → mesmo canônico
        '#include "../../Game/Ring/KhaaosRingManager.h"\n'  # relativo explícito → intocado
    ),
    # Codegen: cpp em outro módulo inclui header ambíguo → desempate p/ editor.
    "Source/KhaaosRunEditor/EditorThing.cpp": (
        '#include "Dual.h"\n'                       # → Sub/Dual.h (módulo do editor)
        '#include "Object/Foo.generated.h"\n'       # dono inexistente → intocado
    ),
}


def selftest():
    tmp = tempfile.mkdtemp(prefix="khaaos-ue1021-")
    try:
        for rel, content in SELFTEST_FILES.items():
            path = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(content)

        code, rewrites = process(tmp, apply_changes=False)
        assert code == 0, "selftest: process falhou"
        planned = {rel: list(items) for rel, items in rewrites}

        # 1) consumidor AI: exatamente 3 reescritas (basename + 2 ambíguas);
        #    canônico, engine, relativo e .generated.h intocados.
        consumer_key = os.path.join("Source", "KhaaosRun", "Game", "AI", "KhaaosTestConsumer.cpp")
        consumer = planned.get(consumer_key, [])
        assert len(consumer) == 3, f"esperava 3 reescritas no consumidor AI, veio {consumer}"
        assert any('"KhaaosRingManager.h" → "Game/Ring/KhaaosRingManager.h"' in item for item in consumer), \
            f"include basename não planejado: {consumer}"
        assert sum(1 for i in consumer if '"Game/Combat/Dual.h"' in i) == 2, \
            f"ambiguidade deveria desempatar 2x p/ Game/Combat/Dual.h: {consumer}"
        assert not any("Engine/Engine.h" in item for item in consumer), "engine include não deveria ser tocado"
        assert not any("generated.h" in item for item in consumer), "dono canônico não deveria ser tocado"

        # 1b) dono com .generated.h same-dir permanece intacto.
        owner_key = os.path.join("Source", "KhaaosRun", "Game", "Ring", "KhaaosRingManager.h")
        assert owner_key not in planned, ".generated.h same-dir deveria ficar intocado"

        # 2) Editor desempata para o próprio módulo (Sub/Dual.h); dono inexistente intocado.
        editor_key = os.path.join("Source", "KhaaosRunEditor", "EditorThing.cpp")
        editor = planned.get(editor_key, [])
        assert editor == ['"Dual.h" → "Sub/Dual.h"'], \
            f"desempate do módulo editor falhou: {editor}"

        # 3) --fix é idempotente: aplica, reprocessa, zero reescritas.
        code, _ = process(tmp, apply_changes=True)
        assert code == 0
        with open(os.path.join(tmp, "Source", "KhaaosRun", "Game", "AI", "KhaaosTestConsumer.cpp"), encoding="utf-8") as handle:
            fixed = handle.read()
        assert '#include "Game/Ring/KhaaosRingManager.h"' in fixed
        assert fixed.count('#include "Game/Ring/KhaaosRingManager.h"') == 2
        assert '#include "KhaaosRingManager.h"' not in fixed
        assert '#include "../../Game/Ring/KhaaosRingManager.h"' in fixed, "relativo explícito não deveria mudar"
        code, rewrites_after = process(tmp, apply_changes=False)
        assert rewrites_after == [], f"fix não foi idempotente: {rewrites_after}"

        # 4) Guard (--check) reage a uma regeneração que quebra includes.
        regen = os.path.join(tmp, "Source", "KhaaosRun", "Game", "AI", "KhaaosTestConsumer.cpp")
        with open(regen, "a", encoding="utf-8") as handle:
            handle.write('#include "KhaaosRingManager.h"\n')  # regeneração reintroduz o defeito
        code, rewrites_check = process(tmp, apply_changes=False)
        assert len(rewrites_check) == 1, "guard deveria detectar a regeneração"

        print("SELFTEST_OK — 4 grupos de asserções passaram (fix/check/ambiguidade/idempotência)")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="UE1021 include canonicalizer + CI guard")
    parser.add_argument("mode", choices=["fix", "check", "selftest"], nargs="?",
                        default=None, help="modo de execução (default: fix quando ROOT é dado)")
    parser.add_argument("root", nargs="?", default=None,
                        help="pasta que contém KhaaosRun.uproject (ex.: Unreal/KhaaosRun)")
    args = parser.parse_args()

    if args.mode == "selftest":
        sys.exit(selftest())

    if not args.root:
        parser.error("informe ROOT (pasta do .uproject) ou use --mode selftest")
    if not os.path.isfile(os.path.join(args.root, "KhaaosRun.uproject")):
        print(f"ERRO: KhaaosRun.uproject não encontrado em {args.root}", file=sys.stderr)
        sys.exit(1)

    apply_changes = args.mode != "check"
    code, rewrites = process(args.root, apply_changes=apply_changes)
    total = sum(len(items) for _rel, items in rewrites)

    if args.mode == "check":
        if total:
            print(f"UE1021 GUARD: {total} include(s) fora da forma canônica em "
                  f"{len(rewrites)} arquivo(s) — regeneração UE detectada.", file=sys.stderr)
            for rel, items in rewrites:
                for item in items:
                    print(f"  {rel}: {item}", file=sys.stderr)
            print("Rode `python3 scripts/build/fix_ue1021_includes.py fix Unreal/KhaaosRun` "
                  "e commite, ou corrija o gerador que emitiu includes não canônicos.", file=sys.stderr)
            sys.exit(2)
        print(f"UE1021 GUARD OK — includes de projeto canônicos (0 reescritas pendentes).")
        sys.exit(0)

    # modo fix
    if total:
        for rel, items in rewrites:
            for item in items:
                print(f"  {rel}: {item}")
        print(f"FIX OK — {total} include(s) reescrito(s) para a forma canônica "
              f"em {len(rewrites)} arquivo(s).")
    else:
        print("FIX OK — nada a reescrever; includes já canônicos.")


if __name__ == "__main__":
    main()
