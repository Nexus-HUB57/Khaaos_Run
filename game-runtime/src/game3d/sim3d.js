// Khaaos Run — Simulação 3D headless determinística (CIGKV / Battle Royale TPS)
// Autoridade total da partida: movimento, tiro, zona, loot e eliminação vivem aqui.
// O renderizador (main3d/world3d) apenas interpreta o estado — mesmo contrato da
// simulação 2D (shared/simulation.js), em espaço y-up, unidades em metros.
import { SeededRng } from '../shared/rng.js';
import { WEAPONS, rollLoot } from '../shared/weapons.js';
import { buildWorldLayout } from './layout3d.js';
import { resolveScenario } from './scenarios.js';
import { getOperativeAbility } from './operativeAbilities.js';

export const WORLD = { size: 400, ring: { x: 0, z: 0, radius: 170 }, gravity: -22, jumpVel: 7.4 };
export const PLAYER_R = 0.45, PLAYER_H = 1.8, HEAD_Y = 1.5;
export const MATCH_TIME = 600, PULSE_INTERVAL = 45;

// ---- Fase 4 — Infiltração Aérea (assinatura BR/FreeFire) ----
// A partida começa com os operativos caindo do céu: queda livre (SKY) até a
// altitude de abertura automática do paraquedas, depois descida lenta (CHUTE).
// A física vive em stepActorMovement — sim offline, MatchRoom3D e predição do
// cliente replicam EXATAMENTE o mesmo comportamento.
export const DROP_START_Y = 140;       // altitude de inserção (m)
export const DROP_OPEN_Y = 45;         // abertura automática do paraquedas (m)
export const DROP_SKY_GRAVITY = -34;   // gravidade da queda livre
export const DROP_SKY_MAX_FALL = -52;  // terminal velocity da queda livre
export const DROP_CHUTE_GRAVITY = -6.5;// gravidade com paraquedas aberto
export const DROP_CHUTE_MAX_FALL = -9; // terminal velocity com paraquedas
export const DROP_SPEED_MULT = 2.6;    // deriva horizontal no ar (× velocidade base)

// ---- Fase 4 — Arremessáveis táticos (granada FRAG + Gloo Wall) ----
export const FRAG = {
  fuse: 2.2,            // s até detonar após o arremesso
  speed: 21,            // m/s de saída da mão
  loft: 0.42,           // fração da velocidade aplicada para cima
  bounce: 0.38,         // energia conservada no quique (XZ e Y)
  gravity: -19,
  damage: 110,          // dano no epicentro
  radius: 9,            // raio letal (m)
  wallAttenuation: 0.25,// fração do dano se a parede está entre epicentro e alvo
  cap: 3,               // máximo carregado
};
export const GLOO = {
  w: 4, h: 3, d: 0.4,   // dimensões da parede (m) — rot 0 (ao longo de X) ou 90°
  hp: 220,              // pontos de vida (balas/granada desgastam)
  duration: 60,         // s até se dissolver
  forward: 2.2,         // distância à frente do jogador
  cap: 2,               // máximo carregado
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Conversão do catálogo 2D (px) para métricas 3D (m): escala única documentada.
const SCALE = { range: 1 / 2.2, bullet: 1 / 2.2 };
export const WEAPONS3D = {};
for (const [id, w] of Object.entries(WEAPONS)) {
  WEAPONS3D[id] = {
    ...w,
    range: Math.round(w.range * SCALE.range),
    bulletSpeed: Math.round(w.projectileSpeed * SCALE.bullet) || 0,
    spread: { melee: 0, sidearm: 0.014, smg: 0.024, rifle: 0.013, sniper: 0.003, energy: 0.007 }[w.category] ?? 0.02,
    reload: { sidearm: 1.4, smg: 1.9, rifle: 2.1, sniper: 2.8, energy: 2.2, melee: 0 }[w.category] ?? 2,
  };
}
export const AMMO_CAP = { '9MM': 120, '5.56': 150, '.338': 25, CELL: 60 };

export const DEFAULT_INPUT = Object.freeze({
  seq: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false,
});

// ---------- utilitários de colisão ----------
// Exportados para reuso pela MatchRoom3D autoritativa (server/room3d.js).
export function circlePushAabb(px, pz, r, b) {
  const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
  const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), push = r - d; return { x: px + (dx / d) * push, z: pz + (dz / d) * push }; }
  const l = px - b.minX, rt = b.maxX - px, t = pz - b.minZ, bt = b.maxZ - pz;
  const m = Math.min(l, rt, t, bt);
  if (m === l) return { x: b.minX - r, z: pz };
  if (m === rt) return { x: b.maxX + r, z: pz };
  if (m === t) return { x: px, z: b.minZ - r };
  return { x: px, z: b.maxZ + r };
}
export function rayAabb(ox, oy, oz, dx, dy, dz, box, maxT) {
  let tmin = 0, tmax = maxT;
  const axes = [[ox, dx, box.minX, box.maxX], [oy, dy, box.yMin, box.yMax], [oz, dz, box.minZ, box.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
export function rayCharacter(ox, oy, oz, dx, dy, dz, ch, maxT) {
  // cápsula aproximada: cilindro vertical r=PLAYER_R, y∈[ch.y, ch.y+PLAYER_H]
  // (ch.y é a base do ator; 0 no chão — suporte a salto/lag compensation)
  const base = ch.y ?? 0;
  const mx = ox - ch.x, mz = oz - ch.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (mx * dx + mz * dz), c = mx * mx + mz * mz - PLAYER_R * PLAYER_R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const hy = oy + dy * t;
  if (hy < base || hy > base + PLAYER_H) return null;
  return { t, head: hy > base + HEAD_Y };
}

// ---------- movimento compartilhado (servidor autoritativo + predição do cliente) ----------
// Extraído do #stepActor para que a predição client-side replique EXATAMENTE a
// física da MatchRoom3D: mesma velocidade, colisão AABB e integração vertical.
// Aplica APENAS cinemática — combate/timers ficam na responsabilidade de quem chama.
export function stepActorMovement(a, input, dt, world) {
  a.sprinting = !!(input.sprint && !input.ads);
  a.ads = !!input.ads;
  const w = WEAPONS3D[a.weapon] ?? WEAPONS3D.g19;
  let sp = a.speed * (a.abilitySpeedMultiplier ?? 1) * (a.sprinting ? 1.42 : 1) * (a.ads ? 0.55 : 1);
  if (w.category === 'sniper' && !a.ads) sp *= 0.9;
  // Fase 4 — queda/infiltração: deriva horizontal ampliada, sem sprint/ADS no ar
  if (a.dropPhase) { a.sprinting = false; a.ads = false; sp = a.speed * DROP_SPEED_MULT; }
  if (Number.isFinite(a.abilityDistanceBudget)) sp = Math.min(sp, a.abilityDistanceBudget / Math.max(dt, 1e-6));
  const len = Math.hypot(input.dx, input.dy) || 1;
  const mx = (input.dx / len) * sp * dt, mz = (input.dy / len) * sp * dt;
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  a.moving = Math.abs(input.dx) + Math.abs(input.dy) > 0.01;
  // frente do ator: -Z quando yaw=0 (convenção Three.js)
  // rotação local→mundo em torno de Y: [x' = x·cosθ + z·sinθ; z' = -x·sinθ + z·cosθ]
  const oldX = a.x, oldZ = a.z;
  let nx = a.x + (mx * cos + mz * sin), nz = a.z + (-mx * sin + mz * cos);
  // colisão XZ com o mundo (no ar: só a borda do mundo — paredes altas não alcançam)
  if (!a.dropPhase) {
    for (const box of world.colliders) {
      if (box.yMin > a.y + 0.4 && box.yMin > 1.2) continue; // estruturas aéreas não bloqueiam no chão
      const hit = circlePushAabb(nx, nz, PLAYER_R, box);
      if (hit) { nx = hit.x; nz = hit.z; }
    }
  }
  const lim = WORLD.size / 2 - 2;
  a.x = clamp(nx, -lim, lim); a.z = clamp(nz, -lim, lim);
  if (Number.isFinite(a.abilityDistanceBudget)) {
    a.abilityDistanceBudget = Math.max(0, a.abilityDistanceBudget - Math.hypot(a.x - oldX, a.z - oldZ));
  }
  // vertical: fase de queda própria (Fase 4) OU salto normal
  if (a.dropPhase) {
    const phase = a.dropPhase;
    const g = phase === 'sky' ? DROP_SKY_GRAVITY : DROP_CHUTE_GRAVITY;
    const cap = phase === 'sky' ? DROP_SKY_MAX_FALL : DROP_CHUTE_MAX_FALL;
    if (a.vy > cap) a.vy = Math.max(cap, a.vy + g * dt); else a.vy = cap;
    a.y += a.vy * dt;
    if (phase === 'sky' && a.y <= DROP_OPEN_Y) { a.dropPhase = 'chute'; a.vy = Math.max(a.vy, DROP_CHUTE_MAX_FALL); }
    if (a.y <= 0) {
      a.y = 0; a.vy = 0; a.onGround = true; a.dropPhase = null;
      a.landed = true; // consumido pelo dono do step para emitir 'land'
    }
    return a;
  }
  // vertical
  if (!a.onGround || input.jump) {
    if (a.onGround && input.jump) { a.vy = WORLD.jumpVel; a.onGround = false; }
    a.vy += WORLD.gravity * dt; a.y += a.vy * dt;
    if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
  }
  return a;
}

// ---------- arremessáveis táticos (Fase 4) ----------
// Helpers puros compartilhados pela sim offline e pela MatchRoom3D autoritativa.
// Direção de arremesso: mira do ator (yaw/pitch) com loft fixo; física com
// gravidade, quique amortecido em AABBs/chão e pavio temporizado.
export function throwFragProjectile(a, id) {
  const cp = Math.cos(a.pitch ?? 0);
  const fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch ?? 0), fz = -Math.cos(a.yaw) * cp;
  return {
    id, owner: a.id,
    x: a.x + fx * 0.6, y: a.y + 1.5, z: a.z + fz * 0.6,
    vx: fx * FRAG.speed, vy: fy * FRAG.speed + FRAG.speed * FRAG.loft, vz: fz * FRAG.speed,
    fuse: FRAG.fuse, born: -1,
  };
}

// Um passo de física da granada; retorna evento de impacto p/ FX ou null.
export function stepFragProjectile(g, dt, colliders) {
  g.fuse -= dt;
  const ox = g.x, oy = g.y, oz = g.z;
  g.vy += FRAG.gravity * dt;
  g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
  // chão
  if (g.y <= 0.12) {
    g.y = 0.12;
    if (Math.abs(g.vy) > 2.2) {
      g.vy = -g.vy * FRAG.bounce; g.vx *= FRAG.bounce; g.vz *= FRAG.bounce;
      return { kind: 'bounce', x: g.x, y: g.y, z: g.z };
    }
    g.vy = 0; g.vx *= 0.86; g.vz *= 0.86; // rola e atrita
  }
  // AABBs: resolve pela menor penetração (granada é pequena — aproximação de ponto)
  for (const box of colliders) {
    if (box.noBlock) continue;
    if (g.x < box.minX || g.x > box.maxX || g.z < box.minZ || g.z > box.maxZ) continue;
    if (g.y < box.yMin || g.y > box.yMax) continue;
    // recua para a posição anterior e reflete no eixo dominante
    const pen = [
      { axis: 'x', v: Math.min(Math.abs(g.x - box.minX), Math.abs(g.x - box.maxX)) },
      { axis: 'z', v: Math.min(Math.abs(g.z - box.minZ), Math.abs(g.z - box.maxZ)) },
      { axis: 'y', v: Math.min(Math.abs(g.y - box.yMin), Math.abs(g.y - box.yMax)) },
    ].sort((p, q) => p.v - q.v)[0].axis;
    g.x = ox; g.y = oy; g.z = oz;
    if (pen === 'x') { g.vx = -g.vx * FRAG.bounce; g.vz *= FRAG.bounce; }
    else if (pen === 'z') { g.vz = -g.vz * FRAG.bounce; g.vx *= FRAG.bounce; }
    else g.vy = Math.abs(g.vy) > 2.2 ? -g.vy * FRAG.bounce : 0;
    return { kind: 'bounce', x: g.x, y: g.y, z: g.z };
  }
  return null;
}

// Dano radial da explosão: decai linear do epicentro até o raio; paredes entre o
// epicentro e o alvo atenuam (linha epicentro→alvo testada por rayAabb — robusto
// para paredes finas como a Gloo Wall).
export function explosionDamage(ex, ey, ez, target, colliders) {
  const d = Math.hypot(target.x - ex, target.y + 0.9 - ey, target.z - ez);
  if (d > FRAG.radius) return 0;
  let dmg = FRAG.damage * (1 - d / FRAG.radius);
  let dx = target.x - ex, dy = (target.y + 0.9) - ey, dz = target.z - ez;
  const len = Math.hypot(dx, dy, dz);
  if (len > 1e-6) {
    dx /= len; dy /= len; dz /= len;
    for (const box of colliders) {
      if (box.noBlock) continue;
      if (rayAabb(ex, ey, ez, dx, dy, dz, box, len) !== null) { dmg *= FRAG.wallAttenuation; break; }
    }
  }
  return Math.max(0, dmg);
}

// AABB da Gloo Wall: rot 0 → parede estendida em X; rot 90° → estendida em Z.
export function glooCollider(wall) {
  const alongX = (wall.rot ?? 0) === 0;
  const w = alongX ? GLOO.w : GLOO.d, d = alongX ? GLOO.d : GLOO.w;
  return { minX: wall.x - w / 2, maxX: wall.x + w / 2, minZ: wall.z - d / 2, maxZ: wall.z + d / 2, yMin: 0, yMax: GLOO.h, kind: 'gloo', wallId: wall.id };
}

// Posição/rotação de deploy: à frente do ator, alinhada à direção de visão (0/90°).
export function glooDeployPlacement(a) {
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const alongX = Math.abs(fx) < Math.abs(fz); // parede perpendicular à visão
  return {
    x: a.x + fx * GLOO.forward, z: a.z + fz * GLOO.forward,
    rot: alongX ? 0 : Math.PI / 2,
  };
}

// ---------- mundo ----------
const layoutCache = new Map();
export function getWorldLayout(seed, scenarioId = 'CIGKV') {
  const scenario = resolveScenario(scenarioId);
  const key = `${scenario.id}:${String(seed)}`;
  if (!layoutCache.has(key)) layoutCache.set(key, buildWorldLayout(String(seed), scenario.id));
  return layoutCache.get(key);
}

export class KhaaosSim3D {
  constructor({ seed = 'CIGKV-3D', botCount = 12, tickRate = 30, airdrop = true, scenarioId = 'CIGKV' } = {}) {
    this.seed = String(seed);
    this.scenario = resolveScenario(scenarioId);
    this.rng = new SeededRng(`${this.seed}:sim`);
    this.tickRate = tickRate; this.tick = 0; this.time = MATCH_TIME; this.pulseTimer = 0;
    this.events = []; this.replay = []; this.over = false; this.started = false;
    this.airdrop = !!airdrop; // Fase 4: infiltração aérea no início da partida
    this.world = getWorldLayout(this.seed, this.scenario.id);
    this.ring = { x: 0, z: 0, radius: WORLD.ring.radius, target: WORLD.ring.radius, pulse: 0 };
    this.player = this.#spawnPlayer();
    this.bots = Array.from({ length: botCount }, (_, i) => this.#spawnBot(i));
    this.bullets = []; this.nextBulletId = 1;
    this.grenades = []; this.walls = []; this.nextThrowableId = 1; // Fase 4
    this.loot = this.#spawnLoot();
    this.terminals = this.world.terminals.map((t, i) => ({ id: `zex-${i}`, ...t, active: true }));
    // mundo físico da sim: colliders do layout + dinâmicos (Gloo Walls).
    // ALIAS da lista do layout quando não há paredes — mutações externas no layout
    // (ex.: testes que removem colliders) continuam valendo para balas/LOS/movimento.
    this.physicsWorld = { colliders: this.world.colliders };
  }
  #syncPhysicsWorld() {
    const active = this.walls.filter(w => w.active).map(glooCollider);
    this.physicsWorld.colliders = active.length ? this.world.colliders.concat(active) : this.world.colliders;
  }

  // ---------- spawn ----------
  #spawnPlayer() {
    return { id: 'player', name: 'ZHEERS-07', x: this.world.playerSpawn.x, y: 0, z: this.world.playerSpawn.z, vy: 0, yaw: 0, pitch: 0,
      life: 100, armor: 35, xp: 0, krc: 250, kills: 0, speed: 5.2, weapon: 'g19',
      operativeId: 'OP_MALE_VANGUARD',
      temporaryArmor: 0,
      abilityState: { cooldownTicks: 0, activeTicks: 0, effect: null, distanceRemaining: 0, targetIds: [], targetTerminalId: null },
      cooldown: 0, reloadT: 0, ammoMag: WEAPONS3D.g19.magazine,
      inventory: { metal: 0, wood: 0, components: 0, medkit: 1, fuel: 0, frag: 1, gloo: 1, ammo: { '9MM': 45 } },
      slots: { 1: 'g19' }, activeSlot: 1, extracted: 0, alive: true, onGround: true, moving: false, sprinting: false, ads: false,
      dropPhase: null, dropTarget: null };
  }
  #spawnBot(i) {
    const spot = this.world.botSpawns[i % this.world.botSpawns.length];
    const jx = (this.rng.next() - .5) * 10, jz = (this.rng.next() - .5) * 10;
    return { id: `bot-${String(i + 1).padStart(2, '0')}`, name: `ZHEERS-${String(i + 1).padStart(2, '0')}`,
      x: spot.x + jx, y: 0, z: spot.z + jz, vy: 0, yaw: this.rng.next() * Math.PI * 2, pitch: 0,
      life: 100, armor: 20, alive: true, onGround: true, moving: false, sprinting: false, ads: false, revealedTicks: 0,
      speed: 4.55, weapon: this.rng.pick(['g19', 'mp5', 'm4', 'm4', 'g19']), cooldown: this.rng.next() * 2, reloadT: 0, burst: 0,
      dropPhase: null, dropTarget: null,
      ai: { state: 'patrol', lx: 0, lz: 0, think: 0, lostT: 0, strafe: this.rng.next() * 6.28, waypoint: null } };
  }
  #spawnLoot() {
    const zones = ['armory', 'industrial', 'park', 'extraction'];
    const items = Array.from({ length: 24 }, (_, i) => {
      const spot = this.world.lootSpots[i % this.world.lootSpots.length];
      const drop = rollLoot(this.rng, spot.lootZone ?? zones[i % zones.length], 1)[0];
      return { id: `loot-${i}`, x: spot.x, z: spot.z, y: 0.55, sectorId: spot.sectorId, ...drop, active: true };
    });
    // Fase 4 — arremessáveis táticos espalhados deterministamente (FRAG/GLOO)
    const bonus = ['frag', 'gloo', 'frag', 'frag', 'gloo', 'frag'];
    for (let i = 0; i < bonus.length; i++) {
      const spot = this.world.lootSpots[(i * 7 + 3) % this.world.lootSpots.length];
      items.push({ id: `loot-t${i}`, x: spot.x + ((i % 2) - .5) * 1.6, z: spot.z + ((i % 3) - 1) * 1.4,
        y: 0.55, kind: bonus[i], name: bonus[i] === 'frag' ? 'Granada FRAG' : 'Gloo Wall', active: true });
    }
    return items;
  }

  // ---------- protocolo ----------
  start(entry = 'belt') {
    this.started = true;
    const p = this.player;
    p.armor = entry === 'belt' ? 60 : 18;
    p.speed = entry === 'belt' ? 5.2 : 6.1;
    // Fase 4 — infiltração aérea: todos os operativos entram caindo do céu
    if (this.airdrop) {
      this.#airdropActor(p, 0, this.world.lootSpots);
      this.bots.forEach((b, i) => this.#airdropActor(b, i + 1, this.world.lootSpots));
      this.emit('airdrop', { altitude: DROP_START_Y });
    }
    this.emit('entry', { entry });
  }
  #airdropActor(a, idx, lootSpots) {
    // espalha na borda do anel com jitter determinístico; bots escolhem loot spot como destino
    const ang = (idx / 17) * Math.PI * 2 + 0.35;
    const r = 120 + (idx % 3) * 14;
    a.x = Math.cos(ang) * r; a.z = Math.sin(ang) * r;
    a.y = DROP_START_Y + (idx % 4) * 6;
    a.vy = 0; a.onGround = false; a.dropPhase = 'sky';
    a.yaw = Math.atan2(-a.x, -a.z); // olhando para o centro
    const spot = lootSpots[(idx * 5) % lootSpots.length];
    a.dropTarget = { x: spot.x, z: spot.z };
  }
  emit(type, payload = {}) { this.events.push({ tick: this.tick, type, ...payload }); }
  consumeEvents() { const e = this.events; this.events = []; return e; }
  record(input) { this.replay.push({ tick: this.tick, input: { ...DEFAULT_INPUT, ...input } }); }

  #advanceAbility() {
    const p = this.player, state = p.abilityState;
    state.cooldownTicks = Math.max(0, state.cooldownTicks - 1);
    if (state.activeTicks > 0) {
      state.activeTicks--;
      if (state.activeTicks === 0) {
        if (state.effect === 'temporaryArmor') p.temporaryArmor = 0;
        state.effect = null;
        state.targetTerminalId = null;
        state.targetIds = [];
      }
    }
    for (const bot of this.bots) if (bot.revealedTicks > 0) bot.revealedTicks--;
  }

  #activateAbility() {
    const p = this.player;
    const ability = getOperativeAbility(p.operativeId);
    const state = p.abilityState;
    if (!this.started || !p.alive || state.cooldownTicks > 0) return false;
    if (ability.effect === 'heal' && p.life >= 100) {
      this.emit('abilityUnavailable', { reason: 'life_full', name: ability.name });
      return false;
    }

    const params = ability.parameters;
    state.effect = ability.effect;
    state.cooldownTicks = Math.ceil(ability.cooldownSeconds * this.tickRate);
    state.activeTicks = Math.ceil(ability.durationSeconds * this.tickRate);
    state.distanceRemaining = params.maxDistance ?? 0;
    state.originX = p.x; state.originZ = p.z;
    state.targetIds = []; state.targetTerminalId = null;
    let details = {};

    if (ability.effect === 'heal') {
      const healed = Math.min(params.heal, 100 - p.life);
      p.life += healed;
      details.healed = healed;
    } else if (ability.effect === 'recon') {
      const radius = params.radius;
      const targets = this.bots.filter((bot) => bot.alive && dist2d(p.x, p.z, bot.x, bot.z) <= radius);
      for (const bot of targets) bot.revealedTicks = Math.ceil(params.revealSeconds * this.tickRate);
      state.targetIds = targets.map((bot) => bot.id);
      details.targets = targets.length;
    } else if (ability.effect === 'stun') {
      const targets = this.bots.filter((bot) => bot.alive && dist2d(p.x, p.z, bot.x, bot.z) <= params.radius);
      for (const bot of targets) bot.ai.stunTicks = Math.ceil(params.stunSeconds * this.tickRate);
      details.targets = targets.length;
    } else if (ability.effect === 'temporaryArmor') {
      p.temporaryArmor = params.armor;
    } else if (ability.effect === 'ringRead' || ability.effect === 'ringForecast') {
      details.nextPulseSeconds = Math.max(0, PULSE_INTERVAL - this.pulseTimer);
      details.targetRadius = this.ring.radius > 42
        ? Math.max(42, 168 - (this.ring.pulse + 1) * 30)
        : this.ring.radius;
    } else if (ability.effect === 'terminalScan') {
      const terminal = this.terminals.filter((item) => item.active)
        .sort((a, b) => dist2d(p.x, p.z, a.x, a.z) - dist2d(p.x, p.z, b.x, b.z))[0];
      if (terminal) {
        state.targetTerminalId = terminal.id;
        details.terminalLabel = terminal.label || terminal.id;
        details.terminalDistance = Math.round(dist2d(p.x, p.z, terminal.x, terminal.z));
      }
    }

    this.emit('ability', {
      operativeId: p.operativeId,
      name: ability.name,
      effect: ability.effect,
      durationSeconds: ability.durationSeconds,
      cooldownSeconds: ability.cooldownSeconds,
      description: ability.description,
      ...details,
    });
    if (ability.durationSeconds === 0) state.effect = null;
    return true;
  }

  step(rawInput = DEFAULT_INPUT, dt = 1 / 30) {
    const input = { ...DEFAULT_INPUT, ...rawInput };
    this.record(input);
    if (this.over || !this.started) return this.snapshot();
    this.tick++; this.time = Math.max(0, this.time - dt);
    this.#advanceAbility();
    if (input.ability) this.#activateAbility();

    // --- zona segura ---
    this.pulseTimer += dt;
    if (this.pulseTimer >= PULSE_INTERVAL && this.ring.radius > 42) {
      this.pulseTimer = 0;
      this.ring.pulse++;
      this.ring.target = Math.max(42, 168 - this.ring.pulse * 30);
      this.emit('pulse', { pulse: this.ring.pulse, target: this.ring.target });
    }
    if (this.ring.radius > this.ring.target) this.ring.radius = Math.max(this.ring.target, this.ring.radius - dt * 1.15);
    const p = this.player;
    if (p.alive && dist2d(p.x, p.z, this.ring.x, this.ring.z) > this.ring.radius) {
      this.#hurtPlayer((4 + this.ring.pulse * 1.4) * this.scenario.ringDamageMultiplier * dt, null, 'ring');
    }

    // --- jogador ---
    if (p.alive) this.#stepActor(p, input, dt, true);
    // --- bots ---
    for (const b of this.bots) if (b.alive) this.#stepBot(b, dt);
    // --- projéteis e arremessáveis ---
    this.#stepBullets(dt);
    this.#stepThrowables(dt);
    // --- fim de partida ---
    if (p.alive && this.time <= 0) { this.over = true; this.emit('victory', { kills: p.kills, xp: p.xp, krc: p.krc }); }
    if (!p.alive && !this.over) { this.over = true; this.emit('eliminated', { kills: p.kills }); }
    return this.snapshot();
  }

  // ---------- atores ----------
  #stepActor(a, input, dt, isPlayer) {
    a.cooldown = Math.max(0, a.cooldown - dt);
    if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) this.#finishReload(a); }
    a.yaw = input.yaw; a.pitch = input.pitch ?? 0;
    if (isPlayer) {
      const ability = getOperativeAbility(a.operativeId);
      const active = a.abilityState.activeTicks > 0;
      a.abilitySpeedMultiplier = active && (ability.effect === 'speed' || ability.effect === 'dash')
        ? ability.parameters.speedMultiplier : 1;
      a.abilityDistanceBudget = active && ability.effect === 'dash' ? a.abilityState.distanceRemaining : undefined;
      a.abilityAccuracyMultiplier = active && ability.effect === 'precision' ? ability.parameters.accuracyMultiplier : 1;
    }
    stepActorMovement(a, input, dt, this.physicsWorld);
    if (a.landed) { a.landed = false; if (isPlayer) this.emit('land', { x: a.x, z: a.z }); }
    const airborne = !!a.dropPhase; // sem combate/coleta no ar (Fase 4)
    if (isPlayer && getOperativeAbility(a.operativeId).effect === 'dash' && a.abilityState.activeTicks > 0) {
      a.abilityState.distanceRemaining = a.abilityDistanceBudget;
      if (a.abilityState.distanceRemaining <= 0.001) a.abilityState.activeTicks = 0;
      delete a.abilityDistanceBudget;
    }
    if (isPlayer) {
      const w = WEAPONS3D[a.weapon] ?? WEAPONS3D.g19;
      if (!airborne) {
        if (input.reload) this.#tryReload(a);
        if (input.medkit) this.#useMedkit(a);
        if (input.interact) this.#interact(a);
        if (input.throw) this.#throwFrag(a);
        if (input.gloo) this.#deployGloo(a);
        if (input.fire && w.category === 'melee') this.#meleeSwing(a, w);
        else if (input.fire) this.#fire(a, w);
      }
    }
  }

  // ---------- arremessáveis táticos (Fase 4) ----------
  #throwFrag(a) {
    if ((a.inventory.frag ?? 0) <= 0 || a.reloadT > 0) return;
    a.inventory.frag--;
    const g = throwFragProjectile(a, this.nextThrowableId++);
    this.grenades.push(g);
    this.emit('frag', { owner: a.id, x: g.x, y: g.y, z: g.z });
  }
  #deployGloo(a) {
    if ((a.inventory.gloo ?? 0) <= 0) return;
    const place = glooDeployPlacement(a);
    // não empilha dentro de collider existente (inclusive outras paredes)
    const probe = { ...place, id: 'probe' };
    const box = glooCollider(probe);
    for (const c of this.physicsWorld.colliders) {
      if (c.noBlock) continue;
      const overlap = box.minX < c.maxX && box.maxX > c.minX && box.minZ < c.maxZ && box.maxZ > c.minZ && box.yMin < c.yMax && GLOO.h > c.yMin;
      if (overlap) return;
    }
    a.inventory.gloo--;
    const wall = { id: this.nextThrowableId++, x: place.x, z: place.z, rot: place.rot, hp: GLOO.hp, age: 0, active: true, owner: a.id };
    this.walls.push(wall);
    this.#syncPhysicsWorld();
    this.emit('gloo', { owner: a.id, id: wall.id, x: wall.x, z: wall.z, rot: wall.rot });
  }
  #stepThrowables(dt) {
    // granadas: física + detonação
    for (const g of this.grenades) {
      stepFragProjectile(g, dt, this.physicsWorld.colliders);
      if (g.fuse <= 0) {
        g.dead = true;
        this.#detonate(g);
      }
    }
    this.grenades = this.grenades.filter(g => !g.dead);
    // gloo walls: dano persistido, expiração e queda de hp
    let changed = false;
    for (const w of this.walls) {
      if (!w.active) continue;
      w.age += dt;
      if (w.hp <= 0 || w.age >= GLOO.duration) { w.active = false; changed = true; this.emit('glooDown', { id: w.id, destroyed: w.hp <= 0 }); }
    }
    if (changed) this.#syncPhysicsWorld();
  }
  #detonate(g) {
    const actors = [this.player, ...this.bots].filter(a => a.alive);
    for (const a of actors) {
      const dmg = explosionDamage(g.x, g.y, g.z, a, this.physicsWorld.colliders);
      if (dmg <= 0) continue;
      if (a.id === 'player') this.#hurtPlayer(dmg, g.owner, 'explosion');
      else this.#damageBot(a, dmg, g.owner, false);
    }
    // granada desgasta gloo walls no raio
    let changed = false;
    for (const w of this.walls) {
      if (!w.active) continue;
      const box = glooCollider(w);
      const cx = clamp(g.x, box.minX, box.maxX), cz = clamp(g.z, box.minZ, box.maxZ);
      const cy = clamp(g.y, box.yMin, box.yMax);
      const d = Math.hypot(g.x - cx, g.y - cy, g.z - cz);
      if (d <= FRAG.radius) { w.hp -= FRAG.damage * (1 - d / FRAG.radius) * 2; changed = true; }
    }
    if (changed) { for (const w of this.walls) if (w.active && w.hp <= 0) { w.active = false; this.emit('glooDown', { id: w.id, destroyed: true }); } this.#syncPhysicsWorld(); }
    this.emit('explosion', { x: g.x, y: g.y, z: g.z, owner: g.owner });
  }

  #stepBot(b, dt) {
    const p = this.player;
    // Fase 4 — na queda: deriva para o destino de aterrissagem, sem combate
    if (b.dropPhase) {
      const tx = b.dropTarget?.x ?? 0, tz = b.dropTarget?.z ?? 0;
      const inAngle = Math.atan2(-(tx - b.x), -(tz - b.z));
      b.yaw += Math.atan2(Math.sin(inAngle - b.yaw), Math.cos(inAngle - b.yaw)) * Math.min(1, dt * 4);
      const dist = dist2d(b.x, b.z, tx, tz);
      const dy = dist > 6 ? -1 : 0; // anda para frente enquanto longe do alvo
      this.#stepActor(b, { ...DEFAULT_INPUT, dx: 0, dy, yaw: b.yaw }, dt, false);
      if (b.landed) { b.landed = false; b.ai.state = 'patrol'; b.ai.think = 0; }
      return;
    }
    if ((b.ai.stunTicks ?? 0) > 0) { b.ai.stunTicks--; b.moving = false; return; }
    b.ai.think -= dt;
    const d = dist2d(b.x, b.z, p.x, p.z);
    const concealed = p.abilityState?.effect === 'concealment' && p.abilityState.activeTicks > 0;
    const sees = p.alive && !concealed && d < 85 && this.#hasLos(b, p);
    if (sees) { b.ai.state = 'engage'; b.ai.lostT = 0; b.ai.lx = p.x; b.ai.lz = p.z; }
    else if (b.ai.state === 'engage') {
      if (concealed) { b.ai.state = 'hunt'; b.ai.lostT = 5; }
      else { b.ai.lostT += dt; if (b.ai.lostT > 5) b.ai.state = 'hunt'; }
    }
    if (b.ai.think <= 0) {
      b.ai.think = 0.4 + this.rng.next() * 0.5;
      if (b.ai.state !== 'engage' && (!b.ai.waypoint || dist2d(b.x, b.z, b.ai.waypoint.x, b.ai.waypoint.z) < 6)) {
        const ang = this.rng.next() * Math.PI * 2, rr = this.rng.next() * this.ring.radius * 0.85;
        b.ai.waypoint = { x: clamp(this.ring.x + Math.cos(ang) * rr, -190, 190), z: clamp(this.ring.z + Math.sin(ang) * rr, -190, 190) };
      }
    }
    let tx, tz, run = 0.62;
    if (b.ai.state === 'engage') {
      const ideal = 16;
      const away = d < ideal ? -1 : 1;
      b.ai.strafe += dt * 1.7;
      tx = p.x + Math.cos(b.ai.strafe) * away * 6; tz = p.z + Math.sin(b.ai.strafe) * away * 6;
      run = 1;
    } else if (b.ai.state === 'hunt') {
      tx = b.ai.lx ?? p.x; tz = b.ai.lz ?? p.z;
      if (dist2d(b.x, b.z, tx, tz) < 5) b.ai.state = 'patrol';
    } else { tx = b.ai.waypoint?.x ?? this.ring.x; tz = b.ai.waypoint?.z ?? this.ring.z; }
    // permanece dentro do anel
    if (dist2d(tx, tz, this.ring.x, this.ring.z) > this.ring.radius * 0.92) {
      const ang = Math.atan2(tz - this.ring.z, tx - this.ring.x);
      tx = this.ring.x + Math.cos(ang) * this.ring.radius * 0.85; tz = this.ring.z + Math.sin(ang) * this.ring.radius * 0.85;
    }
    const ax = tx - b.x, az = tz - b.z;
    const inAngle = Math.atan2(-ax, -az); // yaw apontando para o destino
    b.yaw += Math.atan2(Math.sin(inAngle - b.yaw), Math.cos(inAngle - b.yaw)) * Math.min(1, dt * 6);
    // frente do ator é -Z: para CAMINHAR na direção do yaw o input é dy negativo
    const input = { ...DEFAULT_INPUT, dx: 0, dy: -run, yaw: b.yaw, pitch: 0 };
    this.#stepActor(b, input, dt, false);
    // disparo — erro humano: espalha o ponto alvo em vez do cone de saída
    const w = WEAPONS3D[b.weapon];
    if (sees && b.cooldown <= 0 && b.reloadT <= 0) {
      const err = 0.45 + Math.min(1.2, d * 0.012);
      this.#spawnBullet(b, { tx: p.x + (this.rng.next() - 0.5) * err * 2, ty: p.y + 1.2 + (this.rng.next() - 0.5) * err, tz: p.z + (this.rng.next() - 0.5) * err * 2 }, 0.012, w, 0.55);
      b.burst++;
      if (b.burst >= (w.category === 'sniper' ? 1 : 3 + Math.floor(this.rng.next() * 4))) {
        b.burst = 0; b.cooldown = 1.1 + this.rng.next() * 1.4;
        if (this.rng.next() < 0.25) b.reloadT = w.reload;
      } else b.cooldown = 1 / w.fireRate;
    }
  }

  #hasLos(a, b) {
    const ox = a.x, oy = a.y + 1.5, oz = a.z;
    let dx = b.x - ox, dy = (b.y + 1.5) - oy, dz = b.z - oz;
    const len = Math.hypot(dx, dy, dz); if (len < 0.01) return true;
    dx /= len; dy /= len; dz /= len;
    for (const box of this.physicsWorld.colliders) {
      if (box.noBlock) continue;
      if (rayAabb(ox, oy, oz, dx, dy, dz, box, len) !== null) return false;
    }
    return true;
  }

  // ---------- combate ----------
  #muzzle(a) {
    const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
    const fx = -sin, fz = -cos; // frente
    const rx = cos, rz = -sin;  // direita
    return { x: a.x + fx * 0.55 + rx * 0.22, y: a.y + 1.42 + Math.sin(a.pitch ?? 0) * 0.3, z: a.z + fz * 0.55 + rz * 0.22 };
  }
  #fire(a, w) {
    if (a.cooldown > 0 || a.reloadT > 0) return false;
    if (a.weapon === 'sucata') return this.#meleeSwing(a, w);
    const isPlayer = a.id === 'player';
    if (isPlayer ? a.ammoMag <= 0 : false) { this.emit('empty', { weapon: w.name }); this.#tryReload(a); return false; }
    if (isPlayer) a.ammoMag--;
    a.cooldown = 1 / w.fireRate;
    const m = this.#muzzle(a);
    const cp = Math.cos(a.pitch ?? 0);
    const vdx = -Math.sin(a.yaw) * cp, vdy = Math.sin(a.pitch ?? 0), vdz = -Math.cos(a.yaw) * cp;
    // convergência: o projétil parte do cano em direção ao ponto visado pelo crosshair
    const conv = Math.min(w.range, 60);
    const ax = a.x + vdx * conv, ay = a.y + 1.55 + vdy * conv, az = a.z + vdz * conv;
    let dx = ax - m.x, dy = ay - m.y, dz = az - m.z;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const accuracy = isPlayer ? (a.abilityAccuracyMultiplier ?? 1) : 1;
    const spread = isPlayer
      ? (w.spread / accuracy) * (a.ads ? 0.35 : 1) * (a.sprinting ? 1.8 : 1) * (a.moving ? 1.35 : 1)
      : 0;
    this.#spawnBullet(a, { dx, dy, dz, ox: m.x, oy: m.y, oz: m.z }, spread, w, isPlayer ? 1 : 0.55);
    this.emit('shot', { owner: a.id, weapon: a.weapon, x: m.x, y: m.y, z: m.z });
    return true;
  }
  #spawnBullet(a, dir, spread, w, dmgScale = 1) {
    let { dx, dy, dz, ox, oy, oz } = dir;
    if (dir.tx !== undefined) { // bot: mira a partir do cano no ponto alvo
      let tx = dir.tx - ox, ty = dir.ty - oy, tz = dir.tz - oz;
      const tl = Math.hypot(tx, ty, tz) || 1;
      dx = tx / tl; dy = ty / tl; dz = tz / tl;
    }
    if (spread > 0) {
      const r1 = (this.rng.next() - 0.5) * 2 * spread, r2 = (this.rng.next() - 0.5) * 2 * spread;
      const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
      dx += rx * r1; dz += rz * r1; dy += r2;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    }
    this.bullets.push({ id: this.nextBulletId++, x: ox, y: oy, z: oz, vx: dx * w.bulletSpeed, vy: dy * w.bulletSpeed, vz: dz * w.bulletSpeed,
      owner: a.id, damage: w.damage * dmgScale, life: w.range / w.bulletSpeed, weapon: w.id });
  }
  #aimDir(a, tx, ty, tz) {
    let dx = tx - a.x, dy = ty - (a.y + 1.55), dz = tz - a.z;
    const len = Math.hypot(dx, dy, dz) || 1; return { dx: dx / len, dy: dy / len, dz: dz / len };
  }
  #meleeSwing(a, w) {
    if (a.cooldown > 0) return false;
    a.cooldown = 1 / w.fireRate;
    const reach = 2.4;
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (dist2d(a.x, a.z, b.x, b.z) < reach && Math.abs(a.y - b.y) < 2) {
        const facing = Math.atan2(-Math.sin(a.yaw), -Math.cos(a.yaw));
        const ang = Math.atan2(b.z - a.z, b.x - a.x);
        const diff = Math.abs(Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing)));
        if (diff < 1.2) { this.#damageBot(b, w.damage, a.id, false); this.emit('melee', { target: b.id }); break; }
      }
    }
    this.emit('swing', { owner: a.id });
    return true;
  }
  #stepBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      b.life -= dt;
      const ox = b.x, oy = b.y, oz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0) { b.life = 0; this.emit('impact', { x: b.x, y: 0.02, z: b.z, kind: 'ground' }); continue; }
      const len = Math.hypot(b.x - ox, b.y - oy, b.z - oz);
      if (len <= 0) continue;
      const dx = (b.x - ox) / len, dy = (b.y - oy) / len, dz = (b.z - oz) / len;
      let hitT = Infinity, hitBox = null;
      for (const box of this.physicsWorld.colliders) {
        if (box.noBlock) continue;
        const t = rayAabb(ox, oy, oz, dx, dy, dz, box, len);
        if (t !== null && t < hitT) { hitT = t; hitBox = box; }
      }
      let charHit = null, charT = Infinity;
      if (b.owner !== 'player' && p.alive) {
        const h = rayCharacter(ox, oy, oz, dx, dy, dz, p, len);
        if (h && h.t < charT) { charT = h.t; charHit = { ref: p, head: h.head, isPlayer: true }; }
      }
      for (const bot of this.bots) {
        if (!bot.alive || bot.id === b.owner) continue;
        const h = rayCharacter(ox, oy, oz, dx, dy, dz, bot, len);
        if (h && h.t < charT) { charT = h.t; charHit = { ref: bot, head: h.head, isPlayer: false }; }
      }
      if (charHit && charT < hitT) {
        b.life = 0;
        const dmg = b.damage * (charHit.head ? 1.75 : 1);
        if (charHit.isPlayer) this.#hurtPlayer(dmg, b.owner, charHit.head ? 'headshot' : 'body');
        else this.#damageBot(charHit.ref, dmg, b.owner, charHit.head);
        this.emit('hit', { x: ox + dx * charT, y: oy + dy * charT, z: oz + dz * charT, victim: charHit.ref.id, head: charHit.head, damage: Math.round(dmg) });
        continue;
      }
      if (hitT < len) {
        b.life = 0;
        // Fase 4 — balas desgastam Gloo Walls (cobertura destrutível)
        if (hitBox?.wallId) {
          const w = this.walls.find(wl => wl.id === hitBox.wallId && wl.active);
          if (w) w.hp -= b.damage;
        }
        this.emit('impact', { x: ox + dx * hitT, y: oy + dy * hitT, z: oz + dz * hitT, kind: hitBox?.wallId ? 'gloo' : 'wall' });
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }
  #damageBot(bot, dmg, ownerId, head) {
    if (!bot.alive) return;
    if (bot.armor > 0) { const soak = Math.min(bot.armor, dmg * 0.6); bot.armor -= soak; dmg -= soak; }
    bot.life -= dmg;
    if (bot.life <= 0) {
      bot.alive = false;
      if (ownerId === 'player') {
        const krc = Math.round(15 * this.scenario.krcMultiplier);
        this.player.kills++; this.player.xp += head ? 180 : 120; this.player.krc += krc;
        this.emit('kill', { target: bot.name, head, xp: head ? 180 : 120, krc });
      } else this.emit('botKill', { target: bot.name });
    }
  }
  #hurtPlayer(dmg, ownerId, kind) {
    const p = this.player;
    if (!p.alive) return;
    const ability = getOperativeAbility(p.operativeId);
    if (kind === 'ring' && p.abilityState.activeTicks > 0 && ability.effect === 'ringResistance') {
      dmg *= 1 - ability.parameters.ringDamageReduction;
    } else if (kind !== 'ring' && p.abilityState.activeTicks > 0 && ability.effect === 'damageReduction') {
      dmg *= 1 - ability.parameters.damageReduction;
    }
    if (kind !== 'ring' && p.temporaryArmor > 0) {
      const soak = Math.min(p.temporaryArmor, dmg);
      p.temporaryArmor -= soak; dmg -= soak;
    }
    if (p.armor > 0 && kind !== 'ring') { const soak = Math.min(p.armor, dmg * 0.6); p.armor -= soak; dmg -= soak; }
    p.life -= dmg;
    this.emit('hurt', { amount: dmg, from: ownerId, kind, life: Math.max(0, p.life) });
    if (p.life <= 0) { p.life = 0; p.alive = false; this.emit('eliminated', { kills: p.kills, by: ownerId }); }
  }

  // ---------- inventário ----------
  #tryReload(a) {
    const w = WEAPONS3D[a.weapon];
    if (!w || w.ammo === 'none' || a.reloadT > 0) return;
    const reserve = a.id === 'player' ? (a.inventory.ammo[w.ammo] || 0) : 999;
    if (reserve <= 0 || a.ammoMag >= w.magazine) return;
    a.reloadT = w.reload;
    if (a.id === 'player') this.emit('reload', { weapon: w.name });
  }
  #finishReload(a) {
    const w = WEAPONS3D[a.weapon];
    if (a.id === 'player') {
      const reserve = a.inventory.ammo[w.ammo] || 0;
      const need = Math.min(w.magazine - a.ammoMag, reserve);
      a.ammoMag += need; a.inventory.ammo[w.ammo] = reserve - need;
      this.emit('reloaded', { weapon: w.name, mag: a.ammoMag });
    } else a.ammoMag = w.magazine;
  }
  #useMedkit(a) {
    if (a.inventory.medkit <= 0 || a.life >= 100) return;
    a.inventory.medkit--; a.life = Math.min(100, a.life + 30);
    this.emit('medkit', { life: a.life });
  }
  #interact(a) {
    const item = this.loot.find(i => i.active && dist2d(i.x, i.z, a.x, a.z) < 2.6 && Math.abs(i.y - a.y) < 2.2);
    if (item) { item.active = false; this.#pickup(a, item); return; }
    const t = this.terminals.find(t => t.active && dist2d(t.x, t.z, a.x, a.z) < 3.4);
    if (t) { t.active = false; a.extracted++; a.xp += 250; this.emit('extract', { count: a.extracted, x: t.x, z: t.z }); }
  }
  #pickup(a, item) {
    if (item.kind === 'weapon') {
      const id = item.id, w = WEAPONS3D[id] || WEAPONS3D.g19;
      a.slots[a.activeSlot] = id; a.weapon = id;
      a.ammoMag = Math.min(w.magazine, a.inventory.ammo[w.ammo] || 0);
      if (a.inventory.ammo[w.ammo] > 0) a.inventory.ammo[w.ammo] -= a.ammoMag;
      a.reloadT = 0;
      this.emit('loot', { item: item.name || id, rarity: item.rarity, kind: 'weapon' });
    } else if (item.kind === 'ammo') {
      const cap = AMMO_CAP[item.id] || 100;
      a.inventory.ammo[item.id] = Math.min(cap, (a.inventory.ammo[item.id] || 0) + item.amount);
      this.emit('loot', { item: `${item.amount}× ${item.id}`, kind: 'ammo' });
    } else if (item.kind === 'consumable') {
      a.inventory.medkit = Math.min(5, (a.inventory.medkit || 0) + 1);
      this.emit('loot', { item: 'Kit Médico', kind: 'consumable' });
    } else if (item.kind === 'armor') {
      a.armor = Math.min(100, a.armor + (item.amount || 18));
      this.emit('loot', { item: 'Placa Cerâmica', kind: 'armor' });
    } else if (item.kind === 'resource') {
      a.inventory[item.id] = (a.inventory[item.id] || 0) + (item.amount || 1);
      this.emit('loot', { item: item.id, kind: 'resource' });
    } else if (item.kind === 'frag') {
      a.inventory.frag = Math.min(FRAG.cap, (a.inventory.frag || 0) + 1);
      this.emit('loot', { item: 'Granada FRAG', kind: 'frag' });
    } else if (item.kind === 'gloo') {
      a.inventory.gloo = Math.min(GLOO.cap, (a.inventory.gloo || 0) + 1);
      this.emit('loot', { item: 'Gloo Wall', kind: 'gloo' });
    }
  }
  switchSlot(slot) {
    const a = this.player;
    if (!a.slots[slot]) return false;
    const old = WEAPONS3D[a.weapon];
    if (old && old.ammo !== 'none') a.inventory.ammo[old.ammo] = (a.inventory.ammo[old.ammo] || 0) + a.ammoMag;
    a.activeSlot = slot; a.weapon = a.slots[slot];
    const w = WEAPONS3D[a.weapon];
    a.ammoMag = Math.min(w.magazine, a.inventory.ammo[w.ammo] || 0);
    if (a.inventory.ammo[w.ammo] > 0) a.inventory.ammo[w.ammo] -= a.ammoMag;
    a.reloadT = 0;
    this.emit('weaponSwitch', { weapon: a.weapon });
    return true;
  }

  // ---------- snapshot / replay ----------
  snapshot() {
    return { seed: this.seed, scenarioId: this.scenario.id, tick: this.tick, time: this.time, over: this.over, started: this.started,
      ring: { ...this.ring }, player: structuredClone(this.player),
      bots: this.bots.map(b => { const { ai, ...rest } = b; return rest; }),
      bullets: this.bullets.map(b => ({ ...b })), loot: this.loot.map(i => ({ ...i })),
      grenades: this.grenades.map(g => ({ ...g })), walls: this.walls.map(w => ({ ...w })),
      terminals: this.terminals.map(t => ({ ...t })), replayLength: this.replay.length };
  }
  applySnapshot(s) {
    if (!s) return;
    this.seed = s.seed ?? this.seed; this.tick = s.tick ?? this.tick; this.time = s.time ?? this.time;
    this.over = s.over ?? this.over; this.started = s.started ?? this.started;
    this.ring = { ...this.ring, ...s.ring };
    if (s.player) this.player = structuredClone(s.player);
    this.bots = (s.bots ?? []).map(b => ({ ...b, ai: b.ai ?? { state: 'patrol', think: 0, lostT: 0, strafe: 0, waypoint: null } }));
    this.bullets = (s.bullets ?? []).map(b => ({ ...b }));
    this.loot = (s.loot ?? this.loot).map(i => ({ ...i }));
    this.grenades = (s.grenades ?? this.grenades).map(g => ({ ...g }));
    this.walls = (s.walls ?? this.walls).map(w => ({ ...w }));
    this.#syncPhysicsWorld();
    this.terminals = (s.terminals ?? this.terminals).map(t => ({ ...t }));
  }
  exportReplay() { return { version: 3, mode: '3d', seed: this.seed, scenarioId: this.scenario.id, operativeId: this.player.operativeId, tickRate: this.tickRate, inputs: this.replay }; }
}
