# MP-ZEX 08+09 — Despacho único em staging (dois dispositivos reais)

> Fecha a última superfície manual da matriz MP-ZEX (docs/FASE43
> PLANO_TESTES_MULTIPLAYER_REAL.md): **MP-ZEX-08** (gate de release) e
> **MP-ZEX-09** (latência/jitter/perda) sobem para o staging real com **duas
> sessões reais independentes** — as contas `KR_STAGING_TEST_USER_A/B` — em
> **um único `workflow_dispatch`**. Antes disso, ambos os cenários já são
> revalidados a cada mudança por `game-runtime/scripts/mpzex-staging-selftest.mjs`
> (servidor autoritativo real isolado, contratos idênticos).

Workflow: `.github/workflows/mp-zex-staging.yml` —
**"MP-ZEX 08+09 — Despacho único em staging"**.

## 1. Pré-requisitos (uma vez)

### 1.1 Secrets do environment `staging`

| Secret | Conteúdo | Quem cria |
|---|---|---|
| `KR_STAGING_BASE_URL` | URL HTTPS do staging (host deve conter `stage`/`staging`) | você |
| `KR_STAGING_TEST_USER_A` | usuário da sessão/dispositivo A | script |
| `KR_STAGING_TEST_PASSWORD_A` | senha de A (gerada se ausente) | script |
| `KR_STAGING_TEST_USER_B` | usuário da sessão/dispositivo B (≠ A) | script |
| `KR_STAGING_TEST_PASSWORD_B` | senha de B (gerada se ausente) | script |

Automatizado:

```bash
export REPO=Nexus-HUB57/Khaaos_Run
export KR_STAGING_BASE_URL=https://staging.sua-infra.example
bash scripts/staging/setup_staging_secrets.sh
```

Regras herdadas do checklist EOS (PB-07): valores só por env/gerenciador de
senhas; o script imprime apenas NOMES; senhas geradas via `openssl rand`.

Auditoria contínua: `GH_TOKEN=… node scripts/eos/p0_gate.mjs` (item [S]).

### 1.2 Provisionamento das contas no staging (uma vez)

As duas contas precisam EXISTIR no servidor de staging. Com o `.env` do
compose aberto, gere o JSON com o mesmo formato de `KR_USERS_JSON`
(`game-runtime/server/auth.js`):

```bash
cd game-runtime
node -e '
const { hashPassword } = await import("./server/auth.js");
const j = (u, p) => ({ id: u, username: u, role: "player", region: "sa-east", passwordHash: hashPassword(p) });
console.log(JSON.stringify([j("kr_zex_a", process.env.PA), j("kr_zex_b", process.env.PB)]));
' --input-type=module
# → cole o resultado em KR_USERS_JSON do .env de staging e reinicie o compose
```

### 1.3 Domínio sem rótulo staging (opcional)

O script do 08 recusa hosts que não contenham `stage`/`staging`. Para um
domínio confirmado, defina a variável NÃO secreta
`KR_STAGING_ALLOW_CUSTOM_HOST=true` no environment — decisão humana
consciente, nunca automática.

## 2. Despacho

GitHub → Actions → **MP-ZEX 08+09 — Despacho único em staging** → Run workflow:

| Input | Default | Papel |
|---|---|---|
| `scenarios` | `08,09` | escolha os cenários (`08`, `09` ou `08,09`) |
| `rtt_up_ms` / `rtt_down_ms` | `65`/`65` | atraso base do DegradedLink (RTT nominal ≈ 130 ms) |
| `jitter_ms` | `30` | jitter ± por quadro |
| `loss_pct` | `2` | probabilidade de spike de retransmissão (+200–400 ms) |

Execução **serial** (09 roda depois do 08 — doutrina de uma partida de teste
por vez no staging, `concurrency: mp-zex-staging`, `cancel-in-progress: false`).

### Job 1 — MP-ZEX-08 (gate de release)

`run-mp-zex-08-staging.mjs` contra o staging: duas contas reais na MESMA sala,
navegação só com inputs de gameplay (A* + unstick, sem teleporte/debug),
canal de A, `terminate` real do socket, liberação imediata para B, resume de A
pela janela de 15 s. **Contrato: `MP-ZEX-08 PASS`** — sem XP/extração para A,
`extractCancelled/disconnect` preservado, B canalizando o terminal.

### Job 2 — MP-ZEX-09 (rede degradada)

`run-mp-zex-09-degraded.mjs` em MODO REMOTO (`KR_ZEX09_BASE_URL` = staging,
mesmas duas contas): o **DegradedLink** atua no cliente A (RTT nominal 130 ms
± jitter, "perda" ~2% como picos de retransmissão — TCP não descarta quadros).
Três fases: interrupção em rede normal (baseline), interrupção degradada
(quadro atrasado não ressuscita o canal), conclusão degradada (XP == baseline,
atraso visual B→A dentro do bound p95, convergência pós-drain).
**Contrato: `[MP-ZEX-09] RELATÓRIO:`** + exit 0.

## 3. Evidências

- Log completo do 08 e o relatório JSON do 09 virem artefatos
  (`mp-zex-08-staging-<run_id>`, `mp-zex-09-staging-<run_id>`, retenção 14 d).
- Resumo por job no `$GITHUB_STEP_SUMMARY` da run.
- Ensaios locais: `node game-runtime/scripts/mpzex-staging-selftest.mjs`
  → `MPZEX_STAGING_SELFTEST_OK` (roda 08 e 09-remoto contra servidor real
  isolado; logs em `artifacts/mp-zex-staging/`).

## 4. O que "dois dispositivos reais" significa aqui

Duas sessões **autenticadas e independentes** (contas A e B distintas) contra
o servidor de staging — nunca mock, nunca sala local, nunca a mesma conexão.
O par A/B é o par exigido pela matriz MP-ZEX (mesma sala, disputa, queda e
resume, RTT assimétrico). MP-ZEX-11 (clientes mistos desktop/touch) permanece
a única superfície manual — exige hardware/navegador touch real.

## 5. Falhas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| `::error::Environment "staging" sem os secrets…` | secrets ausentes | `scripts/staging/setup_staging_secrets.sh` |
| `Recusado: o host não identifica staging` | domínio sem rótulo | variável `KR_STAGING_ALLOW_CUSTOM_HOST=true` (confirmar destino antes) |
| `Login da conta A falhou` | contas não provisionadas | §1.2 (`KR_USERS_JSON` + restart) |
| `As duas contas caíram em salas distintas` | staging com tráfego paralelo | rodar em staging isolado; re-despachar |
| `A e B caíram no mesmo terminal` | spawns próximos no staging fazem ambos adotarem o mesmo terminal | **resolvido no #335**: B desempata excluindo o terminal de A (rota real de gameplay); em caso de colisão remanescente, restart do staging (Actions → "Staging — restart") e re-despachar |
| `não progride pela rota` | mapa/obstáculo novo | log agora imprime pos/waypoint; o unstick cobre quinas — investigar layout se >10 manobras |
| Sala com bots interferindo | staging compartilhado | usar instância de staging dedicada ao teste |
