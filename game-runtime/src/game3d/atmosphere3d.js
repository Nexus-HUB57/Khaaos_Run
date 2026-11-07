// Khaaos Run — Fase 46: atmosfera procedural por mundo.
// VFX decorativo, determinístico e sem colisão: a simulação não depende dele.
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';

const PROFILES = Object.freeze({
  CIGKV: Object.freeze({ kind: 'ash', color: 0x9e91a2, count: 72, spread: 190, height: 34, drift: 1.8, fall: .8, size: .09 }),
  Barburhen: Object.freeze({ kind: 'acidRain', color: 0x9be86b, count: 180, spread: 185, height: 38, drift: 2.2, fall: 13, size: .035 }),
  Priadus: Object.freeze({ kind: 'spores', color: 0x91ffb6, count: 120, spread: 175, height: 24, drift: .75, fall: .35, size: .11 }),
  Ckesalth: Object.freeze({ kind: 'dust', color: 0xe2ae70, count: 135, spread: 190, height: 18, drift: 3.8, fall: .16, size: .08 }),
  Arukheea: Object.freeze({ kind: 'saltSpray', color: 0x8bd9e8, count: 110, spread: 198, height: 20, drift: 2.6, fall: .55, size: .07 }),
});

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));

function seedFor(id) {
  let h = 2166136261;
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pointGeometry(profile, seed, count) {
  const rng = new SeededRng(seed);
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: (rng.next() - .5) * profile.spread * 2,
      y: .3 + rng.next() * profile.height,
      z: (rng.next() - .5) * profile.spread * 2,
      phase: rng.next() * Math.PI * 2,
      speed: .72 + rng.next() * .56,
    });
  }
  return points;
}

function makeMaterial(profile, q) {
  const opacity = profile.kind === 'acidRain' ? .42 : profile.kind === 'dust' ? .24 : .36;
  return profile.kind === 'acidRain'
    ? new THREE.LineBasicMaterial({ color: profile.color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
    : new THREE.PointsMaterial({ color: profile.color, size: profile.size * (q.isMobile ? .8 : 1), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
}

/**
 * Add a decorative atmosphere layer. The returned registry follows the same
 * `{ id, kind, count, group, animators }` shape used by other world systems.
 */
export function buildAtmosphere(scene, scenario, q = {}) {
  if (scene.userData.atmosphere) return scene.userData.atmosphere;
  const id = scenario?.id ?? 'CIGKV';
  const base = PROFILES[id] ?? PROFILES.CIGKV;
  const factor = clamp01(q.atmosphereFactor ?? q.fxFactor ?? (q.isMobile ? .55 : 1));
  const count = Math.max(12, Math.round(base.count * factor));
  const points = pointGeometry(base, seedFor(id), count);
  const group = new THREE.Group();
  group.name = `atmosphere-${base.kind}`;
  group.userData.decorative = true;
  const hazardState = { active: false, kind: null, boost: 0, pulse: 0 };
  const material = makeMaterial(base, q);
  const positions = new Float32Array(base.kind === 'acidRain' ? count * 6 : count * 3);
  const geometry = new THREE.BufferGeometry();
  const mesh = base.kind === 'acidRain' ? new THREE.LineSegments(geometry, material) : new THREE.Points(geometry, material);
  mesh.name = base.kind;
  mesh.frustumCulled = false;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(mesh);
  scene.add(group);

  const update = (_dt, t = 0) => {
    const dt = Number.isFinite(_dt) && _dt > 0 ? Math.min(_dt, .25) : 0;
    if (hazardState.pulse > 0) hazardState.pulse = Math.max(0, hazardState.pulse - dt);
    if (base.kind === 'acidRain' && hazardState.pulse === 0 && hazardState.kind === 'acidRain') hazardState.active = false;
    const targetBoost = hazardState.active ? .9 : hazardState.pulse > 0 ? .7 : 0;
    hazardState.boost += (targetBoost - hazardState.boost) * Math.min(1, dt * 5);
    const attr = geometry.getAttribute('position');
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const phase = p.phase + t * p.speed;
      const x = p.x + Math.sin(phase * .7) * base.drift + t * base.drift * .08;
      const z = p.z + Math.cos(phase * .53) * base.drift * .4;
      const y = .25 + ((p.y - t * base.fall * (1 + hazardState.boost * .8) * p.speed) % base.height + base.height) % base.height;
      if (base.kind === 'acidRain') {
        const j = i * 6;
        attr.array[j] = x; attr.array[j + 1] = y; attr.array[j + 2] = z;
        attr.array[j + 3] = x + base.drift * .025; attr.array[j + 4] = y - 1.25; attr.array[j + 5] = z;
      } else {
        const j = i * 3;
        attr.array[j] = x; attr.array[j + 1] = y; attr.array[j + 2] = z;
      }
    }
    attr.needsUpdate = true;
    material.opacity = (base.kind === 'acidRain' ? .28 : .22)
      + (Math.sin(t * .7) * .5 + .5) * (base.kind === 'spores' ? .18 : .12)
      + hazardState.boost * .16;
  };
  const handleEvent = (event = {}) => {
    const type = event.type;
    const starts = { tsunamiStart: 'tsunami', sporeFogStart: 'spore', toxicSmokeStart: 'smoke', gravityAnomalyStart: 'gravity' };
    const ends = { tsunamiEnd: 'tsunami', sporeFogEnd: 'spore', toxicSmokeEnd: 'smoke', gravityAnomalyEnd: 'gravity' };
    const compatible = { ash: 'gravity', acidRain: 'acid', spores: 'spore', dust: 'smoke', saltSpray: 'tsunami' }[base.kind];
    if (starts[type] && starts[type] === compatible) { hazardState.kind = starts[type]; hazardState.active = true; return; }
    if (ends[type] && ends[type] === compatible && hazardState.kind === ends[type]) { hazardState.active = false; return; }
    if (type === 'acidRain' && base.kind === 'acidRain') {
      hazardState.kind = 'acidRain'; hazardState.active = true; hazardState.pulse = 2.2;
    }
  };
  update(0, 0);
  const registry = { id, kind: base.kind, count, group, mesh, material, placements: points, hazardState, handleEvent, animators: [update] };
  scene.userData.atmosphere = registry;
  return registry;
}

export { PROFILES as ATMOSPHERE_PROFILES };
