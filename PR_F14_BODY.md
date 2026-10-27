# F14 — Redis Event Mesh no RoomManager + guard CI fix_ue1021_includes.py + SDK real do EAC no pipeline headless

Três entregas da auditoria arquitetural (Fase 0/2), end to end e testadas localmente:

## 1) Guard de CI contra regenerações UE — `fix_ue1021_includes.py`
- **Fixer idempotente**: reescreve includes de projeto para a forma canônica `Game/<SubDir>/Header.h` SOMENTE quando o header existe no projeto (engine/thirdparty intocados); desempate de basename ambíguo pelo módulo do arquivo que inclui; `.generated.h`, relativos e same-dir nunca tocados.
- **Modo guard** (`--check`): exit 2 com a lista exata do que uma regeneração UE quebrou — falha RÁPIDA no CI antes do build real.
- **Selftest embutido** (`selftest`): fixture sintética com 4 grupos de asserções (fix/check/ambiguidade/idempotência).
- **Adotado no `ue5-preflight.yml`**: passo "CI guard — UE1021" roda `selftest` + `check` ANTES do preflight em toda PR/push (triggers incluem o próprio script).

## 2) Redis Event Mesh no RoomManager (auditoria: SPOF do estado em memória)
- **`server/game/RoomEventMesh.ts`** (novo): índice de salas em HASH Redis (`<ns>:rooms:index`), leases de vivacidade por sala (sliding TTL 30s), heartbeat 10s, **reconcile** que derruba registros de nós mortos (lease expirado) e órfãos self (nó reiniciou), eventos `mesh:room_updated/closed/lost` no canal de controle existente.
- **Integração RoomManager** (autoritativo segue local — sockets são deste processo):
  - `broadcastRoomState` espelha a sala no mesh (fingerprint + throttle 1.5s, fire-and-forget: falha do mesh NUNCA propaga);
  - `destroyRoom` → `markRoomClosed`;
  - `listLobbies`/`getRoomSummary` mesclam salas de OUTROS nós (cache síncrono, marca `remote`/`nodeId`);
  - `join_by_invite_code` resolve lobby em outro nó e responde erro direcionado **`ROOM_REMOTE_NODE`** (roomId/nodeId/endpoint) sem vazar convite/jogadores/host.
- **Fallback graceful**: sem REDIS_URL opera com barramento local em-processo (single-node = comportamento de hoje); `DistributedState.getRedisClient()` compartilha a conexão.
- **9 testes novos** (`tests/official/room-event-mesh.test.ts`): cross-node via bus local, dedupe/throttle, morte de nó por lease + `room_lost`, órfãos self, convite privado não listado, integração RoomManager (mirror/cleanup), ROOM_REMOTE_NODE sem vazamento, summary/list remotos. Suíte oficial: **322+39 pass / 0 fail**.

## 3) SDK REAL do EAC no pipeline headless
- **`KhaaosEACIntegration.cpp/.h`**: a camada REAL agora compila sob `KHAAOS_EAC_SDK=1` — `anticheat/sdk.h`, `eac_server/eac_client` start/stop com fail-closed, **trampolim de callbacks C** com marshaling `AsyncTask` para a game thread, pump `receive()` a 100ms, `set_game_session_id`; modo stub segue default e loga `Running (stub)` — **só o build com SDK real loga `EAC Status: Active`** (linha canônica para o smoke).
- **`scripts/build/setup_eac_sdk.sh`** (novo): resolve o SDK por (1) `KHAAOS_EAC_SDK_DIR` → (2) `Source/KhaaosEAC/EACSDK/` → (3) download `EAC_SDK_URL` (+`EAC_SDK_URL_TOKEN` Bearer); valida layout (`Sdk/anticheat/sdkdefines.h` + libs eacserver/eacclient); `--emit-env` para GITHUB_ENV; `--require` para go-live; fonte EXPLÍCITA inválida = falha rápida (exit 1); sem SDK = stub e nunca quebra.
- **Workflows**: `ue5-headless-compile.yml` e `ue58-container-build.yml` ganham o passo "Resolve EAC SDK (real vs stub)" antes do build + linha `EAC SDK` no summary.
- **Preflight UE1045 (novo)**: pacote EAC explicitamente fornecido e INVÁLIDO agora é erro fatal (antes passaria silencioso); UE1040 segue informativo.

## Verificação local
- `tsc --noEmit` limpo; eslint limpo nos arquivos tocados
- Suíte oficial: 322+39 pass / 0 fail / 1 skipped (pré-existente)
- `fix_ue1021_includes.py check` → 0 pendentes na árvore real
- `ue58_preflight.mjs` → ok (UE1040 stub warning como antes; UE1045 validado com pacote quebrado sintético)
- `setup_eac_sdk.sh` → stub/real/inválido/`--require` todos exercitados
