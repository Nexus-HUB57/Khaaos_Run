# Roadmap de Desenvolvimento — Próximos Passos (End to End)

**Data:** 2026-11-02
**Branch de trabalho:** novo branch a partir de `main` atual (`9df772e`, PR #242) — `feat/e2e-phases-9-12` está 100% contido na `main` e 232 commits atrás (congelar). Ver [`REVISAO_E2E_2026-11-02.md`](REVISAO_E2E_2026-11-02.md). **Sync 2026-11-02:** `fetch` + rebase de estado — 0 PRs abertos (verificado via API GitHub), #236 mesclado em 2026-11-01, docs de status publicados via branch `docs/console-web-mundos-20261102`.
**Base examinada:** README snapshot 2026-10-26/27 + evidências de execução da sessão 2026-11-02 (alistamento E2E, mundos canônicos, gráficos v3–v5, 2PC server-side).
**Revisão (2026-11-02, 2ª passada):** auditoria E2E corrigiu 6 desvios neste documento — 1.3 já concluído (PRs mesclados 2026-10-26), branch de trabalho contido na `main`, baseline UE5 ~3× maior (298/293 headers), fila de 97 workflows sem runner, gap canônico quantificado, 36 workflows. Detalhes em [`REVISAO_E2E_2026-11-02.md`](REVISAO_E2E_2026-11-02.md).
**Relação com outros roadmaps:** este documento é o **plano de execução consolidado** ("o que fazer a partir de hoje, em que ordem e com que critério de aceite"). [`docs/ROADMAP.md`](ROADMAP.md) mantém o detalhamento de engenharia por issues (#53–#60); [`docs/README_AUDIT_ROADMAP.md`](README_AUDIT_ROADMAP.md) mantém a auditoria documental do README; o "Roadmap Go Live" do README mantém as fases 0–5 de produto. Onde houver sobreposição, vale o critério de aceite mais rigoroso.

**Atualização 2026-11-05 — Jornada Oficial:** a revisão confirmou que a jornada de 7 etapas ainda não está E2E: autenticação é OIDC-only; a integração da taxa é test-only, USD e sem gate pago transversal; o marco 1.000.000, Academia KR, notificações e agenda CIGKV não estão ligados à fonte de alistamentos confirmados. A rota sem gateway agora falha fechado. Antes de live permanecem P1: preço/cotação BRL e sign-off jurídico/fiscal, tentativas de pagamento duráveis/atômicas contra concorrência, acesso pago, contador/entitlement e outbox do CIGKV. Evidências e critérios de aceite: [`REVISAO_E2E_JORNADA_OFICIAL_2026-11-05.md`](REVISAO_E2E_JORNADA_OFICIAL_2026-11-05.md). `npm run verify:all` passou; a suíte PostgreSQL serializada passou (172 testes, 2 skips).

**Princípio (mesma disciplina do README):**

- **Versionado** = código/configuração commitado. Não equivale a operacional.
- **Validado** = evidência de execução observável (browser real, API, testes, logs). Não equivale a staging.
- **Aceite** = critério operacional demonstrado no ambiente-alvo (staging/produção). Só isso fecha item.
- Nenhum item é promovido de faixa sem a evidência explícita indicada.

---

## 0. Baseline consolidado — onde estamos em 2026-11-02

| Camada | Estado | Última evidência |
|--------|--------|------------------|
| **Console Web (preview Next.js 16)** | 🟢 Operacional no preview | Alistamento E2E validado em browser real (taxa U$1 = 100 KRC, protocolo `KR-REG-*`, bônus 500 KRC, idempotente, retomada de sessão); aba Mundos com especificação canônica (100 operadores/ring, 15.000–25.000 m²) e `WorldMapPreview` canvas orgânico; erro Prisma `enrollmentProtocol` resolvido |
| **Game-service (orquestração, porta 3003)** | 🟢 Operacional no preview | Keeper com spawn detached do `next dev :3000` + watchdog cron 5 min (`GET /api/match` 200 contínuo) |
| **Repo UE5 — código C++** | 🟡 Versionado, não compilado | 298 `.cpp` + 293 headers, 129.492 linhas (`Unreal/KhaaosRun/Source/**` — contagem re-verificada em 2026-11-02, revisão E2E); gráficos v3–v5 (commits `98aa769`, `7e18ff0`, `519be5c`, `fca74b0`) prontos para o primeiro build real |
| **Repo UE5 — Economia/pagamentos 2PC** | 🟡 Server-side testado; cliente UE5 não exercitado | Escrow + idempotência + métricas Prometheus + painéis Grafana versionados; `TryPurchase` 2PC pendente de E2E com cliente UE5 real |
| **Repo Web/API (Express 5 + React 18)** | 🟡 `npm run verify:all` 7/7 | Suíte oficial 337 pass · 2 skip · 0 fail (snapshot 2026-10-27); coverage 27,46% linhas |
| **CI/CD** | 🟡 36 workflows versionados | Preflight UE5.8 verde por PR; **build real bloqueado: 0 runners GPU registrados e 97 runs do `ue5-headless-compile` presas em `queued`** (2026-11-02) |
| **GitHub** | 🟢 ~100 PRs mesclados · **0 abertos** (API, 2026-11-02) | #102/#111/#112/#113 **mesclados em 2026-10-26**; #236 (mobile toolchain/GPU/rede) **mesclado em 2026-11-01**; `main` em **#242** (ci(unreal): telemetry automation, 2026-11-01) |
| **Mundos (dados/intake)** | 🟡 Pacotes source 5/5 | OBJ/glTF/`.umap.json`/DataTables/SVG em `Unreal/KhaaosRun/Content/Maps/{CIGKV,Barburhen,Priadus,Ckesalth,Arukheea}`; cook `.umap` exige UE Editor |
| **Infra (IaC/containers)** | 🟡 Versionada | Terraform T4 (`ecs.gn6i-c4g1.xlarge`), compose 5 serviços, Grafana dashboards; execução multi-região pendente |

---

## 1. Sprint imediato (Semana 1) — desbloqueios P0

Cinco ações destravam todo o resto. Ordenadas por criticidade do caminho crítico:

| # | Ação | Como | Critério de aceite | Dependência |
|---|------|------|--------------------|-------------|
| 1.1 | **Reconciliar versões do console web** — definir a fonte da verdade única entre o preview local (chat `290c30fa`, base antiga) e o preview corrente dos devs (chat `61d24148`) e portar as entregas validadas (alistamento E2E + mundos canônicos + `WorldMapPreview`) para ela. **Nota 2026-11-02:** base canônica deve partir da `main` atual (`9df772e`); gap quantificado: `WorldMapPreview` e rota HTTP de alistamento **não existem** no app canônico (`client/`+`server/`) | Inventário de diffs das duas bases; decidir a base canônica; portar por PR com `npm run check` | Um único preview canônico contendo: alistamento 3 etapas com taxa U$1 idempotente **e** aba Mundos canônica com mapas orgânicos; E2E re-executado nessa base | Confirmação do time (versão `61d24148` é conjunta) |
| 1.2 | **Registrar runner self-hosted GPU UE5.8** | `scripts/build/bootstrap_ue58_runner.sh` (v4.0, suporte Tesla T4/GRID); configurar secret `UE_CONTAINER_PAT` **ou** `UE5_GITHUB_TOKEN` (convergir com gate M4 do PR #236); disparar `ue5-headless-compile.yml` manual; **enquanto não houver runner, desativar triggers automáticos do workflow** (evidência 2026-11-02: 0 runners, 97 runs `queued`) | Runner online no GitHub; primeiro `ue5-headless-compile` executa os 8 steps sem falha de infraestrutura | GPU T4 provisionada (Terraform) |
| ~~1.3~~ | ✅ **CONCLUÍDO (2026-10-26)** — os 4 PRs (#102, #111, #112, #113) foram mesclados; #236 também já mesclado (2026-11-01); sem PRs abertos (2026-11-02) | Revisão por pares + CI verde (proteção Zero-Deletion `scripts/khaaos_workflow.sh`) | Fechado com evidência de `merged_at` na API | — |
| 1.4 | **Staging PostgreSQL/Redis operacional** (conteúdo do PR #113) | `configure-staging-database.yml` (manual, com confirmação); apontar `DATABASE_URL` de staging | `GET /healthz` 200 com Postgres real; testes de integração passando contra staging | 1.3 |
| 1.5 | **Webhooks reais Discord/Slack** | `scripts/configure_webhooks_v2.sh` com URLs reais dos canais do projeto | Alerta de teste chegando nos dois canais em < 1 min | URLs dos canais |

**Execução diária contínua:** watchdog do preview (cron 5 min em `GET /api/match`) e suíte de sanidade pós-merge (`npm run check`, `npm run test:official`, `npm run verify:all`).

---

## 2. Trilhas end to end (T1–T8)

Cada trilha lista objetivo, tarefas com prioridade, critério de aceite e dependências. IDs `Tx.y` são rastreáveis em commits/PRs (`docs(trilha T2): ...`).

### T1 — Console Web & Pagamento (paralela, sem dependência de UE5)

**Objetivo:** console canônico com campanha de alistamento capaz de operar com valor real sob compliance.

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T1.1 | Executar Sprint 1.1 (reconciliação de versões) | P0 | Preview canônico único com as duas features validadas |
| T1.2 | Liquidação real da taxa U$1 (gateway PIX/Cartão) | P0 | Pagamento de teste (sandbox) liquida → webhook confirma → `enrollmentPaid=true` com recibo conciliável; falha de webhook não credita (job de reconciliação) |
| T1.3 | KYC leve no alistamento (dados mínimos + aceite de termos) | P1 | Alistamento exige aceite; dados persistidos; LGPD revisada |
| T1.4 | Protocolo `KR-REG-*` assinado (HMAC) e verificável | P1 | Protocolo validável server-side; falsificação rejeitada |
| T1.5 | EP555 (8 patentes) + War'I + Forja + BankHaaos no console com dados do repo | P1 | Navegação completa sem stubs; inventário persistido |
| T1.6 | Deploy staging do console (Render ou equivalente) | P1 | URL de staging com smoke test automatizado verde |
| T1.7 | Observabilidade do console: `/healthz`, métricas, log de auditoria do fluxo financeiro | P1 | Dashboards do console scraping `/metrics`; alerta em falha de pagamento |

**Dependências:** T1.2 exige decisão de compliance (ver T5) antes de valor real; sandbox pode avançar já.

### T2 — Build UE5.8 (caminho crítico global)

**Objetivo:** primeiro binário compilado do projeto — desbloqueia T3, T4, T5 (cliente), T6, T7.

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T2.1 | Sprint 1.2 (runner GPU + secret) | P0 | Runner online; workflow dispara |
| T2.2 | Compilar `KhaaosRun.uproject` Development Editor + Linux Dedicated Server | P0 | Zero erros UBT; artefatos publicados no runner |
| T2.3 | Corrigir débitos revelados pelo primeiro build (headers v3–v5, módulos do `Build.cs`) | P0 | Ciclo build→fix→build fechado em < 5 iterações |
| T2.4 | Automation tests em instalação real (smoke de GameMode, GAS, SafeZone) | P0 | Suíte de automation passa no editor compilado |
| T2.5 | Docker multi-stage funcional (imagem runtime < 5 GB) e `docker compose -f Unreal/KhaaosRun/Build/docker-compose.yml up` sobe server + economy-api + Redis + Prometheus + Grafana | P1 | Compose up com healthchecks verdes por 30 min |
| T2.6 | Publicar imagem no GHCR via `ue5-server-build.yml` + scan Trivy | P1 | Imagem no GHCR; Trivy sem CVE crítico |

**Dependências:** 1.2; provisioning de GPU (Terraform já versionado).

### T3 — Mundos & Assets Cook (depende de T2)

**Objetivo:** os 5 rings canônicos jogáveis no UE5, fiéis ao contrato de dimensões e ao look Free Fire.

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T3.1 | Importar os 5 pacotes intake no UE Editor (OBJ/glTF → estáticos) | P0 | Assets importados sem escala errada (metros); relatório `asset_import_report.json` sem pendências |
| T3.2 | Cook `.umap` por mundo com MapBuilder (DT de pontos) | P0 | Cada mapa carrega com spawns 100p, POIs e ZEX posicionados |
| T3.3 | Paridade de dimensões: `MapData` C++ ↔ `shared/worlds.ts` (16.000/19.000/22.000/25.000/18.000 m²; bounding boxes canônicas) | P0 | Teste automatizado compara MapData vs contrato; divergência = falha |
| T3.4 | Look Free Fire aplicado: LUTs do `KhaaosPostProcessStack`, `KhaaosAtmosphereLighting` por bioma (8×8 presets), `KhaaosStylizedMaterialSystem` por espécie | P1 | Screenshot review dos 5 mundos vs checklist visual; 30/60/120 fps por preset Mobile→PhD |
| T3.5 | VFX de zona/risco por mundo (chuva ácida Barburhen, neblina Priadus, fumaça Ckesalth, tsunami Arukheea) | P1 | Volumes aplicam fórmulas sincronizadas (ex.: 0,01 = −1% Vitality/tick) validadas em runtime |

### T4 — Rede, EOS & Partida Real (depende de T2; parcialmente paralela com T3)

**Objetivo:** uma partida real de 100 operadores no ring canônico, fim a fim.

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T4.1 | Credenciais EOS reais (Product/Sandbox/Deployment IDs) | P0 | Login/logout EOS funcional em staging |
| T4.2 | Lobby + Matchmaking + Sessions com 100 jogadores | P0 | 100 players em lobby sem crash; matchmaking < 30 s p95 |
| T4.3 | `KhaaosLoadTestManager` 100 bots no servidor compilado | P0 | JSON report: 0 crashes, RTT < 100 ms local |
| T4.4 | Partida real assistida: CIGKV ring 100p, fluxo contínuo, Pulso Khaaos 10 min, ZEX + Forja + Bankhaoos ativos | P0 | Partida completa do drop à eliminação/vitória sem intervention manual |
| T4.5 | Multi-region routing (SA/NA/EU) medido | P1 | Ping-based routing funcional; RTT regional registrado |
| T4.6 | Stress 500/1000/2000 bots (`stress-test.yml`) | P1 | < 150 ms RTT p95, zero crashes em 8 h |

### T5 — Economia & Compliance (gate para valor real)

**Objetivo:** KRC confiável e a taxa U$1 real — sem jamais abrir valor real sem aceite.

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T5.1 | `TryPurchase` 2PC E2E: cliente UE5 real → `EconomyBridge2PC` → staging (`/api/economy/2pc/*`) | P0 | Compra com escrow + commit; replay sem duplo débito; abort com refund observado no Grafana |
| T5.2 | Stress do `KhaaosAtomicLedger` (15 tx types, SHA256, escrow, cap 1B) | P0 | Zero double-spend em stress test documentado |
| T5.3 | Revisão de compliance (KYC/AML/BCB/IRPF) com jurídico — abrangendo a taxa de alistamento U$1 | P0 | Sign-off legal documentado; condições de valor real listadas |
| T5.4 | Ledger imutável (append-only) + auditoria externa amostral | P1 | Impossibilidade de UPDATE em transações; relatório de auditoria |
| T5.5 | Desligar modo dev `ue5-player-<id>` quando secret 2PC ativo em staging | P0 | Requisições dev-mode rejeitadas com secret configurado |

### T6 — Infra & Observabilidade (paralela; consolida com T2.5)

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T6.1 | Prometheus scraping `/metrics` + Grafana (dashboards 2PC + servidor) em staging | P0 | 8+ panels com dados reais por 24 h |
| T6.2 | Alertas Discord/Slack ligados a SLOs (erro 5xx, escrow órfão, RTT) | P0 | Alerta disparado em falha simulada em < 5 min |
| T6.3 | Deploy multi-região (`scripts/fase5/deploy_multiregion.sh`) + failover/rollback drill | P1 | Drill executado: falha de região → tráfego migrado; rollback testado |
| T6.4 | Backup/restore do banco de staging | P1 | Restore testado com perda-zero verificada |

### T7 — Segurança & Anti-Cheat (paralela; fecha com T2/T4)

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T7.1 | EAC: baixar SDK oficial no dev portal da Epic e compilar módulo `KhaaosEAC` (sem stub) | P0 | EAC ativo no servidor compilado; kick de movimento hack < 2 s (3-strike) |
| T7.2 | Validação anti-cheat em build real: speed/teleport/damage hack | P0 | 3-strike kick < 2 s por classe de hack |
| T7.3 | Pentest das rotas financeiras e de sessão (2PC, enrollment, WS token) | P1 | Relatório de pentest sem achado crítico aberto |
| T7.4 | Rate limits e DDoS em produção (60/min, 50/s global, auto-block 30 min) | P1 | Métricas de bloqueio visíveis no Grafana |

### T8 — Beta & Go-Live (consolida tudo)

| ID | Tarefa | P | Critério de aceite |
|----|--------|---|--------------------|
| T8.1 | Beta Campaign (6 fases, NDA, convites, referral) ativa sobre o alistamento real | P0 | 10.000+ alistamentos com taxa liquidada (marco parcial do EXCO 1M) |
| T8.2 | Desafio de Gigantes (top 50 do CIGKV) | P2 | Evento noturno transmitido; premiação em KRC de jogo |
| T8.3 | Go-Live Checklist 25 checks (`scripts/fase5/golive_checklist.sh`) | P0 | GO/NO-GO com todos os checks críticos = PASS |
| T8.4 | **GO LIVE** — W1/C1 Barburhen oficial (7 dias, 12 h/dia) | P0 | Ciclo completo operado; prêmio do Fundo KR governado |

---

## 3. Sequenciamento — caminho crítico

```
Semana            1    2    3    4    5    6    7    8    9   10 … 28
                  │    │    │    │    │    │    │    │    │    │
Sprint 1 (1.1–1.5)├───┤
T1 Console/Pagamento   ├──────────┤ (sandbox) ──► (real pós-T5.3) ──► campanha
T2 Build UE5.8         ├───────────┤            ► artefato GHCR
T3 Mundos/Cook                 ├─────────────┤
T4 EOS/Partida real                 ├─────────────┤  ► 100p real no CIGKV
T5 Economia/Compliance              ├───────┤ (2PC e2e) ► sign-off real
T6 Infra/Observabilidade       ├───────┤
T7 Segurança/EAC                        ├────────────┤
T8 Beta → GO LIVE                                ├──────────────────────► GO
```

**Caminho crítico:** runner GPU (1.2) → build UE5 (T2) → cook dos mundos (T3) → EOS staging (T4) → partida real 100p → alpha fechado → compliance (T5.3) → beta → go-live.

**Paralelo de alto valor (não bloqueia o crítico):** T1 inteira e T6 podem avançar desde a semana 1; T7 depende de T2.2.

---

## 4. Riscos e mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Duas versões paralelas do console** divergirem de novo | Alto — retrabalho e confusão de evidências | Fechar 1.1 na semana 1; regra: um preview canônico, port por PR, E2E re-executado na base canônica |
| **Primeiro build UE5 revelar débitos extensos** (48 abilities, 27 VFX, headers v3–v5) | Alto — atrasa T3/T4 | Orçamento de ciclo build→fix→build (T2.3); preflight `KHAAOSRUN_API` já zera uma classe de erro; priorizar erros de módulo antes de gameplay |
| **Credenciais EOS/EAC com lead time externo** | Médio | Solicitar no dev portal da Epic na semana 1 (paralelo ao build); sandbox enquanto isso |
| **Custo/estabilidade do runner GPU** | Médio | T4 spot/preemptible com cache UBT; Terraform já fixa T4 física (`gn6i-c4g1.xlarge`); bootstrap v4.0 cobre driver |
| **Pressão por "valor real" antes do aceite** | Alto — risco legal | Gates T5.3 obrigatórios; enquanto isso tudo permanece economia de jogo (KRC), como já documentado no README |
| **Capacidade 100p do RoomManager em memória** | Médio — staging escala mal | Usar Redis pub/sub (já no compose, pendente de adoção) antes do beta; load test T4.6 como gate |
| **Deriva doc ↔ código** | Médio | Checkpoint de auditoria `README_AUDIT_ROADMAP.md` a cada marco; snapshots datados; este roadmap revisado semanalmente |

---

## 5. Definition of Done — end to end (aceite global do produto)

O produto só é declarado pronto quando **todos** os itens abaixo forem demonstrados (não versionados — demonstrados):

1. Jogador real se alista no console canônico, paga U$1 via gateway real, recebe protocolo assinado e entra no Bankhaoos com bônus de boas-vindas — recibo conciliável.
2. Partida real no CIGKV: 100 operadores no ring canônico de 16.000 m², Zu cinematográfico, Pulso Khaaos, ZEX/Forja com `TryPurchase` 2PC contra ledger de staging, extração ou eliminação.
3. Binário do dedicated server compilado, publicado no GHCR, rodando no compose de produção com healthchecks verdes por 72 h.
4. EOS Auth/Lobby/Matchmaking/Sessions/Cloud Save operacionais com credenciais reais.
5. EAC ativo com kicks demonstrados; pentest sem críticos abertos.
6. Observabilidade: dashboards Prometheus/Grafana com dados reais, alertas chegando nos canais reais, multi-região com drill de failover executado.
7. Compliance sign-off liberando valor real sob as condições documentadas.
8. Go-Live Checklist 25/25 críticos = PASS → GO.

---

## 6. Cadência de governança

- **Contínua:** watchdog do preview (5 min); convenção de PR via `scripts/khaaos_workflow.sh` (branch dedicada, rebase `main`, nunca commit direto na main).
- **Diária (pós-merge):** `npm run check` + `npm run test:official` + `npm run verify:all`.
- **Semanal:** revisão deste roadmap (atualizar status com evidência), snapshot de PRs abertos, checkpoint da auditoria documental.
- **Por marco:** atualizar o "Roadmap Go Live" do README e as issues correspondentes (#53–#60), sempre distinguindo *versionado* × *validado* × *aceite*.

---

## 7. Apêndice — comandos canônicos desta rodada

```bash
# Sanidade do repositório (raiz do repo)
npm run check && npm run test:official && npm run verify:all

# Runner GPU UE5.8 (primeira vez)
bash scripts/build/bootstrap_ue58_runner.sh   # v4.0 — Tesla T4 / GRID, BusID auto

# Compilação do dedicado (com runner/engine disponíveis)
bash scripts/build-server.sh                  # caminho canônico auditado (P0-02)

# Pacotes de intake dos mundos (regenerar se contrato mudar)
python3 scripts/build/generate_world_asset_packages.py

# Readiness UE5 (API macro e naming)
node scripts/verify_ue5_build_readiness.mjs

# Webhooks de alerta reais
bash scripts/configure_webhooks_v2.sh

# Fluxo de PR (nunca na main)
bash scripts/khaaos_workflow.sh
```

---

<sub>Roadmap de execução 2026-11 · Khaaos Run · Nível Devs Ph.D · Equipe Nexus — revisão semanal obrigatória com evidência.</sub>
