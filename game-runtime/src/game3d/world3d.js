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
import { roadSegments, propPlacements, facadeDetails, canopyTint, trafficPlacements } from './detail3d.js';
import { buildTrafficVehicles } from './vehicles3d.js';
import { buildWorldMarks } from './worldmarks3d.js';
import { buildDistrictDressing } from './districts3d.js'; // Fase 22 — cenários vivos
import { buildInteriors, buildShellHost } from './interiors3d.js'; // Fase 23 — interiores reais
import { buildTerrain, terrainHeightAt } from './terrain3d.js'; // Fase 23 — relevo do terreno
import { buildLightShafts } from './lightshafts3d.js'; // Fase 24 — raios de luz pelas janelas
import { qualityTier } from './quality3d.js';
import { loadGltfModel, cloneModel } from './assets3d.js';
import { NIGHT, nightSceneState } from './skyPhase.js';
import {
  concreteMaterial, metalMaterial, groundMaterial, asphaltMaterial,
  windowsTexture, crateTexture, grassBladeTexture, cloudTexture,
  roadMaterial, sidewalkMaterial, crosswalkTexture, barrelMaterial,
  sandbagMaterial, palletMaterial, signTexture, mountainTexture, contactShadowTexture,
} from './textures3d.js';
import { createLootMesh, createTerminalMesh } from './entities3d.js';
// Fase 31 — vegetação de produção: árvores por arquétipo de mundo, arbustos
// em cluster, tufos de grama curvados e vento por shader (vegetation3d).
import {
  treeArchetypeFor, buildTreeField, buildBushField,
  buildGrassFieldLOD, patchSway, tickVegetationWind,   // Fase 32 — grama com LOD
  grassOutdoorBake, applyOutdoorTint,                  // F36 — impostor outdoor (bake no terreno)
  bushShadowEntries,                                   // F38 — sombra de contato dos arbustos
  scrubShadowBand, patchInstanceAlpha,                 // F39 — banda de distância da sombra do scrub
} from './vegetation3d.js';
export { tickVegetationWind }; // re-export p/ o main3d (tick único do vento)

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
      // FIX "mundo vermelho" (parte 3 — causa raiz): abaixo do horizonte o domo
      // era 100% `horizon` (laranja vivo). No paraquedas (135 m), o chão só
      // cobre 440×440 m — todo o "vazio" fora dele mostrava o interior do domo
      // LARANJA: o mapa inteiro ficava vermelho do alto. O shader agora decai
      // para o fogColor abaixo do horizonte (leitura de solo distante na névoa,
      // como em qualquer BR). Uniform sincronizado no applyNightness.
      fogColor: { value: new THREE.Color(scenario.fogColor) },
      // Fase 8 — céu dinâmico: cada pulso do Ring aprofunda a noite
      night: { value: 0 },
      nTop: { value: new THREE.Color(NIGHT.skyTop) },
      nMid: { value: new THREE.Color(NIGHT.skyMid) },
      nHorizon: { value: new THREE.Color(NIGHT.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, sunDir, fogColor;
      uniform float night;
      uniform vec3 nTop, nMid, nHorizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
        col = mix(col, top, smoothstep(0.25, 0.85, h));
        // Fase 8 — mistura para a paleta noturna por banda (horizonte→meio→zênite)
        vec3 ncol = mix(nHorizon, nMid, smoothstep(0.0, 0.28, h));
        ncol = mix(ncol, nTop, smoothstep(0.25, 0.85, h));
        col = mix(col, ncol, night);
        // FIX "mundo vermelho": abaixo do horizonte decai p/ o fog do cenário
        // (escuro, dessaturado) — o "vazio" fora do chão lê como solo na névoa.
        float under = smoothstep(0.0, -0.22, vDir.y);
        vec3 below = fogColor * mix(.9, .25, night);
        col = mix(col, below, under);
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, .62, .3) * pow(sun, 22.0) * 1.35 * (1.0 - night * 0.88);   // halo cede à noite
        col += vec3(1.0, .85, .6) * pow(sun, 380.0) * 3.2 * (1.0 - night * 0.86);   // disco vira "lua"
        // estrelas — ganham peso com a noite
        vec3 sd = normalize(vDir) * 220.0;
        float star = step(0.9985, fract(sin(dot(floor(sd), vec3(12.9898, 78.233, 45.164))) * 43758.5453));
        col += vec3(.9) * star * smoothstep(0.35, 0.9, h) * mix(.5, 1.7, night);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// ---------- parede do anel (zona segura) ----------
// FIX visual (regressão "mundo vermelho"): o ShaderMaterial da parede NÃO
// participa do FogExp2 da cena — no Ring de 800 m a parede ficava visível a
// 800 m como uma cortina vermelha nítida dominando o céu durante a QUEDA
// LIVRE. O shader agora replica o FogExp2 do renderer (mesma fórmula
// 1-exp(-(d·density)²)): a parede some na névoa quando distante e volta a
// aparecer quando o Ring encolhe. uniforms de fog são sincronizados a cada
// frame no updateRing (acompanham applyNightness).
export function createRingWall() {
  const group = new THREE.Group();
  const mk = (radius, opacity, color) => {
    const geo = new THREE.CylinderGeometry(radius, radius, 34, 96, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        time: { value: 0 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity },
        fogColor: { value: new THREE.Color('#57382f') }, fogDensity: { value: 0.0035 },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vPos; varying float vDepth;
        void main() { vUv = uv; vPos = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition; }`,
      fragmentShader: `
        uniform float time; uniform vec3 color; uniform float opacity;
        uniform vec3 fogColor; uniform float fogDensity;
        varying vec2 vUv; varying vec3 vPos; varying float vDepth;
        void main() {
          float grid = step(.975, fract(vUv.x * 70.0)) + step(.96, fract(vUv.y * 18.0 - time * .18));
          float edgeTop = smoothstep(1.0, .82, vUv.y);
          float edgeBottom = smoothstep(0.0, .10, vUv.y);
          float a = (0.05 + grid * .16) * edgeTop * edgeBottom;
          float wave = smoothstep(.4, 1., fract(vUv.y * 2.2 - time * .1)) * .05;
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vDepth * vDepth);
          vec3 col = mix(color, fogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, (a + wave) * opacity * (1.0 - clamp(fogFactor, 0.0, 1.0)));
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

// ---------- Fase 8/16 — tráfego urbano estático (carros/vans no padrão do jogo) ----------
// Fase 16 (P0): a silhueta dos veículos foi reconstruída em vehicles3d.js
// (casco + capô + greenhouse em prisma + rodas cilíndricas + luzes); as
// placements continuam EXATAMENTE as mesmas (posições/yaw/cor — zero gameplay).
function buildTraffic(scene, layout, q) {
  const traffic = trafficPlacements(layout, { density: q.trafficFactor ?? 1 });
  if (!traffic.length) return;
  scene.userData.trafficPlacements = traffic; // registro p/ inspeção e2e
  scene.userData.trafficStats = buildTrafficVehicles(scene, traffic);
  // sombras de contato sob os veículos (blobs retangulares aproximados)
  buildContactShadows(scene, traffic.map((t) => ({
    x: t.x, z: t.z, rot: t.rot, size: t.type === 'van' ? 3.4 : 2.8,
  })));
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
// Fase 23 — estruturas com casca (interiors3d) têm porta REAL: a porta pintada
// da fachada é pulada; ruínas (paredes quebradas) também não recebem janelas.
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
function buildFacades(scene, layout, shellSet = null) {
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
    const shelled = shellSet?.has(s) ?? false;
    const host = new THREE.Group();
    host.position.set(s.x, s.yMin, s.z); // y local 0 = chão; v é altura do chão
    host.rotation.y = s.rot ?? 0;
    for (const d of details) {
      if (shelled && (d.kind === 'door' || (d.kind === 'windows' && s.kind === 'ruin'))) continue; // Fase 23
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

// ---------- Fase 7 — sombras de contato (blob) sob props/árvores/pedras ----------
// Um único InstancedMesh de planos com gradiente radial ancora cada objeto no
// chão — custo de 1 draw call, sem depender da resolução do shadow map.
// Fase 22 — exportada para o dressing dos distritos reusar a MESMA infra.
const CONTACT_SHADOW_SIZES = {
  lamp: 1.7, barrel: 1.05, tire: 1.0, sandbag: 1.7, pallet: 1.8,
  barrierprop: 2.9, crate: 1.25, cone: 0.62, rubble: 1.15, rubbleSlab: 1.35,
};
export function buildContactShadows(scene, entries) {
  if (!entries.length) return null;
  const tex = contactShadowTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const im = new THREE.InstancedMesh(geo, mat, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((e, i) => {
    dummy.position.set(e.x, 0.012 + i * 0.0006, e.z); // stagger evita z-fighting entre blobs
    dummy.rotation.set(-Math.PI / 2, 0, e.rot ?? 0);
    dummy.scale.setScalar(e.size ?? 1);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.renderOrder = 1;
  im.receiveShadow = false;
  im.castShadow = false;
  scene.add(im);
  return im;   // F38 — retorno p/ o chamador registrar/inspecionar (testes)
}

// ---------- F39 — sombras de contato em BANDAS DE DISTÂNCIA (scrub) ----------
// Os discos do mato rasteiro de Barburhen (F7) eram ESTÁTICOS: opacidade cheia
// a 200 m virava moiré escuro no horizonte. Aqui o MESMO disco radial ganha
// alpha POR INSTÂNCIA dirigido por scrubShadowBand (vegetation3d — cheio
// perto, raleio smoothstep, zero longe): main3d chama update(camX, camZ)
// 1×/frame (O(scrub), tipicamente 150 hipotenusa + 150 floats — nada).
// Mesma textura/material do F7 (consistência visual), material transparente
// sem depthWrite + polygonOffset contra o terreno; y ancora no RELEVO (entry.y
// com lift embutido — no plano jogável o terreno é 0, na margem acompanha).
export function buildBandContactShadows(scene, entries, {
  opacity = .55, nearDist = 30, farDist = 90,
} = {}) {
  if (!entries.length) return null;
  const tex = contactShadowTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: Math.max(.05, Math.min(1, opacity)),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  patchInstanceAlpha(mat);                       // F39 — alpha por instância (F37)
  const geo = new THREE.PlaneGeometry(1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(entries.length), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('instanceAlpha', alpha);
  const im = new THREE.InstancedMesh(geo, mat, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((e, i) => {
    dummy.position.set(e.x, e.y ?? (0.012 + i * 0.0006), e.z);
    dummy.rotation.set(-Math.PI / 2, 0, e.rot ?? 0);
    dummy.scale.setScalar(e.size ?? 1);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.renderOrder = 1;
  im.receiveShadow = false;
  im.castShadow = false;
  im.count = entries.length;
  im.visible = false;                            // update() acende com a banda
  im.computeBoundingSphere?.();
  scene.add(im);
  return {
    mesh: im, entries, alpha, nearDist, farDist,
    update(camX = 0, camZ = 0) {
      let lit = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const a = scrubShadowBand(Math.hypot(e.x - camX, e.z - camZ), { nearDist, farDist });
        alpha.setX(i, a);
        if (a > 0.002) lit++;
      }
      alpha.needsUpdate = true;
      im.visible = lit > 0;                      // banda vazia → 0 draw calls
      return this;
    },
  };
}

// ---------- Fase 6 — props instanciados (postes, barris, pneus, sacos, paletes) ----------
function buildProps(scene, layout, q) {
  const isBarburhen = layout.scenarioId === 'Barburhen';
  const props = propPlacements(layout, { density: q.propsFactor * (isBarburhen ? 1.22 : 1) });
  if (!props.length) return;
  // Fase 7 — sombras de contato sob TODOS os props
  buildContactShadows(scene, props.map((p) => ({
    x: p.x, z: p.z, rot: 0, size: (CONTACT_SHADOW_SIZES[p.type] ?? 1.2) * (p.s ?? 1),
  })));
  // Fase 7 — registro para o upgrade GLTF pós-load (applyGltfProps)
  scene.userData.propPlacements = props;
  const dummy = new THREE.Object3D();
  const byType = (t) => props.filter(p => p.type === t);
  const propInstances = {}; // Fase 7 — registro p/ substituição por GLTF
  const inst = (geo, mat, list, fill, { cast = true, receive = true, type = null } = {}) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    let i = 0;
    for (const p of list) { fill(p); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix); }
    im.count = i;
    im.castShadow = cast; im.receiveShadow = receive;
    scene.add(im);
    if (type) propInstances[type] = im;
    return im;
  };

  // postes de luz: mastro + braço + cabeça emissiva
  const lamps = byType('lamp');
  const poleM = metalMaterial('#3c4046');
  inst(new THREE.CylinderGeometry(.07, .1, 5.2, 6), poleM, lamps, (p) => {
    dummy.position.set(p.x, 2.6, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(p.s);
  }, { cast: false, type: 'lamp-pole' });
  inst(new THREE.BoxGeometry(1.1, .1, .16), poleM, lamps, (p) => {
    dummy.position.set(p.x + Math.sin(p.rot) * .5, 5.1, p.z + Math.cos(p.rot) * .5);
    dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { cast: false });
  const headM = new THREE.MeshStandardMaterial({ color: '#ffe9b8', emissive: '#ffdf9e', emissiveIntensity: 1.1, roughness: .4 });
  inst(new THREE.BoxGeometry(.5, .12, .3), headM, lamps, (p) => {
    dummy.position.set(p.x + Math.sin(p.rot) * 1, 5.02, p.z + Math.cos(p.rot) * 1);
    dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { cast: false, receive: false });

  // barris (cilindro com anéis da textura) — substituído por GLTF real pós-load
  inst(new THREE.CylinderGeometry(.34, .34, .95, 10), barrelMaterial('#4a5545'), byType('barrel'), (p) => {
    dummy.position.set(p.x, .48 * p.s, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { type: 'barrel' });
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
  // barricadas de concreto (jersey barrier com listras) — GLTF real pós-load
  const barM = concreteMaterial(1);
  barM.color = new THREE.Color('#9a958b');
  inst(new THREE.BoxGeometry(2.2, .95, .55), barM, byType('barrierprop'), (p) => {
    dummy.position.set(p.x, .48, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { type: 'barrierprop' });
  // caixotes de suprimento (fallback procedural — GLTF substitui pós-load)
  const crateM = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: .85 });
  inst(new THREE.BoxGeometry(.9, .9, .9), crateM, byType('crate'), (p) => {
    dummy.position.set(p.x, .45 * p.s, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { type: 'crate' });
  // cones de trânsito (fallback procedural — GLTF substitui pós-load)
  const coneM = new THREE.MeshStandardMaterial({ color: '#e65214', roughness: .7 });
  inst(new THREE.ConeGeometry(.22, .7, 10), coneM, byType('cone'), (p) => {
    dummy.position.set(p.x, .35 * p.s, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s);
  }, { type: 'cone' });
  // Barburhen — detritos de concreto e chapa, instanciados para manter custo baixo.
  const rubbleM = concreteMaterial(1.4);
  rubbleM.color = new THREE.Color('#777875');
  inst(new THREE.DodecahedronGeometry(.42, 0), rubbleM, byType('rubble'), (p) => {
    dummy.position.set(p.x, .2 * p.s, p.z);
    dummy.rotation.set(p.rot * .7, p.rot, p.rot * .35);
    dummy.scale.set(p.s, p.s * (.55 + (p.x * p.x + p.z * p.z) % .35), p.s * .72);
  }, { type: 'rubble' });
  const slabM = metalMaterial('#50565a');
  inst(new THREE.BoxGeometry(.9, .16, .42), slabM, byType('rubbleSlab'), (p) => {
    dummy.position.set(p.x, .1 * p.s, p.z);
    dummy.rotation.set((p.rot % .25) - .12, p.rot, (p.rot % .18) - .09);
    dummy.scale.setScalar(p.s);
  }, { type: 'rubbleSlab' });
  // tipos com asset GLTF real (aplicados depois por applyGltfProps)
  scene.userData.gltfPropTypes = ['barrel', 'crate', 'cone', 'barrierprop'];
  scene.userData.propInstances = propInstances;
}

// Fase 7 — troca os props procedurais por modelos GLTF REAIS assim que carregam.
// Se o fetch falhar (asset ausente/rede), o procedural PERMANECE — zero regressão.
export function applyGltfProps(scene) {
  const placements = scene.userData.propPlacements;
  const types = scene.userData.gltfPropTypes;
  const meshes = scene.userData.propInstances;
  if (!placements || !types || !meshes) return;
  const map = { barrel: 'barrel', crate: 'crate', cone: 'cone', barrierprop: 'barrier' };
  for (const type of types) {
    const asset = map[type];
    if (!asset) continue;
    loadGltfModel(asset).then((model) => {
      if (!model) return;
      const list = placements.filter((p) => p.type === type);
      const old = meshes[type];
      if (old) scene.remove(old);
      const group = new THREE.Group();
      for (const p of list) {
        const clone = cloneModel(model);
        if (!clone) continue;
        clone.position.set(p.x, 0, p.z);
        clone.rotation.y = p.rot ?? 0;
        clone.scale.setScalar(p.s ?? 1);
        group.add(clone);
      }
      scene.add(group);
    });
  }
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

// ---------- Fase 22 — paletas de vegetação POR CENÁRIO ----------
// A copa e a grama acompanham a identidade do mundo (antes: sempre oliva
// crepuscular do CIGKV, mesmo no deserto de lava ou no arquipélago).
const CANOPY_PALETTES = {
  CIGKV: [0x6a7a3c, 0x59682f, 0x7d8443, 0x8a6f3c],                 // oliva crepuscular (original)
  Barburhen: [0x3f5f4a, 0x35523f, 0x4a6a50, 0x5d6b5a],             // pinhais frios
  Priadus: [0x2f5d43, 0x275043, 0x3a6b52, 0x4a6b3f],               // dossel pantanoso
  Ckesalth: [0x7a6f3c, 0x8a7444, 0x6b6034, 0x6e5636],              // arbustos secos do deserto
  Arukheea: [0x5f6f8a, 0x54647f, 0x6b7f9a, 0x7a6f9a],              // flora cinza-astral
};
const GRASS_TINTS = {
  CIGKV: ['#c9cfa0', '#b3bd8c'],                                   // original
  Barburhen: ['#a8c0b4', '#94b0a4'],                               // capim gélido
  Priadus: ['#5f7f6a', '#4f6f5c'],                                 // capim de mangue
  Ckesalth: ['#c9b078', '#bfa267'],                                // capim seco dourado
  Arukheea: ['#9aa4b8', '#8a94ac'],                                // capim de cinza astral
};
function scenarioCanopyTint(scenario, rng) {
  const palette = CANOPY_PALETTES[scenario.id] ?? CANOPY_PALETTES.CIGKV;
  return palette[Math.floor(rng.next() * palette.length) % palette.length];
}

// ---------- Fase 31 — natureza: árvores/arquétipo, arbustos, pedras, nuvens ----
// Vegetação de produção (vegetation3d): tronco com raízes e galhos, dossel
// em blobs deformados, vento por shader e tint por instância. 2 draw calls
// instanciadas para a floresta inteira (antes: tronco-cilindro + 3 icosaedros).
function buildNature(scene, layout, rng, q, scenario = null) {
  const free = (x, z, m = 4) => layout.colliders.every(c => x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  const districtClear = (x, z, pad = 8) => layout.districts.every(d => Math.hypot(x - d.cx, z - d.cz) > d.r + pad);

  // ---- árvores (arquétipo por mundo — identidade W1-W4) ----
  const TREES = Math.max(8, Math.round(52 * q.treeFactor));
  const shadowSpots = []; // Fase 7 — sombras de contato da natureza
  const seedBase = `${scenario?.id ?? 'CIGKV'}`.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const archetype = treeArchetypeFor(scenario?.id ?? 'CIGKV');
  const treeSpots = [];
  let ti = 0, guard = 0;
  while (ti < TREES && guard++ < 600) {
    const x = (rng.next() - .5) * 392, z = (rng.next() - .5) * 392;
    if (!free(x, z) || !districtClear(x, z)) continue;
    const s = .8 + rng.next() * .7;
    shadowSpots.push({ x, z, size: 3.1 * s });
    treeSpots.push({
      x, z, s, rot: rng.next() * Math.PI * 2, tilt: (rng.next() - .5) * .1,
      tint: scenario ? scenarioCanopyTint(scenario, rng) : canopyTint(rng),
      trunkTint: rng.next() < .5 ? '#6b5433' : '#7a6140',
    });
    ti++;
  }
  const field = buildTreeField({ archetype, seed: seedBase + 1, spots: treeSpots });
  scene.add(field.trunks, field.canopies);

  // ---- arbustos (clusters de 5 blobs — Fase 31; tint por instância) ----
  const BUSH = Math.max(6, Math.round(40 * q.bushFactor));
  const bushSpots = [];
  let bi = 0; guard = 0;
  while (bi < BUSH && guard++ < 400) {
    const x = (rng.next() - .5) * 380, z = (rng.next() - .5) * 380;
    if (!free(x, z, 2.5) || !districtClear(x, z, 3)) continue;
    const tintHex = scenario
      ? '#' + new THREE.Color(scenarioCanopyTint(scenario, rng)).multiplyScalar(.78).getHexString()
      : '#45542c';
    bushSpots.push({
      x, z, s: .75 + rng.next() * .6, rot: rng.next() * Math.PI * 2, tint: tintHex,
    });
    bi++;
  }
  const bushes = buildBushField({ seed: seedBase + 2, spots: bushSpots });
  scene.add(bushes);
  scene.userData.swayMats = [
    field.canopies.material, bushes.material,
  ];
  // Fase 38 — ARBUSTOS entram no registry de sombras de contato (F7): antes
  // só árvores/pedras/scrub ancoravam no chão — o cluster de blobs "flutuava"
  // sobre o solo liso. 1 disco por arbusto (bushShadowEntries, PURO), mesmo
  // InstancedMesh/estagger das demais sombras de natureza.
  const bushShadows = bushShadowEntries(bushSpots);
  shadowSpots.push(...bushShadows);
  scene.userData.bushShadowSpots = bushShadows;   // inspeção/teste (padrão propPlacements)

  // Barburhen — vegetação baixa fria, crescendo entre concreto e pátios.
  // Planos cruzados com vento por shader mantêm a silhueta orgânica.
  if (scenario?.id === 'Barburhen') {
    const SCRUB = Math.round(150 * q.treeFactor);
    const scrubGeo = new THREE.PlaneGeometry(.9, 1.35);
    const scrubTex = grassBladeTexture();
    const scrubMats = ['#82958a', '#6d8179'].map((color) => {
      const m = new THREE.MeshStandardMaterial({
        map: scrubTex.clone(), alphaTest: .42, side: THREE.DoubleSide, roughness: 1, color,
      });
      patchSway(m, { strength: .055, freq: 2.0, yScale: .75 }); // Fase 31 — mato vivo
      (scene.userData.swayMats ??= []).push(m);
      return m;
    });
    const scrubDummy = new THREE.Object3D();
    const scrubMeshes = scrubMats.map((mat) => new THREE.InstancedMesh(scrubGeo, mat, SCRUB));
    // F39 — sombras do scrub saem do lote ESTÁTICO (shadowSpots) e ganham o
    // próprio campo em BANDAS DE DISTÂNCIA: cheio perto, raleio suave, zero
    // no horizonte (o disco a 200 m era moiré — agora morre antes do fog).
    const scrubShadowSpots = [];
    let si = 0; guard = 0;
    while (si < SCRUB && guard++ < SCRUB * 14) {
      const x = (rng.next() - .5) * 392, z = (rng.next() - .5) * 392;
      if (!free(x, z, 1.8) || !districtClear(x, z, 4)) continue;
      const s = .55 + rng.next() * .8;
      scrubShadowSpots.push({
        x, z, rot: 0, size: 1.05 * s,
        // ancoragem no RELEVO (contrato F37 do capim): lift 12mm embutido —
        // no plano jogável o terreno é 0; na margem o disco acompanha.
        y: terrainHeightAt(x, z, scenario.id) + .012,
      });
      scrubDummy.position.set(x, .68 * s, z);
      scrubDummy.scale.set(s, s, s);
      scrubDummy.rotation.set(0, rng.next() * Math.PI * 2, (rng.next() - .5) * .12);
      scrubDummy.updateMatrix(); scrubMeshes[0].setMatrixAt(si, scrubDummy.matrix);
      scrubDummy.rotation.y += Math.PI / 2;
      scrubDummy.updateMatrix(); scrubMeshes[1].setMatrixAt(si, scrubDummy.matrix);
      si++;
    }
    scrubMeshes.forEach((mesh) => { mesh.count = si; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); });
    if (q.contactShadows && scrubShadowSpots.length) {
      // F39 — banda canônica 30→90m: dentro do full do capim (28m) a âncora
      // é plena; o raleio termina a 90m, ANTES do fim da banda de impostores
      // (110m) — a sombra nunca sobrevive à vegetação que ela ancora.
      scene.userData.scrubBandShadows = buildBandContactShadows(scene, scrubShadowSpots, {
        opacity: .55, nearDist: 30, farDist: 90,
      });
      scene.userData.scrubShadowEntries = scrubShadowSpots.length;   // inspeção/teste
    }
  }

  // ---- pedras ----
  const ROCKS = Math.max(6, Math.round(30 * q.rockFactor));
  const rockGeo = new THREE.DodecahedronGeometry(.9, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: .92, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.castShadow = rocks.receiveShadow = true;
  const rockDummy = new THREE.Object3D();
  let ri = 0; guard = 0;
  while (ri < ROCKS && guard++ < 400) {
    const x = (rng.next() - .5) * 390, z = (rng.next() - .5) * 390;
    if (!free(x, z, 3) || !districtClear(x, z, 2)) continue;
    const rs = .5 + rng.next() * .9;
    shadowSpots.push({ x, z, size: 1.5 * rs });
    rockDummy.position.set(x, .25 + rng.next() * .2, z);
    rockDummy.scale.set(rs, .35 + rng.next() * .5, .5 + rng.next() * .9);
    rockDummy.rotation.set(rng.next() * .4, rng.next() * Math.PI * 2, rng.next() * .4);
    rockDummy.updateMatrix();
    rocks.setMatrixAt(ri++, rockDummy.matrix);
  }
  rocks.count = ri;
  scene.add(rocks);

  // Fase 7 — sombras de contato sob árvores/pedras/scrub; F38 — + arbustos
  // (ancoragem no relevo do chão: y=0 na zona plana do jogo, stagger anti-z-fight)
  if (q.contactShadows && shadowSpots.length) {
    const natureShadows = buildContactShadows(scene, shadowSpots);
    scene.userData.natureContactShadows = natureShadows;        // F38 — inspeção/teste
    scene.userData.natureShadowEntries = shadowSpots.length;    // F38 — registro do total
  }

  // ---- nuvens de crepúsculo ----
  const cloudTex = cloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, opacity: .85,
    color: '#d8b8a8',
  });
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < q.cloudCount; i++) {
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
export function buildScene(seed, scenarioId = 'CIGKV', renderer = null, quality = 'high') {
  const scenario = resolveScenario(scenarioId);
  const q = qualityTier(quality);
  const layout = getWorldLayout(seed, scenario.id);
  const scene = new THREE.Scene();
  // FIX "mundo vermelho" (parte 2): density 0.0035 deixava o solo a 200-400 m
  // com 39-86% do fogColor quente durante a QUEDA LIVRE — o mapa inteiro
  // ficava vermelho do alto. 0.0026 mantém a leitura de profundidade no chão
  // (30 m ≈ 0.6%) e devolve a visibilidade do mapa no paraquedas.
  scene.fog = new THREE.FogExp2(new THREE.Color(scenario.fogColor), scenario.id === 'Barburhen' ? 0.0036 : 0.0026);
  scene.userData.scenarioId = scenario.id;
  scene.userData.mapLabel = scenario.mapLabel;

  scene.add(createSky(scenario));

  // Fase 7 — luz recalibrada: sol menos saturado, fill mais suave (contraste
  // cinematográfico sem lavar as sombras); hemisfério amarra o chão ao céu.
  const isBarburhen = scenario.id === 'Barburhen';
  const sun = new THREE.DirectionalLight(isBarburhen ? '#f0c7a2' : '#ffc98f', isBarburhen ? 2.05 : 2.35);
  sun.position.set(-160, 60, -240);
  sun.castShadow = true;
  sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
  const S = 150;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(isBarburhen ? '#c5d5dc' : '#8f74b4', isBarburhen ? '#4e5a61' : '#4a3d2e', isBarburhen ? 1.04 : 1.18);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(isBarburhen ? '#7898b6' : '#6a5aa0', isBarburhen ? 0.5 : 0.72);
  fill.position.set(140, 80, 180);
  scene.add(fill);
  const back = new THREE.DirectionalLight(isBarburhen ? '#b98263' : '#a8885e', isBarburhen ? 0.42 : 0.55);
  back.position.set(60, 50, 240);
  scene.add(back);

  // ---- terreno (Fase 23: relevo por elevação FORA da área jogável; plano
  // jogável permanece y=0 exato — entidades/sombras/loot intactos) ----
  const ground = buildTerrain(scenario);
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

  // Fase 4/6/7 — natureza, cordilheira e props (com tier de qualidade)
  buildNature(scene, layout, new SeededRng(`${seed}:nature`), q, scenario);
  buildMountains(scene, scenario);
  buildProps(scene, layout, q);
  // Fase 22 — cenários vivos: kits por distrito DENTRO da arena (zero colliders)
  buildDistrictDressing(scene, layout, scenario, q, {
    contactShadows: (entries) => buildContactShadows(scene, entries),
  });
  // Fase 8/16 — tráfego urbano estático (silhueta automotiva real)
  buildTraffic(scene, layout, q);
  // Fase 16 (P1) — marcos de mundo: identidade visual de cada cenário no horizonte
  buildWorldMarks(scene, layout, scenario);

  // Fase 23 — interiores reais: cascas com porta/mobília substituem a caixa
  // sólida das estruturas-habitação (colliders do layout intactos)
  const interiors = buildInteriors(scene, layout, scenario, q);

  for (const s of layout.structures) {
    const shellSpec = interiors.shells.get(s);
    if (shellSpec) {
      // Fase 23 — casca habitável no lugar da caixa (mesma transform; o sim
      // continua tratando a estrutura como sólida, exatamente como antes)
      const host = buildShellHost(s, shellSpec, interiors.mats);
      interiors.group.add(host);
      // Fase 25 — folha de porta registrada p/ o animator (abrir/fechar/quebrar)
      if (host.userData.doorHandle) interiors.doors.set(host.userData.doorHandle.id, host.userData.doorHandle);
      // Fase 26 — painéis de vidro registrados p/ o visual de estilhaço
      for (const gp of host.userData.glassPanels ?? []) if (gp.id) interiors.glass.set(gp.id, gp.mesh);
    } else {
      const mat = s.kind === 'container' ? containerMats[s.variant % 4] : (mats[s.kind] ?? mats.wall);
      const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.yMin + s.h / 2, s.z);
      mesh.rotation.y = s.rot ?? 0;
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    if (s.h >= 6 && s.kind !== 'monolith' && !shellSpec) { // Fase 23 — cascas têm teto próprio
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
  // Fase 23 — shells recebem o Set p/ pular porta pintada (agora é vão real)
  buildFacades(scene, layout, interiors.shells);

  // Fase 24 — raios de luz pelas janelas (poça no piso, respiração suave;
  // 2 draw calls, gate por tier via q.lightFactor)
  buildLightShafts(scene, layout, scenario, interiors, q);

  // ---- grama em TUFOS com LOD de distância (Fase 31/32): 3 lâminas curvadas
  // por tufo, plantio em clumps (moitas) e vento por shader — mata de
  // produção. Fase 32: o campo é dividido em CHUNKS de 25m com 3 tiers pela
  // distância da câmera — full (<28m), sparse (28-58m, fração .4) e hidden
  // (>=58m, render 0). O plantio gera spots; buildGrassFieldLOD monta tudo.
  const bladeTex = grassBladeTexture();
  const GRASS = Math.max(240, Math.round(2300 * q.grassFactor));
  const seedRng = { s: 12345, next() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; } };
  const grassSpots = []; // {x,z,y,rot,s,sy,tintJitter} — clumps de 6-14 tufos
  let placed = 0, clumps = 0;
  while (placed < GRASS && clumps++ < GRASS * 2) {
    const cx = (seedRng.next() - .5) * 400, cz = (seedRng.next() - .5) * 400;
    const inField = seedRng.next() < .82;
    const n = 6 + Math.floor(seedRng.next() * 9);
    for (let k = 0; k < n && placed < GRASS; k++) {
      const rad = seedRng.next() * (inField ? 2.6 : 7.5);
      const a = seedRng.next() * Math.PI * 2;
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      let ok = true;
      for (const c of layout.colliders) {
        if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) { ok = false; break; }
      }
      if (!ok) continue;
      const rot = seedRng.next() * Math.PI;
      const vr = seedRng.next();
      const s = .7 + vr * .75;
      // Fase 23 — grama acompanha o relevo (só muda além da área jogável)
      grassSpots.push({
        x, z, y: .04 + terrainHeightAt(x, z, scenario.id),
        rot, s, sy: .85 + vr * .4, tintJitter: vr,
      });
      placed++;
    }
  }
  const grassTints = GRASS_TINTS[scenario.id] ?? GRASS_TINTS.CIGKV;
  const grassLOD = buildGrassFieldLOD({
    spots: grassSpots, seed: 77, texture: bladeTex, tintFamilies: grassTints,
    chunkSize: 25, nearDist: 28, midDist: 58, sparseKeep: .4,
    // Fase 34 — faixa de IMPOSTORES entre sparse e hidden: cada chunk a 58-110m
    // vira 1 quad cruzado (mancha de capim no horizonte por ~2 triângulos);
    // além de 110m render 0. Fase 37 — FADE SUAVE por instância nas duas
    // bordas da banda (nasce do desbaste em 58m, dissolve no bake outdoor em
    // 110m) + SOMBRA DE CONTATO FALSA ancorada no relevo (disco radial na
    // média dos tufos do chunk, lift anti-z-fight). Leitura contínua:
    // tufos → desbaste → mancha com sombra → campo eterno até o fog.
    impostorDist: 110, impostorHeight: 1.15, impostorWidth: 3.2, impostorOpacity: .55,
    impostorFadeZone: 14, impostorShadowOpacity: .5, impostorShadowRadius: 1.9,
    // Fase 38 — desbaste GRADUAL do sparse (zonas canônicas 10/12) + pre-roll
    // de 9m do impostor: a mancha nasce DENTRO da saída do desbaste (49→58m)
    // e chega a ~70% de alpha quando os últimos tufos somem — cross-fade sem
    // buraco de densidade na fronteira 58m.
    sparseEntryZone: 10, sparseExitZone: 12, impostorPreRoll: 9,
    // vento na grama: amplitude maior, frequência alta — capim vivo ao vento
    sway: { strength: .07, freq: 2.1, yScale: 1.1 },
  });
  scene.add(grassLOD.group);
  (scene.userData.swayMats ??= []).push(...grassLOD.mats, ...grassLOD.impostorMats); // Fase 34 — impostor balança
  scene.userData.grassLOD = grassLOD; // main3d chama update(camX, camZ) 1×/frame

  // F36 — OUTDOOR IMPOSTOR: além da faixa de impostores (≥110m) o chunk segue
  // INVISÍVEL (render 0), mas a identidade do capim é cozida nas vertex colors
  // do terreno UMA vez aqui — o horizonte lê "campo" com custo ZERO por frame
  // (0 draw calls, 0 matrizes; o chão em si é o impostor).
  const terrainMesh = scene.getObjectByName('terrain');
  const outdoorBake = grassOutdoorBake(grassLOD.chunks, grassTints);
  if (terrainMesh) applyOutdoorTint(terrainMesh, outdoorBake, { radius: 25, strength: .3 });
  scene.userData.grassOutdoorBake = { chunks: outdoorBake.length, radius: 25, strength: .3 };

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
  scene.userData.quality = quality;
  // Fase 8 — base do ciclo dia/noite dirigido pelos pulsos do Ring
  const skyMesh = scene.children.find((c) => c.isMesh && c.material?.uniforms?.night);
  scene.userData.nightBase = {
    sky: { ...scenario.sky },
    fogColor: scenario.fogColor,
    sunColor: isBarburhen ? '#f0c7a2' : '#ffc98f',
    sunIntensity: isBarburhen ? 2.05 : 2.35,
    hemiIntensity: isBarburhen ? 1.04 : 1.18,
    fillIntensity: isBarburhen ? 0.5 : 0.72,
    backIntensity: isBarburhen ? 0.42 : 0.55,
    buildingMat: mats.building ?? null,
    buildingEmissive: 0.55,
  };
  scene.userData.nightUniforms = skyMesh?.material.uniforms ?? null;
  scene.userData.nightLights = { sun, hemi, fill, back };
  scene.userData.nightT = -1; // força 1ª aplicação
  return { scene, layout, sun, materials: mats, quality: q };
}

// Fase 8 — aplica o nightness t ∈ [0,1] na cena (céu, fog, luzes, janelas).
// Idempotente e barato: re-aplica apenas quando t muda de fato (> 0,001).
export function applyNightness(scene, t) {
  const base = scene.userData?.nightBase;
  if (!base) return;
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  if (Math.abs((scene.userData.nightT ?? -1) - k) < 0.001) return;
  scene.userData.nightT = k;
  const st = nightSceneState(base, k);
  const u = scene.userData.nightUniforms;
  if (u) {
    u.night.value = k;
    u.top.value.set(st.skyTop);
    u.mid.value.set(st.skyMid);
    u.horizon.value.set(st.skyHorizon);
  }
  if (scene.fog) scene.fog.color.set(st.fog);
  // FIX "mundo vermelho": o domo usa o fogColor abaixo do horizonte — acompanha
  // a cor do fog em cada pulso (noite → 'below' fica bem escuro no shader).
  if (u?.fogColor) u.fogColor.value.set(st.fog);
  const { sun, hemi, fill, back } = scene.userData.nightLights ?? {};
  sun?.color.set(st.sunColor); if (sun) sun.intensity = st.sunIntensity;
  if (hemi) hemi.intensity = st.hemiIntensity;
  if (fill) fill.intensity = st.fillIntensity;
  if (back) back.intensity = st.backIntensity;
  // janelas dos prédios brilham mais quando escurece
  if (base.buildingMat) base.buildingMat.emissiveIntensity = base.buildingEmissive + k * 0.5;
}
