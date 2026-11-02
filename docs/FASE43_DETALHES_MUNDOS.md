# Fase 43 — Detalhes fiéis aos Mundos (dressing nível Free Fire)

> Diretiva: **"Prosseguir desenvolvimento dos mundos com gráficos realistas nível
> Free Fire, com detalhes 100% fiéis às descrições de cada um dos Mundos"**.
> A Fase 42 garantiu as DINÂMICAS canônicas 1:1 com o README; esta fase traz os
> DETALHES de cenário que o README cita e que faltavam no runtime 3D.

## Matriz README → runtime (F43)

| Mundo | README (canônico) | Detalhe F43 | Implementação |
|---|---|---|---|
| **W1 Barburhen** | "construções **inacabadas**" | `skeleton` | Esqueleto de concreto cru: 4 pilares + 2 lajes + **vergalhões expostos** no topo — 3 unidades nos distritos urbanos |
| **W1 Barburhen** | "**desabamentos**" | `collapse` | Laje tombada sobre pilha de entulho com vergalhão torcido — 2 unidades (Urbana + Parque) |
| **W2 Priadus** | "**flora carnívora**" | `carnplant` | Bulbo ácido aberto com 6 dentes inclinados para dentro + 3 tentáculos rasteiros, pulso bioluminescente — a FLORA é dressing estático (a fauna/jacarés segue conteúdo UE5, desvio documentado na F42) |
| **W2 Priadus** | "neblina **alucinógena**" | patch `mist` | Bancos de névoa rasteira translúcida que RESPIRAM (opacidade pulsa .15→.32) — atmosfera PERMANENTE do mundo, distinta do evento SPORE_FOG (o manto da Emboscada Verde) |
| **W3 Ckesalth** | "lagoas de petróleo **em chamas**" | fogo nos `oilpool` | Cada lagoa ganha 3 chamas reais tremulando (animator de flames) + fagulhas e fumaça fina no pool compartilhado de partículas |
| **W3 Ckesalth** | "**areia movediça**" | patch `quicksand` | Disco de solo molhado escuro com anéis concêntricos de afundamento no setor canônico (a mecânica de afundamento segue conteúdo UE5, desvio F42) |
| **W4 Arukheea** | "Ilha isolada... **tubarões**" | mar + `sharkfin` (WORLDMARKS) | **Anel oceânico** cinza-astral (190→360 m, mesma gramática do arquipélago de Priadus) + 3 barbatanas patrulhando em arco fechado no mar aberto (r 208–248, fora da área jogável) |

## Decisões de arquitetura

- **Tubarões nos WORLDMARKS, não no dressing**: a barbatana em terra lê quebrado.
  O README exige ilha → o mar é marca do horizonte (igual ao `priadus-water-ring`,
  isento do bounds test por definição). A arena permanece SECA — contrato de
  gameplay intocado (nenhum collider, loot ou estrada tocados).
- **Fauna sem IA**: os 3 tubarões seguem caminho analítico por `t` (determinístico,
  sem NaN, sempre na faixa do mar 200–255 m do centro) — mesma doutrina dos
  animators do dressing. A fauna com IA (jacarés/tubarões caçadores) segue
  documentada como conteúdo UE5.8.
- **Pulso bioluminescente ativado**: a F22 deixou `userData.pulse` no sporesac
  SEM consumidor; a F43 cria o animator de pulsos (sporesac + carnplant pulsam
  o emissiveIntensity) — promessa antiga da vitrine cumprida.
- **Fogo nas lagoas**: README literal "lagoas de petróleo EM CHAMAS" — o óleo
  negro espelhado (F31) agora queima: chamas + fagulhas + fumaça fina, mesmo
  orçamento do pool compartilhado (cap 12 emissores respeitado).

## Contrato de teste

- `test/mundos-detalhes.test.js` (9): presença por mundo, exclusividade cruzada,
  determinismo byte-idêntico, zero impacto (colliders/praça/loot), builds reais
  (skeleton/collapse com sombra, pulso vivo da carnplant, névoa que respira,
  oilfire 1:1 por lagoa + pool vivo, mar centrado + tubarões SEMPRE no mar
  200–255 m durante 60 s simulados), idempotência do registry.
- Re-âncoras honestas: `worldmarks.test.js` — assinaturas de Arukheea ganham
  `sea`/`sharks`; bounds test isenta `arukheea-sea-ring` (anel na origem, por
  definição — mesmo tratamento do `priadus-water-ring`).
- Suíte: **1000 testes — 987 pass / 0 fail / 13 skipped** (+9 líquidos F43);
  tsc 0; vite build OK; version 0.24.0.

## Evidência visual (browser real, vitrine `scripts/f43-showcase.html`)

- `artifacts/f43-validate-barburhen-skeleton.png` — colunas + lajes + vergalhões
- `artifacts/f43-validate-barburhen-collapse.png` — laje tombada junto ao Café ZEX
- `artifacts/f43-validate-priadus-carnplant.png` — bulbo ácido no passadiço
- `artifacts/f43-validate-ckesalth-oilfire.png` — óleo negro espelhado em chamas
- `artifacts/f43-validate-arukheea-sharkfin.png` — barbatana no mar, costa atrás
