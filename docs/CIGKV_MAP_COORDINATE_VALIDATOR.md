# Validação de coordenadas dos dados CIGKV

O script `scripts/validate_cigkv_map_coordinates.py` faz uma checagem estática, sem modificar os arquivos, antes de importar ou carregar o layout no Unreal. Por padrão, ele inspeciona as duas cópias versionadas:

- `config/levels/CIGKV_level_data.json`
- `Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json`

Ele valida JSON estrito (rejeita `NaN`/infinito), sistema de coordenadas UE5 Z-up e unidade `cm`, dimensões, contrato de origem e `world_bounds`, coordenadas finitas e dentro dos limites, bounds/setor declarado, IDs positivos e únicos, rotação, raio/borda de ZEX, spawn duplicado e paridade espacial entre as cópias. Não impõe espaçamento mínimo, distribuição de produto nem altera/realinha coordenadas.

## Uso

```bash
# Gate estrito antes de carregar no Unreal; retorna código 1 se faltar contrato ou houver erro
python3 scripts/validate_cigkv_map_coordinates.py

# Validar um arquivo específico (pode repetir --input para comparar cópias)
python3 scripts/validate_cigkv_map_coordinates.py --input caminho/para/mapa.json

# Gerar relatório legível por máquina
python3 scripts/validate_cigkv_map_coordinates.py --report /tmp/cigkv-coordinate-report.json

# Diagnóstico legado dos JSONs atuais; não significa que estão prontos para Unreal
python3 scripts/validate_cigkv_map_coordinates.py --allow-legacy-contract

# Testes unitários portáveis do repositório
python3 -m unittest discover -s tests/python -p 'test_cigkv_map_coordinates.py' -v
```

## Resultado do baseline atual

As duas cópias presentes são byte-idênticas e contêm 50 spawns, 15 ZEX, 60 pontos de loot e quatro fases. No modo legado, as coordenadas atuais cabem nos limites provisórios `[0, map_size]`, sem problemas estruturais de ponto/setor detectados pelo script. Contudo, `coordinate_origin` e `world_bounds` não estão declarados. Por isso o modo padrão bloqueia a classificação **seguro para carregar no Unreal**; o modo `--allow-legacy-contract` serve apenas para diagnosticar os dados com essa suposição explícita e mantém `safe_to_load_into_unreal=false`.

Para desbloquear o gate, a decisão de design deve registrar no JSON o frame de coordenadas aprovado em `coordinate_origin` (`x`, `y`, `z`) e bounds explícitos em `world_bounds` (`min` e `max`, cada um com `x`, `y`, `z`), compatíveis com as dimensões e as coordenadas. O script não escolhe canto/centro de origem. Mesmo com o gate aprovado, ainda é necessária validação no Unreal contra o mapa real: colisão, altura de piso, NavMesh, volumes vedados e fairness de spawn ficam fora do escopo deste validador estático.
