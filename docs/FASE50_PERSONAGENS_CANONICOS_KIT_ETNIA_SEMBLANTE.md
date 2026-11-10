# Fase 50 — Personagens Canônicos: Kit de Construção Étnica e Semblante (referência CoD)

## Problema

O gráfico dos mundos avançou (F41 perfis de luz, F49 bioma/molas), mas os avatares seguiam
"robóticos": crânio de esfera genérica com rosto PINTADO (olhos/sobrancelhas/boca eram
tinta em calota), cabeça grande (~5,6 cabeças de altura — leitura chibi/manequim) e
geometria idêntica para os 33 operativos — a etnia canônica do catálogo
(`Content/Avatars/avatar_catalog.json`, 25+ etnias documentadas) só existia como COR de
pele, nunca como SEMELHANTE.

## Solução — `src/game3d/heads3d.js` (kit de construção canônica)

1. **Crânio ESCULPIDO por etnia** (`sculptSkullGeo`): esfera unitária (14×11) com
   deslocamento por vértice — arco superciliar (glabella), zigomático (maçãs),
   afundamento sub-malar, taper mandibular, mento projetado e achatamento facial.
   8 famílias (`ETHNIC_SCULPT`): afro, europeu, asiatico, arabe (aquiline), indigena,
   polinesio, sulasiatico, pardo — com dimorfismo por gênero (brow/jaw/chin vs lips/cheek).
2. **Semblante em geometria 3D**: olhos completos (esclera + íris cor do catálogo +
   pupila em disco + pálpebra superior com PISCAR real), sobrancelhas (hairM, arco com
   medial baixa), nariz (ponte + dorso + asas com `nostrilFlare`), lábios com volume
   (`lipFull` por etnia/gênero) + linha da boca, orelhas, pescoço/trapézio.
3. **Cabelo por estilo canônico**: buzz / straight / curly (6 cachos determinísticos) /
   long (nuca + mechas) / longUnder (sob capacete) / shaved (Talon — moicano F7 manda);
   **barba** por viés de família (`beardBias`: árabe .72 > sulasiático .62 > europeu .50
   … indígena .18), nunca no Talon.
4. **Proporção ~8 cabeças**: crânio r .105/.108 (antes .125) — fim da leitura robótica.
5. **Cânone por operativo** (`CANON` tabela congelada, 33 ids espelhando o catálogo +
   `resolveEthnicity` com fallback determinístico por hash para bots/OCE):
   ex. BREACHER→europeu loiro de barba platina, MEDIC_AFRICAN→afro buzz,
   RECON_ASIAN→asiatico liso sem barba, MARKSMAN_MENA→árabe aquilino com barba,
   VALKYRIE→afro feminina de cabelo longo.
6. **Rig facial v2** (API F12 preservada: `FACIAL_EXPRESSIONS`/`FACE_JAW`/`set/reset`):
   mandíbula F12 intacta + NOVO movimento geométrico de sobrancelhas (dor ergue medial,
   grito ergue tudo, morte cai), pálpebras (blink/pain/death/knocked) e lábios
   (grito abre); o patch de complexão troca map por expressão — **`complexionTexture`**
   nova em textures3d (sombreamento do complexão SEM traços pintados + rubor de dor,
   palidez de morte, hematomas de DBNO) — teste facial-blendshapes permanece verde.
7. **Capacete re-projetado**: casco = calota aberta (só a abóbada) — a esfera fechada
   antiga engolia o rosto; aba, banda de óculos, jugular (x ±.095), trilhos e NVG
   assentam no crânio novo; boina idem. Acessórios F7 (bandana/máscara/lanterna/antena)
   re-ancorados no crânio esculpido; âncora do rabo F49 na nuca atualizada (.168→.142).
8. **Drop-in total**: mesmos pivôs (quadril .84, tronco 1.22, cabeça 1.68), mesma API
   de parts, cânone exposto em `head.userData.canon`; orçamento ≤6500 tris/ator mantido
   (re-corte de segmentos: crânio 14×11, patch 10×7, orelhas sem concha, mechas 3×2…).

## Vitrine f50 — ferramenta de inspeção (`scripts/f50-showcase.html`)

Alinhamento canônico de 8 operativos (uma por família + 2 gêneros, cores do catálogo),
câmeras ALINHAMENTO/CABEÇA/PERFIL 3/4, expressões do rig ao vivo
(NEUTRO/PISCAR/DOR/GRITO/MORTE), regimes parado/andar/correr, biomas/luz F41/F49,
luz-chave frontal de character-viewer, readout com etnia esculpida/estilo/barba/
métricas da sculpt/tris; `window.__f50.shot` para evidências.

## Validação

- **+7 testes novos** (`test/character-canon.test.js`): 33 ids mapeados, mapping canônico
  correto + determinismo, sculpt DISTINTA por etnia (≥50 vértices divergentes afro×
  europeu×asiatico + memo + dimorfismo), semblante 3D completo (esferas/círculos/caixas,
  crânio .19–.26 m, volumes acoplados, íris em -z), drop-in com pivôs/API/orçamento
  (4 variantes + bot ≤6500), estilos de cabelo/barba (curly ≥7, Talon 0, long ≥4,
  vieses de barba), animação sem NaN com o rig novo.
- **Contratos atualizados com o cânone**: realism-f41 (jugular x ±.095/y −.048 no
  crânio novo — contrato F28 de `baseHeadGear` preservado).
- **Suíte de personagem**: 89/89 verdes (character-canon, character-realism,
  realism-f41, facial-blendshapes, f49-terreno-bioma-cabelo-capa, character-lod,
  character-lod2-silhouette, character-hit-reaction). Suíte total 1009 testes: falhas
  remanescentes = infra pré-existente (pg/redis/WS ausentes no sandbox — base idêntica
  sem as mudanças).
- **vite build OK** (7.3 s) · browser real: alinhamento de 8 etnias + closes
  (europeu loiro de barba platina, pardo de barba cheia e cabelo cacheado, asiático de
  zigoma largo sem barba, afro feminina de lábios plenos e olhos violeta) + expressões
  dor/grito ao vivo + IN-GAME w4 TPS com o jogador de proporção ~8 cabeças.

## Evidências (`game-runtime/artifacts/`)

- `f50-alinhamento-canonical.png` — 8 operativos, readout do cânone (6340 tris)
- `f50-cabeca-europeu-draxen.png` — Eslavo: pele #ffdbac, íris ciano, barba platina
- `f50-cabeca-pardo-khael.png` — Afro-Latino: pele #8d5524, curly, barba cheia, olhos âmbar
- `f50-cabeca-asiatico-ren.png` — Japonês: zigoma 1.24, nariz baixo, liso, sem barba
- `f50-cabeca-afro-f-nyra.png` — Afro-Brasileira: lábios 1.55, olhos violeta, mechas longas
- `f50-expressao-dor-nyra.png` / `f50-expressao-grito-nyra.png` — rig facial v2 ao vivo
- `f50-ingame-w4-tps.png` / `f50-ingame-close-khael.png` / `f50-ingame-34-khael.png` — drop-in no jogo real

## Estado

- Base: `16d1b35` (rebase sobre o test: expand HUD/network coverage dos paralelos)
- game-runtime: personagem 89/89 · build OK · bloqueios humanos inalterados
  (0 self-hosted runners; EOS_*/UE_CONTAINER_PAT; credenciais Stripe test; MP-ZEX-08/09/10/11)
