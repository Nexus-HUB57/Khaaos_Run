# M3 — Multiplayer distribuído e SRE (ownership/fencing, AOI, load generator)

Fecha o milestone **M3** do `docs/ROADMAP.md` com **evidência executada** (testes no CI +
smoke real em loopback), não com stubs.

## 1. Ownership/fencing de salas entre réplicas (`server/distributed.js` — novo)

- Cada sala tem **UM dono por vez** com lease TTL (15 s) num registro compartilhado
  entre réplicas: Redis (Lua atômica, `KR_REDIS_URL`) ou memória de teste (mesmas
  semânticas, determinística no CI).
- **Epoch (fence) monotônico por sala**: nova posse incrementa, renovação preserva.
  Réplica agindo com fence antigo (partição, GC pause, failover) é **REJEITADA**
  (`fencing_violation`) e a sala dela **congela** (`owner_lost` → clientes migram
  via reconexão). O dono antigo nunca continua escrevendo depois do takeover.
- Mutação estrutural (`addPlayer`, criação de sala) sob `guard(roomId)`; ids de sala
  com prefixo da réplica (globalmente únicos).
- Ativação **opt-in**: `KR_DISTRIBUTED=1` — sem env, single-node **idêntico** ao
  anterior (no-op total; 516 testes pré-existentes verdes sem mudança).
- Fail-open em erro de driver (continuidade de jogo) com sinal em métricas/audit;
  o epoch garante que o dono NOVO sempre vence no reconcile.

## 2. Reconexão entre réplicas — redireciona ao dono, nunca duplica

- Reconectar numa réplica sem a sala → consulta `ownerOf` no registro → responde
  `redirect` com o endereço do dono vivo; o cliente (`net3d.js`) troca o alvo e
  retoma a MESMA sessão no dono (mesmo ator, `ackSeq` monotônico).
- `owner_lost` (failover) → reconexão imediata; dono morto → alocação nova (nunca erro).

## 3. Relay de eventos entre réplicas (ordem monotônica)

- `room_open`/`match_end` em stream por sala com **seq monotônica**; consumo com
  **deduplicação**, **gap contabilizado** sem travar, **replay limitado** (MAXLEN 512)
  e **TTL 60 s** — sem crescimento indefinido.

## 4. AOI fan-out (opt-in por sala)

- Snapshot por observador: atores com **histerese** (entra 130 m / sai 165 m) e
  projéteis ≤ 180 m; `aliveCount` permanece GLOBAL (HUD passa a usá-lo —
  `s.aliveCount ?? contagem local`). Cliente recria mesh por id no reaparecimento.
- Ativa com a camada distribuída ou `KR_AOI=1`; sem AOI, snapshot canônico intacto.

## 5. Load generator + SLOs + playbook

- `scripts/loadgen.mjs`: perfis reproduzíveis (`smoke12`/`ring50`/`spike200`, seed
  determinística), RTT p50/p95/p99, gap de snapshots, erros, RSS; relatório texto+JSON;
  pool de identidades (`scripts/make-loadgen-users.mjs`) respeitando o rate limit
  por usuário. `node scripts/loadgen.mjs --list` para ver os perfis.
- Soak (`test/soak.test.js`) agora **publica latências** (RTT p50/p95/p99 + gap de
  snapshots) e afirma **memória bounded** (Δ RSS < 64 MB por janela de CI).
- `docs/M3_DISTRIBUTED_SRE.md`: SLOs, dicionário de métricas (`/healthz` →
  `distributed`) e 5 playbooks operacionais (fencing, freeze, redirects, readiness,
  memória).

## Evidência executada (loopback)

| Perfil | Resultado |
|---|---|
| `smoke12` | 12/12 conexões, 0 erros, RTT p50 0,3 ms / p95 0,5 ms, gap p95 51,2 ms — **SLO_OK** |
| `ring50` (50 identidades reais) | 50/50, 0 erros, RTT p95 1,0 ms, gap p95 51,6 ms — **SLO_OK** |
| Soak CI | RTT p95 2,8 ms, gap p95 49,6 ms, Δ RSS 11,8 MB — bounded |

## Testes

`test/distributed.test.js` (5 pass + 1 opt-in Redis):
1. Duas réplicas disputam a sala → owner único, epoch monotônico, **fence antigo rejeitado**.
2. Reconnect entre réplicas → redirect ao dono, sessão retoma **sem duplicar jogador**,
   ackSeq monotônico, sala congela no dono antigo pós-takeover.
3. Relay: seq monotônica, dedup, gap, replay limitado (MAXLEN), TTL.
4. `/readyz` 503 `not_ready` com dependência morta (liveness 200 intacto).
5. AOI: histerese enter/exit + `aliveCount` global; canônico preservado sem AOI.
6. Paridade Redis (opt-in `REDIS_URL`).

Suíte completa: **534 testes → 521 pass / 0 fail / 13 skipped** (opt-in infra).
Build de produção verde (`vite build`).

## Aceite do milestone (ROADMAP M3)

- ✅ "teste com duas réplicas prova owner único e rejeita fencing antigo" — teste 1/2.
- ✅ "reconnect mantém ordem e não duplica jogadores" — teste 2 (ackSeq monotônico,
  um único humano na sala).
- ✅ "soak acordado termina sem crescimento contínuo de memória/crashes e publica
  latências" — soak M3 (RSS bounded + p50/p95/p99 publicados).
- ✅ "readiness falha quando uma dependência necessária está indisponível" — teste 4.
