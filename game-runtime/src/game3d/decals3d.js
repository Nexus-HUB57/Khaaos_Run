// Khaaos Run — Fase 20: decals de morte direcional (backlog LOD/decals).
// ==========================================================================
// Marca de sangue no chão ORIENTADA pela direção da queda: a Fase 12 fornece o
// ângulo do tiro no espaço LOCAL do modelo (0 = frente, +π/2 = lado +x, π =
// costas) e o corpo cai LONGE do atirador — este módulo converte ângulo local
// + yaw do ator na direção MUNDIAL da queda e orienta a poça/riscos/gotículas
// nesse eixo, ancoradas no chão onde o corpo assentou.
//
// Filosofia do pool de partículas (Fase 17) aplicada a decals:
//   - 100% procedural: UMA geometria mesclada por decal (fan da poça + riscos
//     + gotículas), SEM textura/canvas — testável headless;
//   - LOD por drawRange: a geometria é particionada [poça | detalhes] e o
//     nível de detalhe alterna geometry.setDrawRange (zero swap de geometria,
//     1 draw call por decal);
//   - determinístico: hash do seed do ator (mesma família do deathFall) —
//     nenhum Math.random interno;
//   - orçamento constante: pool fixo em ring buffer — spawn acima da
//     capacidade recicla o decal mais antigo; fade de vida (soak-in rápido,
//     hold longo, fade-out) e LOD por distância com HISTERESE (full → simple
//     → hidden) por decal, rebaixando/cullando pelo tier de qualidade.
import * as THREE from 'three';

// Limiares por tier (metros) + orçamento de decals simultâneos + vida (s).
// low simplifica mais perto, culla antes e retém menos — mobile.
export const DECAL_LOD_TIERS = {
  low: { full: 14, simple: 40, cull: 110, capacity: 12, life: 20 },
  medium: { full: 22, simple: 60, cull: 160, capacity: 18, life: 24 },
  high: { full: 30, simple: 85, cull: 220, capacity: 24, life: 28 },
};

export function decalThresholds(tier = 'high') {
  return DECAL_LOD_TIERS[tier] ?? DECAL_LOD_TIERS.high;
}

// margem de histerese: voltar ao nível melhor exige aproximar 15% além do
// limiar (mesma convenção do LOD de personagens — lod3d.js)
const HYST = .15;

// decisão pura: 'full' | 'simple' | 'hidden'. `current` habilita a histerese;
// primeira chamada pode omitir.
export function decalLODDecision(dist, current = 'full', th = DECAL_LOD_TIERS.high) {
  if (current === 'hidden') {
    if (dist >= th.cull * (1 - HYST)) return 'hidden';
    return dist < th.simple ? 'full' : 'simple';
  }
  if (current === 'simple') {
    if (dist > th.cull) return 'hidden';
    if (dist < th.full * (1 - HYST)) return 'full';
    return 'simple';
  }
  if (dist >= th.cull) return 'hidden';
  if (dist >= th.simple) return 'simple';
  return 'full';
}

// ---------- direção mundial da queda (puro) ----------
// deathFall (Fase 12): rotX positivo = tomba de costas (+z local), rotZ
// positivo = tomba p/ −x local. Logo a direção LOCAL de queda é
// (−sin(angle), +cos(angle)) em (x, z). O root do modelo usa
// rotation.y = yaw + π (main3d.syncEntities), e a rotação R_y(θ) leva
// (lx, lz) → (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ).
export function fallDirectionWorld({ angle = 0, yaw = 0 } = {}) {
  const a = Number.isFinite(angle) ? angle : 0;
  const y = Number.isFinite(yaw) ? yaw : 0;
  const lx = -Math.sin(a), lz = Math.cos(a);
  const th = y + Math.PI;
  const cos = Math.cos(th), sin = Math.sin(th);
  return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos };
}

// yaw mundial do decal: grupo com rotation.y = φ leva o +z local para
// (sinφ, cosφ) — φ = atan2(dx, dz) alinha o +z do decal com a queda.
export function decalYawWorld({ angle = 0, yaw = 0 } = {}) {
  const { x, z } = fallDirectionWorld({ angle, yaw });
  return Math.atan2(x, z);
}

// ---------- plano determinístico do decal ----------
// hash determinístico (mesma família do deathFall em entities3d.js)
function hash(seed, k) {
  const h = Math.sin(seed * 127.1 + k * 311.7 + 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Plano do decal em espaço LOCAL (+z = direção da queda). Tudo derivado do
 * seed do ator + power do tiro — mesmo seed ⇒ mesmo plano (bit a bit).
 * power 0..1: 0 = poça mínima sem riscos; 1 = poça larga + riscos longos.
 */
export function decalPlan({ angle = 0, yaw = 0, power = 1, seed = 0 } = {}) {
  const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 1));
  const s = Number.isFinite(seed) ? seed : 0;
  const dir = fallDirectionWorld({ angle, yaw });
  const yawWorld = decalYawWorld({ angle, yaw });

  const poolR = .5 + .45 * p;            // raio da poça (m)
  const poolStretch = 1.2 + .35 * p;     // alongamento na direção da queda
  const poolOffset = .18 + .34 * p;      // centro deslocado p/ onde o corpo assentou

  const streaks = [];
  if (p >= .25) {
    const n = 2 + Math.round(hash(s, 1));                     // 2–3 riscos
    for (let i = 0; i < n; i++) {
      streaks.push({
        off: (hash(s, 2 + i * 3) * 2 - 1) * poolR * .55,      // desvio lateral
        len: poolR * (1.1 + 1.1 * p) * (.75 + .5 * hash(s, 3 + i * 3)),
        w: .07 + .09 * hash(s, 4 + i * 3),
        alpha: .3 + .35 * hash(s, 5 + i * 3),
      });
    }
  }

  const droplets = [];
  const nd = 2 + Math.round(hash(s, 11) * 2);                 // 2–4 gotículas
  for (let i = 0; i < nd; i++) {
    const dist = poolR * (1.3 + 1.6 * hash(s, 12 + i * 2)) * (.6 + .6 * p);
    const lat = (hash(s, 13 + i * 2) * 2 - 1) * poolR * 1.4;
    droplets.push({
      x: lat, z: poolOffset + dist,
      r: .035 + .05 * hash(s, 14 + i),
      alpha: .4 + .4 * hash(s, 15 + i),
    });
  }

  return {
    yawWorld, dx: dir.x, dz: dir.z, power: p,
    poolR, poolStretch, poolOffset, streaks, droplets,
    tint: hash(s, 21),                    // variação sutil de cor do sangue
    opacity: .74 + .16 * hash(s, 22),
  };
}

// sangue: vermelho escuro com variação sutil por decal (tint 0..1)
export function decalColor(tint = .5) {
  const t = Math.max(0, Math.min(1, Number.isFinite(tint) ? tint : .5));
  return { r: .30 + .07 * t, g: .035 + .025 * t, b: .045 + .02 * t };
}

// ---------- geometria mesclada (poça + riscos + gotículas) ----------
// Triângulos diretos no plano XZ (y = 0). Partição do drawRange:
//   [0, simpleVerts) = poça (LOD simple — 12 tris)
//   [0, fullVerts)   = poça + riscos + gotículas (LOD full)
export const POOL_SEGS = 12;
export const POOL_VERTS = POOL_SEGS * 3;      // fan de 12 triângulos
export const DROPLET_SEGS = 6;
export const DROPLET_VERTS = DROPLET_SEGS * 3;

export function buildDecalGeometry(plan) {
  const pos = [];
  const push = (x, z) => pos.push(x, 0, z);

  // poça: elipse alongada na direção da queda (+z local), centro deslocado
  const cz = plan.poolOffset;
  for (let i = 0; i < POOL_SEGS; i++) {
    const a0 = (i / POOL_SEGS) * Math.PI * 2;
    const a1 = ((i + 1) / POOL_SEGS) * Math.PI * 2;
    push(0, cz);
    push(Math.cos(a0) * plan.poolR, cz + Math.sin(a0) * plan.poolR * plan.poolStretch);
    push(Math.cos(a1) * plan.poolR, cz + Math.sin(a1) * plan.poolR * plan.poolStretch);
  }
  const simpleVerts = pos.length / 3;

  // riscos: quads ao longo do +z a partir da borda da poça
  for (const st of plan.streaks) {
    const z0 = plan.poolOffset + plan.poolR * .35;
    const z1 = z0 + st.len;
    push(st.off - st.w / 2, z0); push(st.off - st.w / 2, z1); push(st.off + st.w / 2, z1);
    push(st.off - st.w / 2, z0); push(st.off + st.w / 2, z1); push(st.off + st.w / 2, z0);
  }

  // gotículas: mini-fans além dos riscos
  for (const d of plan.droplets) {
    for (let i = 0; i < DROPLET_SEGS; i++) {
      const a0 = (i / DROPLET_SEGS) * Math.PI * 2;
      const a1 = ((i + 1) / DROPLET_SEGS) * Math.PI * 2;
      push(d.x, d.z);
      push(d.x + Math.cos(a0) * d.r, d.z + Math.sin(a0) * d.r);
      push(d.x + Math.cos(a1) * d.r, d.z + Math.sin(a1) * d.r);
    }
  }
  const fullVerts = pos.length / 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return { geometry, simpleVerts, fullVerts };
}

// ---------- sistema (pool em ring buffer, 1 mesh por decal) ----------
const EPS = .045;    // acima da sombra de contato (+.02), abaixo do corpo
const LAYER = .006;  // camadas anti z-fight entre decals sobrepostos

export class DeathDecalSystem {
  constructor(scene, { capacity = null, tier = 'high', life = null, name = 'deathDecals' } = {}) {
    const th = decalThresholds(tier);
    this.scene = scene;
    this.name = name;
    this.th = th;
    this.capacity = Math.max(1, capacity ?? th.capacity);
    this.life = Math.max(1, life ?? th.life);
    this.slots = [];
    this.cursor = 0;
    this.live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.visible = false;
      mesh.renderOrder = 2;              // sombra de contato = 1, partículas = 6
      scene.add(mesh);
      this.slots.push({
        mesh, material, alive: false, age: 0, level: 'full',
        baseOpacity: .85, simpleVerts: 0, fullVerts: 0, plan: null,
      });
    }
  }

  /**
   * Registra um decal de morte. Recicla o slot mais antigo quando cheio.
   * `angle` é o ângulo LOCAL do tiro (Fase 12), `yaw` o yaw do ator no
   * snapshot — a orientação mundial é derivada aqui.
   * @returns {number} índice do slot escrito
   */
  spawn({ x = 0, y = 0, z = 0, angle = 0, yaw = 0, power = 1, seed = 0 } = {}) {
    const i = this.cursor;
    const s = this.slots[i];
    const replacing = s.alive;
    const plan = decalPlan({ angle, yaw, power, seed });
    s.mesh.geometry.dispose();
    const { geometry, simpleVerts, fullVerts } = buildDecalGeometry(plan);
    s.mesh.geometry = geometry;
    s.plan = plan;
    s.simpleVerts = simpleVerts;
    s.fullVerts = fullVerts;
    s.age = 0;
    s.alive = true;
    s.level = 'full';
    s.baseOpacity = plan.opacity;
    const c = decalColor(plan.tint);
    s.material.color.setRGB(c.r, c.g, c.b);
    s.mesh.position.set(x, y + EPS + (i % 6) * LAYER, z);
    s.mesh.rotation.y = plan.yawWorld;
    s.mesh.geometry.setDrawRange(0, fullVerts);
    s.mesh.visible = true;
    if (!replacing) this.live++;
    this.cursor = (this.cursor + 1) % this.capacity;
    return i;
  }

  /** Envelhece, aplica fade de vida e resolve o LOD pela distância à câmera. */
  update(dt, camPos = { x: 0, y: 0, z: 0 }) {
    if (dt > 0) {
      for (const s of this.slots) {
        if (!s.alive) continue;
        s.age += dt;
        if (s.age >= this.life) this.#kill(s);
      }
    }
    for (const s of this.slots) {
      if (!s.alive) continue;
      const m = s.mesh;
      const d = Math.hypot(m.position.x - camPos.x, m.position.y - camPos.y, m.position.z - camPos.z);
      s.level = decalLODDecision(d, s.level, this.th);
      if (s.level === 'hidden') { m.visible = false; continue; }
      m.visible = true;
      m.geometry.setDrawRange(0, s.level === 'full' ? s.fullVerts : s.simpleVerts);
      const k = s.age / this.life;
      // envelope: soak-in 8% da vida, hold, fade-out nos 15% finais
      const env = k < .08 ? k / .08 : (k > .85 ? Math.max(0, 1 - (k - .85) / .15) : 1);
      s.material.opacity = s.baseOpacity * env;
    }
  }

  #kill(s) {
    s.alive = false;
    s.mesh.visible = false;
    s.material.opacity = 0;
    this.live--;
  }

  get activeCount() { return this.live; }

  /** Snapshot p/ testes: decals vivos com estado de LOD/fade. */
  snapshot() {
    const out = [];
    for (const s of this.slots) {
      if (!s.alive) continue;
      out.push({
        x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z,
        yawWorld: s.mesh.rotation.y, age: s.age, level: s.level,
        opacity: s.material.opacity, poolR: s.plan.poolR, power: s.plan.power,
        simpleVerts: s.simpleVerts, fullVerts: s.fullVerts,
      });
    }
    return out;
  }

  clear() {
    for (const s of this.slots) if (s.alive) this.#kill(s);
  }

  dispose() {
    for (const s of this.slots) {
      s.mesh.geometry.dispose();
      s.material.dispose();
      this.scene.remove(s.mesh);
    }
    this.slots.length = 0;
    this.live = 0;
    this.cursor = 0;
  }
}
