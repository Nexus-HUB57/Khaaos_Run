// Khaaos Run — IA de comportamento animal (fauna)
// =============================================================================
// Camada leve de AI para a fauna ambiental: máquinas de estado + steering.
// Não afeta gameplay (zero colliders / dano). Determinístico o suficiente para
// testes; reage a jogador (proximidade) e à pressão do anel (agitation).
//
// Estados canônicos:
//   idle        — parado / observação curta
//   wander      — vagância dentro do home radius
//   flee        — foge do jogador (presas: rato, caranguejo, escorpião…)
//   investigate — aproxima-se com cautela (curiosidade baixa)
//   hunt        — persegue / embosca (croc, tubarão)
//   surface     — sobe / mergulha (aquáticos)
//   flock       — órbita em banda (gaivotas)
//   swarm       — nuvem (mosquitos, moscas, gafanhotos)
//
// Uso:
//   const brain = createBrain(species, opts);
//   brain.step(dt, t, ctx); // ctx = { playerX, playerZ, agitation, groundY }
//   // brain.x / brain.z / brain.yaw / brain.yOffset / brain.state

/** Perfis de comportamento por espécie. */
export const SPECIES_AI = Object.freeze({
  rat: Object.freeze({
    baseSpeed: 2.4, fleeSpeed: 4.2, fearRadius: 14, homePull: 0.35,
    idleMin: 0.6, idleMax: 2.2, states: ['idle', 'wander', 'flee'],
    boldness: 0.15, // chance de investigar em vez de fugir
  }),
  crab: Object.freeze({
    baseSpeed: 1.2, fleeSpeed: 2.6, fearRadius: 11, homePull: 0.4,
    idleMin: 0.4, idleMax: 1.6, states: ['idle', 'wander', 'flee'],
    boldness: 0.08, sideways: true,
  }),
  scorpion: Object.freeze({
    baseSpeed: 0.7, fleeSpeed: 1.5, fearRadius: 9, homePull: 0.45,
    idleMin: 0.9, idleMax: 2.8, states: ['idle', 'wander', 'flee', 'investigate'],
    boldness: 0.35, // mais agressivo / curioso
  }),
  croc: Object.freeze({
    baseSpeed: 0.85, fleeSpeed: 1.1, huntSpeed: 1.9, fearRadius: 0,
    huntRadius: 22, homePull: 0.2, idleMin: 1.5, idleMax: 4,
    states: ['wander', 'hunt', 'surface'], boldness: 0.7, aquatic: true,
  }),
  shark: Object.freeze({
    baseSpeed: 1.4, fleeSpeed: 1.2, huntSpeed: 2.8, fearRadius: 0,
    huntRadius: 40, homePull: 0.05, idleMin: 0, idleMax: 0,
    states: ['wander', 'hunt', 'surface'], boldness: 0.85, aquatic: true, ringPatrol: true,
  }),
  seagull: Object.freeze({
    baseSpeed: 0.16, fleeSpeed: 0.28, fearRadius: 18, homePull: 0,
    idleMin: 0, idleMax: 0, states: ['flock'], boldness: 0.2, airborne: true,
  }),
  mosquito: Object.freeze({
    baseSpeed: 0.55, fleeSpeed: 1.1, fearRadius: 6, homePull: 0.25,
    idleMin: 0, idleMax: 0, states: ['swarm'], boldness: 0.5, airborne: true,
  }),
  fly: Object.freeze({
    baseSpeed: 0.7, fleeSpeed: 1.4, fearRadius: 5, homePull: 0.3,
    idleMin: 0, idleMax: 0, states: ['swarm'], boldness: 0.4, airborne: true,
  }),
  locust: Object.freeze({
    baseSpeed: 0.4, fleeSpeed: 1.0, fearRadius: 10, homePull: 0.3,
    idleMin: 0.2, idleMax: 0.8, states: ['swarm', 'wander'], boldness: 0.25,
  }),
});

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function len2(x, z) { return Math.hypot(x, z); }
function norm(x, z) {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

/**
 * Pseudo-ruído barato e estável (não precisa ser criptográfico).
 */
function n2(t, ax, az) {
  return Math.abs((Math.sin(t * 12.9898 + ax * 0.17) * 43758.5453) % 1);
}

/**
 * Cria um cérebro de AI para um indivíduo da espécie.
 * @param {string} species
 * @param {object} opts { x, z, homeX, homeZ, homeR, dir, seed, ringMin, ringMax }
 */
export function createBrain(species, opts = {}) {
  const profile = SPECIES_AI[species] ?? SPECIES_AI.rat;
  const seed = opts.seed ?? 0;
  const brain = {
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
    // interno
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
    r: opts.r ?? (opts.ringMin ? (opts.ringMin + opts.ringMax) * 0.5 : 0),
    seed,
    // saída p/ animação de mesh
    speed: 0,
    alert: 0, // 0..1 quão alerta está (foge/caça)
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

function stepBrain(brain, dt, t, ctx) {
  const P = brain.profile;
  const agit = clamp(ctx.agitation ?? 0, 0, 1);
  const dPlayer = distToPlayer(brain, ctx);
  brain.stateT += dt;
  brain.alert = 0;

  // ---- sensores → possíveis transições ----
  const fearR = P.fearRadius * (1 - agit * 0.25); // sob pressão foge de menos longe (mais caótico)
  const huntR = (P.huntRadius ?? 0) * (1 + agit * 0.35);

  if (P.states.includes('flee') && dPlayer < fearR) {
    // boldness: às vezes investiga em vez de fugir
    if (P.states.includes('investigate') && dPlayer > fearR * 0.55
        && n2(t, brain.seed, dPlayer) < P.boldness * (1 - agit * 0.5)) {
      enter(brain, 'investigate', t);
    } else {
      enter(brain, 'flee', t);
    }
  } else if (P.states.includes('hunt') && dPlayer < huntR) {
    enter(brain, 'hunt', t);
  } else if (brain.state === 'flee' || brain.state === 'investigate' || brain.state === 'hunt') {
    // saiu do raio → volta a vagar
    if (dPlayer > (brain.state === 'hunt' ? huntR * 1.25 : fearR * 1.4)) {
      enter(brain, P.states.includes('wander') ? 'wander' : P.states[0], t);
    }
  }

  // ---- execução do estado ----
  let vx = 0, vz = 0;
  const speedMul = 1 + agit * (brain.state === 'flee' || brain.state === 'hunt' ? 1.3 : 0.7);

  switch (brain.state) {
    case 'idle': {
      brain.wait -= dt;
      brain.speed = 0;
      if (brain.wait <= 0) enter(brain, 'wander', t);
      break;
    }
    case 'wander': {
      if (P.ringPatrol) {
        // tubarão: patrulha em anel
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
        brain.alert = clamp(1 - dPlayer / (fearR + 0.01), 0, 1);
        // home pull leve para não sair do distrito
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
        // mantém distância mínima ~ fearRadius * 0.4
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
      }
      break;
    }
    case 'surface': {
      // tratado no pós (yOffset); horizontalmente continua wander
      enter(brain, 'wander', t);
      break;
    }
    case 'flock': {
      brain.angle += dt * (P.baseSpeed + agit * 0.12) * brain.dir;
      brain.speed = P.baseSpeed * speedMul;
      break;
    }
    case 'swarm': {
      // lissajous drift + medo do jogador
      const drift = P.baseSpeed * speedMul;
      vx = Math.sin(t * 0.55 + brain.seed) * drift;
      vz = Math.cos(t * 0.41 + brain.seed * 1.3) * drift;
      if (dPlayer < fearR && ctx.playerX != null) {
        const away = norm(brain.x - ctx.playerX, brain.z - ctx.playerZ);
        vx += away.x * P.fleeSpeed * 0.6;
        vz += away.z * P.fleeSpeed * 0.6;
        brain.alert = 0.6;
      }
      // home soft pull
      vx += (brain.homeX - brain.x) * P.homePull * 0.15;
      vz += (brain.homeZ - brain.z) * P.homePull * 0.15;
      brain.speed = len2(vx, vz);
      break;
    }
    default:
      enter(brain, 'wander', t);
  }

  // integração horizontal (não ringPatrol — já escreveu x/z)
  if (!P.ringPatrol && brain.state !== 'flock') {
    brain.x += vx * dt;
    brain.z += vz * dt;
    if (Math.abs(vx) + Math.abs(vz) > 1e-4) {
      let yaw = Math.atan2(vx, vz);
      if (P.sideways) yaw += Math.PI / 2; // caranguejo anda de lado
      // suaviza yaw
      let dy = yaw - brain.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      brain.yaw += dy * Math.min(1, dt * 8);
    }
    // hard home clamp
    const hx = brain.x - brain.homeX, hz = brain.z - brain.homeZ;
    const hd = len2(hx, hz);
    if (hd > brain.homeR * 1.15) {
      const n = norm(hx, hz);
      brain.x = brain.homeX + n.x * brain.homeR;
      brain.z = brain.homeZ + n.z * brain.homeR;
    }
  }

  // aquáticos: ciclo de mergulho
  if (P.aquatic) {
    brain.nextDive -= dt;
    if (brain.nextDive <= 0) {
      brain.submerged = brain.submerged > 0 ? 0 : 2.4 + n2(t, brain.seed, 1) * 1.5;
      brain.nextDive = (10 + n2(t, brain.x, brain.z) * 12) / (1 + agit * 1.5);
    }
    if (brain.submerged > 0) brain.submerged -= dt;
    brain.yOffset = brain.submerged > 0 ? (P.ringPatrol ? -0.4 : -0.22) : (P.ringPatrol ? 0.12 : 0.05);
    if (P.ringPatrol) {
      brain.yOffset += Math.sin(t * 0.4 + brain.seed) * 0.35;
    }
  } else if (P.airborne) {
    brain.yOffset = 0; // altura tratada pelo caller (band height)
  } else {
    // bob de movimento
    brain.yOffset = brain.speed > 0.2 ? Math.abs(Math.sin(t * (10 + brain.speed))) * 0.03 : 0;
  }

  return brain;
}

/**
 * Contexto compartilhado da cena (preenchido por main3d a cada frame).
 */
export function createFaunaContext() {
  return { playerX: null, playerZ: null, agitation: 0 };
}
