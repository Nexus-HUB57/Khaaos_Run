# Análise do replay fixo UE5.8 — dry-run detalhado

**Data da execução:** 5 de novembro de 2026
**Modo:** `--dry-run --simulate-metrics`
**Status:** `dry_run_simulated`
**Engine/GPU:** não detectados no sandbox

## 1. Comando reproduzido

```bash
node scripts/performance/ue58_fixed_replay.mjs \
  --dry-run \
  --simulate-metrics \
  --replay scripts/performance/ue58-fixed-replay.json \
  --output-dir /tmp/khaaos-fixed-replay-dry-run-detailed
```

O modo simulado gera 20 amostras determinísticas para validar o parser, a agregação p50/p95/máximo e a lógica dos gates. Ele não executa `UnrealEditor-Cmd`, não mede GPU real e não comprova ativação efetiva do Lumen ou do Nanite.

## 2. Manifesto analisado

O replay fixa a comparação entre execuções com:

- seed: `UE58-FIVE-WORLDS-FIXED-REPLAY-2026-11`;
- duração: 600 segundos;
- tick rate: 30 Hz;
- 60 operadores por mundo;
- cinco mundos: CIGKV, Barburhen, Priadus, Ckesalth e Arukheea;
- perfil gráfico: Medium;
- resolução dinâmica desativada;
- Lumen, Nanite, Virtual Shadow Maps e TAAU configurados como ativos.

A configuração de captura exige `Stat Unit`, `Stat Unit Graph`, GPU Visualizer, CSV, Unreal Insights e shader pipeline cache.

## 3. Critérios de aceitação

| Critério | Limite | Evidência exigida |
|---|---:|---|
| Game Thread p95 | ≤ 8,33 ms | CSV de Stat Unit/Insights |
| Render Thread p95 | ≤ 8,33 ms | CSV de Stat Unit/Insights |
| GPU/frame p95 | ≤ 16,67 ms | GPU Visualizer/CSV |
| Tick autoritativo p95 | ≤ 33,33 ms | métrica do servidor |
| Crescimento de memória | ≤ 512 MB | captura de memória durante 600 s |
| Hitch persistente | < 100 ms | Insights e série temporal |
| Lumen GPU p95 | ≤ 8,33 ms | coluna/captura específica de Lumen no runner real |
| Fallback Nanite p95 | ≤ 5% | Stat Unit Graph/telemetria Nanite |

Os dois últimos critérios são deliberadamente separados do frame time agregado. Assim, um frame GPU dentro de 16,67 ms não mascara um custo excessivo de Lumen, nem um frame estável mascara fallback elevado do Nanite.

## 4. Resultado das métricas simuladas

| Métrica | Amostras | p50 | p95 | Máximo | Limite | Gate simulado |
|---|---:|---:|---:|---:|---:|---|
| Game Thread | 20 | 5,8 ms | 7,1 ms | 7,8 ms | 8,33 ms | PASS |
| Render Thread | 20 | 6,4 ms | 7,6 ms | 8,0 ms | 8,33 ms | PASS |
| GPU/frame | 20 | 10,2 ms | 12,8 ms | 14,4 ms | 16,67 ms | PASS |
| Lumen GPU | 0 | — | — | — | 8,33 ms | NÃO MEDIDO |
| Fallback Nanite | 0 | — | — | — | 5% | NÃO MEDIDO |

O cálculo de p95 usa a posição `ceil(0,95 × N) - 1` após ordenar as amostras. Com 20 amostras, o p95 corresponde à 19ª observação ordenada.

## 5. Interpretação dos gates

O resultado do executor agora separa dois estados:

- `configurationPass: true`: o manifesto ativa Lumen/Nanite e exige os coletores correspondentes.
- `realRunnerPass: false`: o dry-run não possui amostras específicas de Lumen GPU nem de fallback Nanite.

Portanto, o dry-run confirma que o contrato está corretamente configurado e que o parser funciona, mas não aprova o desempenho gráfico real. A aprovação real só ocorre quando o runner UE5.8 gerar essas colunas/capturas.

O resultado resumido foi:

```json
{
  "status": "dry_run_simulated",
  "configurationPass": true,
  "realRunnerPass": false,
  "gameThreadP95Ms": 7.1,
  "renderThreadP95Ms": 7.6,
  "gpuP95Ms": 12.8,
  "lumenGpuP95Ms": null,
  "naniteFallbackP95Percent": null
}
```

## 6. Alterações aplicadas

- Critérios específicos de Lumen e Nanite adicionados ao manifesto.
- Executor ampliado para reconhecer colunas opcionais de Lumen GPU e fallback Nanite.
- Gate corrigido para não tratar métrica ausente como aprovação.
- Novo modo `--simulate-metrics` para gerar uma execução determinística e auditável.
- Relatório versionado para permitir revisão da PR sem confundir proxy com medição de GPU.

## 7. Requisito para homologação

A variável `UE5_REPLAY_COMMAND` deve executar o AutomationTest cookado e produzir no diretório `KHAAOS_REPLAY_OUTPUT`:

1. CSV de Game Thread, Render Thread e GPU;
2. captura específica de custo Lumen;
3. métrica de fallback Nanite;
4. trace Unreal Insights;
5. dados de shader/PSO e memória.

Sem esses artefatos, o job deve permanecer como configuração validada, não como aprovação do desempenho Live Action.
