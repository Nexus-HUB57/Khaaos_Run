import { GameSimulation, MAP } from '../src/shared/simulation.js';
import { WEAPONS } from '../src/shared/weapons.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const ROOM_STATES = Object.freeze({
  LOBBY: 'LOBBY',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
});

export class MatchRoom {
  constructor({ id, seed, region = 'sa-east', capacity = 16 }) {
    this.id = id;
    this.seed = seed;
    this.region = region;
    this.capacity = capacity;
    this.sim = new GameSimulation({ seed, botCount: 0 });
    this.players = new Map();
    this.projectiles = [];
    this.state = ROOM_STATES.LOBBY;
    this.started = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  addPlayer(id) {
    if (this.state !== ROOM_STATES.LOBBY || this.players.size >= this.capacity) return null;
    const angle = this.sim.rng.next() * Math.PI * 2;
    const rad = 80 + this.sim.rng.next() * 260;
    const player = {
      id,
      x: 550 + Math.cos(angle) * rad,
      y: 330 + Math.sin(angle) * rad,
      r: 12,
      life: 100,
      defense: 35,
      xp: 0,
      krc: 250,
      kills: 0,
      speed: 190,
      weapon: 'g19',
      cooldown: 0,
      inventory: { ammo: { '9MM': 45 } },
      alive: true,
      entry: null,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.lastActivity = Date.now();
  }

  start(id, entry = 'belt') {
    const player = this.players.get(id);
    if (!player || this.state !== ROOM_STATES.LOBBY || !['belt', 'rush'].includes(entry)) return false;
    player.entry = entry;
    player.defense = entry === 'belt' ? 60 : 18;
    player.speed = entry === 'belt' ? 190 : 225;
    this.state = ROOM_STATES.IN_PROGRESS;
    this.started = true;
    return true;
  }

  input(id, input, dt) {
    const player = this.players.get(id);
    if (this.state !== ROOM_STATES.IN_PROGRESS || !player || !player.alive) return;
    const len = Math.hypot(input.dx, input.dy) || 1;
    player.x = clamp(player.x + (input.dx / len) * player.speed * dt, 18, MAP.width - 18);
    player.y = clamp(player.y + (input.dy / len) * player.speed * dt, 18, MAP.height - 18);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (input.fire) this.fire(player, input.aimX, input.aimY);
    if (input.interact) {
      const item = this.sim.loot.find((loot) => loot.active && dist(loot, player) < 30);
      if (item) {
        item.active = false;
        player.xp += 20;
      }
    }
  }

  fire(player, aimX, aimY) {
    if (player.cooldown > 0) return;
    const weapon = WEAPONS[player.weapon];
    if (!weapon || !weapon.projectileSpeed) return;
    const ammo = player.inventory.ammo[weapon.ammo] || 0;
    if (ammo <= 0) return;
    player.inventory.ammo[weapon.ammo]--;
    const angle = Math.atan2(aimY - player.y, aimX - player.x);
    player.cooldown = 1 / weapon.fireRate;
    this.projectiles.push({
      owner: player.id,
      x: player.x,
      y: player.y,
      vx: Math.cos(angle) * weapon.projectileSpeed,
      vy: Math.sin(angle) * weapon.projectileSpeed,
      damage: weapon.damage,
      life: weapon.range / weapon.projectileSpeed,
    });
  }

  tick(dt = 1 / 20) {
    if (this.state !== ROOM_STATES.IN_PROGRESS) return;
    this.sim.tick++;
    this.sim.time = Math.max(0, this.sim.time - dt);
    if (this.sim.time < 480) this.sim.ring.radius = Math.max(this.sim.ring.target, this.sim.ring.radius - dt * 0.42);
    const pulse = Math.floor((600 - this.sim.time) / 40) + 1;
    if (pulse !== this.sim.ring.pulse) {
      this.sim.ring.pulse = pulse;
      this.sim.ring.target = Math.max(110, 430 - pulse * 38);
    }

    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (dist(player, this.sim.ring) > this.sim.ring.radius) {
        if (player.defense > 0) player.defense = Math.max(0, player.defense - dt * 4);
        else player.life -= dt * 3.5;
      }
      if (player.life <= 0) player.alive = false;
    }

    for (const bullet of this.projectiles) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      for (const player of this.players.values()) {
        if (!player.alive || player.id === bullet.owner || dist(player, bullet) >= player.r + 4) continue;
        if (player.defense > 0) player.defense = Math.max(0, player.defense - bullet.damage * 0.28);
        else player.life -= bullet.damage * 0.35;
        bullet.life = 0;
        if (player.life <= 0) {
          player.alive = false;
          const killer = this.players.get(bullet.owner);
          if (killer) {
            killer.kills++;
            killer.xp += 120;
            killer.krc += 15;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((bullet) => bullet.life > 0 && bullet.x > -30 && bullet.x < MAP.width + 30 && bullet.y > -30 && bullet.y < MAP.height + 30);
    if (this.sim.time <= 0 || [...this.players.values()].every((player) => !player.alive)) this.state = ROOM_STATES.FINISHED;
    this.lastActivity = Date.now();
  }

  snapshot(forId) {
    const self = this.players.get(forId);
    return {
      seed: this.seed,
      tick: this.sim.tick,
      state: this.state,
      time: this.sim.time,
      ring: { ...this.sim.ring },
      player: self ? { ...self } : null,
      bots: [...this.players.values()].filter((player) => player.id !== forId).map((player) => ({ ...player })),
      bullets: this.projectiles.map((bullet) => ({ ...bullet })),
      loot: this.sim.loot.map((item) => ({ ...item })),
      terminals: this.sim.terminals.map((terminal) => ({ ...terminal })),
      replayLength: 0,
      roomId: this.id,
      region: this.region,
      online: true,
    };
  }

  metrics() {
    return {
      id: this.id,
      seed: this.seed,
      region: this.region,
      players: this.players.size,
      capacity: this.capacity,
      state: this.state,
      started: this.started,
      ageMs: Date.now() - this.createdAt,
      lastActivityMs: Date.now() - this.lastActivity,
      alive: [...this.players.values()].filter((player) => player.alive).length,
    };
  }
}
