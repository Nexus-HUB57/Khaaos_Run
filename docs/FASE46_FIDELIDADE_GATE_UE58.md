# Fase 46 — Portão de Fidelidade no pipeline UE5.8 + painel Command Monitor

> Continuação direta da **Fase 44** (`FASE44_AUDITORIA_FIDELIDADE.md`): o
> instrumento de auditoria Mundos ↔ README deixa de ser só um step de CI e
> passa a ser **barreira em três pontos** — CI, preflight de UE5.8 e painel
> `/admin` ao vivo.

## Por que existe (a motivação arquitetural)

O pipeline UE5.8 **consome a geometria do runtime Three.js**:
`export_barburhen_obj.py` → `Barburhen_Map.obj` → `bake_barburhen_colliders.py`
→ `import_barburhen_map.py` → engine. Se os mundos do runtime derivarem do
README (setor renomeado, dressing abaixo do mínimo, dinâmica vazada), essa
deriva é **cozida no build da engine** — e nenhum teste de runtime a pega
depois, porque o OBJ já foi gerado.

Conclusão: a auditoria F44 precisa rodar **ANTES do export**, como portão do
preflight — o workflow que roda em toda PR que toca a geometria canônica.

## O que a fase entrega

### 1. `game-runtime/scripts/fidelity-snapshot.mjs` — a lib do portão

O pipeline do CLI F44 virou módulo importável e puro de efeitos colaterais
(não escreve artifacts, não imprime — isso é do chamador):

- `runFidelitySnapshot({ repoRoot?, runtimeRoot?, readmeText?, simSource?, docs? })`
  → `{ ok, summary, checks, meta }` com
  `meta = { ranAt, durationMs, worlds, dressingCounts, sceneCounts }`;
- stub de canvas instalado de forma idempotente (só se não houver `document`);
- imports LAZY dos módulos game3d — carregar a lib não puxa `three.js` para o
  processo (só a primeira auditoria).

O CLI `audit-fidelity.mjs` virou **wrapper fino**: roda o snapshot, escreve
`artifacts/audit-fidelity.{json,md}` e sai com code 1 em deriva (contrato CI
inalterado — ci.yml e verify-all continuam idênticos).

### 2. Portão no `ue5-preflight.yml`

- step **"Fidelity gate — Mundos ↔ README (F44/F46)"** — primeiro passo depois
  do checkout/setup-node, **antes do guard UE1021 e do export OBJ**:
  `cd game-runtime && npm ci && npm run audit:fidelity`;
- paths de gatilho ampliados (nos DOIS blocos, `pull_request` e `push`):
  `README.md` (a fonte do cânon mudou ⇒ re-certifica) +
  `game-runtime/scripts/fidelity-{audit-lib,snapshot,audit*}.mjs` +
  `game-runtime/src/game3d/{scenarios,world3d,districts3d}.js` (as fontes da
  geometria canônica consumida pelo pipeline UE);
- Summary do workflow ganhou a linha
  `| Fidelidade Mundos ↔ README (F44) | ✅ FIEL / ❌ DERIVA |`.

Resultado: auditoria falha ⇒ OBJ nunca é gerado ⇒ engine nunca cozinha deriva.

### 3. Painel — `GET /admin/ue58/fidelity` + seção no Command Monitor

- rota nova no servidor autoritativo (`server/server.js`), guard
  `admin:metrics`, trilha `audit.record` com outcome `allow` (FIEL) / `deny`
  (deriva — veredito registrado na auditoria administrativa);
- **cache TTL de 30 s**: o snapshot constrói as 5 cenas (~2 s) — martelo no
  botão serve a última auditoria (`cached: true, cacheAgeMs`); falha do runner
  NÃO popula o cache (próxima chamada re-tenta ao vivo);
- runner **injetável** (`ue58.fidelityRunner`) para testes; default importa o
  snapshot de forma lazy;
- `admin.html` ganhou a seção **"FIDELIDADE DOS MUNDOS ↔ README (F44)"** com
  botão **RODAR AUDITORIA** — mostra veredito grande (FIEL ✅ / DISCREPÂNCIAS ❌)
  e a tabela dos 53 checks (check/mundo/verificação/status/detalhe), com
  falhas destacadas em vermelho.

### 4. Suíte de proteção do portão (`test/fidelity-gate.test.js`, 9 testes)

- **lib**: snapshot REAL do repo 100% FIEL (≥50 checks, meta com os 5 mundos,
  mínimos Free Fire intactos — skeleton/quicksand/sharkfin) + render legível;
- **rota E2E** (servidor real, DI de stub): 200 com report do runner; segunda
  chamada serve CACHE com o runner chamado 1×; token errado → 403 sem
  disparar auditoria; runner que lança → 502 estruturado e falha NÃO popula o
  cache; deriva real (fail>0) → 200 com `ok:false` — veredito honesto, não
  erro HTTP;
- **wire anti-drift**: `ue5-preflight.yml` tem o step do portão ANTES do
  export (ordem verificada), paths cobrem README + fontes nos DOIS blocos,
  Summary tem a linha do veredito;
- **CLI wrapper**: consome a lib compartilhada (sem pipeline duplicado que
  possa divergir) e a lib não importa o CLI (sem ciclo).

## Bug pescado no caminho

- `ReferenceError: admin is not defined` — a rota nova usava o estilo
  one-liner do guard (`if (!guardHttp(...)) return;`) mas referenciava
  `admin?.username` no `audit.record`; o catch externo do handler engolia o
  erro como 400 `bad_request`. Diagnóstico por instrumentação temporária do
  catch; fix: capturar o actor (`const admin = guardHttp(...)`) como nas rotas
  POST da Fase 39.

## Estado

- Suíte: game-runtime **1024 — 1011 pass / 0 fail / 13 skipped** (+9 líquidos
  F46); tsc 0; vite build OK; `npm run audit:fidelity` → **FIEL ✅ 53 checks /
  0 falhas** (snapshot ~1,9 s); version **0.26.0**.
- Painel: a seção de fidelidade usa o mesmo `ADMIN_TOKEN` das demais rotas —
  o veredito ao vivo está a um clique do operador.
