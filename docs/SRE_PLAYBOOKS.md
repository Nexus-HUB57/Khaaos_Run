# Khaaos Run — Playbooks SRE (roadmap M3)

> Runbooks operacionais para os alertas definidos em
> `monitoring/prometheus/rules/khaaos-slo-alerts.yml`. Cada playbook segue o
> formato: **sintomas → diagnóstico → remediação → pós-incidente**. O staging
> gerenciado é `infra/staging/docker-compose.yml` (PostgreSQL + Redis
> master/réplica + N réplicas de app atrás do nginx).

## PB-01 — Erro 5xx sustentado (SLO-1 fast burn)

**Sintomas**: `KhaaosSLOAvailabilityFastBurn`; `khaaos_http_requests_total{status="5.."}` crescendo.

**Diagnóstico**:
```bash
# 1. Quais rotas estão falhando?
#    PromQL: sum by (route, status) (rate(khaaos_http_requests_total{status=~"5.."}[10m]))
# 2. O nó específico ou todos?
docker compose -f infra/staging/docker-compose.yml ps
curl -s http://localhost:8080/readyz | python3 -m json.tool
# 3. Logs estruturados dos nós
docker compose -f infra/staging/docker-compose.yml logs --since 15m app-1 | grep -E "error|unhandled"
```

**Causas comuns e remediação**:
1. **Deploy quebrado**: rollback da imagem anterior (`docker compose up -d --no-deps --scale app=N` com tag anterior). Nunca depurar em produção com budget queimando.
2. **DB indisponível**: seguir PB-02.
3. **Redis indisponível**: o mesh degrada para barramento local (single-node) — verificar `docker compose logs redis` e PB-03.

**Pós-incidente**: registrar o evento em `/tmp/f16-smoke.log`-equivalente do staging (`verify.sh` output), abrir issue com o error budget consumido.

## PB-02 — Pool de PostgreSQL saturado / DB lento (SLO-2, SLO-5)

**Sintomas**: `KhaaosDbPoolSaturated` (saturação > 90%); latência p99 acima de 500 ms; `khaaos_db_pool{state="waiting"}` > 0.

**Diagnóstico**:
```bash
# Saturação por réplica
#    PromQL: khaaos:slo:db_pool_saturation_ratio
# Queries lentas no PG
docker compose -f infra/staging/docker-compose.yml exec postgres \
  psql -U khaaos -c "SELECT pid, now()-query_start AS dur, state, left(query,80) FROM pg_stat_activity WHERE state='active' ORDER BY dur DESC LIMIT 10;"
# Espera por locks
docker compose -f infra/staging/docker-compose.yml exec postgres \
  psql -U khaaos -c "SELECT relation::regclass, mode, count(*) FROM pg_locks WHERE NOT granted GROUP BY 1,2;"
```

**Remediação**:
1. **Fila de conexões esperando**: escalar réplicas de app (`--scale app=3`) para diluir? NÃO — o pool é por réplica; se o PG está no limite de conexões, escalar app piora. Primeiro identificar a query dominante.
2. **Query dominante**: matar com `SELECT pg_terminate_backend(pid);` e abrir ticket para índice/rewritе (migrations versionadas).
3. **Saturation estrutural**: aumentar `max_connections` do PG exige revisão de memória — apenas com janela de mudança.

**Pós-incidente**: toda query abortada manualmente precisa de issue com o plano de correção permanente.

## PB-03 — Mesh cross-node degradado / sala cercada (SLO-3, SLO-4)

**Sintomas**: `KhaaosRelayPublishErrors` (relay ok < 99,9%); `KhaaosRoomFencedSpike` (salas cercadas); clientes reportando `ROOM_NODE_LOST` com `reason="fenced"`.

**Diagnóstico**:
```bash
# 1. Índice de nós vivo? (mestre Redis)
docker compose -f infra/staging/docker-compose.yml exec redis \
  redis-cli hgetall khaaos:nodes:index
# 2. Réplica sincronizada?
docker compose -f infra/staging/docker-compose.yml exec redis-replica \
  redis-cli info replication | grep -E "role|master_link_status"
# 3. Salas no índice distribuído vs salas locais
docker compose -f infra/staging/docker-compose.yml exec redis \
  redis-cli hlen khaaos:rooms:index
curl -s http://localhost:8080/healthz | python3 -m json.tool | grep -A3 rooms
# 4. Fence epochs por sala (chave <ns>:room:<id>:fence)
docker compose -f infra/staging/docker-compose.yml exec redis \
  redis-cli keys "khaaos:room:*:fence"
```

**Interpretação do fencing (M3)**:
- `khaaos_room_fenced_total` **isolado**: partição curta de rede ou nó pausado
  (GC/pausa de host). O sistema se autocorrigiu (drenagem + reancoragem).
- **Repetido para a mesma sala**: nó zumbi (processo vivo sem heartbeats).
  Identificar e `docker compose restart app-1`.
- **Em massa (> 5/min)**: partição de rede real entre nós — verificar DNS/rede
  do host; considerar promoção da réplica Redis (abaixo) se o master oscilar.

**Remediação**:
1. Nó zumbi: restart da réplica de app correspondente.
2. Master Redis perdido: **promoção da réplica** (RPO=0 para o índice):
   ```bash
   # Promove a réplica removendo --replicaof via override e reinicia os apps
   # apontando KR_REDIS_URL para redis-replica (runbook CROSS_NODE_SMOKE.md §4)
   ```
3. Depois da promoção: os nós re-registram no próximo heartbeat (≤ 5 s) e os
   túneis se reabrem por reancoragem de cliente — sem intervenção manual.

## PB-04 — Storm de reconexão WS (SLO-2)

**Sintomas**: `khaaos_runtime_reconnects_total` em pico; `khaaos_runtime_ws_connections` oscilando; latência HTTP sobe junto (handshakes).

**Diagnóstico**:
```bash
# Conexões por nó + fila do matchmaking
curl -s http://localhost:8080/healthz | python3 -m json.tool
# Backpressure (mensagens enfileiradas acima do limite → closes 4008)
#    PromQL: rate(khaaos_runtime_backpressure_total[5m])
# Rate limiting de upgrade
#    PromQL: rate(khaaos_runtime_rate_limited_total[5m])
```

**Remediação**:
1. **Evento de rede do cliente (região)**: normalização espontânea; monitorar.
2. **Servidor fechando clientes (backpressure 4008)**: reduzir custo por tick
   (salas IN_PROGRESS acima do esperado?) — PromQL
   `khaaos_runtime_rooms{state="IN_PROGRESS"}`; escalar app.
3. **Rate limit no upgrade mordendo clients legítimos** (429): verificar picos
   de IP no NAT corporativo; ajustar janela do limite com feature flag
   `KR_READY_MAX_CONNECTIONS`/rate limits (deploy restart).

## PB-05 — Saturação de réplica de app / overload do readiness

**Sintomas**: `/readyz` retornando `overload` (503) — réplica sai da rotação do nginx; `khaaos_http_active_connections` acima de `KR_READY_MAX_CONNECTIONS`.

**Diagnóstico**:
```bash
for port in 8080; do curl -s http://localhost:$port/readyz | python3 -m json.tool; done
# Autoscaler (dry-run por padrão) mostra a decisão
node infra/staging/autoscaler.mjs
```

**Remediação**:
1. Escalar: `docker compose -f infra/staging/docker-compose.yml up -d --scale app=3 nginx`
   (nginx sobe os novos upstreams automaticamente).
2. Confirmar o LB round-robin: `bash infra/staging/verify.sh` (etapa de LB).
3. Se a saturação vem de salas presas (`FINISHED` não coletadas): o cleanup de
   60 s do runtime resolve; investigar vazamento se persistir (PB-06).

## PB-06 — Drill de morte de nó (exercício mensal, staging)

**Objetivo**: provar a cadeia completa ROOM_NODE_LOST → reconcile do mesh →
reancoragem e o fencing M3 sob condição REAL.

**Procedimento (staging gerenciado)**:
```bash
# Smoke completo contra o staging com morte do nó dono injetada
SMOKE_EXTERNAL=1 \
SMOKE_NODE_A_PORT=8910 SMOKE_NODE_B_PORT=8911 \
SMOKE_EXPECTED_NODES=staging-a,staging-b \
REDIS_URL=redis://127.0.0.1:56379 SMOKE_REPLICA_URL=redis://127.0.0.1:56380 \
DATABASE_URL=postgres://khaaos:***@127.0.0.1:55432/khaaos_staging \
SMOKE_KILL_COMMAND="docker compose -f infra/staging/docker-compose.yml kill app-1" \
node scripts/smoke-fase16-cross-node.mjs
```

**Aceite** (linha `F16_SMOKE_OK`): túnel com privacidade M1, partida via
túnel, abate cross-node, payouts 2PC COMMITTED com ledger balanceado,
`ROOM_NODE_LOST` no sobrevivente, reconcile do índice e reancoragem local.

**Fencing (M3)**: após o drill, verificar que `khaaos_room_fenced_total`
NÃO cresceu (nó morto não reassume). Se crescer durante uma partição
simulada (pausar container em vez de matar), o crescimento é o ACEITE do
fence — o nó pausado drena a sala ao voltar.

## PB-07 — Rotação de credenciais suspeita (vazamento de token)

**Sintomas**: token GitHub/segredo exposto em chat, print, arquivo ou log.

**Ação imediata (< 15 min)**: seguir `docs/TOKEN_ROTATION_RUNBOOK.md` —
revogar o token comprometido e emitir substituto com escopo mínimo. Nunca
"atualizar depois": tokens expostos são varridos por bots em minutos.
