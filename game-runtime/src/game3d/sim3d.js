// Khaaos Run — Simulação 3D headless determinística (CIGKV / Battle Royale TPS)
// Autoridade total da partida: movimento, tiro, zona, loot e eliminação vivem aqui.
// O renderizador (main3d/world3d) apenas interpreta o estado — mesmo contrato da
// simulação 2D (shared/simulation.js), em espaço y-up, unidades em metros.
import { SeededRng } from '../shared/rng.js';
import { WEAPONS, rollLoot } from '../shared/weapons.js';
import { buildWorldLayout } from './layout3d.js';

export const WORLD = { size: 400, ring: { x: 0, z: 0, radius: 170 }, gravity: -22, jumpVel: 7.4 };
export const PLAYER_R = 0.45, PLAYER_H = 1.8, HEAD_Y = 1.5;
export const MATCH_TIME = 600, PULSE_INTERVAL = 45;
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
  jump: false, interact: false, reload: false, medkit: false,
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
  // cápsula aproximada: cilindro vertical r=PLAYER_R, y∈[0, PLAYER_H]
  const mx = ox - ch.x, mz = oz - ch.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (mx * dx + mz * dz), c = mx * mx + mz * mz - PLAYER_R * PLAYER_R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const hy = oy + dy * t;
  if (hy < 0 || hy > PLAYER_H) return null;
  return { t, head: hy > HEAD_Y };
}

// ---------- mundo ----------
const layoutCache = new Map();
export function getWorldLayout(seed) {
  const key = String(seed);
  if (!layoutCache.has(key)) layoutCache.set(key, buildWorldLayout(key));
  return layoutCache.get(key);
}

export class KhaaosSim3D {
  constructor({ seed = 'CIGKV-3D', botCount = 12, tickRate = 30 } = {}) {
    this.seed = String(seed);
    this.rng = new SeededRng(`${this.seed}:sim`);
    this.tickRate = tickRate; this.tick = 0; this.time = MATCH_TIME; this.pulseTimer = 0;
    this.events = []; this.replay = []; this.over = false; this.started = false;
    this.world = getWorldLayout(this.seed);
    this.ring = { x: 0, z: 0, radius: WORLD.ring.radius, target: WORLD.ring.radius, pulse: 0 };
    this.player = this.#spawnPlayer();
    this.bots = Array.from({ length: botCount }, (_, i) => this.#spawnBot(i));
    this.bullets = []; this.nextBulletId = 1;
    this.loot = this.#spawnLoot();
    this.terminals = this.world.terminals.map((t, i) => ({ id: `zex-${i}`, ...t, active: true }));
  }

  // ---------- spawn ----------
  #spawnPlayer() {
    return { id: 'player', name: 'ZHEERS-07', x: 0, y: 0, z: 150, vy: 0, yaw: 0, pitch: 0,
      life: 100, armor: 35, xp: 0, krc: 250, kills: 0, speed: 5.2, weapon: 'g19',
      cooldown: 0, reloadT: 0, ammoMag: WEAPONS3D.g19.magazine,
      inventory: { metal: 0, wood: 0, components: 0, medkit: 1, fuel: 0, ammo: { '9MM': 45 } },
      slots: { 1: 'g19' }, activeSlot: 1, extracted: 0, alive: true, onGround: true, moving: false, sprinting: false, ads: false };
  }
  #spawnBot(i) {
    const spot = this.world.botSpawns[i % this.world.botSpawns.length];
    const jx = (this.rng.next() - .5) * 10, jz = (this.rng.next() - .5) * 10;
    return { id: `bot-${String(i + 1).padStart(2, '0')}`, name: `ZHEERS-${String(i + 1).padStart(2, '0')}`,
      x: spot.x + jx, y: 0, z: spot.z + jz, vy: 0, yaw: this.rng.next() * Math.PI * 2, pitch: 0,
      life: 100, armor: 20, alive: true, onGround: true, moving: false, sprinting: false, ads: false,
      speed: 4.55, weapon: this.rng.pick(['g19', 'mp5', 'm4', 'm4', 'g19']), cooldown: this.rng.next() * 2, reloadT: 0, burst: 0,
      ai: { state: 'patrol', lx: 0, lz: 0, think: 0, lostT: 0, strafe: this.rng.next() * 6.28, waypoint: null } };
  }
  #spawnLoot() {
    const zones = ['armory', 'industrial', 'park', 'extraction'];
    return Array.from({ length: 24 }, (_, i) => {
      const spot = this.world.lootSpots[i % this.world.lootSpots.length];
      const drop = rollLoot(this.rng, zones[i % zones.length], 1)[0];
      return { id: `loot-${i}`, x: spot.x, z: spot.z, y: 0.55, ...drop, active: true };
    });
  }

  // ---------- protocolo ----------
  start(entry = 'belt') {
    this.started = true;
    const p = this.player;
    p.armor = entry === 'belt' ? 60 : 18;
    p.speed = entry === 'belt' ? 5.2 : 6.1;
    this.emit('entry', { entry });
  }
  emit(type, payload = {}) { this.events.push({ tick: this.tick, type, ...payload }); }
  consumeEvents() { const e = this.events; this.events = []; return e; }
  record(input) { this.replay.push({ tick: this.tick, input: { ...DEFAULT_INPUT, ...input } }); }

  step(rawInput = DEFAULT_INPUT, dt = 1 / 30) {
    const input = { ...DEFAULT_INPUT, ...rawInput };
    this.record(input);
    if (this.over || !this.started) return this.snapshot();
    this.tick++; this.time = Math.max(0, this.time - dt);

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
      this.#hurtPlayer((4 + this.ring.pulse * 1.4) * dt, null, 'ring');
    }

    // --- jogador ---
    if (p.alive) this.#stepActor(p, input, dt, true);
    // --- bots ---
    for (const b of this.bots) if (b.alive) this.#stepBot(b, dt);
    // --- projéteis ---
    this.#stepBullets(dt);
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
    a.sprinting = !!(isPlayer && input.sprint && !input.ads);
    a.ads = !!(isPlayer && input.ads);
    const w = WEAPONS3D[a.weapon] ?? WEAPONS3D.g19;
    let sp = a.speed * (a.sprinting ? 1.42 : 1) * (a.ads ? 0.55 : 1);
    if (w.category === 'sniper' && !a.ads) sp *= 0.9;
    const len = Math.hypot(input.dx, input.dy) || 1;
    const mx = (input.dx / len) * sp * dt, mz = (input.dy / len) * sp * dt;
    const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
    a.moving = Math.abs(input.dx) + Math.abs(input.dy) > 0.01;
    // frente do ator: -Z quando yaw=0 (convenção Three.js)
    // rotação local→mundo em torno de Y: [x' = x·cosθ + z·sinθ; z' = -x·sinθ + z·cosθ]
    let nx = a.x + (mx * cos + mz * sin), nz = a.z + (-mx * sin + mz * cos);
    // colisão XZ com o mundo
    for (const box of this.world.colliders) {
      if (box.yMin > a.y + 0.4 && box.yMin > 1.2) continue; // estruturas aéreas não bloqueiam no chão
      const hit = circlePushAabb(nx, nz, PLAYER_R, box);
      if (hit) { nx = hit.x; nz = hit.z; }
    }
    const lim = WORLD.size / 2 - 2;
    a.x = clamp(nx, -lim, lim); a.z = clamp(nz, -lim, lim);
    // vertical
    if (!a.onGround || input.jump) {
      if (a.onGround && input.jump) { a.vy = WORLD.jumpVel; a.onGround = false; }
      a.vy += WORLD.gravity * dt; a.y += a.vy * dt;
      if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
    }
    if (isPlayer) {
      if (input.reload) this.#tryReload(a);
      if (input.medkit) this.#useMedkit(a);
      if (input.interact) this.#interact(a);
      if (input.fire && w.category === 'melee') this.#meleeSwing(a, w);
      else if (input.fire) this.#fire(a, w);
    }
  }

  #stepBot(b, dt) {
    const p = this.player;
    b.ai.think -= dt;
    const d = dist2d(b.x, b.z, p.x, p.z);
    const sees = p.alive && d < 85 && this.#hasLos(b, p);
    if (sees) { b.ai.state = 'engage'; b.ai.lostT = 0; b.ai.lx = p.x; b.ai.lz = p.z; }
    else if (b.ai.state === 'engage') { b.ai.lostT += dt; if (b.ai.lostT > 5) b.ai.state = 'hunt'; }
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
    for (const box of this.world.colliders) {
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
    const spread = isPlayer
      ? w.spread * (a.ads ? 0.35 : 1) * (a.sprinting ? 1.8 : 1) * (a.moving ? 1.35 : 1)
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
      let hitT = Infinity;
      for (const box of this.world.colliders) {
        if (box.noBlock) continue;
        const t = rayAabb(ox, oy, oz, dx, dy, dz, box, len);
        if (t !== null && t < hitT) hitT = t;
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
        this.emit('impact', { x: ox + dx * hitT, y: oy + dy * hitT, z: oz + dz * hitT, kind: 'wall' });
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
        this.player.kills++; this.player.xp += head ? 180 : 120; this.player.krc += 15;
        this.emit('kill', { target: bot.name, head, xp: head ? 180 : 120, krc: 15 });
      } else this.emit('botKill', { target: bot.name });
    }
  }
  #hurtPlayer(dmg, ownerId, kind) {
    const p = this.player;
    if (!p.alive) return;
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
    return { seed: this.seed, tick: this.tick, time: this.time, over: this.over, started: this.started,
      ring: { ...this.ring }, player: structuredClone(this.player),
      bots: this.bots.map(b => { const { ai, ...rest } = b; return rest; }),
      bullets: this.bullets.map(b => ({ ...b })), loot: this.loot.map(i => ({ ...i })),
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
    this.terminals = (s.terminals ?? this.terminals).map(t => ({ ...t }));
  }
  exportReplay() { return { version: 3, mode: '3d', seed: this.seed, tickRate: this.tickRate, inputs: this.replay }; }
}
