# Khaaos Run — Stress integrado UE5.8 e relatório FPS

**Gerado:** 2026-10-27T12:27:40.683Z

## Resultado executivo

- Mundos simultâneos: **CIGKV, Barburhen, Priadus, Ckesalth, Arukheea**
- Carga do proxy: **300 operadores** (60 por mundo)
- Proxy da simulação: **941.62 FPS server-equivalentes no p95 agregado**
- Gate de frame time de simulação: **PASS** (p95 ≤ 33.33 ms)
- Renderização UE5.8: **SKIPPED_NO_ENGINE** — UnrealEditor-Cmd/UE5_ROOT ausente neste ambiente; o resultado usa o proxy determinístico da simulação.

> Limitação importante: o sandbox não possui Unreal Engine 5.8 licenciado. Portanto, os números de renderização são marcados como não medidos; o relatório não converte o proxy em uma alegação de FPS gráfico real.

## Frame time por mundo

| Mundo | Jogadores | p50 ms | p95 ms | p99 ms | FPS server-equivalente | Gate |
|---|---:|---:|---:|---:|---:|---|
| CIGKV | 60 | 0.154 | 0.999 | 1.629 | 1001.32 | PASS |
| Barburhen | 60 | 0.181 | 1.062 | 1.732 | 941.91 | PASS |
| Priadus | 60 | 0.174 | 1.043 | 1.708 | 958.67 | PASS |
| Ckesalth | 60 | 0.231 | 0.998 | 1.599 | 1002.46 | PASS |
| Arukheea | 60 | 0.138 | 0.984 | 1.48 | 1016.48 | PASS |

## Gate visual live action / primeira pessoa

| Métrica | Alvo | Estado atual | Ação UE5.8 |
|---|---:|---|---|
| FPS de renderização | ≥ 60 | Não medido | Executar AutomationTest com captura Stat Unit/CSV em runner UE5.8 |
| Frame time de render | ≤ 16,67 ms | Não medido | Validar Lumen, Nanite, VSM e TAAU no hardware alvo |
| Server tick | ≥ 30 Hz | Proxy medido | Manter NetServerMaxTickRate=60 e observar p95 |
| LOD fora do frustum | Ativo | Implementado | Confirmar ganho com Unreal Insights |
| PBR/Lumen | Sem shader hitch crítico | Não medido | Fazer warm-up de PSO e shader pipeline cache |

## Recomendações de otimização

1. Capturar **Unreal Insights + Stat UnitGraph + GPU Visualizer** em cada um dos cinco mapas com 60 operadores e replay fixo.
2. Manter personagens próximos em LOD full, migrar para proxy/silhueta por distância e aplicar o gate de frustum antes de aumentar densidade de props.
3. Tratar Lumen e Virtual Shadow Maps como perfis escaláveis: High para referência, Medium para o alvo de 60 FPS e Low para fallback.
4. Fazer soak test de 10 minutos por mundo e um teste simultâneo dos cinco mundos; bloquear release se p95 de frame time exceder 16,67 ms no cliente ou 33,33 ms no servidor.
