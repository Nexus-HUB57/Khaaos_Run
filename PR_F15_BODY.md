# F15 — EAC Dedicated Smoke (Active exigido) + Gateway WS cross-node por nodeId + Idempotency-Key uniforme em /api/bank/*

Três frentes do relatório de auditoria arquitetural (Fase 0.3 + Fase 2), validadas end to end.

## ① Smoke do EAC contra servidor dedicado REAL (exige `Active` no log)

- **`scripts/build/eac_dedicated_smoke.mjs`** — modo **estrito por padrão**: exit 0 **somente** com a linha canônica `EAC Status: Active` no log; `EAC Status: Running (stub…)` → **exit 4 sempre** (estado contraditório é erro, com instrução de go-live); `--allow-missing-input` marca `EAC_SMOKE=SKIPPED` e exit 0 (contrato UE1040: stub nunca quebra o build de PR).
- Modo binário: spawna o servidor dedicado (`-nullrhi -unattended -nosplash -log`), observa stdout com deadline (`--timeout-ms`), kill tree no fim; modo log: `--log <arquivo>` (ou `EAC_SMOKE_LOG`).
- **Selftest** (`eac_dedicated_smoke_selftest.mjs`) — roda no CI **Node sem UE**: matcher active/stub/absent (inclusive stub que *depois* vira Active — ordem importa), linha parecida não engana, e contratos de exit code 3/0/4 validados por spawn do próprio smoke.
- **Wiring**: `ue5-headless-compile.yml` (selftest sempre + smoke estrito após Compile Server, executado somente com `EAC_SDK_MODE=real` — com stub marca SKIPPED com `::warning`) e `ue58-container-build.yml` (smoke estrito após UBT, antes do upload do binário; erro fatal se SDK real presente mas binário ausente).

## ② Gateway WS roteando por nodeId (proxy cross-node — auditoria Fase 2)

O RoomEventMesh (F14) eliminou o SPOF de descoberta, mas o `ROOM_REMOTE_NODE` ainda forçava reconexão do cliente. O gateway fecha esse gap:

- **`server/game/NodeWsGateway.ts`** — registro de nós (HASH + lease 15s, heartbeat 5s, reconcile de nós mortos), canal relay dedicado por nó (`<ns>:relay:<nodeId>`), envelopes versionados `c2s/s2c/cls/drop` com validação de tamanho (32KB) e transportes dual: Redis (produção multi-nó) e barramento local (fallback + testes).
- **`RelaySocket`** — conexão virtual no nó dono com a superfície exata usada pelo RoomManager (`readyState/send/close`); `s2c` transporta a string JSON **pronta** (origem faz `ws.send` sem re-parse).
- **Origem**: `openRelay` (join sintético), `routeIfRelayed` — operações de âncora (`join/queue/create_lobby/join_code`) re-ancoram LOCAL (troca de sala sem túnel fantasma); morte do nó dono → `ROOM_NODE_LOST` no cliente (mesma UX de queda de servidor).
- **Nó dono**: sessões por sala; `destroyRoom` → `dropSessionsForRoom` (`room_closed`); `cls`/`drop` encerram com `unregisterSocket + onDisconnect`; **revogação de sessão (`closeUserSockets`) propaga cross-node**.
- **Privacidade/segurança**: join por `roomId` cru **NUNCA** relay a sala privada remota (exige `join_code`); a autorização de convite é validada na origem contra o índice do mesh e viaja no **hop** de relay (`ra=1` no envelope interno) — nunca em campo do cliente.
- **RoomManager**: integração em `join` (roomId remoto), `join_by_invite_code`, fechamento de socket, `destroyRoom`; caminho legado `ROOM_REMOTE_NODE` preservado quando o relay não está disponível. Corrige de quebra o bug de join com roomId remoto cair silenciosamente em lobby local novo.
- **Testes** (`tests/official/node-ws-gateway.test.ts`, **9/9**): túnel e2e entre gateways, roteamento/re-âncoragem, `cls`, morte de nó por lease, `RelaySocket.close`/drop, **join e join_code cross-node com salas REAIS de duas instâncias RoomManager** (welcome + room_state autoritativo no nó dono, estado de origem vazio), legado preservado, drop por destruição de sala.

## ③ Idempotency-Key em `/api/bank/*` (auditoria Fase 2)

- `POST /api/bank/deposit` (congelado, 503) agora valida o header **antes** da resposta — idempotência uniforme em **toda** mutação `/api/bank/*`; quando os pagamentos reabrirem, a proteção é herdada por construção.
- **`tests/official/bank-idempotency.test.ts`**: sem chave → `400` canônico (deposit e transfer); chave curta → `400`; com chave → `503 PAYMENTS_NOT_CONFIGURED`; contra **PostgreSQL real** (`TEST_DATABASE_URL`): replay idêntico devolve a mesma resposta (`deepEqual`), mesma chave com payload divergente → `409`, **par de ledger único** (débito/crédito balanceado) e saldo descontado **exatamente uma vez**.
- Wired no `07-economy-validation.yml` (job PG); `docs/ECONOMY_TRANSACTIONS.md` documenta o guard uniforme.

## Validação

- `tsc` limpo; suíte oficial **337 pass / 0 fail / 2 skipped** (TS) + **39/0** (JS); build de produção OK; EAC selftest `EAC_SELFTEST_OK`.
- Parte PG do idempotency roda no job de economy (idempotência das migrations 0002/0003 verificada).
