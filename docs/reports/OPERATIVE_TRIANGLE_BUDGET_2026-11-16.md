# Auditoria de triângulos — operativos e loadouts (2026-11-16)

Gerado em 2026-11-16T15:28:57.852Z. O audit mede malhas dos factories reais Three.js, sem geometria simulada. **Teto de gameplay: 8,000 triângulos para a entidade third-person completa (corpo + gear + uma arma com anexos/skin/overlay).** O mesh Hero FBX isolado mantém subteto de 6,500; ele não substitui nem define o orçamento equipado.

## Escopo e método

- 33 identidades CANON; a contagem-base inclui corpo, cabeça/rosto, acessórios identitários e sombra de contato de createOperative().
- 5.280 combinações reais de corpo/gear (capacete-base ligado/desligado × níveis de colete, capacete dinâmico e mochila), aplicadas por applyOperativeGear(). A métrica runtime usa só meshes e materiais visíveis; storedTriangles também preserva geometria ocultada por substituição.
- 9.120 estados reais de arma entre as nove do catálogo, incluindo subconjuntos compatíveis de anexos, cinco tiers de raridade, skins e estágios míticos 0–4.
- A verificação equipada testa **47,520 casos**: cada um dos 5.280 estados de corpo/gear combinado com o estado de maior contagem medido para cada uma das nove armas. É uma envoltória conservadora da pior configuração por arma; não materializa os 48 milhões de pares redundantes com todos os estados de skin/raridade.
- Medimos separadamente cada peça de gear, cada anexo, os overlays míticos por estágio e draw calls. Custo de render considera index/position e drawRange; cada mesh/material group visível conta como draw call. Armas first-person e objetos de mundo estão fora do ator third-person.

## Resultado executivo

- **0 de 47,520 combinações equipadas excedem 8,000 triângulos.** Portanto, todos os estados catalogados passam pelo novo gate de triângulos.
- Pior entidade completa: **OP_MALE_VANGUARD**, body helmet off, vest Nv4, helmet Nv3, pack Nv0, com **m4** e estado `mira4x|silenciador|magestendida|gripvertical; rarity=COMUM; skin=COMUM; mythic=4`: **7,536 triângulos**, margem de **464**.
- A arma de maior custo é a **m4**: 852 triângulos. O estado máximo da M4 usa mira4x + silenciador + magestendida + gripvertical, raridade COMUM, skin COMUM e overlay mítico no estágio 4: 852 triângulos.
- O subteto de **6,500** aplica-se somente ao mesh Hero; não há conflito entre validar o FBX isolado e impor o teto de 8,000 ao ator completo depois de gear/arma.

## Consumo por operativo — cenário máximo já equipado

| Operativo | Base com capacete | Base sem capacete | Máx. corpo + gear | Máx. corpo + gear + arma | Margem até 8,000 | Cenários acima | Loadout completo máximo |
|---|---:|---:|---:|---:|---:|---:|---|
| OP_FEMALE_DISRUPTOR_MENA | 6,306 | 6,218 | 6,518 | 7,370 | +630 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_HEAVY_AFRICAN | 6,354 | 6,266 | 6,566 | 7,418 | +582 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_PILOT_EURO | 6,330 | 6,242 | 6,542 | 7,394 | +606 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_SNIPER | 6,282 | 6,194 | 6,494 | 7,346 | +654 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_STEALTH_ASIAN | 6,354 | 6,266 | 6,566 | 7,418 | +582 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_SURVIVOR_INDIGENOUS | 6,330 | 6,242 | 6,542 | 7,394 | +606 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_TACTICIAN_SOUTHASIAN | 6,306 | 6,218 | 6,518 | 7,370 | +630 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_FEMALE_VALKYRIE | 6,258 | 6,170 | 6,470 | 7,322 | +678 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_FEMALE_COTOVELA | 6,330 | 6,242 | 6,542 | 7,394 | +606 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_FEMALE_PIXEL | 6,258 | 6,170 | 6,470 | 7,322 | +678 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_FEMALE_ROTA | 6,354 | 6,266 | 6,566 | 7,418 | +582 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_FEMALE_SOMBRA | 6,246 | 6,158 | 6,458 | 7,310 | +690 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_MALE_BAILE | 6,256 | 6,292 | 6,592 | 7,444 | +556 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_MALE_CORTA | 6,396 | 6,300 | 6,600 | 7,452 | +548 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_GNG_MALE_SPRAY | 6,244 | 6,100 | 6,412 | 7,264 | +736 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_GNG_MALE_VENTANIA | 6,456 | 6,312 | 6,624 | 7,476 | +524 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_MALE_BERSERKER_PACIFIC | 6,384 | 6,240 | 6,552 | 7,404 | +596 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_MALE_BREACHER | 6,324 | 6,228 | 6,528 | 7,380 | +620 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MALE_HUNTER_INDIGENOUS | 6,304 | 6,208 | 6,508 | 7,360 | +640 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MALE_MARKSMAN_MENA | 6,396 | 6,300 | 6,600 | 7,452 | +548 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MALE_MEDIC_AFRICAN | 6,292 | 6,148 | 6,460 | 7,312 | +688 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_MALE_RECON_ASIAN | 6,268 | 6,172 | 6,472 | 7,324 | +676 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MALE_TALON | 6,344 | 6,200 | 6,512 | 7,364 | +636 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_MALE_TECH_INDIAN | 6,312 | 6,216 | 6,516 | 7,368 | +632 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MALE_VANGUARD | 6,348 | 6,384 | 6,684 | 7,536 | +464 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_FEMALE_CORUJA | 6,258 | 6,170 | 6,470 | 7,322 | +678 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_FEMALE_NOTA | 6,306 | 6,218 | 6,518 | 7,370 | +630 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_FEMALE_SIRENE | 6,270 | 6,182 | 6,482 | 7,334 | +666 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_FEMALE_SORO | 6,402 | 6,314 | 6,614 | 7,466 | +534 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_MALE_ECO | 6,244 | 6,148 | 6,448 | 7,300 | +700 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_MALE_FERRAZ | 6,384 | 6,240 | 6,552 | 7,404 | +596 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |
| OP_MIL_MALE_GRAU | 6,268 | 6,172 | 6,472 | 7,324 | +676 | 0/1440 | bodyHelmet=off, vest=4, helmet=3, pack=0, weapon=m4 |
| OP_MIL_MALE_VULTO | 6,384 | 6,240 | 6,552 | 7,404 | +596 | 0/1440 | bodyHelmet=on, vest=4, helmet=1, pack=0, weapon=m4 |

## Custo das peças de gear

Valores absolutos da malha gerada por buildGearMesh; níveis Nv2+ de capacete e Nv1+ de mochila substituem geometrias-base, portanto estes valores não devem ser somados cegamente ao corpo.

| Peça | Triângulos | Draw calls | Meshes |
|---|---:|---:|---:|
| helmet Nv3 | 276 | 6 | 6 |
| helmet Nv2 | 228 | 2 | 2 |
| vest Nv4 | 144 | 12 | 12 |
| pack Nv3 | 116 | 8 | 8 |
| vest Nv3 | 96 | 8 | 8 |
| pack Nv2 | 68 | 4 | 4 |
| vest Nv2 | 48 | 4 | 4 |
| helmet Nv1 | 24 | 2 | 2 |
| vest Nv1 | 12 | 1 | 1 |
| pack Nv1 | 12 | 1 | 1 |

## Custo máximo dos acessórios de arma

Pior tier por peça (COMUM inclui a geometria extra do desgaste). As contagens incluem o chip de raridade.

| Acessório | Tier mais pesado | Triângulos | Draw calls | Meshes |
|---|---|---:|---:|---:|
| silenciador | COMUM | 208 | 6 | 6 |
| mira4x | COMUM | 156 | 6 | 6 |
| gripvertical | COMUM | 84 | 7 | 7 |
| magestendida | COMUM | 72 | 6 | 6 |

### Overlay mítico isolado por estágio

| Estágio | Triângulos | Draw calls | Meshes |
|---:|---:|---:|---:|
| 1 | 12 | 1 | 1 |
| 2 | 48 | 4 | 4 |
| 3 | 152 | 7 | 7 |
| 4 | 176 | 9 | 9 |

## Armas — custo máximo observado

| Arma | Base (tri) | Máx. (tri) | Slots compatíveis | Combinações medidas | Máx. draw calls | Estado máximo |
|---|---:|---:|---:|---:|---:|---|
| ar47 | 132 | 840 | 4 | 2280 | 46 | mira4x, silenciador, magestendida, gripvertical; tier=COMUM; skin=COMUM; mythic=4 |
| barrett | 120 | 672 | 3 | 1080 | 39 | silenciador, magestendida, gripvertical; tier=COMUM; skin=COMUM; mythic=4 |
| g19 | 84 | 708 | 3 | 1080 | 35 | mira4x, silenciador, magestendida; tier=COMUM; skin=COMUM; mythic=4 |
| lmg | 132 | 320 | 0 | 30 | 21 | —; tier=—; skin=COMUM; mythic=4 |
| m4 | 144 | 852 | 4 | 2280 | 47 | mira4x, silenciador, magestendida, gripvertical; tier=COMUM; skin=COMUM; mythic=4 |
| mp5 | 96 | 804 | 4 | 2280 | 43 | mira4x, silenciador, magestendida, gripvertical; tier=COMUM; skin=COMUM; mythic=4 |
| pulse | 96 | 284 | 0 | 30 | 18 | —; tier=—; skin=COMUM; mythic=4 |
| shotgun | 96 | 284 | 0 | 30 | 18 | —; tier=—; skin=COMUM; mythic=4 |
| sucata | 60 | 248 | 0 | 30 | 15 | —; tier=—; skin=COMUM; mythic=4 |

## Priorização de otimização

**P0 — arma e VFX que mais consomem o orçamento e a CPU de render.** A M4 no estado completo medido chega a 852 triângulos/47 draw calls; Mira 4x e silenciador são os maiores anexos individuais, e o overlay mítico estágio 4 adiciona 176 triângulos/9 meshes-draw calls. Priorizar redução de segmentos nos cilindros/anéis, reaproveitamento/merge por material, e deslocar riscos/chips emissivos para textura/atlas ou instância; preservar legibilidade da silhueta e sockets. O tier COMUM acrescenta 12 triângulos e um draw call por scratch geométrico.

**P1 — colete Nv4 e capacete de assalto.** O colete Nv4 é 144 triângulos distribuídos em 12 draw calls (maior fragmentação do gear); consolidar placas/ombros/LED em poucas geometrias por material. Capacete Nv3 tem 276 triângulos/6 draw calls e Nv2 já tem 228/2; reduzir segmentos do dome e fundir trilhos/mount sem apagar leitura visual balística.

**P2 — grip vertical e mochila Nv3.** Grip comum chega a 84 triângulos/7 draw calls, devido às ranhuras e desgaste; trocar sulcos por normal/roughness e fundir peças. Mochila Nv3 é 116/8, mas substitui mochila-base e tende a reduzir a contagem líquida do corpo; otimizar draw calls e volumes ocultos antes de reduzir silhueta.

No cenário máximo, o cap de triângulos tem 464 de folga; a dimensão urgente remanescente é fragmentação de draw calls, não extrapolação dos triângulos. O maior cenário de draw calls fica reportado no JSON/CSV e requer perfilamento de GPU antes de fixar um segundo teto.

## Reexecução e artefatos

- JSON: `OPERATIVE_TRIANGLE_BUDGET_2026-11-16.json` — métricas completas, por-operativo, por-peça e por arma.
- CSV gear: `OPERATIVE_GEAR_SCENARIOS_2026-11-16.csv` — 5.280 combinações corpo/gear.
- CSV armas: `WEAPON_ATTACHMENT_SCENARIOS_2026-11-16.csv` — 9.120 estados por arma/anexos/raridade/skin/estágio.
- CSV equipado: `OPERATIVE_EQUIPPED_SCENARIOS_2026-11-16.csv` — 47.520 estados corpo/gear + envelope máximo de cada arma, com margem para o cap.
- Reexecutar: `node game-runtime/scripts/audit-character-triangle-budget.mjs`.
