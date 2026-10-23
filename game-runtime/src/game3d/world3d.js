// Khaaos Run — Construção do mundo 3D (Khaoos Ville // CIGKV)
// Céu de crepúsculo vulcânico (paleta Mystic Chaos), luz direcional com sombras,
// terreno, estruturas do layout procedural, parede do anel, grama instanciada.
// Fase 4 — realismo PBR: normal maps procedurais, environment map (metais reais),
// vegetação instanciada (árvores/pedras) e nuvens de crepúsculo.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SeededRng } from '../shared/rng.js';
import { getWorldLayout } from './sim3d.js';
import { resolveScenario } from './scenarios.js';
import {
  concreteMaterial, metalMaterial, groundMaterial, asphaltMaterial,
  windowsTexture, crateTexture, grassBladeTexture, cloudTexture,
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
          // painel de energia subindo
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

// ---------- Fase 4 — natureza: árvores, pedras e nuvens ----------
// Decorativas (sem colisão — a sim permanece idêntica), espalhadas FORA dos
// distritos para não sujar leitura de combate. Instanced = custo mínimo.
function buildNature(scene, layout, rng) {
  const free = (x, z, m = 4) => layout.colliders.every(c => x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  const districtClear = (x, z, pad = 8) => layout.districts.every(d => Math.hypot(x - d.cx, z - d.cz) > d.r + pad);

  // ---- árvores (tronco cônico + copa em dupla esfera achatada) ----
  const TREES = 46;
  const trunkGeo = new THREE.CylinderGeometry(.16, .3, 3.4, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: .95 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#4d5a33', roughness: .9, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREES * 2);
  trunks.castShadow = canopies.castShadow = true;
  trunks.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let ti = 0, ci = 0, guard = 0;
  while (ti < TREES && guard++ < 600) {
    const x = (rng.next() - .5) * 392, z = (rng.next() - .5) * 392;
    if (!free(x, z) || !districtClear(x, z)) continue;
    const s = .8 + rng.next() * .7;
    dummy.position.set(x, 1.7 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti, dummy.matrix);
    for (let k = 0; k < 2 && ci < TREES * 2; k++) {
      dummy.position.set(x + (rng.next() - .5) * .8, (3.3 + k * 1.05) * s, z + (rng.next() - .5) * .8);
      const cs = s * (1.05 - k * .25);
      dummy.scale.setScalar(cs);
      dummy.rotation.set(rng.next() * .3, rng.next() * Math.PI * 2, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(ci++, dummy.matrix);
    }
    ti++;
  }
  trunks.count = ti; canopies.count = ci;
  scene.add(trunks, canopies);

  // ---- pedras (dodecaedros achatados) ----
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

  // ---- nuvens de crepúsculo: planos deitados no céu (horizonte limpo) ----
  const cloudTex = cloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, opacity: .85,
    color: '#d8b8a8', // tinta de crepúsculo
  });
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(90 + rng.next() * 110, 34 + rng.next() * 40), cloudMat);
    const a = rng.next() * Math.PI * 2, r = 160 + rng.next() * 380;
    c.position.set(Math.cos(a) * r, 120 + rng.next() * 90, Math.sin(a) * r);
    c.rotation.x = -Math.PI / 2; // deitadas — lidas como camada no céu
    c.rotation.z = rng.next() * Math.PI;
    cloudGroup.add(c);
  }
  cloudGroup.userData.drift = true; // deriva lenta no loop do jogo
  scene.userData.clouds = cloudGroup;
  scene.add(cloudGroup);
}

// ---------- mundo completo ----------
// Fase 4 + cenários: buildScene(seed, scenarioId, renderer) — renderer habilita o envmap PBR
export function buildScene(seed, scenarioId = 'CIGKV', renderer = null) {
  const scenario = resolveScenario(scenarioId);
  const layout = getWorldLayout(seed, scenario.id);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(scenario.fogColor), scenario.id === 'Barburhen' ? 0.0048 : 0.0038);
  scene.userData.scenarioId = scenario.id;
  scene.userData.mapLabel = scenario.mapLabel;

  scene.add(createSky(scenario));

  // luzes: sol vulcânico + ambiente místico
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
    groundMaterial(30, scenario.groundTint) // PBR: cor + normal procedural + tint do cenário (Fase 4 + cenários)
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
    container: null, // por-variante
    silo: metalGray,
    pavilion: metalGreen,
    monolith: (() => { const m = metalBlue.clone(); m.roughness = .4; m.metalness = .6; m.emissive = new THREE.Color('#1a2e3a'); m.emissiveIntensity = .5; return m; })(),
    building: new THREE.MeshStandardMaterial({ map: winTex, roughness: .8, emissive: '#ffd28a', emissiveMap: winTex, emissiveIntensity: .55 }),
  };
  const containerMats = [metalRust, metalBlue, metalGreen, metalGray];

  // Fase 4 — environment map: reflexos PBR reais nos metais (contêineres, silos,
  // monolito, armas). PMREM + RoomEnvironment (procedural, sem assets externos).
  if (renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
      scene.environmentIntensity = .35; // sutil — o sol continua dominando o look
      pmrem.dispose();
    } catch { /* fallback: materiais seguem sem envmap */ }
  }

  // Fase 4 — vegetação e rochas fora dos distritos (instanced) + nuvens no céu
  buildNature(scene, layout, new SeededRng(`${seed}:nature`));

  for (const s of layout.structures) {
    const mat = s.kind === 'container' ? containerMats[s.variant % 4] : (mats[s.kind] ?? mats.wall);
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.yMin + s.h / 2, s.z);
    mesh.rotation.y = s.rot ?? 0;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // detalhe: topo de concreto nas torres/galpões
    if (s.h >= 6 && s.kind !== 'monolith') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(s.w * 1.04, .5, s.d * 1.04), mats.wall);
      cap.position.set(s.x, s.yMin + s.h + .25, s.z);
      cap.castShadow = true; cap.receiveShadow = true;
      scene.add(cap);
    }
    // antena nos pontos altos
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

  // ---- grama instanciada ----
  const bladeTex = grassBladeTexture();
  const grassMat = new THREE.MeshStandardMaterial({
    map: bladeTex, alphaTest: .45, side: THREE.DoubleSide, roughness: 1, color: '#c9cfa0',
  });
  const grassGeo = new THREE.PlaneGeometry(.9, .7);
  const GRASS = 1500;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, GRASS * 2);
  const dummy = new THREE.Object3D();
  let gi = 0;
  const seedRng = { s: 12345, next() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; } };
  for (let i = 0; i < GRASS * 2 && gi < GRASS * 2; i++) {
    const x = (seedRng.next() - .5) * 400, z = (seedRng.next() - .5) * 400;
    // não nasce dentro de estruturas (aproximação: centro das estruturas)
    let ok = true;
    for (const c of layout.colliders) {
      if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) { ok = false; break; }
    }
    if (!ok) continue;
    dummy.position.set(x, .32, z);
    dummy.rotation.set(0, seedRng.next() * Math.PI, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(gi++, dummy.matrix);
  }
  grass.count = gi;
  scene.add(grass);

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
