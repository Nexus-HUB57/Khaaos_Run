# M4 — Paridade de produto e trilha UE5/EOS real

Aceite do milestone M4 (`docs/ROADMAP.md`) e onde a evidência de cada item é
produzida. Princípio do roadmap vale aqui: **evidência executada, não stubs** —
nada deste documento substitui os contratos `*_OK` greppáveis dos workflows.

## 1. UE5.8 licenciado — UBT, Automation, empacotamento e dois clientes

Workflow: **`M4 — UE5.8/EOS Acceptance`** (`.github/workflows/m4-ue5-eos-acceptance.yml`),
job `ue58-licensed` (container oficial da Epic, mesmo caminho do
`ue58-container-build.yml`).

| Aceite do roadmap | Onde a evidência é produzida |
|---|---|
| Compilar Editor e Dedicated Server por UnrealBuildTool | Passo `UBT — Dedicated Server / Editor / Client` ( três targets, Linux Development, `-project` + `-waitmutex`) |
| Executar Automation Tests identificáveis com exit 0 | Passo `Automation Tests (suite Khaaos, headless)`: `-ExecCmds="Automation RunTests Khaaos -TestExit=Exit"` com `-nullrhi -unattended`; contrato **`AUTOMATION_OK`** + zero `Result={Failed}`; relatório XML em artifact |
| Empacotar | Passo `Empacotar (opcional)`: `RunUAT BuildCookRun -cook -stage -pak -archive` (input `package=true`) |
| Conectar dois clientes | Passo `Dois clientes conectam ao servidor dedicado REAL`: `scripts/ue5/two_client_connect_smoke.mjs` sobe o servidor dedicado + 2 clientes `-nullrhi` e exige **`TWO_CLIENT_CONNECT_SMOKE_OK`** (2× `Login request` no log do servidor + soak sem desconexões) |

Sem o secret `UE_CONTAINER_PAT` (conta GitHub vinculada à Epic, PAT com
`read:packages`) o job de build é **pulado com resumo explicativo** — a CI nunca
falha por falta de engine; a estrutura C++ continua validada no `ue5-preflight`.

## 2. EOS Dev/Staging com credenciais reais

Job `eos-contract` do mesmo workflow + dois scripts:

- **`scripts/eos/inject_eos_credentials.sh`** — substitui os placeholders
  `KHAOS_*` do `DefaultEOS.ini` pelos valores reais vindos dos secrets
  (`EOS_PRODUCT_ID/SANDBOX_ID/DEPLOYMENT_ID/CLIENT_ID/CLIENT_SECRET`) em tempo
  de build/CI; `--check` é o gate que proíbe placeholders em go-live.
- **`scripts/eos/eos-live-smoke.mjs`** — valida as credenciais de serviço
  contra o endpoint **REAL** `api.epicgames.dev/epic/oauth/v2/token`
  (`client_credentials`; `--full` valida também o `deployment_id`, contrato de
  sessões/matchmaking). Contratos: **`EOS_LIVE_SMOKE_OK`** /
  **`EOS_LIVE_SMOKE_SKIPPED`** (sem secrets a CI fica verde — espelha o
  contrato UE1040 do EAC; `--strict` para go-live).

| Secret | Papel |
|---|---|
| `EOS_CLIENT_ID` / `EOS_CLIENT_SECRET` | ClientCredentials policy do Dev Portal (backend services) |
| `EOS_PRODUCT_ID` / `EOS_SANDBOX_ID` / `EOS_DEPLOYMENT_ID` | Identidade do produto/sandbox/deployment Dev/Staging |
| `UE_CONTAINER_PAT` (+ variable `UE_CONTAINER_IMAGE`) | Imagem licenciada UE5.8 da Epic (ghcr.io/epicgames/unreal-engine) |

O mock EOS continua como **teste unitário apenas**
(`npm run test:eos-flow`, workflow `06 — EOS Integration`), exatamente como o
aceite exige.

## 3. Paridade de produto (clientes reais em staging)

- Browser/E2E da aplicação web: `client/**` + suítes oficiais (`npm run
  test:e2e` nos workflows de CI) — staging com PG/Redis reais no
  `staging-smoke.yml`.
- Multiplayer cross-replica ao vivo: workflow **`16 — Cross-Replica Smoke
  (KR_DISTRIBUTED)`** com 2 réplicas reais + Redis real
  (contrato **`CROSS_REPLICA_SMOKE_OK`**) — detalhes em
  `game-runtime/docs/M3_DISTRIBUTED_SRE.md` e `infra/staging/verify-cross-replica.sh`.

## 4. Estado atual (2026-10-28)

- ✅ Pipeline completo implementado e acionável: os três contratos do M4 estão
  wired nos workflows e executam na hora em que licença (PAT) e credenciais EOS
  chegarem — nenhum código adicional é necessário.
- ✅ Cross-replica ao vivo em staging já executado (2 réplicas reais + Redis
  real): `CROSS_REPLICA_SMOKE_OK` com p95 RTT 1,0 ms, gap p95 51,0 ms,
  0 erros.
- ⏳ Pendente apenas de credenciais externas (fora do controle do repo):
  `UE_CONTAINER_PAT` (builds reais) e secrets `EOS_*` (validação live).
  Enquanto isso, a suíte C++ estrutural (ue5-preflight) e os mocks unitários
  permanecem como guardas.
