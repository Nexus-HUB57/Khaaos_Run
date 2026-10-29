# M4 — Trilha UE5/EOS Nativos (estado, ponte server-side e caminho até o aceite)

> Roadmap M4: *"Em runner UE5.8 licenciado, compilar Editor e Dedicated Server
> por UnrealBuildTool, executar Automation Tests, empacotar e conectar dois
> clientes. Configurar EOS Dev/Staging com credenciais reais protegidas e
> validar login, sessões/matchmaking, reconnect e encerramento; manter mock
> apenas como teste unitário."*
>
> **Aceite:** artefatos de build e Automation Tests identificáveis com exit 0;
> mapa jogável e servidor dedicado demonstrados; dois clientes completam
> login→sessão→ação→reconnect; execução EOS sem placeholders, logs verificáveis.

## 1. O que JÁ EXISTE na trilha nativa (UE5.8)

| Componente | Local | Papel |
|------------|-------|-------|
| Nativos EOS C++ | `Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/` | `KhaaosEOSManager` (GameInstanceSubsystem: platform init, login/logout), `KhaaosEOSSession` (`HostDedicatedServerSession`/`JoinDedicatedServerSession`), `KhaaosEOSLobby`, `KhaaosEOSMatchmakingV2`, `KhaaosEOSCrossplay`, `KhaaosEOSCloudSave`, `KhaaosEOSRegionManager`, `KhaaosEOSSessionRecovery` (reconnect) |
| Config | `Unreal/KhaaosRun/Config/DefaultEOS.ini` | ProductId/SandboxId/DeploymentId/ClientId/ClientSecret (placeholders até as credenciais reais chegarem via CI secrets) |
| Bridge spec | `epic_integration/eos_sdk_bridge.json` | SDK 1.16.0, subsystems Auth/Sessions/Lobbies/Voice/Stats, regiões |
| CI | `eos-integration.yml` + `06-eos-integration.yml` + `ue58-preflight` | valida config, estrutura de projeto, includes, GENERATED_BODY |

## 2. O que ENTREGAMOS agora — ponte server-side nativa (runtime autoritativo)

O elo que faltava: o **dedicated server nativo** hospeda a sessão EOS
(`HostDedicatedServerSession`) e o **runtime autoritativo** é a fonte de verdade
da sala (ownership/fencing M3/M4). A ponte ancora uma à outra:

- **`game-runtime/server/eos.js`** — `createEosBridge`:
  - **Credential-gated, SEM mock no runtime**: sem `EOS_PRODUCT_ID/…/EOS_CLIENT_SECRET`
    responde `mode:'unconfigured'` + `missing[]` e REJEITA operações
    (`EOS_UNCONFIGURED`) — nunca finge sucesso. O mock vive SÓ nos unit tests
    (injeção explícita de config de teste), exatamente como o roadmap pede.
  - **Âncora por ownership (fencing)**: sessão EOS só registra contra sala
    possuída por ESTA réplica (lease vivo, não congelada) — validado na camada
    HTTP do server (independente de injeção) e dentro do bridge (defesa em
    profundidade). Sessão não sobrevive à perda de posse.
  - **TTL por heartbeat** (janela 90 s, cleanup a cada 30 s): crash do dedicated
    server não vaza sessão fantasma; `heartbeat`/`end` explícitos.
  - `status()` nunca vaza segredos — só a lista do que falta.

- **RBAC**: nova permissão `eos:operate` + papel `service` (dedicated server).
  Player → 403; service/admin → operam.

- **Endpoints HTTP no runtime**:

| Rota | Método | Quem | Comportamento |
|------|--------|------|---------------|
| `/eos/status` | GET | público | config SEM segredos (o cliente UE5 consulta disponibilidade) |
| `/eos/sessions` | POST | `eos:operate` (service/admin) | ancora sessão EOS à sala possuída — 201 criada / 200 renovada; sala não possuída → 409 `EOS_ROOM_NOT_OWNED`; sem credenciais → 503 `EOS_UNCONFIGURED`; id inválido → 422 |
| `/eos/sessions/:id/heartbeat` | POST | `eos:operate` | renova TTL; desconhecida → 404 |
| `/eos/sessions/:id/end` | POST | `eos:operate` | encerra; desconhecida → 404 |
| `/eos/sessions` | GET | `admin:metrics` | lista sessões + status |

- **Unit tests** (`game-runtime/test/eos-bridge.test.js` — 4 testes): honestidade
  do `unconfigured`, fencing de anchoring, ciclo HTTP completo (201→200→200→404
  + RBAC 403) e rejeição honesta sem credenciais. Auditoria registra
  `eos.session.register` allow/deny.

## 3. Handshake nativo esperado (quando as credenciais chegarem)

```
UE5 Dedicated Server (licenciado, EOS SDK nativo)
  1. EOS_Platform_Create + EOS_Auth_Login (service account/credenciais)
  2. KhaaosEOSSession::HostDedicatedServerSession(MapName, MaxPlayers)
     → EOS_Session Creation → SessionId nativo
  3. POST {runtime}/eos/sessions { sessionId, roomId, hostAddress, maxPlayers }
     ← 201 (sessão ancorada à sala possuída por esta réplica)
  4. heartbeat a cada ≤90 s; end() no shutdown
Clientes (UE5)
  login nativo EOS → matchmaking/session browse EOS → connect no hostAddress
  → sala do runtime (redirect cross-réplica M4 garante o dono certo)
```

## 4. Pré-requisitos externos para o ACEITE integral do M4

| Pré-requisito | Bloqueia | Destino |
|---------------|----------|---------|
| Runner UE5.8 **licenciado** (Windows/Linux) | compilação UBT, Automation Tests, empacotamento | `ue5-build.yml`/`ue58-container-build.yml`/`ue5-headless-compile.yml` |
| Credenciais EOS reais (Dev/Staging) em GitHub Secrets | login/sessão/matchmaking/reconnect de verdade | `EOS_PRODUCT_ID…EOS_CLIENT_SECRET` no runtime + `DefaultEOS.ini` gerado no CI (sem placeholders) |
| 2 clientes executáveis | login→sessão→ação→reconnect ponta a ponta | empacotados no runner + smoke EOS dedicado |

Enquanto isso, o estado do sistema é HONESTO: `/eos/status` → `unconfigured`
com `missing[]`; CI roda os unit tests do bridge (mock confinado) e o preflight
valida estrutura/include sem engine.

## 5. Correções de trilha incluídas

- **Preflight UE1021** (`scripts/build/ue58_preflight.mjs`): include raizado em
  módulo provedor resolve (modelo `PublicIncludePaths.Add(ModuleDirectory)` —
  agora também no `KhaaosRun.Build.cs`), e diretórios de convenção da engine
  (`Commandlets/`, `Public/`, …) não são mais confundidos com includes de
  projeto — derrubava falsos UE1021 como `"Commandlets/Commandlet.h"` (UnrealEd).
- `KhaaosRun.Build.cs`: raiz do módulo no include path — includes `Game/...`
  resolvem no UBT inclusive nos commandlets do `KhaaosRunEditor`.
