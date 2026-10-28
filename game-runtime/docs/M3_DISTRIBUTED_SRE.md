# M3 — Multiplayer distribuído e SRE

Milestone M3 do `docs/ROADMAP.md`, entregue com **evidência executada** (testes no CI +
smoke real), não com stubs. Três frentes: (1) ownership/fencing de salas entre réplicas,
(2) fan-out AOI + backpressure, (3) load generator com perfis reproduzíveis e SLOs.

## 1. Ownership/fencing de salas entre réplicas (`server/distributed.js`)

Modelo de consistência (fencing tokens):

- Cada sala tem **UM dono por vez**, registrado com lease (TTL padrão 15 s) num
  registro compartilhado entre réplicas — Redis (`KR_REDIS_URL`) ou memória de teste.
- O lease carrega um **epoch (fence) monotônico por sala**: cada NOVA posse incrementa
  o epoch; renovações preservam o fence. Uma réplica que age com fence antigo
  (partição curta, GC pause, failover) é **REJEITADA** — o dono novo sempre vence.
- O dono que perde a posse **congela a sala** (`owner_lost`): para de tickar/mutar,
  notifica os clientes e eles reconectam (redirect ao dono novo ou realocação).
  O dono antigo nunca continua escrevendo depois do takeover.
- Mutação estrutural (`addPlayer`, criação de sala) passa pelo `guard(roomId)`:
  só com posse VÁLIDA (dono + fence atuais). Rechega a janela de partição entre
  heartbeats.
- Reconexão em réplica sem a sala: a sessão **não é duplicada nem realocada às
  cegas** — a réplica consulta `ownerOf` no registro e responde `redirect` com o
  endereço do dono vivo (`MemoryReplicaRegistry`/`RedisReplicaRegistry` com TTL).
  Dono morto/desconhecido → degrada para alocação nova (nunca erro).

### Ativação

| Env | Efeito |
|---|---|
| `KR_DISTRIBUTED=1` | ativa a camada (ownership/fencing/redirect/mirror) |
| `KR_REDIS_URL` | leases/relay/registro no Redis (Lua atômica); sem Redis → memória local |
| `KR_REPLICA_URL` | endereço anunciado no registro p/ redirect (`ws://host:porta`) |
| `KR_OWNERSHIP_TTL_MS` / `KR_OWNERSHIP_HEARTBEAT_MS` | lease TTL (15 s) e heartbeat (5 s) |
| `KR_AOI=1` | AOI fan-out sem ativar a camada distribuída |

Sem `KR_DISTRIBUTED` o comportamento single-node é **exatamente** o de antes (no-op).

### Relay de eventos (ordem entre réplicas)

- Cada sala publica eventos de ciclo de vida (`room_open`, `match_end`) num stream
  com **seq monotônica por sala**.
- Consumo via `RelayConsumer`: **deduplicação** (só aceita seq > última vista),
  **gap contabilizado** sem travar (salta para o máximo visto), **replay limitado**
  (MAXLEN 512 no Redis; cap equivalente em memória) e **TTL** (60 s) — sem
  crescimento indefinido.

## 2. AOI fan-out + backpressure

- **AOI (opt-in por sala)**: o snapshot de cada jogador só carrega atores dentro do
  raio de interesse com **histerese** (entra em 130 m, só sai em 165 m — sem churn
  na borda) e projéteis a até 180 m. `aliveCount` continua GLOBAL no snapshot e o
  HUD passa a usá-lo (`s.aliveCount ?? contagem local`). O cliente recria o mesh
  por id quando um ator recortado reaparece (`botOps` map pré-existente).
- **Backpressure**: `bufferedAmount > MAX_BUFFERED_BYTES` → fecha 4008 + métrica
  `backpressure` (pré-existente, mantido e documentado aqui).

## 3. Load generator (`scripts/loadgen.mjs`)

Substitui o smoke local por perfis **reproduzíveis** (seed determinística):

```bash
node scripts/loadgen.mjs --list
node scripts/loadgen.mjs --profile smoke12 --url ws://127.0.0.1:8787
KR_USERS_JSON=$(node scripts/make-loadgen-users.mjs --count 50) node server/server.js
node scripts/loadgen.mjs --profile ring50 --url ws://127.0.0.1:8787 \
  --user-prefix kr_bot --user-count 50 --json /tmp/report.json
```

| Perfil | Jogadores | Spawn | Inputs | Duração |
|---|---|---|---|---|
| `smoke12` | 12 | 150 ms | 10 Hz | 8 s (CI) |
| `ring50` | 50 | 120 ms | 20 Hz | 15 s |
| `spike200` | 200 | 25 ms | 20 Hz | 20 s |

Mede por conexão: **RTT** (ping/pong), **gap entre snapshots** (jitter do servidor),
erros/desconexões e RSS do generator. Relatório em texto + JSON. O rate limit é
**por identidade** (90/s no 3D) — perfis grandes usam o pool `kr_botNNN`.

### SLOs (critério de aceite)

| Indicador | SLO | Fonte |
|---|---|---|
| RTT p95 (loopback/staging) | < 150 ms | loadgen `rtt.p95` |
| Taxa de erros | < 1% das conexões | loadgen `errors/players` |
| Gap de snapshots p95 | ~50 ms (tick 20 Hz) ≤ 100 ms | loadgen `snapshotGap.p95` |
| Memória do soak | Δ RSS < 64 MB por janela de CI | `test/soak.test.js` |
| Owner único | 1 dono/sala; fence antigo rejeitado | `test/distributed.test.js` |
| Readiness | 503 `not_ready` com dependência morta | idem |

### Evidência executada (loopback, out-2026)

- `smoke12`: 12/12 conexões, 0 erros, RTT p50 0,3 ms / p95 0,5 ms, gap p95 51,2 ms.
- `ring50` (50 identidades reais): 50/50, 0 erros, RTT p95 1,0 ms, gap p95 51,6 ms.
- Soak CI: RTT p95 2,8 ms, gap p95 49,6 ms, Δ RSS 11,8 MB — bounded.

## 4. Métricas novas (`/healthz` → `distributed`)

| Métrica | Significado |
|---|---|
| `enabled` / `replicaId` | camada ativa e identidade desta réplica |
| `heldRooms` / `frozenRooms` | leases vivos / salas congeladas por perda de posse |
| `acquired` / `renewed` / `lost` | ciclo de vida dos leases |
| `fenceViolations` | mutações rejeitadas por fence antigo (deve ficar em 0) |
| `redirects` | reconexões redirecionadas ao dono vivo |
| `mirrorApplied` / `mirrorGaps` | consumo do relay entre réplicas |

## 5. Playbooks operacionais

### P1 — `fenceViolations > 0` (fencing rejeitou mutação)
1. **Esperado** após partição/failover: o sistema se auto-corrige (dono novo vence).
2. Se recorrente sem partições: verificar relógio (NTP) e latência Redis entre nós.
3. Clientes afetados recebem `owner_lost`/`redirect` e se realocam sozinhos —
   sem ação manual; monitorar `connections` para pico de reconexão.

### P2 — `frozenRooms > 0` persistente
1. A réplica perdeu leases e não recuperou: checar conectividade Redis
   (`/readyz` → `checks.rateStore`).
2. Se a réplica está saudável mas congela salas: TTL muito curto para o heartbeat
   real — ajustar `KR_OWNERSHIP_TTL_MS` ≥ 3× `KR_OWNERSHIP_HEARTBEAT_MS`.

### P3 — pico de `redirects`
1. Failover em curso: normal. Verificar que o dono antigo saiu da rotação
   (`/readyz` 503 → LB remove).
2. Registry com TTL vencido para réplicas vivas: `KR_REPLICA_URL` configurado?
   Heartbeat ativo? (`/healthz` → `distributed.replicaId`).

### P4 — `readiness` 503 com dependência necessária morta
1. `/readyz` responde `checks` + `errors` nomeando a dependência.
2. Redis: subir réplica/failover; o rate store degrada fail-open, mas ownership
   e mirror precisam do Redis para coerência entre réplicas.
3. Store de sessão: `/readyz` falha → LB tira a instância da rotação; jogadores
   são redirecionados pelas réplicas vivas.

### P5 — Soak com crescimento de memória
1. Rodar `KR_SOAK_MS=600000 npm run test:soak` — o log publica a tendência RSS.
2. Suspeitos clássicos: filas de eventos de jogadores que saíram (room3d limpa
   em `removePlayer`), buffer de snapshots do relay (MAXLEN/TTL), cache de health.

## 6. Testes (evidência no CI)

`test/distributed.test.js`:
1. Duas réplicas disputam a sala → **owner único**, epoch monotônico, **fencing
   antigo rejeitado**, release condicional.
2. Reconnect em réplica sem a sala → **redirect ao dono**; no dono retoma o
   MESMO ator (sem duplicar), ackSeq monotônico pós-resume, sala congela no
   dono antigo após takeover.
3. Relay: seq monotônica, dedup, gap contabilizado, replay limitado (MAXLEN), TTL.
4. `/readyz` 503 `not_ready` com dependência morta (liveness 200 intacto).
5. AOI: recorte com histerese enter/exit, `aliveCount` global, canônico preservado sem AOI.
6. Paridade Redis (opt-in `REDIS_URL`): mesmas semânticas do driver de memória.

`test/soak.test.js` (M3): publica p50/p95/p99 de RTT e gap de snapshots; memória bounded.
