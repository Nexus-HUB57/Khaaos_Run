// Khaaos Run — Fase 16 (P1) — MARCOS DE MUNDO (world marks) por cenário.
//
// Até a Fase 15 trocar de mundo só mudava céu/névoa/luz/tinta do chão: os
// cenários ficavam "fora dos padrões e sem as características descritas em
// cada um dos mundos". Esta camada materializa a IDENTIDADE de cada mundo
// descrita em scenarios.js, com marcos assinatura no horizonte (anel 205–340 m,
// FORA da área jogável — zero impacto em colliders/sim):
//
//   CIGKV      — Campo de Instrução: torres de vigia, alvos de tiro, mastros;
//   Barburhen  — Setor Industrial frio: torres de resfriamento, chaminés com
//                fumaça à deriva, ponte de dutos;
//   Priadus    — Arquipélago Abissal: lâmina d'água, zigurate antigo, domos de
//                coral, mangues;
//   CKESALTH   — Deserto Vertical/Refinaria: mesas estratificadas, colunas de
//                destilação, chama de tocha, dunas;
//   Arukheea   — Singularidade Dimensional: fragmentos flutuantes à deriva,
//                espira astral, pilões nos ANCHORS da gravidade, fendas do vazio.
//
// Tudo determinístico (SeededRng por seed+cenário), instanciado onde repete,
// com ANIMATORS registrados em scene.userData.worldMarks (deriva/flicker) e
// contagens expostas p/ inspeção e2e.
//
// Fase 26 — FX DOS MARCOS × MUNDOS: os marcos REAGEM à sobrevivência do
// próprio mundo (registry.applyHazard — abastecido pelo SurvivalFX a cada
// frame com { kind, boost 0..1, surfaceY }):
//   Priadus  + tsunami  → o ANEL oceânico se agita e sobe (maré de tempestade);
//   Ckesalth + lava     → a chama da tocha ERUPCIONA (escala/emissiva ×) e os
//                         emissores reais de fagulhas/fumaça disparam;
//   Arukheea + gravity  → anéis dos pilões GIRAM, cristal da espira e fendas
//                         do vazio INCANDEM;
//   CIGKV    + acid     → beacons dos mastros estroboscopiam (alerta);
//   Barburhen           → sem sobrevivência no cenário — reação nula.
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import { Emitter, getSharedParticles, bindParticleTicker } from './particles3d.js';
import { frustumPrism } from './prisms3d.js';

const RING_MIN = 205, RING_MAX = 340;

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: opts.rough ?? .85, metalness: opts.metal ?? .08,
  ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.ei ?? 1 } : {}),
});

// posição em anel fora da área jogável, determinística
function ringSpot(rng, angleJitter = 1.4) {
  const a = rng.next() * Math.PI * 2 + angleJitter;
  const r = RING_MIN + rng.next() * (RING_MAX - RING_MIN);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

const noShadow = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };

// ---------- helpers de marcos ----------
function tower(group, mat, x, z, h = 9) {
  const legs = new THREE.Group();
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.28, h, .28), mat);
    leg.position.set(x + lx * 1.1, h / 2, z + lz * 1.1);
    leg.rotation.z = -lx * .08; leg.rotation.x = lz * .08;
    legs.add(leg);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), mat);
  cabin.position.set(x, h + 1, z);
  const roof = new THREE.Mesh(frustumPrism({ wB: 3.3, wT: .4, lB: 3.3, lT: .4, h: 1.4 }), mat);
  roof.position.set(x, h + 2.7, z);
  legs.add(cabin, roof);
  group.add(legs);
  return legs;
}

// ---------- CIGKV — Campo de Instrução ----------
function marksCigkv(group, scene, scenario, rng, hazard) {
  const concrete = M('#8d8a80', { rough: .92 });
  const wood = M('#6e5433');
  const steel = M('#4c4f55', { metal: .6, rough: .45 });
  const counts = { watchtowers: 0, targets: 0, masts: 0 };
  // torres de vigia no anel
  for (let i = 0; i < 4; i++) {
    const s = ringSpot(rng);
    tower(group, concrete, s.x, s.z, 8 + rng.next() * 3);
    counts.watchtowers++;
  }
  // raia de tiro: alvos prancha com anel emissivo (face p/ a arena)
  const targetMat = M('#d8d2c4', { rough: .9 });
  const ringMat = M('#c8ff3d', { emissive: '#c8ff3d', ei: .9 });
  for (let i = 0; i < 6; i++) {
    const s = ringSpot(rng);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.1, .12, 2.2, 6), wood);
    post.position.set(s.x, 1.1, s.z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, .12), targetMat);
    board.position.set(s.x, 2.6, s.z);
    board.rotation.y = Math.atan2(-s.x, -s.z);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(.9, .9, .14), ringMat);
    ring.position.copy(board.position).add(new THREE.Vector3(0, 0, 0));
    ring.rotation.copy(board.rotation);
    ring.translateZ(.02);
    group.add(post, board, ring);
    counts.targets++;
  }
  // mastros de antena com beacon
  const beaconMat = M('#ff3d52', { emissive: '#ff3d52', ei: 1.2 });
  const beacons = [];
  for (let i = 0; i < 3; i++) {
    const s = ringSpot(rng);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.08, .16, 11, 6), steel);
    mast.position.set(s.x, 5.5, s.z);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), beaconMat.clone());
    beacon.position.set(s.x, 11.2, s.z);
    group.add(mast, beacon);
    beacons.push(beacon);
    counts.masts++;
  }
  return { counts, animators: [beaconPulse(beacons, hazard)] };
}

// Fase 26 — chuva ácida (CIGKV): beacons estroboscopiam enquanto o drizzle
// está ativo (boost 1) — pulso 5× mais rápido + brilho de alerta.
function beaconPulse(beacons, hazard) {
  return (dt, t) => {
    const boost = hazard?.kind === 'acid' ? hazard.boost : 0;
    const speed = 2.2 + boost * 11;
    for (let i = 0; i < beacons.length; i++) {
      beacons[i].material.emissiveIntensity = .8 + Math.sin(t * speed + i * 1.3) * (.5 + boost * .5);
    }
  };
}

// ---------- Barburhen — Protótipo do Setor Industrial ----------
function marksBarburhen(group, scene, scenario, rng, hazard) { // sem sobrevivência no cenário — reação nula
  const concrete = M('#9aa7ae', { rough: .9 });
  const steel = M('#5d666d', { metal: .65, rough: .42 });
  const rust = M('#7a4a2b', { metal: .4, rough: .7 });
  const counts = { coolingTowers: 0, smokestacks: 0, pipeBridges: 0 };
  // torres de resfriamento (cintura hiperbólica aproximada em 3 segmentos)
  for (let i = 0; i < 2; i++) {
    const s = ringSpot(rng);
    const segs = [
      { r0: 7.5, r1: 5.6, h: 9, y: 4.5 },
      { r0: 5.6, r1: 4.4, h: 7, y: 12.5 },
      { r0: 4.4, r1: 5.9, h: 5, y: 18.5 },
    ];
    for (const sg of segs) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(sg.r1, sg.r0, sg.h, 18, 1, true), concrete);
      seg.position.set(s.x, sg.y, s.z);
      group.add(seg);
    }
    counts.coolingTowers++;
  }
  // chaminés com colunas de fumaça REAL (partículas pooled — Fase 17):
  // emissor contínuo por chaminé, empuxo negativo (sobe) + deriva de vento
  const emitters = [];
  for (let i = 0; i < 3; i++) {
    const s = ringSpot(rng);
    const h = 22 + rng.next() * 10;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, h, 12), concrete);
    stack.position.set(s.x, h / 2, s.z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.14, 1.2, 12), rust);
    band.position.set(s.x, h - 2, s.z);
    group.add(stack, band);
    const emitter = new Emitter(particles(scene), {
      origin: { x: s.x, y: h + 1, z: s.z },
      rate: 5,
      params: () => ({
        dx: (rng.next() - .5) * 1.2, dz: (rng.next() - .5) * 1.2,
        vx: 1.6 + rng.next() * 1.2, vy: 2.2 + rng.next() * 1.4, vz: (rng.next() - .5) * 1.2,
        size: 2.6 + rng.next() * 1.8, growth: 1.5, life: 5 + rng.next() * 3,
        drag: .35, gravity: -0.55, alpha: .32,
        color: [.79, .82, .85], endColor: [.62, .66, .7],
      }),
    });
    emitters.push(emitter);
    counts.smokestacks++;
  }
  // ponte de dutos entre dois suportes NO MESMO SETOR angular (o vão nunca
  // cruza a arena — o ponto médio fica no anel externo)
  const s1 = ringSpot(rng);
  const a1 = Math.atan2(s1.z, s1.x), r1 = Math.hypot(s1.x, s1.z);
  const a2 = a1 + .25 + rng.next() * .2, r2 = r1 * (.92 + rng.next() * .12);
  const s2 = { x: Math.cos(a2) * r2, z: Math.sin(a2) * r2 };
  const midX = (s1.x + s2.x) / 2, midZ = (s1.z + s2.z) / 2;
  if (Math.hypot(midX, midZ) < 190) s2.x = s1.x * .8, s2.z = s1.z * .8; // fallback no anel
  const span = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 40, 10), steel);
  span.rotation.z = Math.PI / 2;
  span.rotation.y = Math.atan2(s2.x - s1.x, s2.z - s1.z);
  span.position.set((s1.x + s2.x) / 2, 10, (s1.z + s2.z) / 2);
  span.name = 'barburhen-pipe-bridge';   // isenta do bounds test (vão entre pilares)
  group.add(span);
  for (const s of [s1, s2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), steel);
    leg.position.set(s.x, 5, s.z);
    group.add(leg);
  }
  counts.pipeBridges++;
  return { counts, animators: emitters.map((e) => (dt, t) => e.update(dt, t)) };
}

// ---------- Priadus — Arquipélago Abissal ----------
function marksPriadus(group, scene, scenario, rng, hazard) {
  const counts = { waterPlane: 0, temple: 0, coralDomes: 0, mangroves: 0 };
  // lâmina d'água do arquipélago — ANEL no horizonte (190→360 m): a arena
  // permanece seca (gameplay intacto) e o mundo vira ilhas cercadas d'água.
  const water = new THREE.Mesh(
    new THREE.RingGeometry(190, 360, 48),
    new THREE.MeshStandardMaterial({
      color: '#1f6470', transparent: true, opacity: .8, roughness: .12, metalness: .25,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = .3;
  water.name = 'priadus-water-ring';  // anel centrado na origem — isento do bounds test
  group.add(water);
  counts.waterPlane++;
  // zigurate antigo (3 corpos + portal emissivo)
  const stone = M('#5a6b5e', { rough: .95 });
  const s0 = ringSpot(rng);
  const ziggurat = new THREE.Group();
  ziggurat.position.set(s0.x, .3, s0.z);
  let w = 16;
  for (let tier = 0; tier < 3; tier++) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3, w), stone);
    body.position.y = 1.5 + tier * 3;
    body.rotation.y = tier * .12;
    ziggurat.add(body);
    w *= .62;
  }
  const portal = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, .5), M('#9cc7b4', { emissive: '#4fd8b0', ei: .8 }));
  portal.position.set(0, 1.6, -7.2);
  ziggurat.add(portal);
  group.add(ziggurat);
  counts.temple++;
  // domos de coral (laboratório coral): cascas esféricas + tubos
  const domeMat = M('#d98a7a', { rough: .55 });
  const tubeMat = M('#8fb6a8', { rough: .5 });
  for (let i = 0; i < 5; i++) {
    const s = ringSpot(rng);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4 + rng.next() * 1.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(s.x, .3, s.z);
    group.add(dome);
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 2.4 + rng.next() * 2, 6), tubeMat);
      tube.position.set(s.x + (rng.next() - .5) * 5, 1.4, s.z + (rng.next() - .5) * 5);
      tube.rotation.z = (rng.next() - .5) * .5;
      group.add(tube);
    }
    counts.coralDomes++;
  }
  // mangues: troncos inclinados + raízes + copa escura
  const trunkMat = M('#3d4636', { rough: .95 });
  const canopyMat = M('#2c4436', { rough: .95 });
  const trunkGeo = new THREE.CylinderGeometry(.16, .34, 4.4, 6);
  const canopyGeo = new THREE.SphereGeometry(1.7, 8, 6);
  const N = 26;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const s = ringSpot(rng, .8);
    dummy.position.set(s.x, 2.2, s.z);
    dummy.rotation.set((rng.next() - .5) * .3, rng.next() * Math.PI, (rng.next() - .5) * .3);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 4.6;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(.8 + rng.next() * .6);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    counts.mangroves++;
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks, canopies);
  return { counts, animators: [waterShimmer(water, hazard)] };
}

// Fase 26 — tsunami (Priadus): o oceano-anel é a ORIGEM da onda — maré de
// tempestade sobe +6 m com ondulação agitada; opacidade fecha o céu d'água.
function waterShimmer(water, hazard) {
  return (dt, t) => {
    const boost = hazard?.kind === 'tsunami' ? hazard.boost : 0;
    water.position.y = .3 + Math.sin(t * .8) * .045 + boost * (5.5 + Math.sin(t * 1.9) * 1.2);
    if (boost > 0) water.material.opacity = Math.min(.95, .8 + boost * .15);
  };
}

// ---------- CKESALTH — Deserto Vertical / Refinaria das Almas ----------
function marksCkesalth(group, scene, scenario, rng, hazard) {
  const counts = { mesas: 0, columns: 0, flareStack: 0, dunes: 0 };
  const rock = M('#a4744a', { rough: .96 });
  const rockDark = M('#7d5535', { rough: .97 });
  const steel = M('#6d5a45', { metal: .5, rough: .55 });
  // mesas estratificadas (2 corpos = camadas sedimentares)
  for (let i = 0; i < 4; i++) {
    const s = ringSpot(rng);
    const h0 = 7 + rng.next() * 5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7 + rng.next() * 3, 10 + rng.next() * 3, h0, 10), rock);
    base.position.set(s.x, h0 / 2, s.z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.4 + rng.next() * 1.5, 6.6, 5, 10), rockDark);
    top.position.set(s.x, h0 + 2.5, s.z);
    group.add(base, top);
    counts.mesas++;
  }
  // colunas de destilação + chama de tocha (flicker)
  const flameMats = [];
  for (let i = 0; i < 3; i++) {
    const s = ringSpot(rng);
    const h = 13 + rng.next() * 6;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, h, 10), steel);
    col.position.set(s.x, h / 2, s.z);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, .5, 10), steel);
    tray.position.set(s.x, h * .55, s.z);
    group.add(col, tray);
    counts.columns++;
  }
  const fs = ringSpot(rng);
  const stackH = 17;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(.5, .8, stackH, 8), steel);
  stack.position.set(fs.x, stackH / 2, fs.z);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(.9, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 1.6, roughness: .4 }),
  );
  flame.position.set(fs.x, stackH + 1.6, fs.z);
  group.add(stack, flame);
  flameMats.push(flame.material);
  counts.flareStack++;
  // Fase 26 — tocha REAL (partículas pooled): fagulhas ascendentes + fumaça
  // de queima contínua na ponta da tocha (antes: só cone emissivo estático).
  const flareEmitters = [
    new Emitter(particles(scene), {
      origin: { x: fs.x, y: stackH + 2.2, z: fs.z },
      rate: 4,
      params: () => ({
        dx: (rng.next() - .5) * .7, dy: 0, dz: (rng.next() - .5) * .7,
        vx: (rng.next() - .5) * 2.2, vy: 3.4 + rng.next() * 3, vz: (rng.next() - .5) * 2.2,
        size: .28 + rng.next() * .3, growth: -.04, life: .9 + rng.next() * .8,
        drag: .12, gravity: 2.2, alpha: .9,
        color: [1, .68, .2], endColor: [.4, .1, .03],
      }),
    }),
    new Emitter(particles(scene), {
      origin: { x: fs.x, y: stackH + 2.6, z: fs.z },
      rate: 1.6,
      params: () => ({
        dx: (rng.next() - .5) * .5, dy: 0, dz: (rng.next() - .5) * .5,
        vx: .8 + rng.next() * .8, vy: 2 + rng.next() * 1.4, vz: (rng.next() - .5) * .8,
        size: 1.4 + rng.next() * 1.2, growth: 1.1, life: 3.2 + rng.next() * 2,
        drag: .4, gravity: -0.5, alpha: .3,
        color: [.32, .28, .26], endColor: [.5, .48, .46],
      }),
    }),
  ];
  // dunas (esferas achatadas)
  const duneGeo = new THREE.SphereGeometry(9, 12, 8);
  const duneMat = M('#d8b27a', { rough: 1 });
  const dunes = new THREE.InstancedMesh(duneGeo, duneMat, 8);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    const s = ringSpot(rng, .6);
    dummy.position.set(s.x, -4.5, s.z);
    dummy.scale.set(1 + rng.next() * .8, .55, .8 + rng.next() * .6);
    dummy.rotation.y = rng.next() * Math.PI;
    dummy.updateMatrix();
    dunes.setMatrixAt(i, dummy.matrix);
    counts.dunes++;
  }
  dunes.instanceMatrix.needsUpdate = true;
  group.add(dunes);
  return { counts, animators: [flameFlicker(flameMats, flame, hazard, flareEmitters), ...flareEmitters.map((e) => (dt, t) => e.update(dt, t))] };
}

// Fase 26 — erupção (CKESALTH): a tocha ERUPCIONA com a lava — chama 3× mais
// alta e brilhante, emissores reais disparam (fagulhas 4×, fumaça 3×).
function flameFlicker(mats, flame, hazard, flareEmitters = []) {
  return (dt, t) => {
    const boost = hazard?.kind === 'lava' ? hazard.boost : 0;
    const k = (1.3 + Math.sin(t * 11) * .28 + Math.sin(t * 23.7) * .12) * (1 + boost * 2.2);
    for (const m of mats) m.emissiveIntensity = k;
    flame.scale.y = .9 + Math.sin(t * 9.3) * .16 + boost * 2;
    for (let i = 0; i < flareEmitters.length; i++) {
      flareEmitters[i].rate = (i === 0 ? 4 : 1.6) * (1 + boost * (i === 0 ? 3 : 2));
    }
  };
}

// ---------- Arukheea — Singularidade Dimensional ----------
function marksArukheea(group, scene, scenario, rng, hazard) {
  const counts = { fragments: 0, spires: 0, anchorPylons: 0, rifts: 0 };
  const rockMat = M('#42505e', { rough: .8, metal: .2 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#7fd8e8', emissive: '#3ba8c8', emissiveIntensity: .9, roughness: .25, metalness: .4 });
  // fragmentos flutuantes à deriva (icosaedros irregulares)
  const fragGeo = new THREE.IcosahedronGeometry(1, 0);
  const N = 14;
  const frags = new THREE.InstancedMesh(fragGeo, rockMat, N);
  const dummy = new THREE.Object3D();
  const drifters = [];
  for (let i = 0; i < N; i++) {
    const s = ringSpot(rng, 2.1);
    const y = 26 + rng.next() * 58;
    const sc = 3 + rng.next() * 7;
    dummy.position.set(s.x, y, s.z);
    dummy.scale.set(sc, sc * (.5 + rng.next() * .5), sc * (.6 + rng.next() * .5));
    dummy.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
    dummy.updateMatrix();
    frags.setMatrixAt(i, dummy.matrix);
    drifters.push({ x: s.x, z: s.z, baseY: y, phase: rng.next() * Math.PI * 2, amp: .8 + rng.next() * 1.4 });
    counts.fragments++;
  }
  frags.instanceMatrix.needsUpdate = true;
  group.add(frags);
  // espira astral (cristal alongado) + base
  const sp = ringSpot(rng);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 6), crystalMat);
  spire.position.set(sp.x, 13, sp.z);
  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 2.2, 8), rockMat);
  spireBase.position.set(sp.x, 1.1, sp.z);
  group.add(spire, spireBase);
  counts.spires++;
  // pilões nos ANCHORS oficiais da gravidade (dados do cenário — mesma posição da sim;
  // DENTRO da arena por design, por isso o grupo próprio p/ o bounds test)
  const pylonRings = [];
  const anchors = scenario.survival?.anchors ?? [];
  if (anchors.length) {
    const pylonGroup = new THREE.Group();
    pylonGroup.name = 'anchor-pylons';
    for (const a of anchors) {
      const pylon = new THREE.Group();
      pylon.position.set(a.x, 0, a.z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.3, 7, 8), rockMat);
      pillar.position.y = 3.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .16, 8, 24), crystalMat);
      ring.position.y = 8.2;
      ring.rotation.x = Math.PI / 2;
      pylon.add(pillar, ring);
      pylonGroup.add(pylon);
      pylonRings.push(ring);
      counts.anchorPylons++;
    }
    group.add(pylonGroup);
  }
  // fendas do vazio (planos emissivos verticais pulsantes) + motos de vazio
  const riftMats = [];
  const riftEmitters = [];
  for (let i = 0; i < 4; i++) {
    const s = ringSpot(rng, 3.3);
    const riftY = 14 + rng.next() * 10;
    const riftH = 10 + rng.next() * 8;
    const mat = new THREE.MeshBasicMaterial({ color: '#9be8ff', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
    const rift = new THREE.Mesh(new THREE.PlaneGeometry(.8, riftH), mat);
    rift.position.set(s.x, riftY, s.z);
    rift.rotation.y = rng.next() * Math.PI;
    rift.name = 'void-rift'; // Fase 26 — identificação p/ inspeção e2e (raios de luz são PlaneGeometry idêntico)
    group.add(rift);
    riftMats.push(mat);
    counts.rifts++;
    // Fase 17 — motos do vazio escapando da fenda (partículas reais)
    riftEmitters.push(new Emitter(particles(scene), {
      origin: { x: s.x, y: riftY, z: s.z },
      rate: 1.2,
      params: () => ({
        dx: (rng.next() - .5) * .8, dy: (rng.next() - .5) * riftH * .8, dz: (rng.next() - .5) * .8,
        vx: (rng.next() - .5) * .6, vy: .8 + rng.next() * 1.2, vz: (rng.next() - .5) * .6,
        size: .35 + rng.next() * .45, growth: 0, life: 4 + rng.next() * 3,
        drag: .1, gravity: -0.6, alpha: .75,
        color: [.61, .91, 1], endColor: [.24, .66, .78],
      }),
    }));
  }
  return {
    counts,
    animators: [
      fragmentDrift(frags, drifters),
      riftPulse(riftMats, hazard),
      pylonAwakening(pylonRings, crystalMat, hazard), // Fase 26 — giro + incandescência
      ...riftEmitters.map((e) => (dt, t) => e.update(dt, t)),
    ],
  };
}

// Fase 26 — anomalia KHAOS (Arukheea): os pilões ACORDAM — anéis giram 6×
// mais rápido e o cristal (espira + anéis, mesmo material) incandesce.
function pylonAwakening(rings, crystalMat, hazard) {
  return (dt, t) => {
    const boost = hazard?.kind === 'gravity' ? hazard.boost : 0;
    for (let i = 0; i < rings.length; i++) {
      rings[i].rotation.z += dt * (.5 + boost * 2.6) * (i % 2 ? -1 : 1);
    }
    crystalMat.emissiveIntensity = .9 * (1 + boost * 1.6);
  };
}

function fragmentDrift(inst, drifters) {
  const dummy = new THREE.Object3D();
  return (dt, t) => {
    for (let i = 0; i < drifters.length; i++) {
      const d = drifters[i];
      inst.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.y = d.baseY + Math.sin(t * .5 + d.phase) * d.amp;
      dummy.rotation.y += dt * .05;
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
}

// Fase 26 — fendas incandecem com a anomalia (opacidade ↑ com o boost)
function riftPulse(mats, hazard) {
  return (dt, t) => {
    const boost = hazard?.kind === 'gravity' ? hazard.boost : 0;
    for (let i = 0; i < mats.length; i++) {
      mats[i].opacity = Math.min(1, (.4 + Math.sin(t * 1.7 + i * 2.1) * .22) * (1 + boost * .8));
    }
  };
}

// ---------- entrypoint ----------
const BUILDERS = {
  CIGKV: marksCigkv,       // scenarios.js usa id MAIÚSCULO no mapa-base
  Barburhen: marksBarburhen,
  Priadus: marksPriadus,
  Ckesalth: marksCkesalth,
  Arukheea: marksArukheea,
};

/**
 * Sistema de partículas compartilhado da cena (1 draw call, pool fixo).
 * Recriado por cena; se buildWorldMarks rodar 2× na mesma cena, reutiliza.
 */
function particles(scene) {
  return getSharedParticles(scene);
}

/**
 * Constrói os marcos do mundo p/ o cenário e registra animadores/contagens em
 * scene.userData.worldMarks. Puro visual: anel 205–340 m, sem colisores.
 * Fase 26 — o registro expõe `applyHazard(kind, boost, surfaceY)`: o
 * SurvivalFX abastece a cada frame e os animadores REAGEM (FX dos marcos ×
 * mundos). Estado mutável compartilhado via `hazardState` (fechado nos
 * animadores de cada mundo na criação — zero lookup por frame).
 * @returns {{ id: string, counts: Record<string, number>, animators: Function[], applyHazard: Function, hazardState: object }}
 */
export function buildWorldMarks(scene, layout, scenario) {
  const builder = BUILDERS[scenario.id];
  const registry = { id: scenario.id, counts: {}, animators: [], hazardState: { kind: null, boost: 0, surfaceY: 0 } };
  registry.applyHazard = (kind, boost, surfaceY = 0) => {
    registry.hazardState.kind = kind; registry.hazardState.boost = boost; registry.hazardState.surfaceY = surfaceY;
  };
  scene.userData.worldMarks = registry;
  if (!builder) return registry;                       // cenário sem marcos definidos
  const rng = new SeededRng(`${layout.seed}:${scenario.id}:marks`);
  const group = new THREE.Group();
  group.name = `world-marks:${scenario.id}`;
  const built = builder(group, scene, scenario, rng, registry.hazardState);
  registry.counts = built.counts;
  // Fase 17 — tick do sistema de partículas SEMPRE primeiro (emissores dos
  // marcos escrevem no mesmo frame; update integra depois dos spawns).
  // Fase 26 — ticker idempotente por cena: districts roda ANTES dos marcos em
  // buildScene e pode já ter registrado o tick (nunca 2× — integrar 2×
  // aceleraria o tempo das partículas).
  const system = particles(scene);
  bindParticleTicker(scene, system, registry.animators);
  registry.animators.push(...built.animators);
  scene.add(group);
  return registry;
}
