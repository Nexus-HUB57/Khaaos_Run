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

---

## Atualização 2026-11-11 — staging dedicado no VPS + Opção B implementada

- **Alvo do despacho**: `KR_STAGING_BASE_URL` no environment `staging` aponta para o
  **staging dedicado no VPS** (`https://staging.143-95-213-237.sslip.io`, sempre ativo,
  certificado Let's Encrypt válido) — elimina a hibernação do Render free (causa da
  rodada #13). Contas `kr_zex_a`/`kr_zex_b` resetadas e validadas no próprio servidor
  (`/auth/login` 200 nas duas; senhas apenas nos secrets — PB-07).
- **Primeiro despacho contra o staging dedicado (run 43079303822)**: gate ✅;
  **MP-ZEX-08 ✅ PASS** (`[MP-ZEX-08] MP-ZEX-08 PASS: sem XP/extração para A; resume
  preservado; B canalizando o terminal.`); MP-ZEX-09 ❌ na Fase 2 —
  `Timeout esperando estado do servidor: liberação do terminal leste após queda
  degradada (B(resume))` — orçamento de 4 s herdado do loopback, com RTT real +
  DegradedLink (os orçamentos RTT-aware dos PRs #343–#351 cobrem as fases 1/3;
  a liberação da Fase 2 ficou atrás).
- **Opção B IMPLEMENTADA (este PR)**: `server/room3d.js` — salas capacidade 2 sem
  botFill (perfil das salas do despacho) têm pulsos do Ring 3× mais espaçados
  (`PULSE_INTERVAL * 3`); salas normais e sim offline intocados. Resolve a corrida
  anel × terminais (§4) sem tocar gameplay canônico.
- Depois do merge: atualizar o `room3d.js` do staging no VPS, reiniciar
  `khaaos-staging` e re-despachar (cenários `08,09`).

## Cadeia causal da Fase 2 (resolvida com evidência local — 2026-11-11, noite)

Reprodução local com RTT sintético (selftest + `KR_ZEX09_UP_MS=350 KR_ZEX09_DOWN_MS=350`
≈ RTT 700 ms, o mesmo patamar runner↔VPS real). Três defeitos independentes, cada um
com evidência de instrumentação (`[DBG-CH]` no servidor, observador B1 no cliente):

1. **Ressurreição do canal por input em voo** (causa-raiz da Fase 2):
   `cancelZexChannelForDisconnect` cancelava o canal, mas os inputs já enfileirados
   (`actor.inputQueue`) e o `actor.lastInput` (fallback do tick quando a fila esvazia)
   continuavam sendo processados — um `interact=true` pré-queda reabria o canal 11
   ticks depois do cancelamento (`start → cancel → start → COMPLETOU`, mesmo ator).
   O canal zumbi completava e extraía — exatamente o que a Fase 2 existe para proibir.
   **Fix (server)**: morte de transporte marca o ator (`transportDead`), esvazia a
   fila, neutraliza `lastInput`; o resume reativa (`reviveTransport`, chamado no
   caminho de resume do `server.js`).
2. **Laço de sala sem `break`** (script 09): após `navigated = true` o `for` de
   tentativas continuava — 8 salas aceitas com partidas vivas simultâneas no staging
   (evidência: 8× "aceita na tentativa K/8" + 8× "B no alcance" + zero "rejeitada").
   **Fix (script)**: `if (navigated) break;`.
3. **`drain()` sem teto** (script 09, Fase 3): a bomba de input por cliente
   (`client.hold`, 20 Hz) realimenta a fila de subida do link degradado — com RTT
   sintético a fila nunca esvazia e `await linkA3.drain()` pendurava a fase
   (evidência: servidor completou o canal no tick 1519; script sem progresso até o
   timeout global). **Fix (script)**: `Promise.race([drain, sleep(2_500)])` — o
   intent (assentar quadros atrasados) é preservado; a convergência é provada
   pelas asserções seguintes.

Validação local: selftest 08 PASS + 09 Fases 1/2/3 PASS + `MPZEX_STAGING_SELFTEST_OK`
(exit 0); 24/24 nos testes sensíveis (zu-train-protocol, world-survival-load,
environmental-death).
