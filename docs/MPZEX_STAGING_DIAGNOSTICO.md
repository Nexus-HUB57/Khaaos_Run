# MP-ZEX 08+09 em staging — Diagnóstico consolidado e estado (2026-11-10)

> Consolidado das rodadas de despacho **#8–#18** (workflow *MP-ZEX 08+09 —
> Despacho único em staging*), com a cadeia causal completa, os fixes aplicados
> (PRs #343/#345/#346/#347/#348/#349/#350/#351) e a **decisão de design** que
> resta para o aceite integral.

## 1. Estado atual

| Item | Estado |
|---|---|
| Pipeline de entrega do staging | ✅ **reconectado** (#351) — o fallback do hook de deploy voltou a publicar o main no Render (run 93 → deploy do `a410863` aceito pelo Render) |
| Secrets de staging (5 × `KR_STAGING_*`) | ✅ presentes no environment `staging` |
| Gate de secrets do despacho | ✅ success em todas as rodadas |
| **MP-ZEX-08** | ✅ estável em 5 rodadas consecutivas (#9–#12, #14) — na #18 flanqueou por corrida com o anel (ver §4) |
| **MP-ZEX-09** | ⏳ progresso máximo: chega às **Fase 1 (interrupção ✓)** e falha em pontos de **design do mundo** (ver §4) |
| Runner UE5.8 self-hosted | ❌ pendência humana (host ≥ 250 GB/32 GB RAM; a VPS de 4 GB não atende) |
| 7 secrets `EOS_*` | ❌ pendem do portal Epic (Fase A, manual — `docs/EOS_PORTAL_CHECKLIST.md`) |
| Probe EULA GitHub↔Epic | ❌ 404 (vínculo de conta não feito — Fase A1) |

## 2. Cadeia causal resolvida (cada camada com evidência de despacho real)

| Rodada | Sintoma | Diagnóstico | Fix | PR |
|---|---|---|---|---|
| #8–#10 | 09: `Sala ring3d-N sem par sobrevivível (rota máx 55 trechos)` em 4/4 salas | `MAX_ROUTE_STEPS=40` atrás dos mundos pós-Task 53 (rota mínima real = 55) | 40→64 trechos, 4→6 tentativas | #343 |
| #11 | 09: `Conta B não sobreviveu à navegação` 5 ms após o início (rota de 5 trechos) | B knocked **entre o desembarque e a navegação** (janela do trem descoberta; waitForLand só cobria o pouso) | `RoomRetry` no pouso + checagem pós-desembarque + catch central fechando sockets | #345 |
| #12 | 09: `Conta A não sobreviveu à navegação` (crash **sem FAIL logado**) | (a) dano de ring derruba A em rota longa; (b) `navA` rejeitado fora de qualquer handler (unhandledRejection) | par por **MINIMAX** (20/15 trechos vs 55/5), autocuidado caído via medkit, navegação dentro do retry | #346 |
| #13 | 08: `The operation was aborted due to timeout` | staging Render free **hiberna** (~15 min de inatividade); cold start ~50–80 s estoura `REQUEST_TIMEOUT_MS=12s` | readiness paciente (até 180 s, tentativas de 15 s) no 08 e no 09 | #347 |
| #14 | 09: 6 salas rejeitadas **sem motivo logado** | `catch RoomRetry` silencioso + checagem sem telemetria | visibilidade total (`Sala X rejeitada: <motivo>`; `pós-desembarque A: vida/knocked/medkit/pos`); knock com medkit segue; 8 tentativas | #348 |
| #15 | 09: atores desembarcam **já drenados** (A vida 0–98; B vida 0 em 3/6 salas) | o ring dana **passageiros a bordo do trem** (física suspensa = não podem fugir; armadilha) | **Cinto**: `trainOnboard` imune ao dano de ring, paridade room3d/sim3d | #349 |
| #16/#17 | 09: `Timeout esperando conclusão em B(resume)`; despachos rodando contra staging **antigo** | (a) anel fecha sobre o **setor canônico** (`scenarios.ringFinal`) e terminais fora dele morrem no fechamento; (b) **o deploy do staging estava quebrado** — `Missing Actions secret RENDER_DEPLOY_HOOK_URL` | terminais filtrados por `insideFinalRing` (setor canônico + telemetria de fechamento); fallback do hook para o repo secret `RENDER_DEPLOY_HOOK` | #350 / #351 |

## 3. Descobertas de valor permanente

1. **A entrega do staging estava quebrada há semanas** (secret com nome errado no
   environment) — os despachos testavam código antigo e **mascaravam** os fixes.
   O #351 reconectou: run 93 → Render aceitou o deploy do `a410863`.
2. O **selftest local é benigno por construção**: CIGKV não tem `ringFinal`
   (dano ×1) e as partidas locais são curtas — o staging (mundo com `ringFinal`,
   multiplicador 2–2.25 e survival) é outro clima. A telemetria de cenário
   (`Cenário X — anel final em (x,z) 'setor' (dano ring ×N)`) agora expõe essa
   diferença em cada despacho.
3. O padrão de **falha honesta com motivo logado** (RoomRetry + telemetria) é
   reutilizável para os próximos cenários da matriz MP-ZEX.

## 4. Decisão de design restante (dono do produto)

O cenário ring3d de staging coloca os terminais **a ~130 m do centro** enquanto
o anel de CIGKV fecha no **centro** (raio 42, sem `ringFinal`). Em ~60–90 s de
partida o anel fecha e **todo terminal fica fora da zona segura** — o teste vira
corrida contra o anel (o 08 flanqueia quando o fechamento adianta; o 09, que
espera o trem + navega mais, perde a corrida no canal de conclusão).

Opções (não excluem-se):

| Opção | Efeito | Esforço |
|---|---|---|
| **A. Terminal central** no layout ring3d de staging (`ZEX // CENTRO` já existe — mover 1 terminal complementar para o setor do fechamento) | os dois clientes canalizam dentro da zona segura | layout 1 mundo |
| **B. Anel lento em partidas de teste** (salas capacidade 2 / botFill 0: `PULSE_INTERVAL` maior ou `ringDamageMultiplier` 0.5) | o anel continua mecânica, mas não assassina a partida de 2 pessoas | ~5 linhas, server |
| **C. Matchmaking do despacho pede sala dedicada** com cenário/anel configurados (doutrina "instância de staging dedicada" já existe no `docs/MPZEX_STAGING_DISPATCH.md`) | separa ambiente de teste do jogo real | média |

Recomendação técnica: **A + B** (terminais jogáveis no fechamento + anel lento
para o modo de teste de rede). O script de teste NÃO deve teleportar/curar fora
do gameplay — as correções pertencem ao mundo, não ao cliente de teste.

## 5. Sequência de re-despacho (após a decisão de design)

1. merge da opção escolhida;
2. aguardar o deploy do staging (`Deploy Render Staging after CI` → success +
   healthcheck);
3. `Actions → MP-ZEX 08+09 — Despacho único em staging → Run workflow`
   (inputs padrão);
4. contratos: `MP-ZEX-08 PASS` + `[MP-ZEX-09] RELATÓRIO:` → artefatos 14 d;
5. `GH_TOKEN=… node scripts/eos/p0_gate.mjs` para o retrato final.
