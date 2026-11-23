// Khaaos Run — Task 65 (P1): FAUNA CANÔNICA POR MUNDO (os 5 cenários ganham vida).
// ==============================================================================
// O usuário cobrou os "características, animais, etc" de cada mundo conforme as
// descrições oficiais. O cânon (README "Ontologia dos Mundos" + shared/worlds.ts):
//
//   • "Dinâmica de inatividade" — o "dedo-duro" (RATOS, MOSQUITOS, GAFANHOTOS e
//     GAIVOTAS) acompanha o jogador que evita combate — fauna geral dos Rings;
//   • W2 Priadus — "selva hostil, pântanos, flora carnívora, JACARÉS"
//     (README W2; crocs patrulham a Área Pantanosa);
//   • W4 Arukheea — "tsunami iminente, TUBARÕES" (README W4) e shared/worlds.ts:
//     "Costão rochoso com esqueletos de baleia ... TUBARÕES patrulhando o mar"
//     + setor "Fábrica / Cemitério das Baleias" (esqueletos como cenário).
//
// Contrato (idêntico ao districts3d/worldmarks3d):
//  - placements PUROS e determinísticos (SeededRng por seed+cenário);
//  - builder THREE headless-safe, ZERO assets externos (geometria 100% procedural);
//  - ZERO impacto em gameplay: nenhum collider novo, nenhum dano, nenhum alvo —
//    fauna é AMBIENTE (a regra de dano da zona/inatividade segue na sim/servidor);
//  - ANIMATORS em scene.userData.fauna.animators (main3d tick 1×/frame);
//  - AGITAÇÃO "dedo-duro": setAgitation(0..1) — pressão do Ring (1 − raio/170)
//    acelera patrulhas e enxames (visual; a punição canônica continua na sim).
//  - IA de comportamento (faunaAI3d): estados idle/wander/flee/investigate/hunt
//    + steering; reage ao jogador via setContext({ playerX, playerZ }).
//
// Espécies por mundo (ÂNCORAS nos distritos canônicos de layout3d):
//   CIGKV     — ratos (quartel/armory+proving), gaivotas (banda), gafanhotos (Parque);
//   Barburhen — ratos (urbano+industrial), gaivotas, mosquitos (poças ácidas),
//               MOSCAS (cadáveres / dedo-duro urbano);
//   Priadus   — JACARÉS (Área Pantanosa), mosquitos (pântano/bosque);
//               + flora carnívora em vegetation3d (pitcher / snap-trap);
//   Ckesalth  — GAFANHOTOS (vilarejo/refinaria/areia), mosquitos (lagoas de óleo),
//               ESCORPIÕES (areia / refinaria);
//   Arukheea  — TUBARÕES (mar, anel 205–268 m FORA da arena), gaivotas,
//               esqueletos de baleia (Cemitério das Baleias), CARANGUEJOS (costão).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import { terrainHeightAt } from './terrain3d.js';
import { createBrain, createFaunaContext } from './faunaAI3d.js';

// distância ponto→AABB expandida (mesma matemática dos placements do dressing)
function insideCollider(x, z, c, margin) {
  return x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin;
}

/**
 * Configuração canônica por mundo: quantidade de cada espécie (× density),
 * distrito(s)-casa de cada espécie (índice em layout.districts — layout3d.js)
 * e raios de vagância. shark usa ANEL marítimo fora da arena (205–268 m, mesmo
 * vocabulário dos marcos F16); whaleSkeleton é CENÁRIO fixo.
 */
export const FAUNA_PLAN = Object.freeze({
  CIGKV: Object.freeze({
    rat: { count: 6, districts: [0, 1], roam: 26 },
    seagull: { bands: 1, birdsPerBand: 6, orbit: 110, height: 42 },
    locust: { swarms: 1, districts: [2], roam: 30 },
  }),
  Barburhen: Object.freeze({
    rat: { count: 8, districts: [0, 3], roam: 30 },
    seagull: { bands: 1, birdsPerBand: 5, orbit: 120, height: 38 },
    mosquito: { count: 2, districts: [2, 3], roam: 14 },
    // Cadáveres / poças ácidas — enxames de moscas (dedo-duro urbano)
    fly: { swarms: 2, districts: [0, 1, 3], roam: 18 },
  }),
  Priadus: Object.freeze({
    croc: { count: 4, districts: [0], roam: 22 },
    mosquito: { count: 3, districts: [0, 2], roam: 12 },
  }),
  Ckesalth: Object.freeze({
    locust: { swarms: 3, districts: [1, 2, 3], roam: 34 },
    mosquito: { count: 1, districts: [2], roam: 12 },
    // Areia / refinaria — escorpiões e lagartos de deserto
    scorpion: { count: 5, districts: [0, 1, 3], roam: 16 },
  }),
  Arukheea: Object.freeze({
    shark: { count: 4, ringMin: 205, ringMax: 268 },
    seagull: { bands: 2, birdsPerBand: 5, orbit: 130, height: 46 },
    whaleSkeleton: { count: 2, districts: [2], roam: 24 },
    // Costão / enseadas — caranguejos na linha d'água
    crab: { count: 6, districts: [0, 1], roam: 14 },
  }),
});

/**
 * Placements PUROS (sem THREE): mesma seed+cenário → mesmos âncoras.
 * Âncoras evitam colliders de estruturas (margem 2.5 m) e a praça central
 * (r < 50) — fauna não nasce dentro de prédio nem no terminal ZEX.
 */
export function faunaPlacements(layout, scenarioId, { density = 1 } = {}) {
  const plan = FAUNA_PLAN[scenarioId] ?? FAUNA_PLAN.CIGKV;
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:fauna`);
  const items = [];
  const counts = {};
  const districts = layout.districts ?? [];

  const anchor = (districtsIdx, roam) => {
    // candidato determinístico: centro do distrito + dispersão, filtrado por
    // colliders/praça (até 9 tentativas; fallback = centro do distrito)
    for (let i = 0; i < 9; i++) {
      const d = districts[districtsIdx] ?? { cx: 0, cz: 0 };
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * roam;
      const x = d.cx + Math.cos(a) * r;
      const z = d.cz + Math.sin(a) * r;
      if (Math.hypot(x, z) < 50) continue;                       // praça central
      if ((layout.colliders ?? []).some((c) => insideCollider(x, z, c, 2.5))) continue;
      return { x, z };
    }
    const d = districts[districtsIdx] ?? { cx: 0, cz: 0 };
    return { x: d.cx, z: d.cz };
  };

  const seaRingAnchor = (ringMin, ringMax) => {
    const a = rng.next() * Math.PI * 2;
    const r = ringMin + rng.next() * (ringMax - ringMin);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  };

  const push = (kind, n, fn, extra = {}) => {
    const total = Math.max(n > 0 ? 1 : 0, Math.round(n * density));
    for (let i = 0; i < total; i++) items.push({ kind, ...fn(i), ...extra });
    counts[kind] = (counts[kind] ?? 0) + total;
  };

  if (plan.rat) push('rat', plan.rat.count, () => {
    const dIdx = plan.rat.districts[Math.floor(rng.next() * plan.rat.districts.length)];
    return { ...anchor(dIdx, plan.rat.roam), homeR: plan.rat.roam, district: dIdx };
  });
  if (plan.seagull) push('seagull', plan.seagull.bands, () => ({
    x: 0, z: 0, orbit: plan.seagull.orbit + rng.next() * 40,
    height: plan.seagull.height + rng.next() * 10,
    birds: plan.seagull.birdsPerBand, dir: rng.next() < .5 ? 1 : -1,
  }), { band: true });
  if (plan.mosquito) push('mosquito', plan.mosquito.count, () => {
    const dIdx = plan.mosquito.districts[Math.floor(rng.next() * plan.mosquito.districts.length)];
    return { ...anchor(dIdx, plan.mosquito.roam), homeR: plan.mosquito.roam, district: dIdx };
  });
  if (plan.locust) push('locust', plan.locust.swarms, () => {
    const dIdx = plan.locust.districts[Math.floor(rng.next() * plan.locust.districts.length)];
    return { ...anchor(dIdx, plan.locust.roam), homeR: plan.locust.roam, district: dIdx };
  });
  if (plan.croc) push('croc', plan.croc.count, () => {
    const dIdx = plan.croc.districts[0];
    return { ...anchor(dIdx, plan.croc.roam), homeR: plan.croc.roam, district: dIdx };
  });
  if (plan.shark) push('shark', plan.shark.count, () => {
    const p = seaRingAnchor(plan.shark.ringMin, plan.shark.ringMax);
    return { ...p, dir: rng.next() < .5 ? 1 : -1, dive: 1 + rng.next() * 1.4 };
  });
  if (plan.whaleSkeleton) push('whaleSkeleton', plan.whaleSkeleton.count, () => {
    const dIdx = plan.whaleSkeleton.districts[0];
    return { ...anchor(dIdx, plan.whaleSkeleton.roam), rot: rng.next() * Math.PI * 2 };
  });
  if (plan.fly) push('fly', plan.fly.swarms, () => {
    const dIdx = plan.fly.districts[Math.floor(rng.next() * plan.fly.districts.length)];
    return { ...anchor(dIdx, plan.fly.roam), homeR: plan.fly.roam, district: dIdx };
  });
  if (plan.scorpion) push('scorpion', plan.scorpion.count, () => {
    const dIdx = plan.scorpion.districts[Math.floor(rng.next() * plan.scorpion.districts.length)];
    return { ...anchor(dIdx, plan.scorpion.roam), homeR: plan.scorpion.roam, district: dIdx };
  });
  if (plan.crab) push('crab', plan.crab.count, () => {
    const dIdx = plan.crab.districts[Math.floor(rng.next() * plan.crab.districts.length)];
    return { ...anchor(dIdx, plan.crab.roam), homeR: plan.crab.roam, district: dIdx };
  });

  return { items, counts, species: Object.keys(counts).filter((k) => counts[k] > 0) };
}

// ------------------------------------------------- fábricas de malhas ----
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? .85, metalness: o.metal ?? .05,
  ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}),
});

const noShadow = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };

function buildRat(rng) {
  const g = new THREE.Group();
  const fur = mat('#3d3d46', { rough: .92 });
  const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.11, 7, 6), fur));
  body.scale.set(1, .8, 1.7); body.position.y = .09; g.add(body);
  const head = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 6), fur));
  head.rotation.x = -Math.PI / 2; head.position.set(0, .1, .24); g.add(head);
  for (const s of [-1, 1]) {
    const ear = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.03, .05, 5), fur));
    ear.position.set(s * .05, .18, .18); g.add(ear);
  }
  const tail = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(.012, .006, .26, 5), mat('#5d4a52')));
  tail.rotation.x = Math.PI / 2 - .18; tail.position.set(0, .07, -.26);
  g.add(tail); g.userData.tail = tail;
  return g;
}

function buildSeagull() {
  const g = new THREE.Group();
  const feather = mat('#e8e6df', { rough: .7 });
  const wingM = mat('#cfd0cb', { rough: .75 });
  const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), feather));
  body.scale.set(.8, .7, 1.6); g.add(body);
  const beak = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.035, .12, 5), mat('#e2a13c')));
  beak.rotation.x = -Math.PI / 2; beak.position.set(0, .02, .3); g.add(beak);
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.5, .015, .16), wingM));
    wing.position.set(s * .3, .03, 0); g.add(wing);
    wings.push({ wing, s });
  }
  g.userData.wings = wings;
  return g;
}

function buildMosquitoSwarm(rng) {
  const g = new THREE.Group();
  const speckM = mat('#22242a', { rough: .6 });
  const members = [];
  for (let i = 0; i < 14; i++) {
    const m = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.035, 5, 4), speckM));
    g.add(m);
    members.push({
      mesh: m,
      radius: .5 + rng.next() * 1.1,
      phase: rng.next() * Math.PI * 2,
      speed: 2.4 + rng.next() * 2.2,
      yPhase: rng.next() * Math.PI * 2,
    });
  }
  g.userData.members = members;
  return g;
}

function buildLocustSwarm(rng) {
  const g = new THREE.Group();
  const chitin = mat('#a88f4e', { rough: .7 });
  const members = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Group();
    const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 5), chitin));
    body.scale.set(.8, .7, 1.8); m.add(body);
    for (const s of [-1, 1]) {
      const leg = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .07), chitin));
      leg.position.set(s * .045, -.03, 0); leg.rotation.z = s * .5; m.add(leg);
    }
    g.add(m);
    members.push({
      mesh: m, offset: rng.next() * Math.PI * 2, orbitR: 1.4 + rng.next() * 2.6,
      hopPhase: rng.next(), hopSpeed: .55 + rng.next() * .5, dir: rng.next() * Math.PI * 2,
    });
  }
  g.userData.members = members;
  return g;
}

function buildCroc() {
  const g = new THREE.Group();
  const hide = mat('#27402c', { rough: .95 });
  const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), hide));
  body.scale.set(1, .55, 2.1); body.position.y = .16; g.add(body);
  const jaw = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.22, .1, .5), hide));
  jaw.position.set(0, .12, .68); g.add(jaw);
  for (const s of [-1, 1]) {
    const eye = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 5),
      mat('#1a1a1a', { emissive: '#ff2d1a', ei: 1.6 })));
    eye.position.set(s * .07, .24, .62); g.add(eye);
  }
  const tailParts = [];
  let z = -.52;
  for (let i = 0; i < 3; i++) {
    const seg = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.14 - i * .035, .4, 6), hide));
    seg.rotation.x = -Math.PI / 2; seg.position.set(0, .14, z - .14);
    g.add(seg); tailParts.push(seg); z -= .3;
  }
  const ridge = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 4), hide));
  ridge.position.set(0, .3, 0); g.add(ridge);
  g.userData.tailParts = tailParts;
  return g;
}

function buildShark() {
  const g = new THREE.Group();
  const skin = mat('#54646d', { rough: .55, metal: .12 });
  const belly = mat('#c9d2d6', { rough: .6 });
  const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.5, 9, 7), skin));
  body.scale.set(.75, .8, 2.6); g.add(body);
  const under = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.42, 8, 6), belly));
  under.scale.set(.7, .5, 2.3); under.position.y = -.12; g.add(under);
  const dorsal = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.18, .5, 4), skin));
  dorsal.position.set(0, .42, .1); g.add(dorsal);
  const tail = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.3, .55, 4), skin));
  tail.rotation.x = Math.PI / 2.4; tail.position.set(0, .05, -1.25); g.add(tail);
  for (const s of [-1, 1]) {
    const fin = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 4), skin));
    fin.rotation.z = s * 1.9; fin.position.set(s * .38, -.1, .3); g.add(fin);
  }
  g.userData.tail = tail;
  return g;
}

/** Enxame de moscas (Barburhen — cadáveres / poças). Nuvem baixa e nervosa. */
function buildFlySwarm(rng) {
  const g = new THREE.Group();
  const bodyM = mat('#1a1512', { rough: .6 });
  const wingM = mat('#888880', { rough: .4 });
  wingM.transparent = true; wingM.opacity = .35;
  const flies = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Group();
    const body = noShadow(new THREE.Mesh(new THREE.SphereGeometry(.018, 5, 4), bodyM));
    const w1 = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(.04, .02), wingM));
    const w2 = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(.04, .02), wingM));
    w1.position.set(.02, .01, 0); w2.position.set(-.02, .01, 0);
    f.add(body, w1, w2);
    f.userData.wings = [w1, w2];
    f.position.set((rng.next() - .5) * .6, rng.next() * .35, (rng.next() - .5) * .6);
    g.add(f);
    flies.push(f);
  }
  g.userData.flies = flies;
  return g;
}

/** Escorpião de deserto (Ckesalth). Corpo + pinças + cauda articulada. */
function buildScorpion(rng) {
  const g = new THREE.Group();
  const shell = mat('#6b4a2a', { rough: .88, metal: .12 });
  const dark = mat('#3d2818', { rough: .9 });
  const body = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.22, .08, .34), shell));
  body.position.y = .05; g.add(body);
  // pinças
  for (const s of [-1, 1]) {
    const claw = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.06, .04, .14), dark));
    claw.position.set(s * .14, .06, .18);
    claw.rotation.y = s * .35;
    g.add(claw);
  }
  // cauda em 3 segmentos + ferrão
  const tail = new THREE.Group();
  let ty = .08, tz = -.16;
  for (let i = 0; i < 3; i++) {
    const seg = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .1), shell));
    seg.position.set(0, ty + i * .06, tz - i * .08);
    seg.rotation.x = -.4 - i * .25;
    tail.add(seg);
  }
  const stinger = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.025, .1, 5), dark));
  stinger.position.set(0, ty + .22, tz - .28);
  stinger.rotation.x = -1.1;
  tail.add(stinger);
  g.add(tail);
  g.userData.tail = tail;
  g.scale.setScalar(.85 + rng.next() * .35);
  return g;
}

/** Caranguejo de costão (Arukheea). Corpo achatado + pinças laterais. */
function buildCrab(rng) {
  const g = new THREE.Group();
  const shell = mat('#c45c3a', { rough: .8 });
  const dark = mat('#8a3a22', { rough: .85 });
  const body = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.28, .08, .2), shell));
  body.position.y = .05; g.add(body);
  for (const s of [-1, 1]) {
    const claw = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.08, .05, .16), dark));
    claw.position.set(s * .18, .06, .08);
    claw.rotation.y = s * .5;
    g.add(claw);
    // pernas laterais simples
    for (let k = 0; k < 2; k++) {
      const leg = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(.015, .012, .18, 4), dark));
      leg.position.set(s * (.12 + k * .04), .03, -.02 - k * .06);
      leg.rotation.z = s * (.9 + k * .15);
      g.add(leg);
    }
  }
  g.scale.setScalar(.7 + rng.next() * .4);
  return g;
}

function buildWhaleSkeleton(rng) {
  const g = new THREE.Group();
  const bone = mat('#c9c0ac', { rough: .92 });
  // crânio alongado do cetáceo
  const skull = noShadow(new THREE.Mesh(new THREE.BoxGeometry(.9, .7, 2.1), bone));
  skull.position.y = .5; g.add(skull);
  const snout = noShadow(new THREE.Mesh(new THREE.ConeGeometry(.42, 1.4, 6), bone));
  snout.rotation.x = -Math.PI / 2; snout.position.set(0, .42, 1.7); g.add(snout);
  // arco de costelas (torus fatiado) — a "catedral de ossos" do costão
  const ribs = [];
  for (let i = 0; i < 7; i++) {
    const rib = noShadow(new THREE.Mesh(
      new THREE.TorusGeometry(1.5 - i * .05, .07, 5, 14, Math.PI), bone));
    rib.rotation.z = Math.PI / 2;                     // arco vertical
    rib.rotation.y = Math.PI / 2;                     // planos transversais
    rib.position.set(0, .2, .6 - i * .78);            // cauda a partir do crânio
    g.add(rib); ribs.push(rib);
  }
  const spine = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(.09, .06, 6.2, 6), bone));
  spine.rotation.x = Math.PI / 2; spine.position.set(0, 1.55, -1.2); g.add(spine);
  g.rotation.y = rng.next() * Math.PI * 2;
  g.userData.ribs = ribs;
  return g;
}

// ------------------------------------------------- builder da cena ----
/**
 * Constrói a fauna do mundo e registra `scene.userData.fauna`
 * { group, animators, setAgitation, counts, species, placements }.
 * Idempotente (mesmo contrato do dressing F22).
 */
export function buildFauna(scene, layout, scenario, q = {}) {
  if (scene.userData.fauna) return scene.userData.fauna;
  const density = q.dressingFactor ?? 1;
  const plan = faunaPlacements(layout, scenario.id, { density });
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:fauna-build`);
  const group = new THREE.Group();
  group.name = 'fauna';
  const animators = [];
  // Contexto compartilhado de IA: main3d alimenta player + agitation a cada frame.
  const ctx = createFaunaContext();
  const agit = ctx; // alias: setAgitation escreve ctx.agitation
  const groundY = (x, z) => terrainHeightAt(x, z, scenario.id);
  const brains = [];

  /** Aplica pose do brain no mesh (solo). */
  const applyGroundBrain = (body, brain, t, tailWag = 9) => {
    body.position.x = brain.x;
    body.position.z = brain.z;
    body.position.y = groundY(brain.x, brain.z) + (brain.yOffset || 0);
    body.rotation.y = brain.yaw;
    if (body.userData.tail) body.userData.tail.rotation.z = Math.sin(t * tailWag) * (0.25 + brain.alert * 0.2);
  };

  for (const item of plan.items) {
    if (item.kind === 'rat') {
      const body = buildRat(rng);
      body.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(body);
      const brain = createBrain('rat', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        applyGroundBrain(body, brain, t, 11);
      });
    } else if (item.kind === 'seagull') {
      const band = new THREE.Group();
      band.position.set(item.x, item.height, item.z);
      const birds = [];
      for (let b = 0; b < item.birds; b++) {
        const bird = buildSeagull();
        bird.scale.setScalar(.9 + rng.next() * .25);
        band.add(bird);
        birds.push({ bird, phase: (b / item.birds) * Math.PI * 2, r: 6 + rng.next() * 6 });
      }
      group.add(band);
      let angle = rng.next() * Math.PI * 2;
      animators.push((dt, t) => {
        angle += dt * (.14 + .18 * ctx.agitation) * item.dir;
        for (const { bird, phase, r } of birds) {
          const a = angle + phase;
          bird.position.set(Math.cos(a) * r, Math.sin(t * 1.7 + phase) * 1.4, Math.sin(a) * r);
          bird.rotation.y = a + (item.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          for (const { wing, s } of bird.userData.wings) wing.rotation.z = s * Math.sin(t * 7.5 + phase) * .55;
        }
      });
    } else if (item.kind === 'mosquito') {
      const swarm = buildMosquitoSwarm(rng);
      swarm.position.set(item.x, 1.15, item.z);
      group.add(swarm);
      const brain = createBrain('mosquito', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR ?? 12,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        swarm.position.set(brain.x, 1.05 + Math.sin(t * .5 + brain.seed) * .25, brain.z);
        const spread = 1 + ctx.agitation * .9 + brain.alert * .4;
        for (const m of swarm.userData.members) {
          const a = t * m.speed + m.phase;
          m.mesh.position.set(Math.cos(a) * m.radius * spread, Math.sin(a * 1.7 + m.yPhase) * .35, Math.sin(a) * m.radius * spread);
        }
      });
    } else if (item.kind === 'locust') {
      const swarm = buildLocustSwarm(rng);
      swarm.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(swarm);
      const brain = createBrain('locust', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR ?? 30,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        const gx = brain.x, gz = brain.z;
        swarm.position.set(gx, groundY(gx, gz), gz);
        for (const m of swarm.userData.members) {
          m.hopPhase += dt * m.hopSpeed * (1 + .8 * ctx.agitation + brain.alert);
          if (m.hopPhase >= 1) { m.hopPhase = 0; m.dir += (Math.sin(t + m.offset) * .5 + .5) * 1.6; }
          const d = m.hopPhase * 2.2;
          m.mesh.position.set(
            Math.cos(m.dir + m.offset) * m.orbitR + d * Math.cos(m.dir),
            Math.sin(Math.PI * m.hopPhase) * .32,
            Math.sin(m.dir + m.offset) * m.orbitR + d * Math.sin(m.dir));
          m.mesh.rotation.y = m.dir;
        }
      });
    } else if (item.kind === 'croc') {
      const body = buildCroc();
      body.userData.species = 'croc';
      body.position.set(item.x, groundY(item.x, item.z) + .05, item.z);
      group.add(body);
      const brain = createBrain('croc', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR,
        seed: rng.next() * 1000, dir: 1,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        body.position.x = brain.x;
        body.position.z = brain.z;
        body.rotation.y = brain.yaw;
        const targetY = groundY(brain.x, brain.z) + (brain.yOffset || 0.05);
        body.position.y += (targetY - body.position.y) * Math.min(1, dt * 2.2);
        body.userData.tailParts?.forEach((seg, i) => {
          seg.rotation.y = Math.sin(t * (2.6 + brain.alert * 2) + i * .7) * (.22 + brain.alert * .12);
        });
      });
    } else if (item.kind === 'shark') {
      const body = buildShark();
      const ang0 = Math.atan2(item.z, item.x);
      const r0 = Math.hypot(item.x, item.z);
      group.add(body);
      const brain = createBrain('shark', {
        x: item.x, z: item.z, angle: ang0, r: r0, dir: item.dir,
        ringMin: 205, ringMax: 268, seed: item.dive ?? rng.next() * 10,
      });
      brains.push(brain);
      let roll = 0;
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        body.position.set(brain.x, brain.yOffset || 0.1, brain.z);
        body.rotation.y = brain.yaw;
        roll += (Math.sin(t * .8 + brain.seed) * .12 - roll) * Math.min(1, dt * 2);
        body.rotation.z = roll;
        if (body.userData.tail) body.userData.tail.rotation.y = Math.sin(t * (3.4 + brain.alert * 2)) * .3;
      });
    } else if (item.kind === 'whaleSkeleton') {
      const skeleton = buildWhaleSkeleton(rng);
      skeleton.position.set(item.x, groundY(item.x, item.z), item.z);
      skeleton.rotation.y = item.rot;
      group.add(skeleton);
    } else if (item.kind === 'fly') {
      const swarm = buildFlySwarm(rng);
      swarm.position.set(item.x, groundY(item.x, item.z) + .4, item.z);
      group.add(swarm);
      const brain = createBrain('fly', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR ?? 18,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        swarm.position.x = brain.x;
        swarm.position.z = brain.z;
        swarm.position.y = groundY(brain.x, brain.z) + .35 + Math.sin(t * 3.1) * .08;
        const flap = 22 + brain.alert * 12;
        for (const f of swarm.userData.flies) {
          for (const w of f.userData.wings) w.rotation.y = Math.sin(t * flap + f.position.x) * .8;
          f.position.y = .05 + Math.abs(Math.sin(t * 9 + f.position.x * 3)) * .12;
        }
      });
    } else if (item.kind === 'scorpion') {
      const body = buildScorpion(rng);
      body.userData.species = 'scorpion';
      body.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(body);
      const brain = createBrain('scorpion', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        applyGroundBrain(body, brain, t, 0);
        if (body.userData.tail) {
          body.userData.tail.rotation.x = Math.sin(t * 2.4) * .12 + brain.alert * .25;
        }
      });
    } else if (item.kind === 'crab') {
      const body = buildCrab(rng);
      body.userData.species = 'crab';
      body.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(body);
      const brain = createBrain('crab', {
        x: item.x, z: item.z, homeX: item.x, homeZ: item.z, homeR: item.homeR,
        seed: rng.next() * 1000,
      });
      brains.push(brain);
      animators.push((dt, t) => {
        brain.step(dt, t, ctx);
        body.position.x = brain.x;
        body.position.z = brain.z;
        body.position.y = groundY(brain.x, brain.z) + (brain.yOffset || 0);
        body.rotation.y = brain.yaw;
      });
    }
  }

  scene.add(group);
  const meshById = new Map();
  const handle = {
    group,
    animators,
    brains,
    counts: plan.counts,
    species: plan.species,
    placements: plan.items,
    meshById,
    setAgitation(v) { ctx.agitation = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); },
    setContext({ playerX = null, playerZ = null, agitation, camX, camZ, attractors, microBoids } = {}) {
      if (playerX != null) ctx.playerX = playerX;
      if (playerZ != null) ctx.playerZ = playerZ;
      if (agitation != null) ctx.agitation = Math.max(0, Math.min(1, agitation));
      if (camX != null) ctx.camX = camX;
      if (camZ != null) ctx.camZ = camZ;
      if (attractors) ctx.attractors = attractors;
      if (microBoids != null) ctx.microBoids = !!microBoids;
    },
    getContext: () => ({ ...ctx }),
    /** P0: amarra meshes aos gameAnimals da sim. */
    bindGameAnimals(gameAnimals = []) {
      meshById.clear();
      const bySpecies = new Map();
      for (const child of group.children) {
        const sp = child.userData?.species;
        if (!sp) continue;
        if (!bySpecies.has(sp)) bySpecies.set(sp, []);
        bySpecies.get(sp).push(child);
      }
      for (const ga of gameAnimals) {
        const list = bySpecies.get(ga.species) || [];
        const mesh = list.shift();
        if (mesh) {
          mesh.userData.gameId = ga.id;
          meshById.set(ga.id, mesh);
        }
      }
    },
    /** Sync pose/visibilidade da sim (após sim.step). */
    syncFromSim(gameAnimals = []) {
      for (const ga of gameAnimals) {
        const mesh = meshById.get(ga.id);
        if (!mesh) continue;
        if (!ga.alive) { mesh.visible = false; continue; }
        mesh.visible = true;
        mesh.position.x = ga.x;
        mesh.position.z = ga.z;
        mesh.position.y = groundY(ga.x, ga.z) + (ga.yOffset || 0);
        if (ga.yaw != null) mesh.rotation.y = ga.yaw;
        if (ga.species === 'locust' && mesh.userData.members) {
          const keep = ga.swarmMembers ?? mesh.userData.members.length;
          mesh.userData.members.forEach((m, i) => { m.mesh.visible = i < keep; });
        }
      }
    },
  };
  scene.userData.fauna = handle;
  return handle;
}
