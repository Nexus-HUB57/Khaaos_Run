// Khaaos Run — IA de comportamento animal (fauna + caça gameplay)
// =============================================================================
// FSM + steering. Usado pelo CLIENT (fauna3d meshes) e pela SIM (gameAnimals).
// Zero THREE.js — puro, determinístico o bastante, headless-safe.
//
// P0: brains ↔ gameAnimals, group flee, LOD por distância, predador→fear/dano
// P1: attractors, dispersion burst, micro-boids leaders, swarm centroid

export const SPECIES_AI = Object.freeze({
  rat: Object.freeze({
    baseSpeed: 2.4, fleeSpeed: 4.2, fearRadius: 14, homePull: 0.35,
    idleMin: 0.6, idleMax: 2.2, states: ['idle', 'wander', 'flee'],
    boldness: 0.15, huntable: true, groupFlee: true,
  }),
  crab: Object.freeze({
    baseSpeed: 1.2, fleeSpeed: 2.6, fearRadius: 11, homePull: 0.4,
    idleMin: 0.4, idleMax: 1.6, states: ['idle', 'wander', 'flee'],
    boldness: 0.08, sideways: true, huntable: true, groupFlee: true,
  }),
  scorpion: Object.freeze({
    baseSpeed: 0.7, fleeSpeed: 1.5, fearRadius: 9, homePull: 0.45,
    idleMin: 0.9, idleMax: 2.8, states: ['idle', 'wander', 'flee', 'investigate'],
    boldness: 0.35, huntable: true, groupFlee: true,
  }),
  croc: Object.freeze({
    baseSpeed: 0.85, fleeSpeed: 1.1, huntSpeed: 1.9, fearRadius: 0,
    huntRadius: 22, homePull: 0.2, idleMin: 1.5, idleMax: 4,
    states: ['wander', 'hunt', 'surface'], boldness: 0.7, aquatic: true,
    huntable: true, predator: true, predatorDamage: 4, predatorFear: 0.55,
  }),
  shark: Object.freeze({
    baseSpeed: 1.4, fleeSpeed: 1.2, huntSpeed: 2.8, fearRadius: 0,
    huntRadius: 40, homePull: 0.05, idleMin: 0, idleMax: 0,
    states: ['wander', 'hunt', 'surface'], boldness: 0.85, aquatic: true,
    ringPatrol: true, huntable: false, predator: true,
    predatorDamage: 0, predatorFear: 0.35,
  }),
  seagull: Object.freeze({
    baseSpeed: 0.18, fleeSpeed: 0.32, fearRadius: 18, homePull: 0.05,
    idleMin: 0, idleMax: 0, states: ['flock', 'flee'], boldness: 0.2,
    airborne: true, huntable: false,
  }),
  mosquito: Object.freeze({
    baseSpeed: 0.55, fleeSpeed: 1.1, fearRadius: 6, homePull: 0.25,
    idleMin: 0, idleMax: 0, states: ['swarm'], boldness: 0.5, airborne: true,
    huntable: false, swarm: true,
  }),
  fly: Object.freeze({
    baseSpeed: 0.7, fleeSpeed: 1.4, fearRadius: 5, homePull: 0.3,
    idleMin: 0, idleMax: 0, states: ['swarm'], boldness: 0.4, airborne: true,
    huntable: false, swarm: true,
  }),
  locust: Object.freeze({
    baseSpeed: 0.4, fleeSpeed: 1.0, fearRadius: 10, homePull: 0.3,
    idleMin: 0.2, idleMax: 0.8, states: ['swarm', 'wander'], boldness: 0.25,
    huntable: true, swarm: true, groupFlee: true,
  }),
});

/** Distância para AI completa (flee/hunt); além disso só wander barato. */
export const AI_LOD_FULL_RANGE = 55;
export const AI_LOD_MEDIUM_RANGE = 90;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function len2(x, z) { return Math.hypot(x, z); }
function norm(x, z) {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}
function n2(t, ax, az) {
  return Math.abs((Math.sin(t * 12.9898 + ax * 0.17) * 43758.5453) % 1);
}

export function createBrain(species, opts = {}) {
  const profile = SPECIES_AI[species] ?? SPECIES_AI.rat;
  const seed = opts.seed ?? 0;
  const brain = {
    id: opts.id ?? null,
    species,
    profile,
    state: profile.states.includes('wander') ? 'wander' : profile.states[0],
    x: opts.x ?? 0,
    z: opts.z ?? 0,
    homeX: opts.homeX ?? opts.x ?? 0,
    homeZ: opts.homeZ ?? opts.z ?? 0,
    homeR: opts.homeR ?? 20,
    yaw: opts.yaw ?? 0,
    yOffset: 0,
    dir: opts.dir ?? 1,
    tx: opts.x ?? 0,
    tz: opts.z ?? 0,
    wait: 0,
    stateT: 0,
    submerged: 0,
    nextDive: 8 + (seed % 7),
    angle: opts.angle ?? seed * 1.7,
    energy: 1,
    ringMin: opts.ringMin ?? 205,
    ringMax: opts.ringMax ?? 268,
    r: opts.r ?? (opts.ringMin != null ? (opts.ringMin + opts.ringMax) * 0.5 : 0),
    seed,
    speed: 0,
    alert: 0,
    alive: opts.alive !== false,
    // P1 dispersion burst
    dispersion: 0,
    // LOD
    lod: 'full',
    // group flee pulse
    groupAlert: 0,
    // swarm leaders (micro-boids) — preenchidos sob demanda
    leaders: null,
  };
  brain.step = (dt, t, ctx = {}) => stepBrain(brain, dt, t, ctx);
  return brain;
}

function pickWanderTarget(brain, t) {
  const a = n2(t + brain.seed, brain.homeX, brain.homeZ) * Math.PI * 2;
  const r = Math.sqrt(n2(t * 1.3 + brain.seed, brain.homeZ, brain.homeX)) * brain.homeR;
  brain.tx = brain.homeX + Math.cos(a) * r;
  brain.tz = brain.homeZ + Math.sin(a) * r;
}

function distToPlayer(brain, ctx) {
  if (ctx.playerX == null || ctx.playerZ == null) return Infinity;
  return Math.hypot(brain.x - ctx.playerX, brain.z - ctx.playerZ);
}

function enter(brain, state, t) {
  if (brain.state === state) return;
  brain.state = state;
  brain.stateT = 0;
  if (state === 'idle') {
    brain.wait = brain.profile.idleMin + n2(t, brain.x, brain.z) * (brain.profile.idleMax - brain.profile.idleMin);
  }
  if (state === 'wander') pickWanderTarget(brain, t);
}

/** Attractors no ctx: [{ x, z, strength, radius }] */
function attractorForce(brain, ctx) {
  let fx = 0, fz = 0;
  const list = ctx.attractors;
  if (!list || !list.length) return { x: 0, z: 0 };
  for (const a of list) {
    const dx = a.x - brain.x, dz = a.z - brain.z;
    const d = Math.hypot(dx, dz) || 1;
    const R = a.radius ?? 25;
    if (d > R) continue;
    const w = (a.strength ?? 1) * (1 - d / R);
    fx += (dx / d) * w;
    fz += (dz / d) * w;
  }
  return { x: fx, z: fz };
}

function stepBrain(brain, dt, t, ctx) {
  if (!brain.alive) {
    brain.speed = 0;
    brain.alert = 0;
    return brain;
  }
  const P = brain.profile;
  const agit = clamp(ctx.agitation ?? 0, 0, 1);
  const dPlayer = distToPlayer(brain, ctx);
  brain.stateT += dt;

  // LOD: far = only wander integration
  const camDist = ctx.camX != null
    ? Math.hypot(brain.x - ctx.camX, brain.z - (ctx.camZ ?? 0))
    : dPlayer;
  brain.lod = camDist > AI_LOD_MEDIUM_RANGE ? 'far'
    : camDist > AI_LOD_FULL_RANGE ? 'medium' : 'full';

  // group flee pulse decay
  if (brain.groupAlert > 0) brain.groupAlert = Math.max(0, brain.groupAlert - dt * 0.8);
  // dispersion burst decay
  if (brain.dispersion > 0) brain.dispersion = Math.max(0, brain.dispersion - dt * 1.2);

  if (brain.lod === 'far') {
    // cheap wander only
    if (brain.state !== 'wander' && brain.state !== 'swarm' && brain.state !== 'flock') {
      enter(brain, P.swarm ? 'swarm' : 'wander', t);
    }
  }

  const fearR = (P.fearRadius ?? 0) * (1 - agit * 0.25);
  const huntR = (P.huntRadius ?? 0) * (1 + agit * 0.35);

  // group flee: vizinho em pânico eleva alerta
  const effectiveFear = fearR * (1 + brain.groupAlert * 0.5);

  if (brain.lod !== 'far') {
    if (P.states.includes('flee') && (dPlayer < effectiveFear || brain.groupAlert > 0.4)) {
      if (P.states.includes('investigate') && dPlayer > effectiveFear * 0.55
          && brain.groupAlert < 0.3
          && n2(t, brain.seed, dPlayer) < P.boldness * (1 - agit * 0.5)) {
        enter(brain, 'investigate', t);
      } else {
        const was = brain.state;
        enter(brain, 'flee', t);
        // dispersion burst on first enter fear
        if (was !== 'flee' && dPlayer < fearR) brain.dispersion = 1;
      }
    } else if (P.states.includes('hunt') && dPlayer < huntR) {
      enter(brain, 'hunt', t);
    } else if (brain.state === 'flee' || brain.state === 'investigate' || brain.state === 'hunt') {
      if (dPlayer > (brain.state === 'hunt' ? huntR * 1.25 : effectiveFear * 1.4)
          && brain.groupAlert < 0.15) {
        enter(brain, P.states.includes('wander') ? 'wander' : P.states[0], t);
      }
    }
  }

  let vx = 0, vz = 0;
  const speedMul = 1 + agit * (brain.state === 'flee' || brain.state === 'hunt' ? 1.3 : 0.7);
  brain.alert = Math.max(brain.alert * 0.9, brain.groupAlert * 0.5);

  // predator contact pressure (reportado via ctx callback / flag)
  brain.predatorContact = 0;

  switch (brain.state) {
    case 'idle': {
      brain.wait -= dt;
      brain.speed = 0;
      if (brain.wait <= 0) enter(brain, 'wander', t);
      break;
    }
    case 'wander': {
      if (P.ringPatrol) {
        brain.angle += dt * P.baseSpeed * 0.08 * speedMul * brain.dir;
        brain.r += Math.sin(t * 0.13 + brain.seed) * dt * 1.1;
        brain.r = clamp(brain.r, brain.ringMin, brain.ringMax);
        brain.x = Math.cos(brain.angle) * brain.r;
        brain.z = Math.sin(brain.angle) * brain.r;
        brain.yaw = -brain.angle + (brain.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        brain.speed = P.baseSpeed * speedMul;
      } else {
        const dx = brain.tx - brain.x, dz = brain.tz - brain.z;
        const dist = len2(dx, dz);
        if (dist < 0.35) {
          enter(brain, P.idleMax > 0 ? 'idle' : 'wander', t);
          if (brain.state === 'wander') pickWanderTarget(brain, t);
        } else {
          const n = norm(dx, dz);
          const sp = P.baseSpeed * speedMul;
          vx = n.x * sp; vz = n.z * sp;
          brain.speed = sp;
        }
      }
      break;
    }
    case 'flee': {
      if (ctx.playerX != null) {
        const away = norm(brain.x - ctx.playerX, brain.z - ctx.playerZ);
        const sp = P.fleeSpeed * speedMul;
        vx = away.x * sp; vz = away.z * sp;
        brain.speed = sp;
        brain.alert = clamp(1 - dPlayer / (effectiveFear + 0.01), 0.4, 1);
        const hx = brain.homeX - brain.x, hz = brain.homeZ - brain.z;
        const hd = len2(hx, hz);
        if (hd > brain.homeR * 0.85) {
          const hn = norm(hx, hz);
          vx += hn.x * P.baseSpeed * P.homePull * 2;
          vz += hn.z * P.baseSpeed * P.homePull * 2;
        }
      }
      break;
    }
    case 'investigate': {
      if (ctx.playerX != null) {
        const toward = norm(ctx.playerX - brain.x, ctx.playerZ - brain.z);
        const sp = P.baseSpeed * 0.55 * speedMul;
        const desired = fearR * 0.45;
        if (dPlayer > desired + 1) { vx = toward.x * sp; vz = toward.z * sp; }
        else if (dPlayer < desired - 1) { vx = -toward.x * sp; vz = -toward.z * sp; }
        brain.speed = sp;
        brain.alert = 0.4;
      }
      break;
    }
    case 'hunt': {
      if (ctx.playerX != null) {
        const toward = norm(ctx.playerX - brain.x, ctx.playerZ - brain.z);
        const sp = (P.huntSpeed ?? P.baseSpeed * 1.6) * speedMul;
        vx = toward.x * sp; vz = toward.z * sp;
        brain.speed = sp;
        brain.alert = clamp(1 - dPlayer / (huntR + 0.01), 0, 1);
        // contato predador
        if (dPlayer < 2.2 && P.predator) {
          brain.predatorContact = 1;
        }
      }
      break;
    }
    case 'surface': {
      enter(brain, 'wander', t);
      break;
    }
    case 'flock': {
      // gaivotas: órbita + flee se perto
      if (dPlayer < fearR && ctx.playerX != null && brain.lod !== 'far') {
        const away = norm(brain.x - ctx.playerX, brain.z - ctx.playerZ);
        brain.x += away.x * P.fleeSpeed * speedMul * dt * 8;
        brain.z += away.z * P.fleeSpeed * speedMul * dt * 8;
        brain.alert = 0.7;
        brain.speed = P.fleeSpeed * speedMul;
      } else {
        brain.angle += dt * (P.baseSpeed + agit * 0.12) * brain.dir;
        brain.x = brain.homeX + Math.cos(brain.angle) * (brain.homeR || 12);
        brain.z = brain.homeZ + Math.sin(brain.angle) * (brain.homeR || 12);
        brain.yaw = brain.angle + (brain.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        brain.speed = P.baseSpeed * speedMul;
      }
      break;
    }
    case 'swarm': {
      const drift = P.baseSpeed * speedMul;
      vx = Math.sin(t * 0.55 + brain.seed) * drift;
      vz = Math.cos(t * 0.41 + brain.seed * 1.3) * drift;
      if (dPlayer < fearR && ctx.playerX != null) {
        const away = norm(brain.x - ctx.playerX, brain.z - ctx.playerZ);
        vx += away.x * P.fleeSpeed * 0.6;
        vz += away.z * P.fleeSpeed * 0.6;
        brain.alert = 0.6;
        if (brain.dispersion < 0.1) brain.dispersion = 1; // burst
      }
      // P1 attractors (poça, corpse)
      const att = attractorForce(brain, ctx);
      vx += att.x * P.baseSpeed * 0.8;
      vz += att.z * P.baseSpeed * 0.8;
      vx += (brain.homeX - brain.x) * P.homePull * 0.15;
      vz += (brain.homeZ - brain.z) * P.homePull * 0.15;
      brain.speed = len2(vx, vz);
      // micro-boids leaders (opcional)
      if (ctx.microBoids && brain.lod === 'full') {
        stepLeaders(brain, dt, t);
      }
      break;
    }
    default:
      enter(brain, 'wander', t);
  }

  if (!P.ringPatrol && brain.state !== 'flock') {
    brain.x += vx * dt;
    brain.z += vz * dt;
    if (Math.abs(vx) + Math.abs(vz) > 1e-4) {
      let yaw = Math.atan2(vx, vz);
      if (P.sideways) yaw += Math.PI / 2;
      let dy = yaw - brain.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      brain.yaw += dy * Math.min(1, dt * 8);
    }
    const hx = brain.x - brain.homeX, hz = brain.z - brain.homeZ;
    const hd = len2(hx, hz);
    if (hd > brain.homeR * 1.15) {
      const n = norm(hx, hz);
      brain.x = brain.homeX + n.x * brain.homeR;
      brain.z = brain.homeZ + n.z * brain.homeR;
    }
  }

  if (P.aquatic) {
    brain.nextDive -= dt;
    if (brain.nextDive <= 0) {
      brain.submerged = brain.submerged > 0 ? 0 : 2.4 + n2(t, brain.seed, 1) * 1.5;
      brain.nextDive = (10 + n2(t, brain.x, brain.z) * 12) / (1 + agit * 1.5);
    }
    if (brain.submerged > 0) brain.submerged -= dt;
    brain.yOffset = brain.submerged > 0 ? (P.ringPatrol ? -0.4 : -0.22) : (P.ringPatrol ? 0.12 : 0.05);
    if (P.ringPatrol) brain.yOffset += Math.sin(t * 0.4 + brain.seed) * 0.35;
  } else if (P.airborne) {
    brain.yOffset = 0;
  } else {
    brain.yOffset = brain.speed > 0.2 ? Math.abs(Math.sin(t * (10 + brain.speed))) * 0.03 : 0;
  }

  return brain;
}

/** 3–5 leaders com separation leve (espaço local do swarm). */
function stepLeaders(brain, dt, t) {
  if (!brain.leaders) {
    const n = 3 + (Math.floor(brain.seed) % 3);
    brain.leaders = Array.from({ length: n }, (_, i) => ({
      x: Math.cos(i * 2.1 + brain.seed) * 1.2,
      z: Math.sin(i * 2.1 + brain.seed) * 1.2,
      vx: 0, vz: 0,
      phase: i * 1.7,
    }));
  }
  const sepR = 0.85;
  for (let i = 0; i < brain.leaders.length; i++) {
    const L = brain.leaders[i];
    let sx = 0, sz = 0;
    for (let j = 0; j < brain.leaders.length; j++) {
      if (i === j) continue;
      const O = brain.leaders[j];
      const dx = L.x - O.x, dz = L.z - O.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d < sepR) {
        sx += (dx / d) * (sepR - d);
        sz += (dz / d) * (sepR - d);
      }
    }
    L.vx = Math.sin(t * 1.3 + L.phase) * 0.8 + sx * 2;
    L.vz = Math.cos(t * 1.1 + L.phase) * 0.8 + sz * 2;
    L.x = clamp(L.x + L.vx * dt, -2.5, 2.5);
    L.z = clamp(L.z + L.vz * dt, -2.5, 2.5);
  }
}

/**
 * Propaga group-flee: qualquer brain em `flee` com alert alto eleva vizinhos
 * da mesma espécie (ou groupFlee) dentro de radius.
 */
export function propagateGroupFlee(brains, radius = 16) {
  const sources = [];
  for (const b of brains) {
    if (!b.alive) continue;
    if (b.state === 'flee' && b.alert > 0.55 && b.profile.groupFlee) {
      sources.push(b);
    }
  }
  if (!sources.length) return;
  for (const b of brains) {
    if (!b.alive || !b.profile.groupFlee) continue;
    for (const s of sources) {
      if (s === b) continue;
      if (s.species !== b.species && s.species !== 'rat') continue;
      const d = Math.hypot(b.x - s.x, b.z - s.z);
      if (d < radius) {
        b.groupAlert = Math.max(b.groupAlert, s.alert * (1 - d / radius));
      }
    }
  }
}

export function createFaunaContext() {
  return {
    playerX: null, playerZ: null, agitation: 0,
    camX: null, camZ: null,
    attractors: [],
    microBoids: true,
  };
}

/** Snapshot serializável do brain p/ net / debug. */
export function brainSnapshot(brain) {
  return {
    id: brain.id, species: brain.species, state: brain.state,
    x: brain.x, z: brain.z, yaw: brain.yaw, alert: brain.alert,
    alive: brain.alive, lod: brain.lod, dispersion: brain.dispersion,
    predatorContact: brain.predatorContact || 0,
  };
}
