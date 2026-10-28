# Khaaos Run — SLOs e Orçamento de Erro (roadmap M3)

> Catálogo canônico de Service Level Objectives. As regras de gravação e os
> alertas vivem em `monitoring/prometheus/rules/`. Métricas fonte: endpoint
> `/metrics` (app raiz TS: `server/game/metrics.ts`; game-runtime:
> `game-runtime/server/server.js`).

## 1. Objetivos de nível de serviço

| # | SLO | SLI | Objetivo | Janela | Orçamento de erro |
|---|-----|-----|----------|--------|--------------------|
| SLO-1 | Disponibilidade HTTP | fração de respostas não-5xx (`khaaos_http_requests_total`) | **99,5%** | 30 dias rolantes | 0,5% ≈ 3h 36m |
| SLO-2 | Latência HTTP | fração de requisições < 500 ms (`khaaos_http_request_duration_seconds_bucket{le="0.5"}`) | **99%** | 30 dias rolantes | 1% |
| SLO-3 | Relay cross-node | fração de publicações relay `ok` (`khaaos_relay_publish_total{result="ok"}`) | **99,9%** | 30 dias rolantes | 0,1% |
| SLO-4 | Ownership saudável | taxa de salas cercadas (`khaaos_room_fenced_total`) | **≈ 0 por minuto** (evento anômalo por design) | contínuo | — |
| SLO-5 | Pool de DB | saturação do pool (`khaaos_db_pool`) | **< 90%** sustentado | contínuo | — |

## 2. Por que estes objetivos

- **SLO-1 (99,5%)**: o jogador tolera microquedas durante a partida (o cliente
  reconecta), mas não portais fechados. 99,5% deixa ~3,6 h/mês de erro para
  deploys e falhas de nó — compatível com a topologia de 2 réplicas do staging.
- **SLO-2 (500 ms)**: acima disso o cliente WS já compensa atraso e a UX de
  mira sofre. O orçamento de 1% cobre caudas de GC e cold-start.
- **SLO-3 (99,9%)**: o túnel relay é o caminho do jogador remoto; falha de
  publicação vira `ROOM_NODE_LOST` e reancoragem (fricção visível).
- **SLO-4**: o fencing M3 existe para proteger contra split-brain; um fence
  disparando é SINAL de partição — page, não objetivo a otimizar.

## 3. Política de orçamento de erro (error budget policy)

1. **Burn 14,4x em 1h (com 5m)** → PAGE: interromper rollout, investigar
   imediatamente (PB-01/PB-02).
2. **Burn 6x em 6h (com 30m)** → PAGE: degradação sustentada.
3. **Burn 3x em 3d (com 6h)** → TICKET: correção estrutural planejada.
4. **Budget < 25% restante**: congela features não-críticas da semana; só
   correção e confiabilidade.
5. **Budget esgotado**: rollback das mudanças recentes da cadeia afetada e
   incident review com action-items rastreados.

## 4. Dashboards recomendados

- **Visão de serviço**: `khaaos_http_requests_total` por status ×
  `khaaos:slo:http_availability_burn_*` (heat de budget).
- **Realtime**: `khaaos_ws_connections`, `khaaos_ws_rooms{status}`,
  `khaaos_ws_relay_tunnels_active` × `khaaos_ws_relay_sessions_hosted`.
- **Ownership/fencing**: `khaaos_room_leases_total{outcome}` +
  `khaaos_room_fenced_total`.
- **DB**: `khaaos_db_pool{state}` + histograma
  `khaaos_db_query_duration_seconds`.
- **Runtime (game-runtime)**: `khaaos_runtime_ws_connections`,
  `khaaos_runtime_backpressure_total`, `khaaos_runtime_anticheat_*`.

## 5. Revisão

Os objetivos são revisados no fim de cada ciclo de roadmap. Qualquer mudança
de objetivo exige: (a) atualizar este catálogo; (b) atualizar recording rules
e alertas; (c) PR com evidência de 1 semana de dados de staging.
