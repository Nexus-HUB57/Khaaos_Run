// Khaaos Run — Construção do mundo 3D (Khaoos Ville // CIGKV)
// Céu de crepúsculo vulcânico (paleta Mystic Chaos), luz direcional com sombras,
// terreno, estruturas do layout procedural, parede do anel, grama instanciada.
// Fase 4 — realismo PBR: normal maps procedurais, environment map, vegetação.
// Fase 6 — cenário nível "próximo do FreeFire": estradas com faixas e calçadas,
// fachadas detalhadas (portas/janelas/ACs/tubos/placas), props instanciados,
// copas com cor por instância e cordilheira de fundo. Zero assets externos.
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import { getWorldLayout } from './sim3d.js';
import { resolveScenario } from './scenarios.js';
import { roadSegments, propPlacements, facadeDetails, canopyTint } from './detail3d.js';
import {
  concreteMaterial, metalMaterial, groundMaterial, asphaltMaterial,
  windowsTexture, crateTexture, grassBladeTexture, cloudTexture,
  roadMaterial, sidewalkMaterial, crosswalkTexture, barrelMaterial,
  sandbagMaterial, palletMaterial, signTexture, mountainTexture,
} from './textures3d.js';
import { createLootMesh, createTerminalMesh } from './entities3d.js';

// ---------- céu ----------
function createSky(scenario) {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(scenario.sky.top) },
      mid: { value: new THREE.Color(scenario.sky.mid) },
      horizon: { value: new THREE.Color(scenario.sky.horizon) },
      sunDir: { value: new THREE.Vector3(-.55, .18, -.82).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
        col = mix(col, top, smoothstep(0.25, 0.85, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, .62, .3) * pow(sun, 22.0) * 1.35;   // halo
        col += vec3(1.0, .85, .6) * pow(sun, 380.0) * 3.2;   // disco
        // estrelas fracas no zenite
        vec3 sd = normalize(vDir) * 220.0;
        float star = step(0.9985, fract(sin(dot(floor(sd), vec3(12.9898, 78.233, 45.164))) * 43758.5453));
        col += vec3(.9) * star * smoothstep(0.35, 0.9, h) * .5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// ---------- parede do anel (zona segura) ----------
export function createRingWall() {
  const group = new THREE.Group();
  const mk = (radius, opacity, color) => {
    const geo = new THREE.CylinderGeometry(radius, radius, 34, 96, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        time: { value: 0 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vPos;
        void main() { vUv = uv; vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float time; uniform vec3 color; uniform float opacity;
        varying vec2 vUv; varying vec3 vPos;
        void main() {
          float grid = step(.975, fract(vUv.x * 70.0)) + step(.96, fract(vUv.y * 18.0 - time * .18));
          float edgeTop = smoothstep(1.0, .82, vUv.y);
          float edgeBottom = smoothstep(0.0, .10, vUv.y);
          float a = (0.05 + grid * .16) * edgeTop * edgeBottom;
          float wave = smoothstep(.4, 1., fract(vUv.y * 2.2 - time * .1)) * .05;
          gl_FragColor = vec4(color, (a + wave) * opacity);
        }`,
    });
    return new THREE.Mesh(geo, mat);
  };
  const inner = mk(1, .7, '#c8ff3d');
  const outer = mk(1.004, .3, '#ff6b2c');
  group.add(inner, outer);
  group.userData.uniforms = [inner.material.uniforms, outer.material.uniforms];
  return group;
}

// ---------- Fase 6 — viação: estradas com faixas, calçadas e pedestres ----------
function buildRoads(scene, layout) {
  const road = roadMaterial();
  const walk = sidewalkMaterial();
  const group = new THREE.Group();
  for (const seg of roadSegments(layout)) {
    const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const ang = Math.atan2(dx, dz); // rotação em Y para o plano alongado em Z
    // pista de asfalto com faixas
    const m = new THREE.Mesh(new THREE.PlaneGeometry(seg.width, len), road);
    m.rotation.set(-Math.PI / 2, 0, -ang);
    m.position.set((seg.x1 + seg.x2) / 2, .045, (seg.z1 + seg.z2) / 2);
    m.receiveShadow = true;
    m.scale.y = len / 12; // tile de ~12m
    group.add(m);
    // calçadas nas duas margens
    const nx = -dz / len, nz = dx / len;
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len), walk);
      w.rotation.set(-Math.PI / 2, 0, -ang);
      w.position.set((seg.x1 + seg.x2) / 2 + nx * (seg.width / 2 + 1.3) * s, .03,
        (seg.z1 + seg.z2) / 2 + nz * (seg.width / 2 + 1.3) * s);
      w.receiveShadow = true;
      w.scale.y = len / 8;
      group.add(w);
    }
    // faixa de pedestre no início da radial (saída da praça)
    if (seg.kind === 'radial') {
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(seg.width * .92, 2.4),
        new THREE.MeshBasicMaterial({ map: crosswalkTexture(), transparent: true, depthWrite: false }));
      cw.rotation.set(-Math.PI / 2, 0, -ang);
      cw.position.set(seg.x1 + dx / len * 3.4, .075, seg.z1 + dz / len * 3.4);
      group.add(cw);
    }
  }
  scene.add(group);
}

// ---------- Fase 6 — fachadas detalhadas (decoro SEM colliders) ----------
const KIND_SIGN = { barrack: 'ARMAMENTO', hangar: 'PROVING', warehouse: 'SUPRIMENTOS', building: 'CIVIC', depot: 'MUNIÇÃO', ruin: 'RUÍNA', pavilion: 'QUIOSQUE', tower: 'TORRE' };
let _winMats = null;
function windowBandMaterials() {
  if (_winMats) return _winMats;
  const base = windowsTexture();
  _winMats = [0.6, 1.4, 2.6].map((rep) => {
    const map = base.clone(); map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(rep, 1);
    const em = map.clone(); em.needsUpdate = true; em.repeat.set(rep, 1);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffd28a', emissiveIntensity: .5, roughness: .8 });
  });
  return _winMats;
}
function buildFacades(scene, layout) {
  const concreteDark = concreteMaterial(1.2);
  concreteDark.color = new THREE.Color('#56534e');
  const doorM = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: .7, metalness: .3 });
  const acM = metalMaterial('#9aa0a6');
  const pipeM = metalMaterial('#5d6266');
  const tankM = metalMaterial('#8a929a');
  const frameM = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: .6, metalness: .4 });
  const rng = new SeededRng(`${layout.seed}:facades`);
  const facades = new THREE.Group();
  for (const s of layout.structures) {
    const details = facadeDetails(s);
    if (!details.length) continue;
    const host = new THREE.Group();
    host.position.set(s.x, s.yMin, s.z); // y local 0 = chão; v é altura do chão
    host.rotation.y = s.rot ?? 0;
    for (const d of details) {
      const y = d.v + d.h / 2;
      let m = null;
      if (d.kind === 'door') {
        m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, .18), doorM);
        place(m, d.face, d.u, y - .02, s, .1);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(d.w + .3, d.h + .2, .1), frameM);
        place(frame, d.face, d.u, y - .02, s, .06);
      } else if (d.kind === 'windows') {
        const bucket = d.w < 8 ? 0 : d.w < 18 ? 1 : 2;
        m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), windowBandMaterials()[bucket]);
        place(m, d.face, d.u, y, s, .08);
      } else if (d.kind === 'sign') {
        m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h),
          new THREE.MeshBasicMaterial({ map: signTexture(KIND_SIGN[s.kind] ?? 'SETOR'), toneMapped: false }));
        place(m, d.face, d.u, y, s, .12);
      } else if (d.kind === 'ac') {
        m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), acM);
        m.position.set(d.u, s.h + d.h / 2, d.v);
        m.castShadow = true;
        // grade frontal
        const grill = new THREE.Mesh(new THREE.BoxGeometry(d.w * .8, d.h * .5, .05), frameM);
        grill.position.z = d.d / 2;
        m.add(grill);
      } else if (d.kind === 'tank') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(d.w / 2, d.w / 2, d.h, 10), tankM);
        m.position.set(d.u, s.h + d.h / 2, d.v);
        m.castShadow = true;
        const lid = new THREE.Mesh(new THREE.ConeGeometry(d.w * .62, .4, 10), tankM);
        lid.position.y = d.h / 2 + .2;
        m.add(lid);
      } else if (d.kind === 'pipe') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, d.h, 6), pipeM);
        place(m, 'left', d.u, d.h / 2, s, .2);
        m.castShadow = false;
      }
      if (m) host.add(m);
    }
    facades.add(host);
  }
  scene.add(facades);
}
// posiciona um decore na face indicada (espaço LOCAL da estrutura)
function place(mesh, face, u, y, s, off) {
  switch (face) {
    case 'front': mesh.position.set(u, y, -s.d / 2 - off); mesh.rotation.y = Math.PI; break;
    case 'back': mesh.position.set(u, y, s.d / 2 + off); break;
    case 'left': mesh.position.set(-s.w / 2 - off, y, u); mesh.rotation.y = -Math.PI / 2; break;
    case 'right': mesh.position.set(s.w / 2 + off, y, u); mesh.rotation.y = Math.PI / 2; break;
    default: mesh.position.set(u, y, 0);
  }
  mesh.castShadow = false; mesh.receiveShadow = false;
}

// ---------- Fase 6 — props instanciados (postes, barris, pneus, sacos, paletes) ----------
function buildProps(scene, layout) {
  const props = propPlacements(layout);
  if (!props.length) return;
  const dummy = new THREE.Object3D();
  const byType = (t) => props.filter(p => p.type === t);
  const inst = (geo, mat, list, fill, { cast = true, receive = true } = {}) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    let i = 0;
    for (const p of list) { fill(p); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix); }
    im.count = i;
    im.castShadow = cast; im.receiveShadow = receive;
    scene.add(im);
  };

  // postes de luz: mastro + braço + cabeça emissiva
  const lamps = byType('lamp');
  const poleM = metalMaterial('#3c4046');
  inst(new THREE.CylinderGeometry(.07, .1, 5.2, 6), poleM, lamps, (p) => {
    dummy.position.set(p.x, 2.6, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(p.s);
  }, { cast: false });
  inst(new THREE.BoxGeometry(1.1, .1, .16), poleM, lamps, (p) => {
    dummy.position.set(p.x + Math.sin(p.rot) * .5, 5.1, p.z + Math.cos(p.rot) * .5);
    dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { cast: false });
  const headM = new THREE.MeshStandardMaterial({ color: '#ffe9b8', emissive: '#ffdf9e', emissiveIntensity: 1.1, roughness: .4 });
  inst(new THREE.BoxGeometry(.5, .12, .3), headM, lamps, (p) => {
    dummy.position.set(p.x + Math.sin(p.rot) * 1, 5.02, p.z + Math.cos(p.rot) * 1);
    dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { cast: false, receive: false });

  // barris (cilindro com anéis da textura)
  inst(new THREE.CylinderGeometry(.34, .34, .95, 10), barrelMaterial('#4a5545'), byType('barrel'), (p) => {
    dummy.position.set(p.x, .48 * p.s, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  });
  // alguns barris deitados
  inst(new THREE.CylinderGeometry(.34, .34, .95, 10), barrelMaterial('#5d5148'), byType('barrel').filter((_, i) => i % 4 === 3), (p) => {
    dummy.position.set(p.x, .34, p.z); dummy.rotation.set(Math.PI / 2, p.rot, 0); dummy.scale.setScalar(p.s);
  });
  // pneus (torus)
  inst(new THREE.TorusGeometry(.36, .15, 8, 14), new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: .95 }), byType('tire'), (p) => {
    dummy.position.set(p.x, .16, p.z); dummy.rotation.set(Math.PI / 2, 0, p.rot); dummy.scale.setScalar(p.s);
  });
  // sacos de areia: pilha de 3 (2 embaixo + 1 em cima)
  const bags = byType('sandbag');
  const bagGeo = new THREE.BoxGeometry(.75, .3, .42);
  const bagM = sandbagMaterial();
  inst(bagGeo, bagM, bags, (p) => {
    dummy.position.set(p.x, .15, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  });
  inst(bagGeo, bagM, bags, (p) => {
    dummy.position.set(p.x + Math.sin(p.rot + 1.7) * .4, .15, p.z + Math.cos(p.rot + 1.7) * .4);
    dummy.rotation.set(0, p.rot + .3, 0); dummy.scale.setScalar(p.s);
  });
  inst(bagGeo, bagM, bags, (p) => {
    dummy.position.set(p.x, .45, p.z); dummy.rotation.set(0, p.rot + .8, 0); dummy.scale.setScalar(p.s);
  });
  // paletes
  inst(new THREE.BoxGeometry(1.25, .14, 1.05), palletMaterial(), byType('pallet'), (p) => {
    dummy.position.set(p.x, .07, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  });
  // barricadas de concreto (jersey barrier com listras)
  const barM = concreteMaterial(1);
  barM.color = new THREE.Color('#9a958b');
  inst(new THREE.BoxGeometry(2.2, .95, .55), barM, byType('barrierprop'), (p) => {
    dummy.position.set(p.x, .48, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  });
}

// ---------- Fase 6 — cordilheira de fundo ----------
function buildMountains(scene, scenario) {
  const tint = '#' + new THREE.Color(scenario.sky.horizon).multiplyScalar(.5).getHexString();
  const mat = new THREE.MeshBasicMaterial({
    map: mountainTexture(tint), transparent: true, depthWrite: false, fog: false,
  });
  const R = 560, W = 760, H = 190;
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    m.position.set(Math.sin(a) * R, H * .32, Math.cos(a) * R);
    m.rotation.y = a + Math.PI; // voltada para o centro
    scene.add(m);
  }
}

// ---------- Fase 4 — natureza: árvores, pedras e nuvens ----------
function buildNature(scene, layout, rng) {
  const free = (x, z, m = 4) => layout.colliders.every(c => x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  const districtClear = (x, z, pad = 8) => layout.districts.every(d => Math.hypot(x - d.cx, z - d.cz) > d.r + pad);

  // ---- árvores (tronco levemente inclinado + copa com cor por instância) ----
  const TREES = 52;
  const trunkGeo = new THREE.CylinderGeometry(.14, .32, 3.4, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: .95 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9, flatShading: true }); // tinta por instância
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREES * 3);
  trunks.castShadow = canopies.castShadow = true;
  trunks.receiveShadow = canopies.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let ti = 0, ci = 0, guard = 0;
  while (ti < TREES && guard++ < 600) {
    const x = (rng.next() - .5) * 392, z = (rng.next() - .5) * 392;
    if (!free(x, z) || !districtClear(x, z)) continue;
    const s = .8 + rng.next() * .7;
    dummy.position.set(x, 1.7 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, (rng.next() - .5) * .12); // inclinação orgânica
    dummy.updateMatrix();
    trunks.setMatrixAt(ti, dummy.matrix);
    tint.setHex(canopyTint(rng));
    for (let k = 0; k < 3 && ci < TREES * 3; k++) {
      dummy.position.set(x + (rng.next() - .5) * .9, (3.2 + k * .95) * s, z + (rng.next() - .5) * .9);
      const cs = s * (1.1 - k * .27);
      dummy.scale.setScalar(cs);
      dummy.rotation.set(rng.next() * .3, rng.next() * Math.PI * 2, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(ci, dummy.matrix);
      canopies.setColorAt(ci, tint);
      ci++;
    }
    ti++;
  }
  trunks.count = ti; canopies.count = ci;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  scene.add(trunks, canopies);

  // ---- arbustos (esferas achatadas escuras rentes ao chão) ----
  const BUSH = 26;
  const bushGeo = new THREE.IcosahedronGeometry(.7, 1);
  const bushMat = new THREE.MeshStandardMaterial({ color: '#45542c', roughness: .95, flatShading: true });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, BUSH);
  bushes.castShadow = bushes.receiveShadow = true;
  let bi = 0; guard = 0;
  while (bi < BUSH && guard++ < 300) {
    const x = (rng.next() - .5) * 380, z = (rng.next() - .5) * 380;
    if (!free(x, z, 2.5) || !districtClear(x, z, 3)) continue;
    dummy.position.set(x, .3, z);
    dummy.scale.set(.8 + rng.next(), .55 + rng.next() * .4, .8 + rng.next());
    dummy.rotation.set(0, rng.next() * Math.PI * 2, 0);
    dummy.updateMatrix();
    bushes.setMatrixAt(bi++, dummy.matrix);
  }
  bushes.count = bi;
  scene.add(bushes);

  // ---- pedras ----
  const ROCKS = 30;
  const rockGeo = new THREE.DodecahedronGeometry(.9, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: .92, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.castShadow = rocks.receiveShadow = true;
  let ri = 0; guard = 0;
  while (ri < ROCKS && guard++ < 400) {
    const x = (rng.next() - .5) * 390, z = (rng.next() - .5) * 390;
    if (!free(x, z, 3) || !districtClear(x, z, 2)) continue;
    dummy.position.set(x, .25 + rng.next() * .2, z);
    dummy.scale.set(.5 + rng.next() * .9, .35 + rng.next() * .5, .5 + rng.next() * .9);
    dummy.rotation.set(rng.next() * .4, rng.next() * Math.PI * 2, rng.next() * .4);
    dummy.updateMatrix();
    rocks.setMatrixAt(ri++, dummy.matrix);
  }
  rocks.count = ri;
  scene.add(rocks);

  // ---- nuvens de crepúsculo ----
  const cloudTex = cloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, opacity: .85,
    color: '#d8b8a8',
  });
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(90 + rng.next() * 110, 34 + rng.next() * 40), cloudMat);
    const a = rng.next() * Math.PI * 2, r = 160 + rng.next() * 380;
    c.position.set(Math.cos(a) * r, 120 + rng.next() * 90, Math.sin(a) * r);
    c.rotation.x = -Math.PI / 2;
    c.rotation.z = rng.next() * Math.PI;
    cloudGroup.add(c);
  }
  cloudGroup.userData.drift = true;
  scene.userData.clouds = cloudGroup;
  scene.add(cloudGroup);
}

// ---------- mundo completo ----------
export function buildScene(seed, scenarioId = 'CIGKV', renderer = null) {
  const scenario = resolveScenario(scenarioId);
  const layout = getWorldLayout(seed, scenario.id);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(scenario.fogColor), scenario.id === 'Barburhen' ? 0.0048 : 0.0038);
  scene.userData.scenarioId = scenario.id;
  scene.userData.mapLabel = scenario.mapLabel;

  scene.add(createSky(scenario));

  const sun = new THREE.DirectionalLight(scenario.id === 'Barburhen' ? '#dce9f3' : '#ffb37a', 2.6);
  sun.position.set(-160, 60, -240);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
  const S = 150;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(scenario.id === 'Barburhen' ? '#b9d0df' : '#8a6ab0', scenario.id === 'Barburhen' ? '#59646a' : '#3a3028', 1.08);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight('#6a5aa0', 0.55);
  fill.position.set(140, 80, 180);
  scene.add(fill);
  const back = new THREE.DirectionalLight('#a8885e', 0.6);
  back.position.set(60, 50, 240);
  scene.add(back);

  // ---- terreno ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(440, 440),
    groundMaterial(34, scenario.groundTint)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // praça central de asfalto
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(34, 40),
    asphaltMaterial(8)
  );
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = .02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Fase 6 — viação (estradas/calçadas/faixas) por cima do terreno
  buildRoads(scene, layout);

  // ---- estruturas ----
  const concrete = concreteMaterial(2.2);
  const concrete2 = concreteMaterial(1.4);
  const metalRust = metalMaterial('#7a4a2b');
  const metalBlue = metalMaterial('#31556b');
  const metalGreen = metalMaterial('#3d5a3a');
  const metalGray = metalMaterial('#4c4f55');
  const winTex = windowsTexture();
  const crateTex = crateTexture();

  const mats = {
    barrack: concrete,
    hangar: concrete2,
    warehouse: metalGray,
    tower: concrete,
    ruin: (() => { const m = concrete2.clone(); m.color = new THREE.Color('#b0a89a'); m.roughness = .95; return m; })(),
    depot: metalRust,
    wall: concrete,
    barrier: concrete2,
    crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: .85 }),
    container: null,
    silo: metalGray,
    pavilion: metalGreen,
    monolith: (() => { const m = metalBlue.clone(); m.roughness = .4; m.metalness = .6; m.emissive = new THREE.Color('#1a2e3a'); m.emissiveIntensity = .5; return m; })(),
    building: new THREE.MeshStandardMaterial({ map: winTex, roughness: .8, emissive: '#ffd28a', emissiveMap: winTex, emissiveIntensity: .55 }),
  };
  const containerMats = [metalRust, metalBlue, metalGreen, metalGray];

  // Fase 6 — envmap coerente com o céu do cenário (antes: RoomEnvironment genérico)
  if (renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(createSky(scenario));
      const envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 24),
        new THREE.MeshBasicMaterial({ color: scenario.groundTint === '#ffffff' ? '#4a4030' : scenario.groundTint }));
      envGround.rotation.x = -Math.PI / 2; envGround.position.y = -4;
      envScene.add(envGround);
      scene.environment = pmrem.fromScene(envScene, .04).texture;
      scene.environmentIntensity = .45;
      pmrem.dispose();
    } catch { /* fallback: materiais seguem sem envmap */ }
  }

  // Fase 4/6 — natureza, cordilheira e props
  buildNature(scene, layout, new SeededRng(`${seed}:nature`));
  buildMountains(scene, scenario);
  buildProps(scene, layout);

  for (const s of layout.structures) {
    const mat = s.kind === 'container' ? containerMats[s.variant % 4] : (mats[s.kind] ?? mats.wall);
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.yMin + s.h / 2, s.z);
    mesh.rotation.y = s.rot ?? 0;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (s.h >= 6 && s.kind !== 'monolith') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(s.w * 1.04, .5, s.d * 1.04), mats.wall);
      cap.position.set(s.x, s.yMin + s.h + .25, s.z);
      cap.castShadow = true; cap.receiveShadow = true;
      scene.add(cap);
    }
    if (s.h >= 8) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 4.5, 6), mats.silo);
      ant.position.set(s.x + s.w * .3, s.yMin + s.h + 2.2, s.z + s.d * .3);
      scene.add(ant);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ff3d52' }));
      beacon.position.set(s.x + s.w * .3, s.yMin + s.h + 4.5, s.z + s.d * .3);
      scene.add(beacon);
      scene.userData.beacons = scene.userData.beacons || [];
      scene.userData.beacons.push(beacon);
    }
  }

  // Fase 6 — fachadas detalhadas por cima das estruturas (depois dos meshes base)
  buildFacades(scene, layout);

  // ---- grama instanciada (duas tonalidades p/ quebrar a uniformidade) ----
  const bladeTex = grassBladeTexture();
  const GRASS = 1500;
  const seedRng = { s: 12345, next() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; } };
  const grassGeo = new THREE.PlaneGeometry(.9, .7);
  const dummy = new THREE.Object3D();
  const blades = []; // [x, z, rot]
  for (let i = 0; i < GRASS * 2; i++) {
    const x = (seedRng.next() - .5) * 400, z = (seedRng.next() - .5) * 400;
    let ok = true;
    for (const c of layout.colliders) {
      if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) { ok = false; break; }
    }
    if (ok) blades.push([x, z, seedRng.next() * Math.PI]);
  }
  ['#c9cfa0', '#b3bd8c'].forEach((tintCol, half) => {
    const grassMat = new THREE.MeshStandardMaterial({
      map: bladeTex.clone(), alphaTest: .45, side: THREE.DoubleSide, roughness: 1, color: tintCol,
    });
    grassMat.map.needsUpdate = true;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, Math.max(1, Math.ceil(blades.length / 2)));
    let gi = 0;
    for (let i = half; i < blades.length; i += 2) {
      const [x, z, rot] = blades[i];
      dummy.position.set(x, .32, z);
      dummy.rotation.set(0, rot, 0);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
    grass.count = gi;
    scene.add(grass);
  });

  // ---- loot visual ----
  const lootGroup = new THREE.Group();
  scene.userData.lootMeshes = new Map();
  scene.add(lootGroup);

  // ---- terminais ZEX ----
  scene.userData.terminalMeshes = [];
  for (const t of layout.terminals) {
    const tm = createTerminalMesh();
    tm.position.set(t.x, 0, t.z);
    scene.add(tm);
    scene.userData.terminalMeshes.push(tm);
  }

  scene.userData.layout = layout;
  scene.userData.sectors = layout.sectors;
  return { scene, layout, sun, materials: mats };
}
