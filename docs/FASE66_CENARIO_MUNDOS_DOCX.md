# F66 — Cenário dos Mundos 1:1 com o DOCX de referência (end to end)

**Data:** 2026-11-28 · **Branch:** `feat/f66-mundos-cenario-docx` · **Benchmark de realismo:** Free Fire / Call of Duty

A sessão partiu do DOCX de referência oficial dos Mundos ("Khaaos Ville — Ref. Mundos") e fechou as
lacunas entre o que o documento descreve e o que o RUNTIME 3D materializa. A F48/T74 já havia
entregado fauna de carniça (abutre/chacal/ave carnicenta), chalés/barris W4 e o Pátio holográfico
do CIGKV; esta fase fecha o que ainda faltava **item por item do DOCX**.

## Matriz DOCX → RUNTIME (o que faltava e foi fechado nesta fase)

| Mundo | DOCX de referência | Runtime antes | F66 (agora) |
|---|---|---|---|
| **W1 Barburhen** | "a floresta tomando a cidade, **musgo e gramas por todos os lados**, pouco concreto, pouco asfalto" | cinza de cinzas sem vegetação | `moss` (discos de musgo com falhas de concreto, raio 3.4–5.4) + `grasstuft` (tufos nas rachaduras) — 10 musgos + 16 tufos por mapa |
| **W1 Parque Abandonado** | "**Coreto central**, **lago seco**, caminhos em cruz, árvores mortas, **bancos quebrados**" | só árvores mortas/entulho | `gazebo` (base octogonal com musgo, 6 colunas, 1 tombada, cúpula) + `drylake` (bacia de barro rachado, grietas radiais) + `brokenbench` (ripa estourada, perna arrancada, musgo no assento) |
| **W1–W3 corpos** | W1 "corpos que apodrecem... não despawnam"; W2 "corpos apodrecendo em meio às folhagens"; W3 "os caídos são alimento dos abutres" | nada | `rotcorpse` — torso caído com crânio/braço expostos + trepadeiras; mesh estático de lore em W1 (urbano+extração), W2 (pantanosa/bosque/caça) e W3 (Cemitério de Areia) |
| **W2 Priadus** | "O mundo deve ter um **lago**, onde deve haver **pontes em deterioração**, com **pequenas ilhas espalhadas**" | só poças (waterpool) | `lake` (espelho d'água r 5.5–7.5, mesma água do pântano) + **3 ilhotas DENTRO do espelho** (montículo + mangue anão + capim) + **2 pontes NA borda** (verga cedida, pranchas faltando, guarda-corpo torto) — âncoras canônicas ao lago, não espalhadas |
| **W2 fauna** | "**Abutres, Chacais** e Corpos Apodrecendo" | só jacarés/mosquitos | térmico de abutres (W1/W3 já tinham) sobre lago/pantanosa + matilha de chacais no Bosque/Caça |
| **W3 Ckesalth** | "fumaça tóxica" na refinaria; horizonte "**apenas deserto** e palmeiras caídas" (resort **sem montanhas e sem mar ao fundo**) | refinaria sem fumaça; 4 planos de cordilheira no skyline | `smokecolumn` na refinaria (emitter real F33) + **cordilheira de fundo REMOVIDA de Ckesalth** (world3d buildMountains gated por cânon; os demais mundos mantêm o skyline) |
| **W4 Arukheea** | prisão ameaçadora: "mais **arames farpados**, **cercas em curto circuito e faíscas**"; "fábrica... com **chaminé fumegante**" | prisão sem cercas; chaminé com voluta estática | `barbwire` (2 postes tortos enferrujados, 3 fios com farpes, ponta emissiva) + **faíscas reais** (emitter de partículas) + fumaça REAL na boca da chaminé da fábrica (voluta estática removida) |
| **CIGKV** | "**Vila abandonada de Casas dos oficiais**" | quartéis/tendas apenas | `officerhouse` ×4 no Urbano Denso — casa térrea com telhado de duas águas, janelas escurecidas com ripas tortas, porta entreaberta, banda de musgo; variante com telhado colapsado |
| **Fauna canônica** | lista oficial "Animais do Jogo": abutre, **CACHORRO**, chacal, rato, crocodilo, tubarão, gaivota | cachorro ausente | `dog` — vira-lata raivoso (orelhas caídas, pelo malhado, cauda baixa), territorial e ousado (boldness .58 > chacal .42), cabeça erguida rastreando + IA territorial em faunaAI3d |

## Arquivos

- `game-runtime/src/game3d/textures3d.js` — `mossMaterial` + `dryLakeMaterial` (canvas procedural, PRNG estável)
- `game-runtime/src/game3d/districts3d.js` — KITS por mundo, 8 builders novos (`gazebo`, `brokenbench`, `grasstuft`, `officerhouse`, `brokenbridge`, `isle`, `rotcorpse`, `barbwire`), 3 patches novos (`moss`, `drylake`, `lake`), emitters (faíscas da cerca + fumaça da chaminé), bloco canônico de âncoras do lago (Priadus), `im.name = patch-*` para auditoria
- `game-runtime/src/game3d/fauna3d.js` — `FAUNA_PLAN` (dog W1; vulture+jackal W2), `buildDog`, animator do cão
- `game-runtime/src/game3d/faunaAI3d.js` — profile `dog` (territorial)
- `game-runtime/src/game3d/world3d.js` — skyline de montanhas gated por cânon (Ckesalth sem cordilheira; planos nomeados `skyline-mountain`)
- `game-runtime/test/mundos-detalhes.test.js` — +5 testes F66 (presença, exclusividade com donos múltiplos, âncoras do lago, determinismo, skyline)
- `game-runtime/test/fauna3d.test.js` — cão W1 + abutre/chacal W2 com contra-exclusividade

## Garantias mantidas (contratos pré-existentes intactos)

- **Determinismo** por seed (byte-idêntico) — o bloco do lago usa o mesmo SeededRng
- **Zero impacto em gameplay** — nenhum collider novo; itens respeitam praça/loot/estradas/colliders
- **Exclusividade por mundo** — os tipos novos não vazam para mundos que não os citam
- **Draw-call budget (T70)** — patches são InstancedMesh (1 draw call por tipo); tufos são props pequenos culled a 110 m

## Validação

- **Suíte game-runtime completa:** 1359 testes — 1346 pass / 0 fail / 13 skip (adapters de DB, só CI)
- **Testes F66 novos:** 5 (presença DOCX, exclusividade, âncoras do lago, determinismo, skyline W3)
- **tsc:** 0 erros · **build root:** OK
- **E2E visual headless** (vite 5199 + Playwright swiftshader + `canvas.toDataURL`, 11 capturas dirigidas por bbox — `download/f66-evidencias/`):
  - W1: coreto com musgo, banco quebrado com assento musgoso, corpo apodrecendo, cão raivoso em passeio
  - W2: lago com 2 pontes deterioradas na margem + ilhotas com mangue anão dentro do espelho; abutre em térmico
  - CIGKV: casa dos oficiais com telhado de duas águas e musgo na base
  - W3: horizonte de deserto puro (sem cordilheira) com a refinaria
  - W4: cerca farpada com ponta em curto + fábrica de óleo (emitter da chaminé registrado)
- Nota honesta: a fumaça da chaminé usa a gramática de emitters F33 (partículas compartilhadas); em still headless a leitura é fraca — o emitter está registrado e os testes de partículas da gramática seguem verdes no navegador real (E2E F26–F43).

## Pendências fora do escopo desta fase

- Deploy em staging/produção após merge (MP: sem partidas ativas durante deploy)
- Safe areas por hazard (chuva ácida/tsunami/areia movediça) como mecânica — hoje são visuais de cânon + punição na sim
