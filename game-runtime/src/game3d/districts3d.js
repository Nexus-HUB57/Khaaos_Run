// Khaaos Run — Fase 22: CENÁRIOS VIVOS (dressing por distrito, nível Free Fire).
//
// A Fase 16 materializou a identidade dos mundos em MARCOS NO HORIZONTE (anel
// 205–340 m, fora da área jogável). A Fase 22 traz essa identidade PARA DENTRO
// da arena: cada distrito de cada cenário recebe um kit de cenário coerente
// com o nome do setor (scenarios.js) — barracas e raia de treino no campo de
// instrução, bancas com toldos e neve no setor urbano frio, poças de água/
// mangues/templo antigo/corais no arquipélago abissal, dunas/terra rachada
// com lava/trilhos no deserto vertical, estilhaços flutuantes/runas/fendas do
// vazio na singularidade dimensional.
//
// Filosofia do repo (mantida bit a bit):
//  - ZERO impacto em gameplay: nenhum collider novo, placements filtrados por
//    colliders/loot/estradas/praça central e dentro da área jogável;
//  - DETERMINISMO: mesma seed+cenário => mesmos placements (SeededRng);
//  - LÓGICA PURA de placements (districtDressing, sem THREE) + builder visual
//    (buildDistrictDressing) que registra contagens e ANIMATORS em
//    scene.userData.districtDressing (mesmo contrato dos worldMarks);
//  - ZERO assets externos: geometria + texturas 100% procedurais;
//  - QUALIDADE: density vem do tier (quality3d.dressingFactor).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import { roadSegments } from './detail3d.js';
import { frustumPrism } from './prisms3d.js';
import { Emitter, getSharedParticles, bindParticleTicker } from './particles3d.js';
import {
  mudMaterial, waterPoolMaterial, snowMaterial, lavaMaterial,
  runeMaterial, riftMaterial, awningMaterial, plankMaterial,
  duneMaterial, bannerMaterial, signTexture,
  quicksandMaterial, mistMaterial, // F43 — areia movediça (W3) + neblina alucinógena (W2)
  mossMaterial, dryLakeMaterial,   // F66 — musgo invasor (W1) + lago seco (W1)
} from './textures3d.js';

// ============================================================================
// PARTE 1 — placements puros (sem THREE, determinístico)
// ============================================================================

const BOUND = 194;          // área jogável (layout.size 400 → margem)
const PLAZA_R = 46;         // respeita a praça central/terminal (asfalto r=34 + monolito)
const MARGIN = 1.6;         // folga contra colliders
const LOOT_GAP = 3.4;       // folga contra pontos de loot
const ROAD_GAP = 1.3;       // folga além da metade da via

// distância ponto→segmento (mesma matemática do detail3d)
function distToSeg(px, pz, seg) {
  const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (pz - seg.z1) * dz) / len2));
  return Math.hypot(px - (seg.x1 + dx * t), pz - (seg.z1 + dz * t));
}

/**
 * Kits de cenário por distrito. Cada entrada: quantos itens de cada tipo o
 * distrito recebe (× density). Tipos exclusivos por cenário garantem leitura
 * de identidade imediata (teste de exclusividade cruzada).
 */
const KITS = {
  CIGKV: {
    // T74+F48 — README CIGKV: Pátio de Armamento é "zona neutra CIRCULAR" com
    // "paredes holográficas" (patioring + holowall); Parque Abandonado ganha
    // "árvores antigas... copas altas... RIACHOS e ROCHAS" (ancienttree/stream/boulder).
    0: { tent: 3, flagmast: 2, holowall: 2, patioring: 1 },   // Pátio de Armamento
    1: { tirerow: 2, bleacher: 1, tent: 1 },           // Proving Grounds
    2: { bleacher: 1, flagmast: 2, ancienttree: 2, boulder: 3, stream: 2 }, // Parque Abandonado
    3: { fanunit: 2, officerhouse: 4 },                // Urbano Denso (F66: vila abandonada das casas dos oficiais)
    4: {},                                             // Terminal ZEX (praça limpa)
  },
  Barburhen: {
    // Diretiva (Mundos W1): cidade pós-guerra — entulho, carros queimados,
    // árvores mortas, crateras e colunas de fumaça sobre a identidade fria.
    // F42 — trilhos no setor da ESTAÇÃO (README W1: ZEX = estação ferroviária)
    // F43 — README W1: "construções inacabadas... desabamentos": esqueletos de
    // concreto + lajes tombadas sobre entulho nos 4 distritos da cidade.
    // F66 — DOCX de referência: "a floresta tomando a cidade, MUSGO e GRAMAS
    // por todos os lados, pouco concreto, pouco asfalto"; Parque com CORETO,
    // LAGO SECO e BANCOS QUEBRADOS; corpos estáticos (lore: não despawnam).
    0: { stall: 3, billboard: 1, rubble: 3, burntcar: 1, deadtree: 1, skeleton: 1, collapse: 1, moss: 3, grasstuft: 6, rotcorpse: 1 },      // Área Urbana e Comercial
    1: { machinery: 1, snowpile: 2, snowpatch: 2, crater: 2, smokecolumn: 1, rail: 2, skeleton: 1, moss: 2, grasstuft: 3 }, // Setor Industrial (estação)
    2: { machinery: 2, snowpile: 1, deadtree: 2, rubble: 1, crater: 1, collapse: 1, gazebo: 1, brokenbench: 3, drylake: 1, moss: 3, grasstuft: 4 },     // Parque Abandonado
    3: { machinery: 1, fanunit: 2, rubble: 2, smokecolumn: 1, burntcar: 1, skeleton: 1, moss: 2, grasstuft: 3, rotcorpse: 1 }, // Zona de Extração
    4: {},
  },
  Priadus: {
    // Diretiva (Mundos W2): pântano negro + bosque sobre ruínas tecnológicas,
    // área de caça com totens e o Templo Antigo dos Duazhs
    // F43 — README W2: "flora carnívora" + "neblina alucinógena": plantas-bulbo
    // ácidas com dentes/tentáculos e bancos de névoa rasteira pulsante.
    // F66 — DOCX de referência: LAGO com "pontes em deterioração" + "pequenas
    // ilhas espalhadas" (ancorados ao espelho d'água, ver bloco canônico
    // adiante); "esqueletos e corpos apodrecendo em meio às folhagens".
    0: { waterpool: 3, mudpatch: 2, mangrove: 2, hut: 1, walkway: 1, roots: 2, coral: 2, carnplant: 2, mist: 2, lake: 1, skeleton: 1, rotcorpse: 1 },   // Área Pantanosa
    1: { mangrove: 3, hut: 1, walkway: 1, mudpatch: 1, labdome: 1, fallenlog: 2, sporesac: 2, carnplant: 2, mist: 2, skeleton: 1, rotcorpse: 1 }, // O Bosque
    2: { waterpool: 1, walkway: 1, statue: 2, totem: 2, sporesac: 1, roots: 1, mist: 1, rotcorpse: 1 },             // Área de Caça
    3: { templestep: 1, statue: 2, brazier: 2, fallenlog: 1, mist: 1 },                                // Templo Antigo
    4: {},
  },
  Ckesalth: {
    // Diretiva (Mundos W3): resort murado, vilarejo beduíno, refinaria em chamas
    // e o cemitério de areia — óleo negro e ossos espalhados
    // T74 — README W3: "palmeiras DERRUBADAS" (fallenpalm) nos 3 setores de areia
    0: { dune: 2, banner: 2, palmstump: 2, fallenpalm: 2, resortwall: 1, oilpool: 2 },  // Resort Abandonado
    1: { tent: 2, campfire: 1, banner: 1, bones: 2, palmstump: 1, fallenpalm: 1 },      // Vilarejo Beduíno
    2: { refinetower: 1, oiltank: 2, pipeline: 2, lavapatch: 2, minecart: 1, oilpool: 1, smokecolumn: 1 }, // Refinaria (F66: fumaça tóxica visível)
    // F43 — README W3: "areia movediça" ganha o patch visual do terreno que
    // engole no setor canônico (a mecânica de afundamento segue UE5).
    // F66 — DOCX de referência: "os caídos são alimento dos abutres" no
    // Cemitério de Areia — corpo apodrecendo estático (mesh de lore).
    3: { dune: 2, bones: 2, palmstump: 1, fallenpalm: 2, quicksand: 2, rotcorpse: 1 },                // Cemitério de Areia
    4: {},
  },
  Arukheea: {
    // T74 — README W4 canon-puro: o vestuário "quantum" da Singularidade SAIU
    // dos distritos (identidade antiga que o README não descreve) — a ilha
    // pirata assume o cânon: chalés de palha queimados, Prisão monumental com
    // helicóptero de fuga, fábrica de óleo de baleia, marina com naufrágios.
    // Farol mantido; barris de óleo em chamas na marina (F48); aves carnicentas
    // (fauna3d) circulam o Cemitério das Baleias.
    0: { palmtree: 3, burnthut: 2, strawhut: 1 },                              // Bosque dos Perdidos
    // F66 — DOCX de referência: prisão ameaçadora — "mais arames farpados,
    // cercas em curto circuito e faíscas" (barbwire com ponta de energia).
    1: { prisonwall: 2, prisonkeep: 1, heli: 1, lighthouse: 1, strawhut: 2, barbwire: 3 },  // Prisão do Sol da Noite + fuga
    2: { whaleribs: 2, bones: 2, whalefactory: 1, strawhut: 1 },               // Fábrica / Cemitério das Baleias
    3: { shipwreck: 2, palmtree: 2, burnthut: 1, oilbarrel: 3 },               // Marina Fantasma
    4: {},
  },
};

// patches de solo por tipo (entram em `patches`, não em `items`)
// F43 — 'quicksand' (README W3: areia movediça) e 'mist' (README W2: neblina
// alucinógena) entram na MESMA gramática de patch de solo.
// F48 — 'stream' (README CIGKV: "riachos" do Parque Abandonado) na mesma
// gramática — faixa d'água alongada com margens.
const PATCH_TYPES = new Set(['waterpool', 'mudpatch', 'snowpatch', 'lavapatch', 'runering', 'voidscorch', 'crater', 'oilpool', 'quicksand', 'mist', 'stream', 'patioring', 'moss', 'drylake', 'lake']);

/**
 * Placements determinísticos do dressing por cenário.
 * @returns {{ scenarioId, items: Array<{type,x,z,rot,s,a?}>, patches: Array<{type,x,z,r,rot,sx}>, counts: Object }}
 */
export function districtDressing(layout, scenario, { seed = 'dressing', density = 1 } = {}) {
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:${seed}`);
  const roads = roadSegments(layout);
  const roadsAt = (x, z, extra = 0) => roads.some((seg) =>
    distToSeg(x, z, seg) < seg.width / 2 + ROAD_GAP + extra);
  const free = (x, z, m = MARGIN) => layout.colliders.every((c) =>
    x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  const lootClear = (x, z) => (layout.lootSpots || []).every((l) => Math.hypot(x - l.x, z - l.z) > LOOT_GAP);

  const items = [];
  const patches = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };

  // aceitação com TODAS as garantias (bounds, colliders, loot, estradas, praça)
  const accept = (x, z, r = 1) => {
    if (Math.abs(x) > BOUND - r || Math.abs(z) > BOUND - r) return false;
    if (Math.hypot(x, z) < PLAZA_R + r) return false;
    if (!free(x, z, MARGIN + r * .6)) return false;
    if (!lootClear(x, z)) return false;
    if (roadsAt(x, z, r * .5)) return false;
    return true;
  };
  const pushItem = (type, x, z, rot, s, a = undefined) => {
    items.push({ type, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), s: +s.toFixed(2), ...(a !== undefined ? { a } : {}) });
    bump(type);
  };
  const pushPatch = (type, x, z, r, rot = 0, sx = 1) => {
    patches.push({ type, x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2), rot: +rot.toFixed(3), sx: +sx.toFixed(2) });
    bump(type);
  };

  // tenta posicionar `n` unidades de `type` no anel do distrito
  const scatter = (district, type, n, { rMin = 14, rMax = null, sMin = 1, sMax = 1, tries = 26, gap = 3, size = 1, variant = null } = {}) => {
    const R = rMax ?? Math.min(district.r + 6, 70);
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rMin + rng.next() * (R - rMin);
      const x = district.cx + Math.cos(a) * r;
      const z = district.cz + Math.sin(a) * r;
      if (!accept(x, z, size)) continue;
      if (items.some((p) => p.type === type && Math.hypot(p.x - x, p.z - z) < gap)) continue;
      if (patches.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
      const s = sMin + rng.next() * (sMax - sMin);
      pushItem(type, x, z, rng.next() * Math.PI * 2, s, variant === null ? undefined : (variant(rng)));
      placed++;
    }
    return placed;
  };
  // patch de solo (disco elíptico no chão) — mesmas garantias, raio próprio
  const scatterPatch = (district, type, n, { rMin = 2.6, rMax = 4.6, tries = 20 } = {}) => {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 12 + rng.next() * (Math.min(district.r + 6, 70) - 12);
      const x = district.cx + Math.cos(a) * r;
      const z = district.cz + Math.sin(a) * r;
      const pr = rMin + rng.next() * (rMax - rMin);
      if (!accept(x, z, pr * .8)) continue;
      if (patches.some((p) => Math.hypot(p.x - x, p.z - z) < pr + p.r + 1.5)) continue;
      pushPatch(type, x, z, pr, rng.next() * Math.PI, .8 + rng.next() * .5);
      placed++;
    }
    return placed;
  };

  const kit = KITS[scenario.id] ?? {};
  for (const [idx, recipe] of Object.entries(kit)) {
    const district = layout.districts[Number(idx)];
    if (!district) continue;
    for (const [type, count] of Object.entries(recipe)) {
      const n = Math.max(type.endsWith('patch') || type === 'runering' ? 1 : 0, Math.round(count * density));
      if (PATCH_TYPES.has(type)) {
        // F66 — raio canônico por patch: o LAGO de Priadus precisa de espelho
        // grande (ilhotas dentro + pontes na borda); o LAGO SECO do Parque W1
        // é uma bacia média rachada; patioring mantém o anel do Pátio.
        scatterPatch(district, type, n, {
          lake: { rMin: 5.5, rMax: 7.5, tries: 44 },
          drylake: { rMin: 4.4, rMax: 6.2, tries: 34 },
          moss: { rMin: 3.4, rMax: 5.4, tries: 30 },
          patioring: { rMin: 3.2, rMax: 4.4 },
        }[type] ?? {});
        continue;
      }
      // assinatura de tamanho por tipo (grandes marcos de distrito × micro props)
      const spec = {
        mangrove: { sMin: 1.25, sMax: 1.8, size: 1.6, gap: 6 },
        templestep: { sMin: 1, sMax: 1.15, size: 2.6, gap: 10 },
        refinetower: { sMin: 1, sMax: 1.1, size: 2, gap: 9 },
        labdome: { sMin: .95, sMax: 1.2, size: 1.9, gap: 8 },
        hut: { sMin: .95, sMax: 1.15, size: 1.9, gap: 7 },
        machinery: { sMin: .9, sMax: 1.15, size: 1.9, gap: 7 },
        stall: { sMin: .9, sMax: 1.1, size: 1.6, gap: 6 },
        dune: { sMin: 1.1, sMax: 1.7, size: 2.4, gap: 8 },
        tent: { sMin: .9, sMax: 1.2, size: 1.6, gap: 6 },
        walkway: { sMin: .9, sMax: 1.1, size: 2.4, gap: 7 },
        minecart: { sMin: 1, sMax: 1, size: 2.2, gap: 8 },
        // Fase 31 — grandes marcos da diretiva W1-W4
        prisonwall: { sMin: 1, sMax: 1.1, size: 2.8, gap: 9 },
        shipwreck: { sMin: 1, sMax: 1.15, size: 2.8, gap: 9 },
        whaleribs: { sMin: 1, sMax: 1.1, size: 2.6, gap: 8 },
        resortwall: { sMin: 1, sMax: 1.1, size: 2.4, gap: 8 },
        oiltank: { sMin: 1, sMax: 1.1, size: 2.0, gap: 7 },
        lighthouse: { sMin: 1, sMax: 1, size: 2.0, gap: 12 },
        burntcar: { sMin: .95, sMax: 1.1, size: 2.0, gap: 7 },
        fallenlog: { sMin: 1, sMax: 1.2, size: 2.4, gap: 6 },
        pipeline: { sMin: 1, sMax: 1, size: 2.6, gap: 8 },
        rail: { sMin: 1, sMax: 1, size: 3.2, gap: 9 },   // F42 — trilho da estação W1
        deadtree: { sMin: .95, sMax: 1.25, size: 1.6, gap: 5 },
        palmtree: { sMin: 1.05, sMax: 1.4, size: 1.6, gap: 5.5 },
        // F43 — detalhes fiéis ao README (grandes marcos × micro props)
        skeleton: { sMin: 1, sMax: 1.1, size: 2.8, gap: 10 },   // construção inacabada W1
        collapse: { sMin: .95, sMax: 1.15, size: 2.2, gap: 8 }, // desabamento W1
        carnplant: { sMin: .9, sMax: 1.3, size: 1.2, gap: 4.5 },// flora carnívora W2
        // F48 — fidelidade canônica W4/CIGKV
        strawhut: { sMin: .9, sMax: 1.2, size: 1.8, gap: 7 },   // chalé de palha W4
        oilbarrel: { sMin: .85, sMax: 1.1, size: .9, gap: 3.5 },// barril de óleo W4
        boulder: { sMin: .8, sMax: 1.5, size: 1.5, gap: 5 },    // rocha-abrigo CIGKV
        ancienttree: { sMin: 1, sMax: 1.2, size: 3.6, gap: 11 },// árvore antiga CIGKV
        // T74 — canon W3/W4/CIGKV (README 1:1)
        fallenpalm: { sMin: 1.05, sMax: 1.45, size: 2.2, gap: 6.5 }, // palmeira derrubada W3
        burnthut: { sMin: .95, sMax: 1.15, size: 1.9, gap: 6 }, // chalé queimado W4
        prisonkeep: { sMin: 1, sMax: 1, size: 2.4, gap: 10 },   // torre da Prisão W4
        heli: { sMin: 1, sMax: 1, size: 2.4, gap: 9 },          // helicóptero de fuga W4
        whalefactory: { sMin: 1, sMax: 1, size: 3.0, gap: 10 }, // fábrica de óleo W4
        holowall: { sMin: .95, sMax: 1.15, size: 1.9, gap: 6 }, // parede holográfica CIGKV
        // F66 — DOCX de referência: coreto/bancos/grama W1, casas dos oficiais
        // CIGKV, cerca em curto W4, corpo apodrecendo W1/W2/W3
        gazebo: { sMin: 1, sMax: 1, size: 2.6, gap: 12 },
        brokenbench: { sMin: .9, sMax: 1.1, size: 1.4, gap: 5 },
        grasstuft: { sMin: .7, sMax: 1.3, size: .5, gap: 2.2 },
        officerhouse: { sMin: .95, sMax: 1.1, size: 3.2, gap: 12 },
        barbwire: { sMin: 1, sMax: 1.1, size: 2.4, gap: 8 },
        rotcorpse: { sMin: .9, sMax: 1.1, size: 1.6, gap: 5 },
      }[type] ?? { sMin: .9, sMax: 1.25, size: 1.1, gap: 4.5 };
      scatter(district, type, n, spec);
    }
  }

  // F66 — W2 DOCX: "O mundo deve ter um lago, onde deve haver pontes em
  // deterioração, com pequenas ilhas espalhadas" — ilhotas DENTRO do espelho
  // do lago e pontes NA BORDA (atravessando para a água), ancoradas ao lago
  // e não espalhadas pelo distrito; mesmas garantias de aceitação.
  if (scenario.id === 'Priadus') {
    const lake = patches.find((p) => p.type === 'lake');
    if (lake) {
      for (let i = 0; i < 3; i++) {
        const a0 = rng.next() * Math.PI * 2;
        for (let t = 0; t < 6; t++) {
          const a = a0 + t * 1.05;
          const r = lake.r * (.3 + rng.next() * .34);
          const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
          if (!accept(x, z, .9)) continue;
          pushItem('isle', x, z, rng.next() * Math.PI * 2, .9 + rng.next() * .35);
          break;
        }
      }
      for (let i = 0; i < 2; i++) {
        const a0 = (i === 0 ? .4 : 3.6) + rng.next() * .7;
        for (let t = 0; t < 8; t++) {
          const a = a0 + t * .8;
          const r = lake.r * (.86 + rng.next() * .18);
          const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
          if (!accept(x, z, .9)) continue;
          pushItem('brokenbridge', x, z, a + Math.PI / 2, 1);
          break;
        }
      }
    }
  }

  // rasgos de vazio espalhados em Arukheea (identidade extra fora do kit)
  if (scenario.id === 'Arukheea') {
    for (const district of layout.districts.slice(0, 4)) scatterPatch(district, 'voidscorch', 1, { rMin: 2.2, rMax: 3.4 });
  }

  return { scenarioId: scenario.id, items, patches, counts };
}

// ============================================================================
// PARTE 2 — builder visual (THREE) + registry + animators
// ============================================================================

// sombra de contato por tipo (área aproximada da pegada)
const SHADOW_SIZE = {
  tent: 2.6, flagmast: .8, tirerow: 3.4, bleacher: 3.2, fanunit: 2.2,
  stall: 2.6, billboard: 2.4, snowpile: 1.8, machinery: 3.4,
  mangrove: 2.9, walkway: 4.6, hut: 3.4, templestep: 4.8, statue: 1.3,
  brazier: 1.0, coral: 1.4, labdome: 3.2, campfire: 1.5, refinetower: 2.8,
  minecart: 2.3, banner: 1.0, crystal: 1.6,
  // Fase 31 — diretiva dos 4 mundos (destruição/selva/deserto/ilha)
  rubble: 1.6, burntcar: 2.0, deadtree: 1.8, smokecolumn: 1.2,
  roots: 1.8, fallenlog: 2.6, sporesac: 1.0, totem: 1.2,
  palmstump: 1.0, oiltank: 2.0, pipeline: 3.0, bones: 1.8, resortwall: 2.6,
  rail: 3.4,   // F42 — trilho da estação ferroviária (W1)
  palmtree: 1.8, prisonwall: 2.8, lighthouse: 2.2, whaleribs: 3.0, shipwreck: 3.2,
  // F43 — detalhes fiéis ao README por mundo
  skeleton: 3.6, collapse: 2.8, carnplant: 1.2,
  // F48 — W4 chalés/barris + CIGKV parque canônico
  strawhut: 3.0, oilbarrel: 1.0, boulder: 2.0, ancienttree: 5.0,
  // T74 — canon W3/W4/CIGKV
  fallenpalm: 3.0, burnthut: 2.2, prisonkeep: 2.6, heli: 2.4, whalefactory: 3.4, holowall: 2.0,
  // F66 — DOCX de referência
  gazebo: 3.6, brokenbench: 1.6, grasstuft: .7, officerhouse: 4.4,
  brokenbridge: 4.4, isle: 2.4, rotcorpse: 1.8, barbwire: 2.6,
};

const ST = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? .85, metalness: o.metal ?? .08,
  ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}),
  ...(o.flat ? { flatShading: true } : {}),
  ...(o.map ? { map: o.map } : {}),
  ...(o.side ? { side: o.side } : {}),
});

// materiais compartilhados por build (uma cena por chamada)
function sharedMaterials() {
  return {
    stone: ST('#9a948a', { rough: .92, flat: true }),
    stoneDark: ST('#6f6a62', { rough: .95, flat: true }),
    wood: ST('#6e5433', { rough: .9 }),
    woodDark: ST('#4e3a22', { rough: .92 }),
    steel: ST('#4c4f55', { metal: .6, rough: .45 }),
    rust: ST('#7a4a2b', { metal: .4, rough: .72 }),
    rubber: ST('#1c1d20', { rough: .95 }),
    cloth: ST('#5d6b4a', { rough: .95, side: THREE.DoubleSide }),
    clothCold: ST('#5a6a74', { rough: .95, side: THREE.DoubleSide }),
    clothDesert: ST('#8a6f42', { rough: .95, side: THREE.DoubleSide }),
    mangroveTrunk: ST('#4e3d2c', { rough: .95 }),
    mangroveCanopy: ST('#2f5d43', { rough: .92, flat: true }),
    thatch: ST('#8a7444', { rough: .95, flat: true }),
    glass: new THREE.MeshStandardMaterial({
      color: '#9fd8d2', transparent: true, opacity: .28, roughness: .12, metalness: .1,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    crystal: ST('#6fd4e8', { emissive: '#2e9bb8', ei: .8, flat: true, rough: .3, metal: .1 }),
    shard: ST('#8f9fd8', { emissive: '#4a5ec8', ei: .55, flat: true, rough: .35 }),
    coral: ST('#e8788a', { emissive: '#a83a52', ei: .5, rough: .7 }),
    coralAlt: ST('#7fd4c0', { emissive: '#2e8a72', ei: .5, rough: .7 }),
    fire: ST('#ffb347', { emissive: '#ff8c1e', ei: 1.6, rough: .5 }),
    templeStone: ST('#a8a091', { rough: .94, flat: true }),
    // Fase 31 — diretiva dos 4 mundos
    burnt: ST('#26221e', { rough: .95, flat: true }),          // madeira/metal carbonizados
    ash: ST('#4a4642', { rough: .98, flat: true }),            // cinza de Barburhen
    bone: ST('#d8d0bc', { rough: .85, flat: true }),           // marfim de osso
    oil: new THREE.MeshStandardMaterial({
      color: '#0c0e10', roughness: .16, metalness: .45,        // óleo negro espelhado
    }),
    swampRoot: ST('#3a3020', { rough: .96, flat: true }),      // raízes do pântano
    spore: ST('#8aa04a', { emissive: '#5a7a20', ei: .7, rough: .7, flat: true }), // esporos de Priadus
    palmTrunk: ST('#6b5433', { rough: .94 }),
    palmFrond: ST('#3f6b35', { rough: .9, flat: true, side: THREE.DoubleSide }),
    prisonStone: ST('#5e5a52', { rough: .93, flat: true }),    // pedra da prisão
    holo: new THREE.MeshBasicMaterial({
      color: '#ffd28a', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false,
    }),                                                        // luz do farol
    // F43 — materiais dos detalhes fiéis por mundo
    concrete: ST('#8f8a80', { rough: .93, flat: true }),       // concreto cru (esqueleto W1)
    debris: ST('#5c574f', { rough: .96, flat: true }),         // entulho do desabamento W1
    acid: ST('#7dd45a', { emissive: '#3f8a1e', ei: .75, rough: .55, flat: true }), // flora carnívora W2
    vine: ST('#3f6b2a', { rough: .92 }),                       // tentáculos rasteiros W2
    finMat: ST('#3d4a52', { rough: .35, metal: .1 }),          // pele molhada do tubarão W4
    // F48 — fidelidade canônica W4/CIGKV
    oakCanopy: ST('#4f7a38', { rough: .9, flat: true, side: THREE.DoubleSide }), // copa do carvalho antigo CIGKV
    oakTrunk: ST('#4a3a26', { rough: .95, flat: true }),       // tronco grosso da árvore antiga
    strawFresh: ST('#9c8448', { rough: .95, flat: true, side: THREE.DoubleSide }), // palha intacta W4
    strawChar: ST('#2b241c', { rough: .96, flat: true, side: THREE.DoubleSide }),  // palha queimada W4
    barrelRust: ST('#8a3c26', { metal: .35, rough: .68 }),     // barril da fábrica de óleo W4
  };
}

// ---------- item builders (cada um retorna um Group com pivô no chão) ----------
const BUILDERS = {
  tent(m, variant) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(frustumPrism({ wB: 2.6, wT: .3, lB: 3.4, lT: .3, h: 1.7 }),
      variant === 0 ? m.cloth : variant === 1 ? m.clothCold : m.clothDesert);
    body.castShadow = body.receiveShadow = true;
    // ripa central
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(.08, .22, 3.4), m.woodDark);
    ridge.position.y = 1.68;
    g.add(body, ridge);
    return g;
  },
  flagmast(m, variant) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, 4.6, 6), m.steel);
    pole.position.y = 2.3; pole.castShadow = true;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .7),
      ST(['#3d5a8a', '#8a2a22', '#3d6b46'][variant % 3], { rough: .9, side: THREE.DoubleSide }));
    flag.position.set(.62, 4.1, 0); // ancorada no mastro (pivô na borda p/ sway)
    flag.castShadow = false;
    g.add(pole, flag);
    g.userData.flag = flag;
    return g;
  },
  tirerow(m) {
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(.36, .16, 8, 14);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(geo, m.rubber);
      t.position.set(-1.35 + i * .9, .18, (i % 2 ? .06 : -.06));
      t.rotation.set(Math.PI / 2, 0, (i % 2 ? .12 : -.1));
      t.castShadow = t.receiveShadow = true;
      g.add(t);
    }
    return g;
  },
  bleacher(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, .34 + i * .3, .9), m.wood);
      step.position.set(0, (.34 + i * .3) / 2, -i * .85);
      step.castShadow = step.receiveShadow = true;
      g.add(step);
    }
    return g;
  },
  fanunit(m) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, .5, 12), m.steel);
    base.position.y = .25; base.castShadow = base.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.95, .07, 8, 18), m.steel);
    rim.position.y = 1.15; rim.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .3, 8), m.rust);
    hub.position.y = 1.15;
    g.add(base, rim, hub);
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.78, .05, .26), m.steel);
      b.position.set(Math.cos(i * Math.PI / 2) * .52, 1.15, Math.sin(i * Math.PI / 2) * .52);
      b.rotation.y = -i * Math.PI / 2 + Math.PI / 4;
      b.castShadow = true;
      blades.add(b);
    }
    blades.userData.spin = true; // animator gira o rotor
    g.add(blades);
    g.userData.rotor = blades;
    return g;
  },
  stall(m, variant) {
    const g = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(.05, .05, 2.1, 6);
    for (const [px, pz] of [[-1.1, -.7], [1.1, -.7], [-1.1, .7], [1.1, .7]]) {
      const p = new THREE.Mesh(postGeo, m.woodDark);
      p.position.set(px, 1.05, pz);
      g.add(p);
    }
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.3, .12, 1.4), m.plank);
    table.position.y = .85; table.castShadow = table.receiveShadow = true;
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9),
      awningMaterial(['#b8452e', '#2e6b8a', '#8a6b2e'][variant % 3]));
    awn.position.set(0, 2.15, .1); awn.rotation.x = -Math.PI / 2 + .34;
    awn.castShadow = true;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(.5, .34, .5), m.wood);
    crate.position.set(.55, 1.08, .15); crate.rotation.y = .5; crate.castShadow = true;
    g.add(table, awn, crate);
    return g;
  },
  billboard(m, variant) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.16, 3, .16), m.steel);
      leg.position.set(s * .9, 1.5, 0); leg.castShadow = true;
      g.add(leg);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.7, .1), m.woodDark);
    panel.position.y = 3.4; panel.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.45),
      new THREE.MeshBasicMaterial({
        map: signTexture(['SUPRIMENTOS', 'BARBURHEN', 'MUNIÇÃO'][variant % 3], '#7fd4ff'),
        toneMapped: false,
      }));
    face.position.set(0, 3.4, .07);
    g.add(panel, face);
    return g;
  },
  snowpile(m) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 10, 8);
    for (const [dx, dz, s] of [[0, 0, 1], [.7, .3, .6], [-.6, .2, .5]]) {
      const b = new THREE.Mesh(geo, m.snow);
      b.position.set(dx, .12, dz);
      b.scale.set(s, .35, s * .8);
      b.receiveShadow = true; b.castShadow = true;
      g.add(b);
    }
    return g;
  },
  machinery(m) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, .5, 1.6), m.rust);
    base.position.y = .25; base.castShadow = base.receiveShadow = true;
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 1.3, 10), m.rust);
    boiler.position.set(-.5, 1.1, 0); boiler.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.55, 10, 8), m.rust);
    dome.position.set(-.5, 1.75, 0); dome.castShadow = true;
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 1.6, 8), m.steel);
    chim.position.set(.7, 1.6, -.3); chim.castShadow = true;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.5, .09, 8, 16), m.steel);
    wheel.position.set(.85, .95, .35); wheel.rotation.y = Math.PI / 2;
    g.add(base, boiler, dome, chim, wheel);
    return g;
  },
  mangrove(m) {
    const g = new THREE.Group();
    const h = 3.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .26, h, 7), m.mangroveTrunk);
    trunk.position.y = h / 2 + .55; trunk.castShadow = true;
    g.add(trunk);
    // raízes aéreas inclinadas (assinatura do mangue)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + .3;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, 1.5, 5), m.mangroveTrunk);
      root.position.set(Math.cos(a) * .5, .6, Math.sin(a) * .5);
      root.rotation.set(Math.sin(a) * .55, 0, -Math.cos(a) * .55);
      root.castShadow = true;
      g.add(root);
    }
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), m.mangroveCanopy);
    canopy.position.y = h + .9; canopy.scale.set(1.15, .8, 1.15);
    canopy.castShadow = canopy.receiveShadow = true;
    g.add(canopy);
    return g;
  },
  walkway(m) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, .12, 5), m.plank);
    deck.position.y = .42; deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    for (const s of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(.16, .36, 5), m.woodDark);
      beam.position.set(s * .62, .21, 0);
      g.add(beam);
    }
    // pranchas transversais (ritmo visual)
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.56, .05, .34), m.woodDark);
      slat.position.set(0, .5, -2 + i * 1);
      g.add(slat);
    }
    return g;
  },
  hut(m) {
    const g = new THREE.Group();
    for (const [px, pz] of [[-.9, -.7], [.9, -.7], [-.9, .7], [.9, .7]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 1.4, 6), m.woodDark);
      leg.position.set(px, .7, pz); leg.castShadow = true;
      g.add(leg);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, 1.8), m.plank);
    floor.position.y = 1.44; floor.castShadow = floor.receiveShadow = true;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 1.15, 1.6), m.thatch);
    wall.position.y = 2.08; wall.castShadow = true;
    const roof = new THREE.Mesh(frustumPrism({ wB: 2.5, wT: .25, lB: 2.1, lT: .25, h: .95 }), m.thatch);
    roof.position.y = 2.66; roof.castShadow = true;
    g.add(floor, wall, roof);
    return g;
  },
  templestep(m) {
    const g = new THREE.Group();
    const specs = [[4.6, .55], [3.5, .5], [2.4, .45]];
    let y = 0;
    for (const [w, h] of specs) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * .8), m.templeStone);
      step.position.y = y + h / 2;
      step.castShadow = step.receiveShadow = true;
      g.add(step);
      y += h;
    }
    // blocos de canto do topo (altare)
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(.34, .5, .34), m.stoneDark);
      block.position.set(dx * .95, y + .25, dz * .76);
      block.castShadow = true;
      g.add(block);
    }
    return g;
  },
  statue(m) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, .9), m.stoneDark);
    base.position.y = .25; base.castShadow = base.receiveShadow = true;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.18, .24, 1.3, 8), m.templeStone);
    column.position.y = 1.15; column.castShadow = true;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), m.templeStone);
    shoulders.position.y = 1.95; shoulders.scale.set(1.25, .7, .8); shoulders.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 8, 7), m.templeStone);
    head.position.y = 2.35; head.scale.set(.85, 1.1, .9); head.castShadow = true;
    g.add(base, column, shoulders, head);
    return g;
  },
  brazier(m) {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-.3, -.3], [.3, -.3], [0, .38]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .8, 5), m.stoneDark);
      leg.position.set(dx, .4, dz);
      g.add(leg);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.42, .26, .3, 10), m.stoneDark);
    bowl.position.y = .95; bowl.castShadow = true;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.22, .55, 7), m.fire.clone());
    flame.position.y = 1.35;
    g.add(bowl, flame);
    g.userData.flame = flame;
    return g;
  },
  coral(m, variant) {
    const g = new THREE.Group();
    const mat = variant % 2 ? m.coralAlt : m.coral;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + .4;
      const h = .5 + (i % 3) * .35;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(.05, .11, h, 6), mat);
      branch.position.set(Math.cos(a) * .22, h / 2, Math.sin(a) * .22);
      branch.rotation.set(Math.sin(a) * .3, 0, -Math.cos(a) * .3);
      branch.castShadow = true;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.11, 7, 6), mat);
      tip.position.y = h / 2;
      branch.add(tip);
      g.add(branch);
    }
    return g;
  },
  labdome(m) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, .4, 16), m.steel);
    base.position.y = .2; base.castShadow = base.receiveShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
    dome.position.y = .4;
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, .9, 8), m.coralAlt);
    emitter.position.y = 1; emitter.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, .06, 6, 20), m.steel);
    ring.position.y = .42; ring.rotation.x = Math.PI / 2;
    g.add(base, dome, emitter, ring);
    return g;
  },
  campfire(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.16, 0), m.stoneDark);
      stone.position.set(Math.cos(a) * .55, .12, Math.sin(a) * .55);
      stone.rotation.set(a, a * 2, 0);
      g.add(stone);
    }
    for (const rz of [.6, -.6]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .9, 6), m.woodDark);
      log.position.y = .12; log.rotation.set(Math.PI / 2, rz, 0);
      g.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 7), m.fire.clone());
    flame.position.y = .48;
    g.add(flame);
    g.userData.flame = flame;
    return g;
  },
  dune(m) {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), m.dune);
    mound.scale.set(2.3, .42, 1.5);
    mound.position.y = .05;
    mound.receiveShadow = true; mound.castShadow = false; // rente ao chão
    g.add(mound);
    return g;
  },
  refinetower(m) {
    const g = new THREE.Group();
    g.name = 'refinetower';
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.42, .55, 6.4, 10), m.steel);
    column.position.y = 3.2; column.castShadow = true;
    g.add(column);
    for (const y of [1.6, 3.2, 4.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .05, 6, 14), m.rust);
      ring.position.y = y; ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.18, .3, .8, 8), m.rust);
    cap.position.y = 6.8; cap.castShadow = true;
    const flare = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 6), m.fire.clone());
    flare.position.y = 7.35;
    g.add(cap, flare);
    g.userData.flame = flare;
    return g;
  },
  minecart(m) {
    const g = new THREE.Group();
    // trilhos (2 barras + dormentes) ao longo do eixo local Z
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, 9), m.steel);
      rail.position.set(s * .5, .05, 0);
      g.add(rail);
    }
    for (let i = 0; i < 7; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.3, .07, .22), m.woodDark);
      tie.position.set(0, .02, -3.9 + i * 1.3);
      g.add(tie);
    }
    const car = new THREE.Mesh(frustumPrism({ wB: 1.15, wT: .85, lB: 1.7, lT: 1.4, h: .62 }), m.rust);
    car.position.y = .62; car.castShadow = true;
    for (const [wx, wz] of [[-.5, -.55], [.5, -.55], [-.5, .55], [.5, .55]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .1, 8), m.rubber);
      w.position.set(wx, .3, wz); w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    g.add(car);
    return g;
  },
  banner(m, variant) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, 5.4, 7), m.woodDark);
    pole.position.y = 2.7; pole.castShadow = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5),
      bannerMaterial(['#8a2a22', '#2e5a8a', '#6b4a8a'][variant % 3], '#e8d9a8'));
    cloth.position.set(.8, 4, 0);
    cloth.castShadow = false;
    g.add(pole, cloth);
    g.userData.flag = cloth;
    return g;
  },
  crystal(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const h = 1 + (i % 2) * .8;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(.3, 0), m.crystal);
      c.position.set(Math.cos(a) * .3, h / 2 + .1, Math.sin(a) * .3);
      c.scale.set(.7, h * 1.6, .7);
      c.rotation.y = a;
      c.castShadow = true;
      g.add(c);
    }
    return g;
  },
  shard(m) {
    // estilhaço flutuante: base rochosa + cristal suspenso (animator faz o bob)
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 0),
      ST('#4a4458', { flat: true, rough: .9 }));
    rock.scale.set(1.2, .55, 1);
    rock.position.y = .3; rock.castShadow = true;
    const float = new THREE.Mesh(new THREE.OctahedronGeometry(.34, 0), m.shard);
    float.position.y = 1.35; float.castShadow = true;
    g.add(rock, float);
    g.userData.floatMesh = float;
    return g;
  },
  quantumring(m) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, .07, 8, 24), m.steel);
    ring.position.y = 1.55; ring.castShadow = true;
    const rune = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), runeMaterial('#59e6ff'));
    rune.position.y = 1.55;
    rune.rotation.y = Math.PI; // face para dentro do anel
    g.add(ring, rune);
    // pilares laterais finos
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.7, .1), m.steel);
      leg.position.set(s * 1.25, .85, 0);
      g.add(leg);
    }
    // anel + runa giram no próprio plano (stateless via animator com t)
    g.userData.spinners = [ring, rune];
    return g;
  },
  rift(m) {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), riftMaterial());
    plane.position.y = 1.25;
    const plane2 = plane.clone();
    plane2.rotation.y = Math.PI / 2;
    g.add(plane, plane2);
    g.userData.waver = plane;
    return g;
  },

  // ---------- Fase 31 — diretiva dos 4 mundos (W1-W4) ----------
  // W1 BARBURHEN — O Mundo da Destruição: entulho, carro queimado, árvore
  // morta e coluna de fumaça (cidade que desmorona dia após dia)
  rubble(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = .18 + (i % 3) * .12;
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 2 ? m.stone : m.stoneDark);
      c.position.set(Math.sin(i * 2.4) * .5, s * .6, Math.cos(i * 1.7) * .5);
      c.rotation.set(i, i * 2, i * .5);
      c.castShadow = c.receiveShadow = true;
      g.add(c);
    }
    const rebar = new THREE.Mesh(new THREE.BoxGeometry(.04, .7, .04), m.rust);
    rebar.position.set(.3, .32, -.1); rebar.rotation.z = .4; rebar.castShadow = true;
    g.add(rebar);
    return g;
  },
  burntcar(m) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, .55, .95), m.burnt);
    body.position.y = .55; body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, .42, .85), m.burnt);
    cabin.position.set(-.1, 1.0, 0); cabin.castShadow = true;
    g.add(body, cabin);
    for (const [wx, wz] of [[-.62, .48], [.62, .48], [-.62, -.48], [.62, -.48]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .16, 10), m.rubber);
      w.rotation.x = Math.PI / 2; w.position.set(wx, .26, wz); w.castShadow = true;
      g.add(w);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .06, .5), m.ash);
    seat.position.set(0, .84, 0); seat.rotation.z = .12;
    g.add(seat);
    return g;
  },
  deadtree(m) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09, .16, 2.6, 6), m.burnt);
    trunk.position.y = 1.3; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(.03, .06, 1.1, 5), m.burnt);
      br.position.set(Math.sin(i * 2.1) * .35, 1.5 + i * .38, Math.cos(i * 2.1) * .35);
      br.rotation.z = Math.sin(i * 2.1) * .9; br.rotation.x = Math.cos(i * 2.1) * .9;
      br.castShadow = true;
      g.add(br);
    }
    return g;
  },
  smokecolumn(m) {
    // F33 — chaminé do caos: a voluta ESTÁTICA (cone opacity .3) saiu — a
    // fumaça agora é REAL (emissor no pool compartilhado de partículas,
    // registrado no loop de dressing abaixo). A chaminé fica como fonte.
    const g = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, 1.0, 8), m.rust);
    stack.position.y = .5; stack.castShadow = true;
    g.add(stack);
    return g;
  },

  // W2 PRIADUS — A Floresta da Escuridão: raízes expostas, tronco caído,
  // saco de esporos bioluminescente e totem da caça
  roots(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, 1.3, 5), m.swampRoot);
      r.position.set(Math.sin(i * 1.6) * .4, .12, Math.cos(i * 1.6) * .4);
      r.rotation.set(Math.cos(i) * .9, i, Math.sin(i * .7) * .9);
      r.castShadow = true;
      g.add(r);
    }
    return g;
  },
  fallenlog(m) {
    const g = new THREE.Group();
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, 2.6, 7), m.mangroveTrunk);
    log.rotation.z = Math.PI / 2; log.rotation.y = .3; log.position.y = .26;
    log.castShadow = log.receiveShadow = true;
    const moss = new THREE.Mesh(new THREE.BoxGeometry(1.2, .08, .3), m.mangroveCanopy);
    moss.position.set(-.3, .48, 0); moss.rotation.y = .3;
    g.add(log, moss);
    return g;
  },
  sporesac(m) {
    const g = new THREE.Group();
    const sac = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), m.spore);
    sac.position.y = .32; sac.scale.set(1, 1.25, 1); sac.castShadow = true;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, .2, 5), m.swampRoot);
    stalk.position.y = .08;
    g.add(sac, stalk);
    g.userData.pulse = sac; // pulso bioluminescente no animator
    return g;
  },
  totem(m) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.2, .18), m.woodDark);
    post.position.y = 1.1; post.castShadow = true;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(.26, .2, .22), m.bone);
    skull.position.y = 2.0; skull.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, .2), m.rust);
    band.position.y = 1.4;
    g.add(post, skull, band);
    return g;
  },

  // W3 CKESALTH — O Deserto das Almas Esquecidas: toco de palmeira, tanque
  // de óleo, oleoduto, ossos no chão e muralha do resort
  palmstump(m) {
    const g = new THREE.Group();
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(.2, .26, .5, 8), m.palmTrunk);
    stump.position.y = .25; stump.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.24, .04, 5, 10), m.woodDark);
    ring.rotation.x = Math.PI / 2; ring.position.y = .5;
    g.add(stump, ring);
    for (let i = 0; i < 2; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(.7, .16), m.palmFrond);
      frond.position.set(Math.cos(i * 2.4) * .3, .44, Math.sin(i * 2.4) * .3);
      frond.rotation.set(-.7, i * 2.4, 0);
      g.add(frond);
    }
    return g;
  },
  oiltank(m) {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 1.1, 12), m.rust);
    tank.position.y = .55; tank.castShadow = tank.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.74, .74, .1, 12), m.steel);
    cap.position.y = 1.12; cap.castShadow = true;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 6), m.fire);
    flame.position.set(.3, 1.4, 0); flame.name = 'flame';
    g.add(tank, cap, flame);
    g.userData.flame = flame; // tremulação no animator
    return g;
  },
  pipeline(m) {
    const g = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 3.2, 8), m.rust);
    pipe.rotation.z = Math.PI / 2; pipe.rotation.y = .5; pipe.position.y = .42;
    pipe.castShadow = true;
    g.add(pipe);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .42, .08), m.steel);
      leg.position.set(Math.cos(i * 2.1) * 1.1, .21, Math.sin(i * 2.1) * 1.1);
      g.add(leg);
    }
    return g;
  },
  // F42 — trilho da ESTAÇÃO FERROVIÁRIA (README W1: ZEX = estação): dois trilhos
  // de aço + dormentes de madeira — leitura imediata de ferrovia no Setor da estação.
  rail(m) {
    const g = new THREE.Group();
    for (const side of [-.72, .72]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, .09, .1), m.steel);
      bar.position.set(0, .18, side);
      bar.castShadow = true;
      g.add(bar);
    }
    for (let i = 0; i < 5; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(.34, .07, 1.7), m.woodDark);
      tie.position.set(-1.2 + i * .6, .04, 0);
      tie.receiveShadow = true;
      g.add(tie);
    }
    return g;
  },
  bones(m) {
    const g = new THREE.Group();
    const rib = new THREE.Mesh(new THREE.TorusGeometry(.34, .045, 5, 10, Math.PI), m.bone);
    rib.position.y = .18; rib.rotation.y = .4; rib.castShadow = true;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(.3, .22, .26), m.bone);
    skull.position.set(.65, .11, .2); skull.rotation.y = .8; skull.castShadow = true;
    const femur = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .8, 6), m.bone);
    femur.rotation.z = Math.PI / 2; femur.rotation.y = -.6; femur.position.set(-.4, .06, -.25);
    g.add(rib, skull, femur);
    return g;
  },
  resortwall(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const h = .9 - (i === 2 ? .3 : 0);  // trecho desabado
      const seg = new THREE.Mesh(new THREE.BoxGeometry(.9, h, .24), m.stone);
      seg.position.set(i * .92, h / 2, 0);
      seg.castShadow = seg.receiveShadow = true;
      g.add(seg);
    }
    const palm = new THREE.Mesh(new THREE.CylinderGeometry(.06, .09, 1.4, 6), m.palmTrunk);
    palm.position.set(-1.0, .7, .3); palm.rotation.z = .18; palm.castShadow = true;
    g.add(palm);
    return g;
  },

  // W4 ARUKHEEA — A Ilha dos Gritos Calados: palmeira, muralha da prisão,
  // farol, caixas torácicas de baleia e casco de naufrágio
  palmtree(m) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.07, .12, 2.8, 7), m.palmTrunk);
    trunk.position.y = 1.4; trunk.rotation.z = .12; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .3), m.palmFrond);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * .55, 2.75, Math.sin(a) * .55);
      frond.rotation.set(-.55 - Math.sin(a) * .2, -a + Math.PI / 2, Math.cos(a) * .4);
      frond.castShadow = true;
      g.add(frond);
    }
    return g;
  },
  prisonwall(m) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, .3), m.prisonStone);
    wall.position.y = 1.0; wall.castShadow = wall.receiveShadow = true;
    const crenel = new THREE.Mesh(new THREE.BoxGeometry(2.6, .18, .36), m.stoneDark);
    crenel.position.y = 2.06;
    const bars = new THREE.Mesh(new THREE.BoxGeometry(.7, .8, .06), m.steel);
    bars.position.set(.6, .5, .18);   // cela enferrujada embutida
    g.add(wall, crenel, bars);
    return g;
  },
  lighthouse(m) {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(.42, .58, 3.4, 10), m.stone);
    tower.position.y = 1.7; tower.castShadow = true;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.34, .3, .5, 8), m.holo);
    lamp.position.y = 3.62; lamp.name = 'lampGlass';
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.44, .4, 10), m.stoneDark);
    cap.position.y = 4.05; cap.castShadow = true;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.16, .5, 7.0, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.6; beam.rotation.z = .5; beam.name = 'lampBeam';
    g.add(tower, lamp, cap, beam);
    g.userData.spinners = [beam];  // farol gira (nunca desliga — diretiva)
    return g;
  },
  whaleribs(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(.9 - i * .1, .06, 5, 12, Math.PI), m.bone);
      rib.position.set(-.9 + i * .6, .5, 0);
      rib.rotation.y = Math.PI / 2;
      rib.castShadow = true;
      g.add(rib);
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 2.6, 6), m.bone);
    spine.rotation.z = Math.PI / 2; spine.position.y = .55;
    g.add(spine);
    return g;
  },
  shipwreck(m) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, .8, 1.1), m.woodDark);
    hull.position.y = .3; hull.rotation.z = -.22; hull.castShadow = hull.receiveShadow = true;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 2.0, 6), m.wood);
    mast.position.set(.5, 1.2, 0); mast.rotation.z = .5; mast.castShadow = true;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, .08, .08), m.wood);
    rail.position.set(-.2, .95, .5); rail.rotation.z = -.22;
    g.add(hull, mast, rail);
    return g;
  },

  // F43 — W1 BARBURHEN (README): "construções inacabadas... desabamentos"
  skeleton(m) {
    // esqueleto de concreto: 4 pilares + 2 lajes crua + vergalhão exposto no topo
    const g = new THREE.Group();
    g.name = 'skeleton';
    const colGeo = new THREE.BoxGeometry(.3, 3.2, .3);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const col = new THREE.Mesh(colGeo, m.concrete);
      col.position.set(px, 1.6, pz); col.castShadow = true;
      g.add(col);
    }
    for (const y of [1.5, 3.05]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.5, .18, 2.5), m.concrete);
      slab.position.y = y; slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
    }
    for (let i = 0; i < 5; i++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .7, 4), m.rust);
      rebar.position.set(-.8 + (i % 3) * .8, 3.5, i < 3 ? -.6 : .6);
      rebar.rotation.z = i % 2 ? .12 : -.1;
      g.add(rebar);
    }
    return g;
  },
  collapse(m) {
    // desabamento: laje tombada sobre pilha de entulho com vergalhão torcido
    const g = new THREE.Group();
    g.name = 'collapse';
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, .2, 1.6), m.concrete);
    slab.position.set(0, .55, .2); slab.rotation.set(.5, .4, .18);
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
    const geo = new THREE.DodecahedronGeometry(.4, 0);
    for (const [dx, dz, s] of [[-.5, -.3, 1], [.4, .1, .8], [.1, .5, .6], [-.2, .1, .5]]) {
      const r = new THREE.Mesh(geo, m.debris);
      r.position.set(dx, .2 * s, dz);
      r.rotation.set(dx * 2, dz * 3, dx + dz);
      r.scale.setScalar(s); r.castShadow = true;
      g.add(r);
    }
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.4, 5), m.rust);
    rebar.position.set(.7, .8, -.2); rebar.rotation.set(.6, .3, -.7);
    g.add(rebar);
    return g;
  },

  // F43 — W2 PRIADUS (README): "flora carnívora" — bulbo ácido aberto com
  // dentes inclinados para dentro e tentáculos rasteiros; pulso bioluminescente
  // (a FAUNA — jacarés — segue conteúdo UE5; a FLORA é dressing estático).
  carnplant(m) {
    const g = new THREE.Group();
    g.name = 'carnplant';
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .5, 6), m.swampRoot);
    stalk.position.y = .25; stalk.castShadow = true;
    const pod = new THREE.Mesh(
      new THREE.SphereGeometry(.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * .55), m.acid);
    pod.position.y = .58; pod.rotation.x = Math.PI; pod.scale.set(1, .8, 1);
    pod.castShadow = true;
    g.add(stalk, pod);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.045, .18, 4), m.acid);
      tooth.position.set(Math.cos(a) * .24, .62, Math.sin(a) * .24);
      tooth.rotation.set(Math.sin(a) * .8, 0, -Math.cos(a) * .8); // inclinados para dentro
      g.add(tooth);
    }
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.02, .04, .7, 5), m.vine);
      t.position.set(Math.cos(i * 2.2) * .4, .1, Math.sin(i * 2.2) * .4);
      t.rotation.set(Math.cos(i * 2.2) * 1.1, 0, Math.sin(i * 2.2) * -1.1);
      t.castShadow = true;
      g.add(t);
    }
    g.userData.pulse = pod; // pulso bioluminescente no animator (F43 ativa o contrato)
    return g;
  },

  // ════════ F48 — fidelidade canônica (README W4/CIGKV) ════════

  // CHALÉ DE PALHA (W4): "chalés de palha em ruínas ou destruídos pelo fogo".
  // variante 0=intacto (palha dourada) | 1=meio queimado | 2=colapsado (carvão)
  strawhut(m, variant) {
    const g = new THREE.Group();
    const straw = variant === 0 ? m.strawFresh : variant === 1 ? m.thatch : m.strawChar;
    const frame = m.woodDark;
    // círculo de estacas da costa pirata
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.5, 5), frame);
      post.position.set(Math.cos(a) * .85, .72, Math.sin(a) * .7);
      post.rotation.set(Math.sin(a) * .08, 0, -Math.cos(a) * .08);
      post.castShadow = true;
      g.add(post);
    }
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.05, 1.1, 8, 1, true), straw);
    wall.position.y = 1.05; wall.castShadow = true;
    g.add(wall);
    if (variant === 2) {
      // colapsado: telhado caído de lado + brasas
      const fallen = new THREE.Mesh(frustumPrism({ wB: 1.9, wT: .3, lB: 1.7, lT: .3, h: .7 }), m.strawChar);
      fallen.position.set(.5, .3, .2); fallen.rotation.z = 1.2; fallen.castShadow = true;
      g.add(fallen);
      const ember = new THREE.Mesh(new THREE.ConeGeometry(.18, .3, 6), m.fire.clone());
      ember.position.set(-.3, .18, -.15);
      g.add(ember);
      g.userData.flame = ember;
    } else {
      // telhado cônico de palha (queimado = furo/chanfrado)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, .9, 8), variant === 1 ? m.strawChar : straw);
      roof.position.y = 2.02; roof.castShadow = true;
      if (variant === 1) roof.rotation.z = .12;   // assentado/quebrado
      g.add(roof);
    }
    return g;
  },

  // BARRIL DE ÓLEO (W4 — fábrica de óleo de baleia): "barris de óleo por todos
  // os cantos e chamas". variante 0=fechado enferrujado | 1=aberto com chama | 2=tombado
  oilbarrel(m, variant) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .88, 10), m.barrelRust);
    body.position.y = .44; body.castShadow = true;
    // aros reforçando (identidade industrial)
    for (const y of [.22, .66]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.33, .025, 5, 12), m.rust);
      ring.position.y = y; ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    g.add(body);
    if (variant === 1) {
      // barril aberto: óleo negro visível + chama real (animator flames)
      const oil = new THREE.Mesh(new THREE.CircleGeometry(.27, 10), m.oil);
      oil.rotation.x = -Math.PI / 2; oil.position.y = .86;
      g.add(oil);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.14, .42, 6), m.fire.clone());
      flame.position.y = 1.08;
      g.add(flame);
      g.userData.flame = flame;
    } else if (variant === 2) {
      g.rotation.z = Math.PI / 2 - .12;           // tombado vazando
      body.position.y = .3;
    }
    return g;
  },

  // ROCHA-ABRIGO (CIGKV — Parque Abandonado): "rochas que podem servir de
  // abrigo" — bloco granítico com facetas ecompanhante menor (leitura CoD).
  boulder(m, variant) {
    const g = new THREE.Group();
    const main = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + variant * .18, 0), m.stone);
    main.scale.set(1.15, .75, .95);
    main.position.y = .42; main.rotation.set(variant * .7, variant * 1.3, variant * .4);
    main.castShadow = main.receiveShadow = true;
    g.add(main);
    const side = new THREE.Mesh(new THREE.DodecahedronGeometry(.45 + variant * .08, 0), m.stoneDark);
    side.position.set(.9, .22, .55);
    side.rotation.set(variant, variant * .5, 0);
    side.castShadow = true;
    g.add(side);
    return g;
  },

  // ÁRVORE ANTIGA (CIGKV — Parque Abandonado): "árvores antigas com as suas
  // copas altas e galhos bem espalhados" — tronco grosso + 3 andares de copa
  // em altura (7–9 m), silhueta de carvalho centenário.
  ancienttree(m, variant) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.34, .55, 5.6, 8), m.oakTrunk);
    trunk.position.y = 2.8; trunk.castShadow = true;
    g.add(trunk);
    // raízes em contraforte (árvore velha)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + variant * .5;
      const root = new THREE.Mesh(new THREE.ConeGeometry(.22, 1.3, 5), m.oakTrunk);
      root.position.set(Math.cos(a) * .5, .3, Math.sin(a) * .5);
      root.rotation.set(Math.sin(a) * .9, 0, -Math.cos(a) * .9);
      root.castShadow = true;
      g.add(root);
    }
    // galhos primários espalhados (cânon: "galhos bem espalhados")
    const canopy = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + variant;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(.07, .13, 2.6, 5), m.oakTrunk);
      branch.position.set(Math.cos(a) * 1.2, 4.6 + (i % 2) * .9, Math.sin(a) * 1.2);
      branch.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(branch);
      // blob de copa na ponta do galho + copa do topo
      const blob = new THREE.Mesh(new THREE.SphereGeometry(1.15 + (i % 3) * .22, 7, 6), m.oakCanopy);
      blob.position.set(Math.cos(a) * 2.1, 5.3 + (i % 2) * 1.1, Math.sin(a) * 2.1);
      blob.scale.y = .72;
      blob.castShadow = true;
      g.add(blob); canopy.push(blob);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), m.oakCanopy);
    top.position.y = 7.4; top.scale.y = .8; top.castShadow = true;
    g.add(top);
    g.userData.canopy = canopy;
    return g;
  },

  // ════════ T74 — canon W3/W4/CIGKV (README 1:1, reconciliado da VPS) ════════

  // PALMEIRA DERRUBADA (W3): "palmeiras derrubadas" do deserto — tronco
  // tombado com anéis de casca, raízes arrancadas e coroa de frondes aberta.
  fallenpalm(m) {
    const g = new THREE.Group();
    g.name = 'fallenpalm';
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09, .16, 3.0, 7), m.palmTrunk);
    trunk.rotation.z = Math.PI / 2 - .1;          // tombada, quase deitada
    trunk.position.set(0, .3, 0);                 // o tombaço levanta a base
    trunk.castShadow = true;
    g.add(trunk);
    // anéis de casca ao longo do tronco (leitura de palmeira morta)
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.11 + i * .012, .022, 5, 9), m.woodDark);
      ring.rotation.y = Math.PI / 2; ring.position.set(-1.2 + i * .62, .34 + Math.sin(i * 1.1) * .03, 0);
      g.add(ring);
    }
    // raízes arrancadas na base (cones sapando para trás)
    for (const [rz, rx] of [[.28, .16], [-.22, .2], [.05, -.26]]) {
      const root = new THREE.Mesh(new THREE.ConeGeometry(.07, .55, 5), m.palmTrunk);
      root.rotation.x = 1.9; root.rotation.z = rx;
      root.position.set(-1.62, .22, rz);
      root.castShadow = true;
      g.add(root);
    }
    // coroa de frondes ABERTA no chão na ponta do tronco (5 folhas caídas)
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .26), m.palmFrond);
      const a = (i / 5) * Math.PI * 2 + .5;
      frond.position.set(1.62 + Math.cos(a) * .45, .06 + (i % 2) * .04, Math.sin(a) * .45);
      frond.rotation.set(-Math.PI / 2 + .18, -a + Math.PI / 2, Math.cos(a) * .35);
      frond.castShadow = true;
      g.add(frond);
    }
    return g;
  },

  // CHALÉ QUEIMADO (W4): "chalés de palha em ruínas ou destruídos pelo fogo"
  // — paredes carbonizadas, telhado desabado com vigas e brasas pulsantes.
  burnthut(m) {
    const g = new THREE.Group();
    g.name = 'burnthut';
    const charred = m.woodDark;
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, .12), charred);
    wallL.position.set(-.75, .5, 0); wallL.rotation.z = .08; wallL.castShadow = true;
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(.12, .8, 1.4), charred);
    wallR.position.set(.72, .4, .3); wallR.rotation.z = -.12; wallR.castShadow = true;
    g.add(wallL, wallR);
    // vigas do telhado desabado (2 a jeito de colapso)
    for (const [rz, ry] of [[.35, .3], [-.15, -.5]]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, .07, .07), m.woodDark);
      beam.position.set(0, .95 + rz * .3, rz); beam.rotation.set(0, ry, .5);
      beam.castShadow = true;
      g.add(beam);
    }
    // palha residual do telhado (planos queimados no chão)
    for (let i = 0; i < 3; i++) {
      const straw = new THREE.Mesh(new THREE.PlaneGeometry(.8, .5), m.palmFrond);
      straw.position.set(-.3 + i * .45, .03 + (i % 2) * .03, .25 - i * .2);
      straw.rotation.set(-Math.PI / 2 + .15, i * 1.4, 0);
      g.add(straw);
    }
    // brasas sob a ruína (luz de fogo morto-vivo) — pulse: emissive respira
    const ember = new THREE.Mesh(new THREE.SphereGeometry(.16, 6, 5), m.fire);
    ember.scale.set(1.4, .5, 1.1); ember.position.set(.1, .06, -.1);
    ember.name = 'ember';
    g.add(ember);
    g.userData.pulse = ember;
    return g;
  },

  // TORRE DA PRISÃO (W4): a "Prisão do Sol da Noite" monumental — keep de
  // pedra com ameias, grilhões vazios e a bandeira esfarrapada do carcereiro.
  prisonkeep(m) {
    const g = new THREE.Group();
    g.name = 'prisonkeep';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.1, 3.4, 9), m.prisonStone);
    body.position.y = 1.7; body.castShadow = body.receiveShadow = true;
    g.add(body);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, .3, 9), m.stoneDark);
    crown.position.y = 3.55; g.add(crown);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const crenel = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .22), m.stoneDark);
      crenel.position.set(Math.cos(a) * 1.02, 3.85, Math.sin(a) * 1.02);
      g.add(crenel);
    }
    // grilhões na base (argolas vazias — os "gritos calados")
    for (const s of [-1, 1]) {
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(.1, .025, 5, 10), m.steel);
      shackle.rotation.x = Math.PI / 2; shackle.position.set(s * .8, .3, .6);
      g.add(shackle);
    }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.55, .8), m.palmFrond);
    flag.position.set(0, 4.15, .25); flag.rotation.y = .4;
    g.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 5), m.steel);
    pole.position.set(0, 3.9, 0); g.add(pole);
    return g;
  },

  // HELICÓPTERO DE FUGA (W4): "quem não sobe no helicóptero torna-se 'grito
  // calado'" — marca do fim de ciclo; rotor gira no registry (spinners).
  heli(m) {
    const g = new THREE.Group();
    g.name = 'heli';
    const body = new THREE.Mesh(new THREE.SphereGeometry(.5, 9, 7), m.steel);
    body.scale.set(1, .75, 1.7); body.position.y = .62; body.castShadow = true;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(.07, .04, 1.4, 6), m.steel);
    tail.rotation.x = Math.PI / 2; tail.position.set(0, .7, -1.15); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.05, .4, .18), m.steel);
    fin.position.set(0, .9, -1.78); g.add(fin);
    const skid = new THREE.Mesh(new THREE.BoxGeometry(.9, .06, .06), m.steel);
    skid.position.y = .12; g.add(skid);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(2.6, .03, .18), m.steel);
    rotor.position.y = 1.22; rotor.name = 'rotor';
    g.add(body, tail, fin, skid, rotor);
    g.userData.rotor = rotor;
    return g;
  },

  // FÁBRICA DE ÓLEO DE BALEIA (W4): "na marina, onde ficava a velha fábrica de
  // óleo de baleia, só restava a sua estrutura velha e enferrujada" — galpão
  // em ruína com chaminé fumegando (floaters) e tanque tombado.
  whalefactory(m) {
    const g = new THREE.Group();
    g.name = 'whalefactory';
    const shed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 1.6), m.rust);
    shed.position.y = .75; shed.castShadow = shed.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, .12, 1.8), m.stoneDark);
    roof.position.y = 1.58; roof.rotation.z = .04; g.add(roof);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, 1.5, 8), m.rust);
    chimney.position.set(1.15, 2.1, -.4); chimney.rotation.z = .08; chimney.castShadow = true;
    // F66 — a voluta ESTÁTICA saiu: a chaminé fumega de verdade (emitter de
    // partículas no buildDistrictDressing, boca em (1.28, 3.0, -.4) local).
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .9, 10), m.rust);
    tank.rotation.z = Math.PI / 2; tank.position.set(-1.8, .4, .9); tank.castShadow = true;
    g.add(shed, roof, chimney, tank);
    return g;
  },

  // PAREDE HOLOGRÁFICA (CIGKV): "paredes holográficas exibem as estatísticas
  // de cada arma" (Pátio de Armamento do README CIGKV) — painel de vidro com
  // barras de stats e base de energia.
  holowall(m) {
    const g = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#59e6ff'), transparent: true, opacity: .3,
      roughness: .18, metalness: .1, emissive: new THREE.Color('#2fd8f0'), emissiveIntensity: .55,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.25, .05), glass);
    panel.position.y = 1.0; panel.name = 'holoGlass';
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.35, .04), m.steel);
    frame.position.set(0, 1.0, -.02);
    g.add(frame, panel);
    // barras de stats holográficas (3 linhas de leitura legível de longe)
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.9 - i * .22, .07, .01),
        new THREE.MeshBasicMaterial({ color: '#aefffb', transparent: true, opacity: .85 }));
      bar.position.set(-.12, 1.28 - i * .22, .04);
      g.add(bar);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .1, 10), m.holo);
    base.position.y = .05; g.add(base);
    return g;
  },

  // ---------- F66 — DOCX de referência: coreto/bancos/grama de Barburhen,
  // casas dos oficiais do CIGKV, lago de Priadus, corpos apodrecendo e a
  // cerca em curto-circuito da Prisão de Arukheea -------------------------

  // CORETO CENTRAL (W1 Parque Abandonado — DOCX: "Coreto central"): base
  // octogonal de pedra com banda de musgo, 6 colunas (1 tombada) e cúpula.
  gazebo(m) {
    const g = new THREE.Group();
    g.name = 'gazebo';
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, .38, 8), m.stone);
    base.position.y = .19; base.castShadow = base.receiveShadow = true;
    const mossBand = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, .16, 8),
      ST('#46622e', { rough: .95, flat: true }));
    mossBand.position.y = .3;
    g.add(base, mossBand);
    const postGeo = new THREE.CylinderGeometry(.07, .09, 2.1, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const broken = i === 2;                     // coluna tombada pela floresta
      const post = new THREE.Mesh(postGeo, m.woodDark);
      const h = broken ? 1.0 : 2.1;
      post.scale.y = h / 2.1;
      post.position.set(Math.cos(a) * 1.3, .38 + h / 2, Math.sin(a) * 1.3);
      if (broken) { post.rotation.z = .8; post.position.x += .35; }
      post.castShadow = true;
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.05, 8), m.woodDark);
    roof.position.y = 2.75; roof.castShadow = true;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(.11, 6, 5), m.stoneDark);
    finial.position.y = 3.32;
    g.add(roof, finial);
    return g;
  },

  // BANCO QUEBRADO (W1 Parque — DOCX: "bancos quebrados"): assento estourado,
  // perna arrancada e musgo no encosto — mobiliário tomado pela vegetação.
  brokenbench(m) {
    const g = new THREE.Group();
    g.name = 'brokenbench';
    const seatA = new THREE.Mesh(new THREE.BoxGeometry(1.3, .07, .42), m.woodDark);
    seatA.position.set(-.3, .42, 0); seatA.rotation.z = .06; seatA.castShadow = true;
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(.55, .07, .42), m.woodDark);
    seatB.position.set(.52, .3, .1); seatB.rotation.z = -.32; seatB.rotation.y = .4; // ripa estourada
    const legA = new THREE.Mesh(new THREE.BoxGeometry(.09, .42, .4), m.woodDark);
    legA.position.set(-.5, .21, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.25, .3, .06), m.woodDark);
    back.position.set(-.3, .62, -.22); back.rotation.x = .25; back.rotation.z = -.07;
    const mossSeat = new THREE.Mesh(new THREE.BoxGeometry(.7, .03, .34), ST('#3f5a28', { rough: .95, flat: true }));
    mossSeat.position.set(-.35, .47, 0);
    g.add(seatA, seatB, legA, back, mossSeat);
    return g;
  },

  // GRAMA INVASORA (W1 — DOCX: "gramas por todos os lados"): tufo fino
  // nascendo das rachaduras do concreto/asfalto (o inverso da F58: a cidade
  // urbana PERDE asfalto para a natureza, como o cânon pede).
  grasstuft(m) {
    const g = new THREE.Group();
    const bladeGeo = new THREE.ConeGeometry(.032, .42, 4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (i % 3) * .35;
      const blade = new THREE.Mesh(bladeGeo,
        ST(i % 2 ? '#5d7a34' : '#6f8a3c', { rough: .92, flat: true }));
      const tilt = .18 + (i % 4) * .07;
      blade.position.set(Math.cos(a) * .09, .17, Math.sin(a) * .09);
      blade.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
      blade.scale.y = .7 + (i % 3) * .3;
      g.add(blade);
    }
    return g;
  },

  // CASA DOS OFICIAIS (CIGKV — DOCX: "Vila abandonada de Casas dos oficiais"):
  // casa térrea com telhado de duas águas, janelas escurecidas com ripas
  // tortas, porta entreaberta e banda de musgo na base (abandonada há anos);
  // variante 1 = telhado parcialmente colapsado.
  officerhouse(m, variant) {
    const g = new THREE.Group();
    g.name = 'officerhouse';
    const burnt = variant === 1;
    const wall = ST(burnt ? '#6e6254' : '#b0a898', { rough: .92, flat: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 2.4), wall);
    body.position.y = .95; body.castShadow = body.receiveShadow = true;
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.9, .09, 2.7), m.woodDark);
    roofL.position.set(-.85, 2.28, 0); roofL.rotation.z = .52;
    const roofR = roofL.clone(); roofR.position.x = .85; roofR.rotation.z = -.52;
    if (burnt) { roofL.rotation.z = .95; roofL.position.y = 2.05; roofR.rotation.z = -.2; }
    g.add(body, roofL, roofR);
    for (const wx of [-.85, .85]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(.52, .6, .06),
        new THREE.MeshStandardMaterial({ color: '#12100c', roughness: 1 }));
      win.position.set(wx, 1.25, 1.21);
      g.add(win);
      for (const bx of [-.12, .13]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(.05, .62, .02), m.woodDark);
        bar.position.set(wx + bx, 1.25, 1.25); bar.rotation.z = (bx > 0 ? .1 : -.14);
        g.add(bar);
      }
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(.72, 1.45, .06), m.woodDark);
    door.position.set(.15, .74, 1.21); door.rotation.y = .22; g.add(door);
    const mossBand = new THREE.Mesh(new THREE.BoxGeometry(3.28, .4, 2.48), ST('#46622e', { rough: .95, flat: true }));
    mossBand.position.y = .2;
    g.add(mossBand);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(.34, .8, .34), m.stoneDark);
    chimney.position.set(-1.1, 2.5, -.7); chimney.rotation.z = burnt ? .18 : .04;
    g.add(chimney);
    return g;
  },

  // PONTE DETERIORADA (W2 — DOCX: "pontes em deterioração" do lago): dois
  // vãos com verga cedida, pranchas faltando e guarda-corpo torto — ancorada
  // à borda do lago pelo placement canônico (perpendicular à margem).
  brokenbridge(m) {
    const g = new THREE.Group();
    g.name = 'brokenbridge';
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, .95, 6), m.woodDark);
      post.position.set(0, .2, s * .42); post.castShadow = true;
      g.add(post);
    }
    const deckA = new THREE.Mesh(new THREE.BoxGeometry(2.2, .09, .9), m.wood);
    deckA.position.set(-1.05, .62, 0); deckA.rotation.z = .1; deckA.castShadow = true;
    const deckB = new THREE.Mesh(new THREE.BoxGeometry(2.2, .09, .9), m.wood);
    deckB.position.set(1.05, .5, 0); deckB.rotation.z = -.16; deckB.castShadow = true;
    g.add(deckA, deckB);
    for (const [px, tilt] of [[-.9, 0], [.2, .22], [1.5, -.3]]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(.5, .05, .82), m.woodDark);
      plank.position.set(px, .66, 0); plank.rotation.z = tilt;
      g.add(plank);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.4, .05, .05), m.woodDark);
    rail.position.set(.3, .95, .44); rail.rotation.z = .14; rail.rotation.y = .05;
    g.add(rail);
    return g;
  },

  // ILHOTA DO LAGO (W2 — DOCX: "pequenas ilhas espalhadas"): montículo de
  // lama com mangue anão e capim, nascendo do espelho d'água.
  isle(m) {
    const g = new THREE.Group();
    g.name = 'isle';
    const mound = new THREE.Mesh(new THREE.ConeGeometry(1.1, .5, 9), ST('#5a4a32', { rough: .96, flat: true }));
    mound.position.y = .22; mound.scale.set(1, .8, .8); mound.castShadow = true;
    g.add(mound);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, .9, 6), m.mangroveTrunk);
    trunk.rotation.z = .18; trunk.position.set(.3, .85, 0); g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(.55, .5, 7), m.mangroveCanopy);
    canopy.position.set(.42, 1.35, 0); canopy.rotation.z = .1; g.add(canopy);
    for (let i = 0; i < 4; i++) {
      const reed = new THREE.Mesh(new THREE.ConeGeometry(.03, .5, 4),
        ST('#5d7a34', { rough: .92, flat: true }));
      reed.position.set(Math.cos(i * 1.7) * .5, .5, Math.sin(i * 1.7) * .4);
      reed.rotation.z = Math.cos(i * 1.7) * .25;
      g.add(reed);
    }
    return g;
  },

  // CORPO APONDORECENDO (W1 "corpos estáticos" de lore / W2 "corpos apodrecendo
  // em meio às folhagens" / W3 "os caídos são alimento dos abutres"): torso
  // caído com crânio e braço expostos, coberto por trepadeiras — mesh
  // ESTÁTICO que não despawna (cânon de lore).
  rotcorpse(m) {
    const g = new THREE.Group();
    g.name = 'rotcorpse';
    const torso = new THREE.Mesh(new THREE.SphereGeometry(.24, 8, 6),
      ST('#5a5244', { rough: .98, flat: true }));
    torso.scale.set(.75, .42, 1.5); torso.position.y = .12; torso.castShadow = true;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(.095, 7, 6), m.bone);
    skull.position.set(0, .14, .56);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(.16, .022, 5, 9, Math.PI), m.bone);
    rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI; rib.position.set(0, .16, .1);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.04, .03, .5, 5), m.bone);
    arm.rotation.z = Math.PI / 2; arm.rotation.y = .5; arm.position.set(.3, .07, .18);
    g.add(torso, skull, rib, arm);
    for (let i = 0; i < 3; i++) {
      const vine = new THREE.Mesh(new THREE.BoxGeometry(.9, .02, .16),
        ST('#3f6b2a', { rough: .92 }));
      vine.position.set(0, .1 + i * .04, -.25 + i * .22);
      vine.rotation.y = (i - 1) * .5;
      g.add(vine);
    }
    return g;
  },

  // CERCA DE ARAME FARPADO EM CURTO (W4 Prisão — DOCX: "mais arames farpados,
  // cercas em curto circuito e faíscas"): dois postes tortos enferrujados,
  // 3 fios com farpes e ponta de energia — as FAÍSCAS são emitter real.
  barbwire(m) {
    const g = new THREE.Group();
    g.name = 'barbwire';
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 1.15, 6), m.rust);
      post.position.set(s * 1.05, .5, 0); post.rotation.z = s * .09; post.castShadow = true;
      g.add(post);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 5),
      ST('#bfe6ff', { emissive: '#7fc4ff', ei: 1.4, rough: .4 }));
    tip.position.set(1.13, 1.12, 0); g.add(tip);
    const wireGeo = new THREE.BoxGeometry(2.15, .014, .014);
    for (const [h, sag] of [[.45, .015], [.72, .04], [1.0, .02]]) {
      const wire = new THREE.Mesh(wireGeo, m.rust);
      wire.position.set(0, h - sag, 0); wire.rotation.z = sag * .8;
      g.add(wire);
      for (let b = 0; b < 3; b++) {
        const barb = new THREE.Mesh(new THREE.OctahedronGeometry(.032), m.rust);
        barb.position.set(-.7 + b * .7, h - sag + .03, 0);
        g.add(barb);
      }
    }
    return g;
  },
};

// materiais de patch por tipo
function patchMaterial(type, scenario) {
  switch (type) {
    case 'waterpool': return waterPoolMaterial(scenario.id === 'Priadus' ? '#2e6b63' : '#3a7a70');
    case 'mudpatch': return mudMaterial(2);
    case 'snowpatch': return snowMaterial(1.6);
    case 'lavapatch': return lavaMaterial(1);
    case 'runering': return runeMaterial('#59e6ff');
    case 'voidscorch': return voidScorchMaterial();
    case 'crater': return craterMaterial();     // Fase 31 — cratera de Barburhen
    case 'oilpool': return oilPoolMaterial();   // Fase 31 — óleo negro de Ckesalth
    case 'quicksand': return quicksandMaterial(); // F43 — areia movediça (W3)
    case 'mist': return mistMaterial();         // F43 — neblina alucinógena (W2)
    case 'stream': return waterPoolMaterial('#3f6f62'); // F48 — riacho do Parque CIGKV
    case 'patioring': return patioRingMaterial(); // T74 — anel do Pátio de Armamento (CIGKV, energia ciano)
    case 'moss': return mossMaterial();         // F66 — musgo invasor (W1)
    case 'drylake': return dryLakeMaterial();   // F66 — lago seco do Parque (W1)
    case 'lake': return waterPoolMaterial('#2e6b63'); // F66 — espelho do lago (W2, mesma água do pântano)
    default: return mudMaterial(2);
  }
}
let _voidScorch = null;
function voidScorchMaterial() {
  if (!_voidScorch) {
    _voidScorch = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#120c22'), transparent: true, opacity: .62,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  }
  return _voidScorch;
}
let _crater = null;
function craterMaterial() {
  if (!_crater) {
    _crater = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#1c150e'), transparent: true, opacity: .7,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  }
  return _crater;
}
let _patioRing = null;
function patioRingMaterial() {
  if (!_patioRing) {
    _patioRing = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#59e6ff'), transparent: true, opacity: .34,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  }
  return _patioRing;
}
let _oil = null;
function oilPoolMaterial() {
  if (!_oil) {
    _oil = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0a0c0e'), roughness: .14, metalness: .5,
      transparent: true, opacity: .92, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  }
  return _oil;
}

/**
 * Constrói o dressing na cena. Registrado em scene.userData.districtDressing
 * com o MESMO contrato dos worldMarks: { id, counts, animators, placements }.
 * @param {THREE.Scene} scene
 * @param {object} layout — getWorldLayout(seed, scenarioId)
 * @param {object} scenario — resolveScenario(...)
 * @param {object} q — qualityTier(...)
 * @param {{ contactShadows?: (entries: Array) => void,
 *          bandContactShadows?: (entries: Array) => void }} hooks — reusa a infra da Fase 7 (F40: + bandas)
 */
export function buildDistrictDressing(scene, layout, scenario, q, { contactShadows, bandContactShadows } = {}) {
  // idempotência: mesma cena não acumula 2× (padrão worldmarks)
  if (scene.userData.districtDressing) return scene.userData.districtDressing;

  const placements = districtDressing(layout, scenario, { density: q.dressingFactor ?? 1 });
  const m = sharedMaterials();
  const dressing = new THREE.Group();
  dressing.name = 'district-dressing';
  const animators = [];
  const shadows = [];

  // ---------- Fase 26 — PARTÍCULAS REAIS no miolo da arena ----------
  // Fumaça de fogueira + fagulhas, brasas nas fendas de lava, motos do vazio
  // escapando das fendas e fagulhas da torre de destilação — o mesmo pool
  // compartilhado dos marcos (1 draw call), com ticker idempotente (districts
  // roda ANTES de buildWorldMarks em buildScene: quem cria, registra o tick).
  const particleRng = new SeededRng(`${layout.seed}:${layout.scenarioId}:dressing-particles`);
  const emitterAnimators = [];
  const sharedSystem = getSharedParticles(scene);
  if (sharedSystem) {
    const emitters = [];
    const addEmitter = (origin, rate, params) => {
      if (emitters.length >= 12) return; // teto de orçamento (pior caso ~90 vivos)
      emitters.push(new Emitter(sharedSystem, { origin, rate, params }));
    };
    for (const item of placements.items) {
      if (item.type === 'campfire') {
        // fumaça de fogueira: coluna cinza fina com brisa + deriva térmica
        addEmitter({ x: item.x, y: .9 * item.s, z: item.z }, 2.4, () => ({
          dx: (particleRng.next() - .5) * .3, dy: 0, dz: (particleRng.next() - .5) * .3,
          vx: .5 + particleRng.next() * .5, vy: 1.6 + particleRng.next() * 1.1, vz: (particleRng.next() - .5) * .5,
          size: .8 + particleRng.next() * .7, growth: .9, life: 2.6 + particleRng.next() * 1.6,
          drag: .4, gravity: -0.5, alpha: .3,
          color: [.36, .33, .3], endColor: [.55, .53, .5],
        }));
        // fagulhas: curtas, quentes, sobem rápido e morrem cedo
        addEmitter({ x: item.x, y: .55 * item.s, z: item.z }, 1.3, () => ({
          dx: (particleRng.next() - .5) * .35, dy: 0, dz: (particleRng.next() - .5) * .35,
          vx: (particleRng.next() - .5) * 1.4, vy: 2.2 + particleRng.next() * 1.8, vz: (particleRng.next() - .5) * 1.4,
          size: .16 + particleRng.next() * .14, growth: -.03, life: .55 + particleRng.next() * .5,
          drag: .08, gravity: 3, alpha: .95,
          color: [1, .72, .22], endColor: [.45, .12, .04],
        }));
      } else if (item.type === 'refinetower') {
        // fagulhas da chama do flare da torre (fino, alto, contínuo)
        addEmitter({ x: item.x, y: 7.5 * item.s, z: item.z }, 1, () => ({
          dx: (particleRng.next() - .5) * .2, dy: 0, dz: (particleRng.next() - .5) * .2,
          vx: (particleRng.next() - .5) * 1.1, vy: 2.4 + particleRng.next() * 1.6, vz: (particleRng.next() - .5) * 1.1,
          size: .14 + particleRng.next() * .12, growth: -.02, life: .5 + particleRng.next() * .45,
          drag: .08, gravity: 2.4, alpha: .85,
          color: [1, .66, .2], endColor: [.4, .1, .03],
        }));
      } else if (item.type === 'rift') {
        // Fase 26 — fenda do vazio DENTRO da arena: motos de vazio à deriva
        // (mesma linguagem das fendas do horizonte da Fase 17)
        addEmitter({ x: item.x, y: 1.2 * item.s, z: item.z }, 1.2, () => ({
          dx: (particleRng.next() - .5) * .8, dy: (particleRng.next() - .5) * 1.8, dz: (particleRng.next() - .5) * .8,
          vx: (particleRng.next() - .5) * .5, vy: .7 + particleRng.next() * 1, vz: (particleRng.next() - .5) * .5,
          size: .3 + particleRng.next() * .35, growth: 0, life: 3.2 + particleRng.next() * 2.2,
          drag: .1, gravity: -0.6, alpha: .72,
          color: [.61, .91, 1], endColor: [.24, .66, .78],
        }));
      } else if (item.type === 'smokecolumn') {
        // F33 — FUMAÇA REAL na chaminé do caos (a voluta estática saiu do
        // builder): coluna cinza contínua, deriva térmica + brisa, cresce e
        // clareia ao subir — mesma gramática da fumaça de fogueira/lavapatch.
        addEmitter({ x: item.x, y: 1.05 * item.s, z: item.z }, 2.8, () => ({
          dx: (particleRng.next() - .5) * .18, dy: 0, dz: (particleRng.next() - .5) * .18,
          vx: .4 + particleRng.next() * .4, vy: 1.2 + particleRng.next() * .9, vz: (particleRng.next() - .5) * .3,
          size: .5 + particleRng.next() * .45, growth: .75, life: 2.8 + particleRng.next() * 1.8,
          drag: .4, gravity: -0.45, alpha: .32,
          color: [.23, .21, .2], endColor: [.5, .48, .46],
        }));
      } else if (item.type === 'barbwire') {
        // F66 — W4 DOCX: "cercas em curto circuito e faíscas": fagulhas
        // quentes saltam da ponta em curto (vida breve, gravidade puxa).
        addEmitter({
          x: item.x + Math.cos(item.rot) * 1.13 * item.s,
          y: 1.12 * item.s,
          z: item.z - Math.sin(item.rot) * 1.13 * item.s,
        }, 2.2, () => ({
          dx: (particleRng.next() - .5) * .12, dy: 0, dz: (particleRng.next() - .5) * .12,
          vx: (particleRng.next() - .5) * 1.6, vy: 1.4 + particleRng.next() * 1.4, vz: (particleRng.next() - .5) * 1.6,
          size: .09 + particleRng.next() * .08, growth: -.04, life: .3 + particleRng.next() * .3,
          drag: .05, gravity: 3.4, alpha: .95,
          color: [1, .82, .3], endColor: [.5, .14, .03],
        }));
      } else if (item.type === 'whalefactory') {
        // F66 — W4 DOCX: "fábrica de óleo de baleia enferrujada com chaminé
        // fumegante": coluna REAL na boca da chaminé (offset local
        // (1.28, 3.0, -.4) rotacionado pelo rot do item) — a voluta estática
        // do builder saiu (F66).
        const smokeX = item.x + (1.28 * Math.cos(item.rot) + (-.4) * Math.sin(item.rot)) * item.s;
        const smokeZ = item.z + (-1.28 * Math.sin(item.rot) + (-.4) * Math.cos(item.rot)) * item.s;
        addEmitter({ x: smokeX, y: 3.0 * item.s, z: smokeZ }, 2.6, () => ({
          dx: (particleRng.next() - .5) * .16, dy: 0, dz: (particleRng.next() - .5) * .16,
          vx: .35 + particleRng.next() * .35, vy: 1.1 + particleRng.next() * .8, vz: (particleRng.next() - .5) * .3,
          size: .4 + particleRng.next() * .4, growth: .7, life: 2.4 + particleRng.next() * 1.6,
          drag: .4, gravity: -0.4, alpha: .36,
          color: [.3, .29, .28], endColor: [.52, .5, .48],
        }));
      }
    }
    for (const p of placements.patches) {
      if (p.type === 'oilpool') {
        // F43 — lagoas de petróleo EM CHAMAS: fagulhas baixas e quentes saltam
        // do espelho de óleo (mesma gramática das brasas de lavapatch, menor).
        addEmitter({ x: p.x, y: .12, z: p.z }, .8, () => ({
          dx: (particleRng.next() - .5) * p.r * 1.1, dy: 0, dz: (particleRng.next() - .5) * p.r * 1.1,
          vx: (particleRng.next() - .5) * 1.1, vy: 1.9 + particleRng.next() * 1.6, vz: (particleRng.next() - .5) * 1.1,
          size: .14 + particleRng.next() * .16, growth: -.02, life: .6 + particleRng.next() * .55,
          drag: .08, gravity: 2.2, alpha: .9,
          color: [1, .64, .18], endColor: [.4, .09, .03],
        }));
        // fumaça fina do óleo queimando
        addEmitter({ x: p.x, y: .3, z: p.z }, .4, () => ({
          dx: (particleRng.next() - .5) * p.r * .8, dy: 0, dz: (particleRng.next() - .5) * p.r * .8,
          vx: (particleRng.next() - .5) * .4, vy: .9 + particleRng.next() * .7, vz: (particleRng.next() - .5) * .4,
          size: .5 + particleRng.next() * .5, growth: .7, life: 2.2 + particleRng.next() * 1.4,
          drag: .4, gravity: -0.4, alpha: .2,
          color: [.16, .15, .14], endColor: [.42, .4, .38],
        }));
      }
      if (p.type === 'lavapatch') {
        // Fase 26 — fendas de lava: brasas saltam da crosta + wisp de calor
        addEmitter({ x: p.x, y: .1, z: p.z }, 1.1, () => ({
          dx: (particleRng.next() - .5) * p.r * 1.4, dy: 0, dz: (particleRng.next() - .5) * p.r * 1.4,
          vx: (particleRng.next() - .5) * 1.4, vy: 2.4 + particleRng.next() * 2.2, vz: (particleRng.next() - .5) * 1.4,
          size: .22 + particleRng.next() * .26, growth: -.03, life: .8 + particleRng.next() * .7,
          drag: .1, gravity: 2.6, alpha: .88,
          color: [1, .6, .16], endColor: [.38, .08, .03],
        }));
        addEmitter({ x: p.x, y: .25, z: p.z }, .55, () => ({
          dx: (particleRng.next() - .5) * p.r, dy: 0, dz: (particleRng.next() - .5) * p.r,
          vx: (particleRng.next() - .5) * .6, vy: 1.1 + particleRng.next() * .9, vz: (particleRng.next() - .5) * .6,
          size: .9 + particleRng.next() * .8, growth: .8, life: 2.4 + particleRng.next() * 1.4,
          drag: .45, gravity: -0.4, alpha: .22,
          color: [.3, .24, .2], endColor: [.46, .42, .38],
        }));
      }
    }
    emitterAnimators.push(...emitters.map((e) => (dt, t) => e.update(dt, t)));
    // DONO do tick se districts criou o sistema; se worldmarks/outra cena
    // já registrou, nada a fazer (nunca 2× — ver bindParticleTicker).
    bindParticleTicker(scene, sharedSystem, emitterAnimators);
  }

  // ---------- animáveis (coletores usados por patches e itens) ----------
  const floaters = [];   // shards: { mesh, baseY, phase, speed }
  const flags = [];      // bandeiras: { mesh, baseRot, phase }
  const flames = [];     // fogo: { mesh, base, phase }
  const spinners = [];   // anéis quânticos / rotores: { obj, axis, speed, phase }
  const pulses = [];     // F43 — bioluminescência: { mesh, base, phase }

  // ---------- patches de solo ----------
  const patchGeo = new THREE.CircleGeometry(1, 26);
  const byType = new Map();
  for (const p of placements.patches) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  for (const [type, list] of byType) {
    const mat = patchMaterial(type, scenario);
    const im = new THREE.InstancedMesh(patchGeo, mat, list.length);
    im.name = `patch-${type}`;                    // F66 — nome p/ auditoria de cânon
    const dummy = new THREE.Object3D();
    list.forEach((p, i) => {
      dummy.position.set(p.x, .018 + i * .0009, p.z); // stagger anti z-fight
      dummy.rotation.set(-Math.PI / 2, 0, p.rot);
      dummy.scale.set(p.r * p.sx, p.r, 1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.renderOrder = 2;
    im.receiveShadow = false; im.castShadow = false;
    dressing.add(im);
    if (type === 'lavapatch' && mat.emissiveIntensity !== undefined) {
      const base = mat.emissiveIntensity;
      animators.push((dt, t) => { mat.emissiveIntensity = base * (0.82 + Math.sin(t * 1.35) * .3); });
    }
    if (type === 'mist') {
      // F43 — neblina alucinógena respira: opacidade sobe/desce devagar
      animators.push((dt, t) => { mat.opacity = .15 + (Math.sin(t * .55) * .5 + .5) * .17; });
    }
    if (type === 'oilpool') {
      // F43 — README W3: "lagoas de petróleo EM CHAMAS" — cada lagoa ganha
      // chamas reais (cones tremulando no animator de flames) + fagulhas no pool.
      for (const p of list) {
        const fireRng = new SeededRng(`${layout.seed}:oilfire:${p.x}:${p.z}`);
        const fire = new THREE.Group();
        fire.name = 'oilfire';
        const n = 3;
        for (let i = 0; i < n; i++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(.16 + fireRng.next() * .12, .5 + fireRng.next() * .4, 6), m.fire);
          const a = fireRng.next() * Math.PI * 2;
          const rr = fireRng.next() * p.r * .55;
          cone.position.set(Math.cos(a) * rr, .18, Math.sin(a) * rr);
          cone.castShadow = false;
          fire.add(cone);
          flames.push({ mesh: cone, base: cone.material.emissiveIntensity ?? 1.6, phase: fireRng.next() * 6.28 });
        }
        fire.position.set(p.x, .02, p.z);
        dressing.add(fire);
      }
    }
  }

  // ---------- itens (multi-mesh, contagem pequena por tipo) ----------
  const variantRng = new SeededRng(`${layout.seed}:${layout.scenarioId}:dressing-variant`);
  for (const item of placements.items) {
    const build = BUILDERS[item.type];
    if (!build) continue;
    const g = build(m, item.a ?? Math.floor(variantRng.next() * 3));
    g.position.set(item.x, 0, item.z);
    g.rotation.y = item.rot;
    g.scale.setScalar(item.s);
    dressing.add(g);
    const size = (SHADOW_SIZE[item.type] ?? 1.2) * item.s;
    if (size) shadows.push({ x: item.x, z: item.z, rot: item.rot, size });
    // registra peças animáveis
    g.traverse((o) => {
      if (o.userData?.flag) flags.push({ mesh: o.userData.flag, baseRot: o.rotation.z, phase: variantRng.next() * 6.28 });
    });
    if (g.userData?.flame) flames.push({ mesh: g.userData.flame, base: g.userData.flame.material.emissiveIntensity ?? 1.4, phase: variantRng.next() * 6.28 });
    if (g.userData?.floatMesh) floaters.push({ mesh: g.userData.floatMesh, baseY: g.userData.floatMesh.position.y, phase: variantRng.next() * 6.28, speed: .8 + variantRng.next() * .8 });
    if (g.userData?.rotor) spinners.push({ obj: g.userData.rotor, axis: 'y', speed: 1.1, phase: 0 });
    if (g.userData?.spinners) for (const s of g.userData.spinners) spinners.push({ obj: s, axis: 'z', speed: .38, phase: variantRng.next() * 6.28 });
    if (g.userData?.waver) floaters.push({ mesh: g.userData.waver, baseY: g.userData.waver.position.y, phase: variantRng.next() * 6.28, speed: .5, waver: true });
    if (g.userData?.pulse) {
      // F43 — bioluminescência (sporesac F22 + carnplant F43): o contrato
      // "pulso no animator" agora tem consumidor de verdade.
      const mesh = g.userData.pulse;
      pulses.push({ mesh, base: mesh.material.emissiveIntensity ?? 1, phase: variantRng.next() * 6.28 });
    }
  }

  // F40 — as sombras do dressing entram nas BANDAS DE DISTÂNCIA quando o
  // hook existe (alpha por instância — o disco a 200m era moiré); sem o hook
  // cai no F7 estático (retrocompatível — assinatura/contrato intocado).
  if (shadows.length) (bandContactShadows ?? contactShadows)?.(shadows);
  scene.add(dressing);
  animators.push(...emitterAnimators); // Fase 26 — partículas reais do dressing

  // ---------- animators (stateless, determinísticos por t) ----------
  if (floaters.length) {
    animators.push((dt, t) => {
      for (const f of floaters) {
        if (f.waver) f.mesh.scale.y = 1 + Math.sin(t * 2.1 + f.phase) * .06;
        else f.mesh.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * .18;
      }
    });
  }
  if (flags.length) {
    animators.push((dt, t) => {
      for (const f of flags) f.mesh.rotation.y = Math.sin(t * 1.8 + f.phase) * .22;
    });
  }
  if (flames.length) {
    animators.push((dt, t) => {
      for (const f of flames) {
        f.mesh.material.emissiveIntensity = f.base * (.78 + Math.sin(t * 8.7 + f.phase) * .22 + Math.sin(t * 3.1 + f.phase * 2) * .12);
        f.mesh.scale.y = 1 + Math.sin(t * 9.3 + f.phase) * .12;
      }
    });
  }
  if (spinners.length) {
    animators.push((dt, t) => {
      for (const s of spinners) s.obj.rotation[s.axis] = s.phase + t * s.speed;
    });
  }
  if (pulses.length) {
    animators.push((dt, t) => {
      for (const p of pulses) {
        p.mesh.material.emissiveIntensity = p.base * (.72 + Math.sin(t * 2.4 + p.phase) * .28);
      }
    });
  }

  const registry = {
    id: scenario.id,
    counts: placements.counts,
    animators,
    placements,
    group: dressing,
  };
  scene.userData.districtDressing = registry;
  return registry;
}
