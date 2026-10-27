#!/usr/bin/env python3
"""Fix UE1021: reescreve includes de projeto sem o prefixo "Game/" para a
forma canônica relativa à raiz do módulo (Unreal/KhaaosRun/Source/KhaaosRun).

Seguro por construção: só reescreve quando o basename do include existe como
header do projeto e o caminho resolvido com o prefixo "Game/" existe de fato.
Includes de engine (ex.: "Camera/CameraComponent.h") nunca são tocados.
"""
import re
import sys
from pathlib import Path

SRC = Path('/home/z/my-project/Khaaos_Run/Unreal/KhaaosRun/Source/KhaaosRun')
GAME = SRC / 'Game'

# 1) headers do projeto (basename -> [paths relativos a SRC])
headers = {}
for p in SRC.rglob('*.h'):
    headers.setdefault(p.name, []).append(p)

# 2) arquivos alvo: .cpp/.h sob Game/
changed_files = 0
changed_includes = 0
inc_re = re.compile(r'^(\s*#include\s+)"([^"]+)"(.*)$')

for f in list(GAME.rglob('*.cpp')) + list(GAME.rglob('*.h')):
    lines = f.read_text().splitlines(keepends=True)
    out = []
    dirty = False
    for line in lines:
        m = inc_re.match(line)
        if m:
            inc = m.group(2)
            parts = inc.split('/')
            # forma já canônica ou include simples
            if len(parts) == 2 and parts[0] != 'Game':
                sub, base = parts
                subdir = GAME / sub
                target = GAME / sub / base
                # só se: sub é dir real sob Game/, header existe lá, e não é
                # alcançável sem prefixo (evita colisões com engine headers)
                if (subdir.is_dir() and target.exists()
                        and base in headers
                        and not (f.parent / inc).exists()):
                    out.append(f'{m.group(1)}"Game/{inc}"{m.group(3)}')
                    dirty = True
                    changed_includes += 1
                    continue
        out.append(line)
    if dirty:
        f.write_text(''.join(out))
        changed_files += 1

print(f'arquivos alterados: {changed_files}; includes reescritos: {changed_includes}')
if '--check' in sys.argv and changed_includes:
    sys.exit(1)
