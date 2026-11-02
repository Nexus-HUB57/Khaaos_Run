# Fase 44 — Auditoria Executável de Fidelidade (Mundos ↔ README)

> Diretiva: **"Validar e atualizar o repo criando auditoria para erradicar erros
> e discrepâncias que não estão sincronizados com os gráficos e cenários de
> qualidade Free Fire/Garena."** A F42 materializou os Mundos 1:1 com o README e
> a F43 trouxe os detalhes de cenário; a F44 cria o INSTRUMENTO que impede a
> deriva de voltar — e o próprio instrumento tem contrato de teste.

## O que é

`game-runtime/scripts/fidelity-audit-lib.mjs` + `game-runtime/scripts/audit-fidelity.mjs`
(`npm run audit:fidelity`):

1. **Lê o README AO VIVO** (fonte única da verdade) e extrai o cânon dos cinco
   Mundos: setores (tabelas com frações), dinâmica ambiental, alvo do fecho de
   anel e substantivos de cenário;
2. **Constrói cada Mundo headless** (`buildScene` — o MESMO caminho do jogo) e
   conta o dressing REAL: `districtDressing` (placements puros) + grupos
   nomeados na cena (`sharkfin` nos worldmarks, `oilfire` nos oilpools);
3. **Cruza tudo** com `SCENARIOS`, perfis de luz F41, o gate da chuva ácida no
   sim e as matrizes F42/F43;
4. **Escreve** `artifacts/audit-fidelity.{json,md}` e sai com **exit code 1**
   se houver QUALQUER discrepância (CI vermelha até erradicada).

## As 8 classes de check

| ID | Classe | O que pega |
|---|---|---|
| `S1` | Setores README → runtime | setor canônico renomeado/removido no runtime |
| `S2` | Setores runtime → README | setor inventado sem âncora (README ou matriz F42) |
| `D1`/`D1a`/`D1b` | Dinâmica | dinâmica divergente do README; chuva ácida fora do gate no sim; survival.type errado |
| `D2` | Exclusividade | dinâmica vazando para outro mundo (ex.: tsunami no Priadus) |
| `R1` | Fecho de anel | anel fechando em setor divergente do README |
| `B1`/`B2` | Dressing Free Fire | builders canônicos abaixo da densidade (skeleton/collapse/carnplant/mist/oilpool+oilfire/quicksand/prisonwall/lighthouse/sharkfin…) |
| `Q1`/`Q2` | Qualidade visual | mundo sem perfil de luz dedicado (F41) ou paleta incompleta |
| `X1`/`X2` | Não-cânon | erupção de lava como dinâmica; typo regressivo "Khaoos" |
| `DOC-F42`/`DOC-F43` | Documentação | matriz de auditoria ausente ou fora do escopo |

## Modelo de alias (nada escondido)

O README dimensiona os setores de formas que o runtime nomeia diferente — o
mapeamento é EXPLÍCITO na lib (`sectorAliases`), espelhando a matriz F42:

- linhas de extração (estação ferroviária/matadouro/expedição/heliporto) →
  `Terminal ZEX` obrigatório; W1 também mantém o nome literal "Zona de
  Extração" como opcional;
- CIGKV "Setor de Testes (Proving Grounds)" → `Proving Grounds` obrigatório +
  `Urbano Denso` opcional (função da linha: "Urbano denso, prédios
  destrutíveis, túneis");
- W2 "Área de Caça + Templo Antigo" → dois setores obrigatórios no runtime;
- setores "Plus" com decisão registrada na matriz F42 (tabela nova "Setores
  Plus do runtime"): **Areia Movediça** (W3) e **Marina Fantasma** (W4).

## Auditoria da auditoria (auto-verificação)

`game-runtime/test/fidelity-audit.test.js` (9 testes): além de provar que o
repo REAL está 100% FIEL, corrompe ENTRADAS e exige que o check ESPECÍFICO
quebre — setor renomeado, README evoluindo sozinho (novo setor na tabela),
dinâmica vazada, typo regressivo, anel deslocado, dressing abaixo do mínimo,
mundo sem perfil de luz — cada classe de deriva tem um teste que quebra se a
auditoria for "afrouxada".

## Bugs pescados no instrumento (validação empírica)

- regex do cabeçalho `/^\|\s*Setor\b/` casava com a linha de dados
  `| Setor Industrial (desembarque) |` (word boundary depois de "Setor") — o
  setor inteiro virava "cabeçalho" e sumia do cânon; fix: `^\|\s*Setor\s*\|`;
- `indexOf('## ')` casava DENTRO de `### ` (offset +1 de '###' contém '## ') e
  cortava a seção do CIGKV no primeiro subtítulo — sem tabela e sem dinâmica;
  fix: heading line-anchored (`/^## /m`);
- W2 "Área de Caça + Templo Antigo" era testada com worldKey 'PRIADUS' (nunca
  'W2') — o split canônico nunca rodava;
- perfil de luz do CIGKV é o MESMO OBJETO do default (`BASELINE_CIGKV`) —
  comparar identidade de objeto dava falso negativo; fix: checar a CHAVE em
  `LIGHTING_PROFILES`.

## Wire

- `game-runtime`: `npm run audit:fidelity` (script novo);
- CI (`ci.yml`): step **"Auditoria de fidelidade Mundos ↔ README (F44)"**
  logo após o install das deps do runtime;
- `scripts/verify-all.mjs`: check **"Runtime · auditoria de fidelidade Mundos ↔
  README"** no fecho end-to-end local;
- **Fase 46** adicionou o terceiro e o quarto ponto de barreira: portão no
  `ue5-preflight.yml` (ANTES do export OBJ — geometria derivada nunca é cozida
  na engine) e veredito AO VIVO no painel `GET /admin/ue58/fidelity` — ver
  `FASE46_FIDELIDADE_GATE_UE58.md`.

## Estado da auditoria no merge

**FIEL ✅ — 53 checks / 0 falhas** (5 mundos × S/D/R/B/Q + globais X/DOC).
Relatório versionado em `artifacts/audit-fidelity.{json,md}` a cada execução.

## Suíte

game-runtime 1011 — 998 pass / 0 fail / 13 skipped (+9 líquidos F44: 1 fidelidade
corrente + 8 de drift/render); tsc 0; vite build OK; version 0.25.0.
