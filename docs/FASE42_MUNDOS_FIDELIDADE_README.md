# Fase 42 — Mundos fiéis ao README (auditoria de fidelidade 100%)

> Diretiva: **"Revisar Mundos e garantir a fidelidade 100% dos cenários e gráficos
> realistas com o README"**. Este documento é a matriz de auditoria mundo × item
> do README × status, com o que foi corrigido e o que ficou documentado como
> desvio honesto (conteúdo de UE5 / mecânicas de fauna).

## Escala de tempo

O README dimensiona os Rings para o lançamento UE5.8 (CIGKV 3 h, pulsos a cada
10 min). O runtime 3D comprime a partida em `MATCH_TIME = 600 s` — as dinâmicas
ambientais mantêm a PERIODICIDADE RELATIVA e os limiares pinados das Fases
17–30 (anomalia 120 s / tsunami 180 s / fumaça 140 s / esporos 150 s).

## Matriz de auditoria (após a Fase 42)

| Mundo | README (canônico) | Runtime 3D | Status |
|---|---|---|---|
| **CIGKV** | Khaaos Ville — Campo de Instrução; setores Pátio de Armamento / Setor de Testes (Proving Grounds) / Parque Abandonado / 15 ZEX; **Pulso Khaaos** a cada intervalo | mapLabel `Khaaos Ville` (typo 'Khaoos' corrigido); setores idem + 'Urbano Denso' (leitura do "urbano denso" do Proving Grounds) + Terminal ZEX central; **PULSO KHAAOS = KHAOS_GRAVITY** (4 pilões NEXUS/NORTH/EAST/WEST, dreno que fura blindagem — herança F29/F30 preservada 1:1) | ✅ |
| **W1 Barburhen** | "Água da Morte" — anel fecha em direção ao Parque; **chuva ácida**; setores Área Urbana e Comercial / Setor Industrial / Parque Abandonado / ZEX (estação ferroviária) | `acidRain` id-gated (−1 hp/10 s) ✅; **ringFinal → Parque Abandonado (−100,95)**; setor 0 renomeado para 'Área Urbana e Comercial'; **trilhos novos** no setor da estação (dressing, zero collider); carros queimados/entulho/fumaça/crateras (F31) | ✅ |
| **W2 Priadus** | "Emboscada Verde" — anel fecha **no templo**; **neblina com esporos tóxicos** pune atraso | **SPORE_FOG novo**: teto de esporos sobe até 90 m (7 dps, fura blindagem); **ringFinal → Templo Antigo (100,95)**; FX (teto verde + motes) / áudio (sopro de selva + zumbido) / banner NEBLINA TÓXICA / maré verde no oceano-anel; tsunami (não canônico aqui) migrou p/ W4 | ✅ |
| **W3 Ckesalth** | "Assassino Silencioso" — anel fecha **na Vila Sombria** sob **fumaça tóxica**; lagoas de petróleo em chamas; areia movediça | **TOXIC_SMOKE novo**: fumaça sobe até 180 m (9 dps, fura blindagem); **ringFinal → Vila Sombria (95,−95)**; FX (teto cinza + colunas) / áudio (sub abafado + crepitar) / banner FUMAÇA TÓXICA; setor 3 = 'Areia Movediça' (Plus− do README); lagoas de óleo/lavapatches seguem como CENÁRIO (a erupção de lava periódica saiu — não é cânon) | ✅ |
| **W4 Arukheea** | "Tsunami" — anel fecha **na Prisão**; quem não sobe vira "grito calado"; heliporto da torre | **TSUNAMI_WAVE** (herdada da F17, FX/áudio/diretor intactos) + **ringFinal → Prisão do Sol da Noite (95,−95)**; mapLabel `Ilha dos Gritos Calados`; setor 2 = 'Fábrica / Cemitério das Baleias'; farol (luz perpétua) e naufrágios já canônicos | ✅ |

## O que migrou (e por quê)

| Mecânica | Antes | Depois | Motivo |
|---|---|---|---|
| `KHAOS_GRAVITY` (anomalia) | Arukheea | **CIGKV (Pulso Khaaos)** | README: o Pulso é dinâmica do Protocolo CIGKV; Arukheea canônico é Tsunami. Números/pilões/ANOMALIA preservados bit a bit (F29/F30 intocados, só re-ancorados) |
| `TSUNAMI_WAVE` | Priadus | **Arukheea** | README W4 = Tsunami; implementação/FX/áudio reutilizados sem mudança |
| `VOLCANIC_LAVA` (erupção) | Ckesalth | **removida** | Não existe no README; as lagoas em chamas seguem como cenário estático (dressing). FX/áudio/vocabulário 'lava'/'eruption' limpos do código |
| `SPORE_FOG` / `TOXIC_SMOKE` | — | **novos (W2/W3)** | Dinâmicas canônicas faltantes, mesma gramática dos mantos ambientais (teto + dps que fura blindagem + refúgio no alto) |

## Fecho de anel canônico (`ringFinal`)

Novo campo por cenário: o CENTRO do anel deriva em passos determinísticos
(25% do caminho por pulso; 100% no 4º pulso) até o setor onde o README diz que
o Ring fecha. Paridade 1:1 sim offline ↔ MatchRoom3D; o evento `pulse` agora
carrega `finalName` e o HUD anuncia o destino ("O anel fecha em direção ao
Templo Antigo"). CIGKV não desvia (protocolo de praça central).

## Desvios documentados (não cabem no runtime 3D)

- **Jacarés (W2) / tubarões (W4) / flora carnívora (W2)** — fauna com IA: conteúdo de engine (UE5.8), fora do escopo do runtime procedural;
- **Areia movediça (W3) como mecânica de terreno** — o setor existe (nome + dunas); a mecânica de afundamento é conteúdo UE5;
- **Corpos que não desaparecem (W1)** — satisfeito no runtime pelas caixas de morte persistentes na partida (F28) + decals; corpos em decomposição são conteúdo UE5;
- **Heliporto da torre (W4)** — a extração é o Terminal ZEX central (protocolo ZEX); a marcação visual do helipad na praça exigiria abrir exceção na doutrina "praça limpa" da F22 (dressings fora da praça) — marcado como follow-up de decal no cook UE5;
- **Pilões de Arukheea** — permanecem como arquitetura quântica da prisão (posição canônica congelada), mesmo com a anomalia morando no CIGKV.

## Contrato de teste

- `test/mundos-fidelidade.test.js` (10): rótulos/mapLabels, setores, dinâmica por mundo, ringFinal em distrito real, deriva determinística do anel, esporos/fumaça ponta a ponta, Pulso Khaaos com morte direta (F30), paridade autoritativa (sala), lava fora do vocabulário;
- Re-âncoras honestas: `environmental-death` (Arukheea→CIGKV, mecânica idêntica), `world-survival-load` (fumaça/pulso/tsunami nos mundos canônicos), `priadus` (esporos), `survival-fx`/`survival-audio`/`spectator-hazard`/`spectator-damage-numbers` (vocabulário spore/smoke), `worldmarks` (maré verde/tingir tocha), contratos "SCENARIOS" das Fases 22–25 atualizados ao cânon F42;
- Suíte: **991 testes — 978 pass / 0 fail / 13 skipped**; tsc 0; vite build OK.
