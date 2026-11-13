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
//
// Espécies por mundo (ÂNCORAS nos distritos canônicos de layout3d):
//   CIGKV     — ratos (quartel/armory+proving), gaivotas (banda), gafanhotos (Parque);
//   Barburhen — ratos (urbano+industrial), gaivotas, mosquitos (poças ácidas);
//   Priadus   — JACARÉS (Área Pantanosa), mosquitos (pântano/bosque);
//   Ckesalth  — GAFANHOTOS (vilarejo/refinaria/areia), mosquitos (lagoas de óleo);
//   Arukheea  — TUBARÕES (mar, anel 205–268 m FORA da arena), gaivotas,
//               esqueletos de baleia (Cemitério das Baleias).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import { terrainHeightAt } from './terrain3d.js';

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
  }),
  Priadus: Object.freeze({
    croc: { count: 3, districts: [0], roam: 20 },
    mosquito: { count: 3, districts: [0, 2], roam: 12 },
  }),
  Ckesalth: Object.freeze({
    locust: { swarms: 3, districts: [1, 2, 3], roam: 34 },
    mosquito: { count: 1, districts: [2], roam: 12 },
  }),
  Arukheea: Object.freeze({
    shark: { count: 4, ringMin: 205, ringMax: 268 },
    seagull: { bands: 2, birdsPerBand: 5, orbit: 130, height: 46 },
    whaleSkeleton: { count: 2, districts: [2], roam: 24 },
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
  // AGITAÇÃO "dedo-duro" DESTE build: main3d.updateRing alimenta com a pressão
  // do Ring (1 − raio/170) — fauna acelera/enxames crescem conforme o anel
  // fecha (visual; a punição canônica por inatividade segue na sim/servidor).
  const agit = { value: 0 };
  const groundY = (x, z) => terrainHeightAt(x, z, scenario.id);

  for (const item of plan.items) {
    if (item.kind === 'rat') {
      const body = buildRat(rng);
      body.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(body);
      const st = { body, ax: item.x, az: item.z, homeR: item.homeR,
        tx: item.x, tz: item.z, run: false, wait: 1 + rng.next() * 2,
        speed: 2 + rng.next() * 1.1 };
      animators.push((dt, t) => {
        const sp = st.speed * (1 + 1.1 * agit.value);
        if (!st.run) {
          st.wait -= dt;
          if (st.wait <= 0) { // nova toca determinística dentro do raio de casa
            const a = Math.abs((Math.sin(t * 12.9898 + st.ax) * 43758.5453) % 1) * Math.PI * 2;
            const r = Math.sqrt(Math.abs((Math.cos(t * 78.233 + st.az) * 12543.853) % 1)) * st.homeR;
            st.tx = st.ax + Math.cos(a) * r; st.tz = st.az + Math.sin(a) * r;
            st.run = true;
          }
          return;
        }
        const dx = st.tx - st.body.position.x, dz = st.tz - st.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < .3) { st.run = false; st.wait = .9 + (Math.sin(t * 3.7 + st.az) * .5 + .5) * 1.8; return; }
        st.body.position.x += (dx / dist) * sp * dt;
        st.body.position.z += (dz / dist) * sp * dt;
        st.body.rotation.y = Math.atan2(dx, dz);
        // ancorado no relevo (terreno + bob da corrida)
        st.body.position.y = groundY(st.body.position.x, st.body.position.z) + Math.abs(Math.sin(t * 14)) * .035;
        if (st.body.userData.tail) st.body.userData.tail.rotation.z = Math.sin(t * 9) * .3;
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
        angle += dt * (.14 + .18 * agit.value) * item.dir;
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
      const st = { x: item.x, z: item.z, seedA: rng.next() * 100, seedB: rng.next() * 100 };
      animators.push((dt, t) => {
        // nuvem à deriva (lissajous) + indivíduos em órbita com ruído
        st.x += Math.sin(t * .21 + st.seedA) * dt * .5;
        st.z += Math.cos(t * .17 + st.seedB) * dt * .5;
        swarm.position.set(st.x, 1.05 + Math.sin(t * .5 + st.seedA) * .25, st.z);
        const spread = 1 + agit.value * .9;
        for (const m of swarm.userData.members) {
          const a = t * m.speed + m.phase;
          m.mesh.position.set(Math.cos(a) * m.radius * spread, Math.sin(a * 1.7 + m.yPhase) * .35, Math.sin(a) * m.radius * spread);
        }
      });
    } else if (item.kind === 'locust') {
      const swarm = buildLocustSwarm(rng);
      swarm.position.set(item.x, groundY(item.x, item.z), item.z);
      group.add(swarm);
      const st = { ax: item.x, az: item.z, seed: rng.next() * 100 };
      animators.push((dt, t) => {
        // enxame rasteiro: âncora lissajous + indivíduos saltando em parábola
        const gx = st.ax + Math.sin(t * .09 + st.seed) * st.homeR * .5;
        const gz = st.az + Math.cos(t * .07 + st.seed) * st.homeR * .5;
        swarm.position.set(gx, groundY(gx, gz), gz);
        for (const m of swarm.userData.members) {
          m.hopPhase += dt * m.hopSpeed * (1 + .8 * agit.value);
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
      body.position.set(item.x, groundY(item.x, item.z) + .05, item.z);
      group.add(body);
      const st = { body, ax: item.x, az: item.z, homeR: item.homeR,
        a: rng.next() * Math.PI * 2, dir: 1, submerged: 0, nextDive: 10 + rng.next() * 10 };
      animators.push((dt, t) => {
        const speed = .8 * (1 + .9 * agit.value) * st.dir;
        const px = st.body.position.x + Math.cos(st.a) * speed * dt;
        const pz = st.body.position.z + Math.sin(st.a) * speed * dt;
        // patrulha circular dentro do pântano (inverte ao sair do raio de casa)
        if (Math.hypot(px - st.ax, pz - st.az) > st.homeR) st.dir *= -1;
        else { st.body.position.x = px; st.body.position.z = pz; }
        st.body.rotation.y = Math.atan2(Math.cos(st.a) * st.dir, Math.sin(st.a) * st.dir);
        st.body.userData.tailParts.forEach((seg, i) => { seg.rotation.y = Math.sin(t * 2.6 + i * .7) * .22; });
        // mergulho canônico do jacaré (olhos ficam na linha d'água)
        st.nextDive -= dt;
        if (st.nextDive <= 0) { st.submerged = st.submerged > 0 ? 0 : 2.6; st.nextDive = (12 + (Math.sin(t * 5.1 + st.a) * .5 + .5) * 10) / (1 + agit.value * 1.6); }
        if (st.submerged > 0) st.submerged -= dt;
        const targetY = groundY(st.body.position.x, st.body.position.z) + (st.submerged > 0 ? -.22 : .05);
        st.body.position.y += (targetY - st.body.position.y) * Math.min(1, dt * 2.2);
      });
    } else if (item.kind === 'shark') {
      const body = buildShark();
      const ang0 = Math.atan2(item.z, item.x);
      const r0 = Math.hypot(item.x, item.z);
      group.add(body);
      const st = { body, a: ang0, r: r0, dir: item.dir, dive: item.dive, roll: 0 };
      animators.push((dt, t) => {
        // tubarão PATRULHA o mar em anel fora da arena (worlds.ts: "tubarões
        // patrulhando o mar") — mergulha e aforna à superfície em ciclo
        st.a += dt * (.11 + .2 * agit.value) * st.dir;
        st.r += Math.sin(t * .13 + st.dive * 3) * dt * 1.2;
        const x = Math.cos(st.a) * st.r, z = Math.sin(st.a) * st.r;
        const y = .1 + Math.sin(t * .4 + st.dive * 2) * st.dive * .5;
        st.body.position.set(x, y, z);
        st.body.rotation.y = -st.a + (st.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        st.roll += (Math.sin(t * .8 + st.dive) * .12 - st.roll) * Math.min(1, dt * 2);
        st.body.rotation.z = st.roll;
        st.body.userData.tail.rotation.y = Math.sin(t * 3.4) * .3;
      });
    } else if (item.kind === 'whaleSkeleton') {
      const skeleton = buildWhaleSkeleton(rng);
      skeleton.position.set(item.x, groundY(item.x, item.z), item.z);
      skeleton.rotation.y = item.rot;
      group.add(skeleton);
    }
  }

  scene.add(group);
  const handle = {
    group,
    animators,
    counts: plan.counts,
    species: plan.species,
    placements: plan.items,
    setAgitation(v) { agit.value = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); },
  };
  scene.userData.fauna = handle;
  return handle;
}
