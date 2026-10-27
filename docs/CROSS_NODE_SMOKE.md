# Khaaos Run — Smoke Cross-Node (F16/F17): runbook operacional

Fecha a cadeia de confiabilidade multi-nó da auditoria (F14 Event Mesh → F15
gateway por nodeId → F16 payouts 2PC → **F17 guard de CI + staging gerenciado**):
o smoke valida a cadeia COMPLETA contra infraestrutura real e agora roda como
**guard de CI** em cada mudança dela — regressões falham antes do merge.

## O que o smoke valida (7 etapas)

| # | Etapa | Aceite |
|---|---|---|
| 1 | Infra: Redis 7 master + RÉPLICA real | `role:slave` + `master_link_status:up` + probe master→réplica |
| 2 | Registro de nós | `<ns>:nodes:index` com os 2 nós + canais relay ativos |
| 3 | Túnel cross-node | lobby PRIVADO no A; join_code do B → `welcome` + `room_state` relayados; convite nunca vaza |
| 4 | Partida real via túnel | `IN_PROGRESS` nos 2 clientes; movimento B→A converge no snapshot do dono |
| 5 | Combate cross-node | abate através do túnel; `player_eliminated` no dono e no relayado |
| 6 | Payouts 2PC | claims `COMMITTED`; p1=650 (kill+1º), p2=250 (podium); ledger balanceado; wallet creditada 1× |
| 7 | Morte do nó dono | `ROOM_NODE_LOST` no B → mesh reconcilia índice → reancoragem em sala local do B |

Contrato de sucesso: linha `F16_SMOKE_OK` no stdout (exit 0).

## Como executar

### 1. Guard de CI (automático)

Workflow **15 — Cross-Node Smoke** (`.github/workflows/cross-node-smoke.yml`):
PostgreSQL 16 + Redis master como service containers, réplica via
`docker run --network host`, migrações `drizzle-kit migrate`, build de
produção e smoke completo (incluindo morte de nó). Dispara em PRs/push que
tocam `server/game/**`, `migrations/**`, `scripts/smoke-fase16*`,
`infra/staging/**` e no drift semanal (segunda 09:00 UTC).

### 2. Self-hosted / sandbox (1 invocação)

```bash
bash scripts/run-f16-smoke-local.sh    # sobe Redis master+réplica, PG, 2 nós, smoke, derruba tudo
```

### 3. Staging EXTERNO (SMOKE_EXTERNAL=1)

Infra já em pé (ex.: staging gerenciado da F17 com master+réplica):

```bash
SMOKE_EXTERNAL=1 \
SMOKE_NODE_A_PORT=8910 SMOKE_NODE_B_PORT=8911 \
SMOKE_EXPECTED_NODES=staging-a,staging-b \
REDIS_URL=redis://127.0.0.1:56379 SMOKE_REPLICA_URL=redis://127.0.0.1:56380 \
DATABASE_URL=postgres://khaaos:***@127.0.0.1:55432/khaaos_staging \
node scripts/smoke-fase16-cross-node.mjs
```

**Morte de nó no staging gerenciado (F17):** sem `SMOKE_KILL_COMMAND` a etapa
7 é pulada (comportamento legado). Com o comando de morte injetado, a etapa 7
roda contra o orquestrador real:

```bash
SMOKE_EXTERNAL=1 ... SMOKE_KILL_COMMAND="docker compose -f infra/staging/docker-compose.yml kill app-a" \
  node scripts/smoke-fase16-cross-node.mjs
```

### 4. Staging gerenciado (compose) — topologia F17

`infra/staging/docker-compose.yml` agora inclui **redis-replica** (2º nó Redis
real, `--replicaof redis 6379`, healthcheck `master_link_status:up`):
`deploy.sh` sobe e espera a réplica sincronizar; `verify.sh` tem a etapa 4 de
aceite (role:slave + probe de replicação). Promoção em desastre: promova a
réplica a master via override removendo `--replicaof` e reinicie os apps
apontando `KR_REDIS_URL` para ela (RPO=0 para o índice distribuído; o mesh
re-registra os nós no próximo heartbeat).

## Variáveis de ambiente do smoke

| Variável | Padrão | Função |
|---|---|---|
| `SMOKE_EXTERNAL` | `0` | `1` = infra já em pé (não sobe os nós; espera `SMOKE_NODE_*_PORT`) |
| `SMOKE_NODE_A_PORT` / `SMOKE_NODE_B_PORT` | `8900` / `8901` | portas dos nós de aplicação |
| `SMOKE_EXPECTED_NODES` | `smoke-node-a,smoke-node-b` | nodeIds esperados no índice |
| `REDIS_URL` | `redis://127.0.0.1:56379` | master Redis |
| `SMOKE_REPLICA_URL` | vazio | réplica (validação de replicação real) |
| `DATABASE_URL` | PG do sandbox | PostgreSQL com migrações 0000→0007 aplicadas |
| `SMOKE_KILL_COMMAND` | vazio | (EXTERNAL) comando que mata o nó dono; sem ele, etapa 7 pulada |
| `REDIS_CLI` | autodetect | binário redis-cli (fallback: PATH → sandbox legado) |
| `SMOKE_DEBUG` | `0` | log verboso das mensagens WS |

## Histórico de bugs reais que este smoke pegou

1. LazyNodeRegistry nunca chamava a factory (nós reais fora do índice Redis);
2. WebSocketServer duplicado no mesmo httpServer abortando handshakes (F13);
3. double-subscribe do canal relay (envelopes duplicados);
4. `handleMessage` engolindo a causa real de falhas de persistência.

A etapa 7 (morte de nó) validou reconcile de lease, `room_lost` e reancoragem
— o caminho que mantém partidas vivas quando um nó de produção cai.
