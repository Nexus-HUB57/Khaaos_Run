// Khaaos Run — Layout procedural determinístico do mundo 3D (CIGKV // Khaoos Ville)
// Gera distritos, estruturas, colliders AABB, pontos de loot/spawn e terminais ZEX.
// Mesma seed => mesmo mundo (sim e renderizador compartilham esta função).
import { SeededRng } from '../shared/rng.js';
import { resolveScenario } from './scenarios.js';

// Cada estrutura: { x, z, w, d, h, rot, kind, variant }
// Collider AABB alinhado aos eixos (rotação 0°/90° apenas — garante colisão barata).
export function buildWorldLayout(seed, scenarioId = 'CIGKV') {
  const scenario = resolveScenario(scenarioId);
  const rng = new SeededRng(scenario.id === 'CIGKV' ? `${seed}:world` : `${seed}:${scenario.id}:world`);
  const structures = [];
  const colliders = [];
  const districtKinds = ['armory', 'proving', 'park', 'industrial', 'terminal'];
  const districts = scenario.sectorNames.map((name, i) => ({
    name: name.toUpperCase(),
    cx: [-95, 95, -100, 100, 0][i],
    cz: [-95, -95, 95, 95, 0][i],
    kind: districtKinds[i],
    r: [62, 62, 66, 66, 40][i],
  }));

  const addBox = (x, z, w, d, h, kind, variant = 0, yMin = 0, noBlock = false) => {
    const s = { x, z, w, d, h, yMin, kind, variant, rot: rng.next() < 0.5 ? 0 : Math.PI / 2 };
    structures.push(s);
    if (!noBlock) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, yMin, yMax: yMin + h, kind });
    return s;
  };

  // ---- PÁTIO DE ARMAMENTO: quartel com muros, plataforma de tiro, torres ----
  {
    const { cx, cz } = districts[0];
    addBox(cx, cz, 26, 14, 7.5, 'barrack', 0);
    addBox(cx - 30, cz + 18, 10, 10, 9, 'tower', 0);
    addBox(cx + 30, cz - 16, 12, 8, 4.5, 'depot', 1);
    addBox(cx + 8, cz + 26, 8, 8, 2.2, 'crate', 0);
    addBox(cx - 14, cz - 22, 6, 6, 1.6, 'crate', 1);
    addBox(cx + 22, cz + 10, 14, 3, 3, 'wall', 0);
    addBox(cx - 4, cz - 34, 3, 16, 2.6, 'wall', 1);
  }
  // ---- PROVING GROUNDS: arena de treino, coberturas e rampas de concreto ----
  {
    const { cx, cz } = districts[1];
    addBox(cx, cz, 34, 22, 6, 'hangar', 0);
    addBox(cx - 26, cz + 20, 7, 7, 2.4, 'barrier', 0);
    addBox(cx + 18, cz + 26, 7, 7, 2.4, 'barrier', 1);
    addBox(cx + 28, cz - 8, 9, 9, 8.5, 'tower', 1);
    addBox(cx - 8, cz - 30, 10, 5, 3, 'depot', 2);
    addBox(cx + 6, cz + 12, 5, 5, 1.8, 'crate', 2);
    addBox(cx - 20, cz - 18, 5, 5, 1.8, 'crate', 0);
  }
  // ---- PARQUE ABANDONADO: ruínas, edifício torto, quiosques e muros baixos ----
  {
    const { cx, cz } = districts[2];
    addBox(cx - 20, cz - 20, 18, 16, 12, 'ruin', 0);
    addBox(cx + 24, cz + 6, 14, 12, 8, 'ruin', 1);
    addBox(cx + 2, cz + 30, 8, 8, 3.4, 'pavilion', 0);
    addBox(cx - 34, cz + 24, 6, 6, 1.8, 'crate', 1);
    addBox(cx + 14, cz - 28, 12, 3, 2.2, 'wall', 2);
    addBox(cx - 6, cz - 6, 4, 4, 2.6, 'crate', 0);
    addBox(cx + 36, cz - 20, 6, 10, 5, 'depot', 0);
  }
  // ---- SETOR INDUSTRIAL: galpões, contêineres empilhados, silos e chaminés ----
  {
    const { cx, cz } = districts[3];
    addBox(cx - 24, cz - 18, 30, 18, 9, 'warehouse', 0);
    addBox(cx + 26, cz + 14, 22, 14, 7, 'warehouse', 1);
    for (let i = 0; i < 6; i++) {
      const x = cx + rng.int(-40, 40), z = cz + rng.int(-38, 40);
      if (Math.hypot(x - cx, z - cz) < 12) continue;
      addBox(x, z, 12, 5, 5.2, 'container', rng.int(0, 3));
      if (rng.next() < 0.4) addBox(x + rng.int(-2, 2), z + rng.int(-2, 2), 12, 5, 5.2, 'container', rng.int(0, 3), 5.2); // segundo andar
    }
    addBox(cx - 40, cz + 34, 7, 7, 13, 'silo', 0);
    addBox(cx + 40, cz - 32, 7, 7, 13, 'silo', 1);
    addBox(cx + 6, cz - 34, 5, 5, 1.8, 'crate', 3);
  }
  // ---- TERMINAL ZEX: praça central com o monolito e barricadas ----
  {
    const { cx, cz } = districts[4];
    addBox(cx, cz, 10, 10, 16, 'monolith', 0); // torre ZEX — landmark central
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      addBox(cx + Math.cos(a) * 20, cz + Math.sin(a) * 20, 6, 3, 2, 'barrier', i % 2);
    }
    addBox(cx - 14, cz + 12, 5, 5, 1.6, 'crate', 1);
    addBox(cx + 15, cz - 12, 5, 5, 1.6, 'crate', 0);
  }
  if (scenario.id === 'Barburhen') {
    const urban = districts[0];
    addBox(urban.cx + 20, urban.cz + 30, 14, 12, 13, 'building', 0);
    addBox(urban.cx - 31, urban.cz + 30, 12, 11, 9, 'building', 1);
    const station = districts[1];
    addBox(station.cx - 32, station.cz + 38, 36, 3, 1.2, 'barrier', 0);
    addBox(station.cx + 32, station.cz + 38, 36, 3, 1.2, 'barrier', 1);
    addBox(station.cx, station.cz + 42, 18, 8, 3.2, 'depot', 2);
    const industrial = districts[3];
    addBox(industrial.cx - 38, industrial.cz - 34, 8, 8, 16, 'silo', 2);
    addBox(industrial.cx + 34, industrial.cz + 35, 22, 5, 2, 'barrier', 3);
  }
  // ---- espalha ruínas/props de ligação entre distritos ----
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2, r = 30 + rng.next() * 130;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const kind = rng.pick(['crate', 'barrier', 'wall', 'ruin', 'pavilion']);
    const dims = { crate: [5, 5, 1.8], barrier: [7, 7, 2.4], wall: [12, 3, 2.6], ruin: [10, 8, 5], pavilion: [8, 8, 3.2] }[kind];
    if (Math.hypot(x, z) < 26) continue; // não bloqueia o terminal central
    addBox(x, z, dims[0], dims[1], dims[2], kind, rng.int(0, 3));
  }

  // ---- terminais ZEX (3) ----
  // O terminal central fica AO LADO do monolito (10×10 no centro): dentro do colisor
  // o jogador seria empurrado além do alcance de interação (bug de extração).
  const terminals = [
    { x: 8, z: 0, label: 'ZEX // CENTRO', nearMonolith: true },
    { x: -130, z: -30, label: 'ZEX // OESTE' },
    { x: 120, z: 40, label: 'ZEX // LESTE' },
  ];

  // ---- pontos de spawn de bots (anel ao redor do centro, fora da vista do jogador) ----
  const botSpawns = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, r = 60 + (i % 4) * 28;
    botSpawns.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  // ---- pontos de loot: ao lado de estruturas, livres de colisão ----
  const lootSpots = [];
  const lootZoneFor = (x, z) => {
    const closest = districts.reduce((best, district) => {
      const d = Math.hypot(x - district.cx, z - district.cz);
      return d < best.distance ? { district, distance: d } : best;
    }, { district: districts[0], distance: Infinity }).district;
    const zoneByKind = { armory: 'armory', proving: 'extraction', park: 'park', industrial: 'industrial', terminal: 'extraction' };
    return { sectorId: closest.kind, sectorName: closest.name, lootZone: zoneByKind[closest.kind] };
  };
  const free = (x, z, m = 3) => colliders.every(c => x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  for (const s of structures) {
    if (s.kind === 'monolith' || s.h < 1.5) continue;
    const spots = [[s.x + s.w / 2 + 3, s.z], [s.x - s.w / 2 - 3, s.z], [s.x, s.z + s.d / 2 + 3], [s.x, s.z - s.d / 2 - 3]];
    for (const [x, z] of spots) {
      if (Math.abs(x) < 195 && Math.abs(z) < 195 && free(x, z)) lootSpots.push({ x, z, ...lootZoneFor(x, z) });
      if (lootSpots.length >= 40) break;
    }
    if (lootSpots.length >= 40) break;
  }
  // garantia: completa com pontos aleatórios livres
  let guard = 0;
  while (lootSpots.length < 30 && guard++ < 400) {
    const x = (rng.next() - 0.5) * 360, z = (rng.next() - 0.5) * 360;
    if (free(x, z, 2)) lootSpots.push({ x, z, ...lootZoneFor(x, z) });
  }

  return { seed, scenarioId: scenario.id, size: 400, structures, colliders, districts, sectors: districts, terminals, botSpawns, lootSpots, playerSpawn: { ...scenario.playerSpawn } };
}
