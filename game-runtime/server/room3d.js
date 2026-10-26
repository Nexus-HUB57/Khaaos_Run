// Khaaos Run — MatchRoom3D: sala autoritativa do Battle Royale 3D (CIGKV).
// Humanos + bots preenchem o ring; o servidor é a única autoridade de movimento,
// balística, zona, loot e eliminação. O cliente 3D (src/game3d) apenas envia inputs
// e interpreta snapshots — mesmo contrato "simulação headless → renderizador burro"
// da simulação local, agora com múltiplos operativos.
//
// Reutiliza os helpers de física exportados de src/game3d/sim3d.js para garantir
// que o comportamento online seja idêntico ao offline (mesmas constantes e colisões).
import { SeededRng } from '../src/shared/rng.js';
import { rollLoot } from '../src/shared/weapons.js';
import { ROOM_STATES } from './room.js';
import {
  WORLD, PLAYER_R, MATCH_TIME, PULSE_INTERVAL, WEAPONS3D, AMMO_CAP,
  FRAG, GLOO, DROP_START_Y,
  getWorldLayout, circlePushAabb, rayAabb, rayCharacter, stepActorMovement,
  throwFragProjectile, stepFragProjectile, explosionDamage, glooCollider, glooDeployPlacement,
} from '../src/game3d/sim3d.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export const HEADSHOT_MULT = 1.75;
export const KILL_XP = 120, KILL_XP_HEAD = 180, KILL_KRC = 15;
export const EXTRACT_XP = 250;
export const BOT_SIGHT = 70;

// Fase 3 — netfeel: fila de inputs (predição/reconciliação) e lag compensation.
export const INPUT_DT = 1 / 30;        // cada input cobre 1/30s (cadência do cliente)
export const MAX_INPUTS_PER_TICK = 3;  // 20Hz tick × 3 ≈ 90 inputs/s: drena rajadas sem permitir speedhack
export const INPUT_QUEUE_CAP = 60;     // teto da fila por jogador (~2s de rede degradada)
export const HISTORY_TICKS = 26;       // buffer de posições p/ rewind (~1,3s @ 20Hz)
export const LAG_COMP_MIN_MS = 30, LAG_COMP_MAX_MS = 600;
export const INTERP_DELAY_MS = 110, HALF_TICK_MS = 25; // buffer de interpolação do cliente + meia tick

export class MatchRoom3D {
  constructor({ id, seed, region = 'sa-east', capacity = 16, botFill, airdrop = true } = {}) {
    this.id = id;
    this.seed = String(seed);
    this.region = region;
    this.capacity = capacity;
    this.botFill = Number.isFinite(botFill) ? botFill : capacity - 1;
    this.airdrop = !!airdrop; // Fase 4: infiltração aérea no início da partida
    this.mode = '3d';
    this.is3d = true;
    this.rng = new SeededRng(`${this.seed}:room3d`);
    this.world = getWorldLayout(this.seed);
    this.ring = { x: 0, z: 0, radius: WORLD.ring.radius, target: WORLD.ring.radius, pulse: 0 };
    this.humans = new Map();   // id (client-id) -> actor
    this.players = this.humans; // alias de compatibilidade com o matchmaking/reconexão 2D
    this.bots = [];
    this.bullets = [];
    this.grenades = [];        // Fase 4: granadas FRAG em voo
    this.walls = [];           // Fase 4: Gloo Walls ativas
    this.nextBulletId = 1;
    this.nextThrowableId = 1;
    this.loot = [];
    this.terminals = [];
    this.events = new Map();   // humanId -> [{tick, type, ...}]
    this.tickCount = 0; // contador público no snapshot (método tick(dt) avança a sala)
    this.time = MATCH_TIME;
    this.pulseTimer = 0;
    this.state = ROOM_STATES.LOBBY;
    this.started = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.history = [];         // [{tick, at: [{id,x,y,z}]}] — rewind p/ lag compensation
    // mundo físico da sala: colliders do layout + dinâmicos (Gloo Walls)
    this.physicsWorld = { colliders: this.world.colliders };
  }
  #syncPhysicsWorld() {
    const active = this.walls.filter((w) => w.active).map(glooCollider);
    this.physicsWorld.colliders = active.length ? this.world.colliders.concat(active) : this.world.colliders;
  }

  // ---------- eventos ----------
  #emitTo(humanId, type, payload = {}) {
    if (!this.events.has(humanId)) this.events.set(humanId, []);
    this.events.get(humanId).push({ tick: this.tickCount, type, ...payload });
  }
  #emitAll(type, payload = {}, exceptId = null) {
    for (const id of this.humans.keys()) if (id !== exceptId) this.#emitTo(id, type, payload);
  }
  drainEvents(humanId) {
    const list = this.events.get(humanId) || [];
    this.events.set(humanId, []);
    return list;
  }

  // ---------- spawn ----------
  #baseActor(id, name) {
    return {
      id, name, isBot: false,
      x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0,
      life: 100, armor: 35, xp: 0, krc: 250, kills: 0, extracted: 0,
      speed: 5.2, weapon: 'g19', cooldown: 0, reloadT: 0,
      ammoMag: WEAPONS3D.g19.magazine,
      inventory: { metal: 0, wood: 0, components: 0, medkit: 1, fuel: 0, frag: 1, gloo: 1, ammo: { '9MM': 45 } },
      slots: { 1: 'g19' }, activeSlot: 1,
      alive: true, onGround: true, moving: false, sprinting: false, ads: false,
      stamina: 100, crouching: false, sliding: false, slideT: 0,
      dropPhase: null, dropTarget: null, landed: false,
      lastInput: null, lastSeq: 0, lastProcessedSeq: 0,
      inputQueue: [], rtt: null,
    };
  }
  // Fase 4 — infiltração aérea: ator entra caindo com destino de aterrissagem
  #airdropActor(a, idx, lootSpots) {
    const ang = (idx / 17) * Math.PI * 2 + 0.35;
    const r = 120 + (idx % 3) * 14;
    a.x = Math.cos(ang) * r; a.z = Math.sin(ang) * r;
    a.y = DROP_START_Y + (idx % 4) * 6;
    a.vy = 0; a.onGround = false; a.dropPhase = 'sky';
    a.yaw = Math.atan2(-a.x, -a.z);
    const spot = lootSpots[(idx * 5) % lootSpots.length];
    a.dropTarget = { x: spot.x, z: spot.z };
  }
  addPlayer(id, name = 'OPERATIVO') {
    if (this.state !== ROOM_STATES.LOBBY || this.humans.size >= this.capacity) return null;
    const actor = this.#baseActor(id, String(name).slice(0, 24));
    // posições humanas distribuídas na borda do ring (determinístico por ordem de entrada)
    const angle = (this.humans.size / this.capacity) * Math.PI * 2;
    const radius = 118 + (this.humans.size % 3) * 12;
    actor.x = Math.cos(angle) * radius;
    actor.z = Math.sin(angle) * radius;
    actor.yaw = Math.atan2(-actor.x, -actor.z); // olhando para o centro
    this.humans.set(id, actor);
    this.lastActivity = Date.now();
    return actor;
  }
  removePlayer(id) {
    const actor = this.humans.get(id);
    this.humans.delete(id);
    this.events.delete(id);
    if (actor && this.state === ROOM_STATES.IN_PROGRESS) {
      this.#emitAll('killfeed', { killer: 'CONEXÃO', victim: actor.name, head: false });
    }
    this.lastActivity = Date.now();
  }
  #spawnBot(i) {
    const spot = this.world.botSpawns[i % this.world.botSpawns.length];
    const jx = (this.rng.next() - 0.5) * 10, jz = (this.rng.next() - 0.5) * 10;
    const bot = this.#baseActor(`bot-${String(i + 1).padStart(2, '0')}`, `ZHEERS-${String(i + 1).padStart(2, '0')}`);
    bot.isBot = true;
    bot.x = spot.x + jx; bot.z = spot.z + jz;
    bot.yaw = this.rng.next() * Math.PI * 2;
    bot.armor = 20;
    bot.speed = 4.55;
    bot.weapon = this.rng.pick(['g19', 'mp5', 'm4', 'm4', 'g19']);
    bot.ammoMag = WEAPONS3D[bot.weapon].magazine;
    bot.cooldown = this.rng.next() * 2;
    bot.krc = 0;
    bot.ai = { state: 'patrol', lx: 0, lz: 0, think: 0, lostT: 0, strafe: this.rng.next() * 6.28, waypoint: null };
    return bot;
  }

  // ---------- protocolo ----------
  start(id, entry = 'belt') {
    const actor = this.humans.get(id);
    if (!actor || this.state !== ROOM_STATES.LOBBY) return false;
    if (!['belt', 'rush'].includes(entry)) return false;
    actor.armor = entry === 'belt' ? 60 : 18;
    actor.speed = entry === 'belt' ? 5.2 : 6.1;
    this.state = ROOM_STATES.IN_PROGRESS;
    this.started = true;
    this.loot = this.#spawnLoot();
    this.terminals = this.world.terminals.map((t, i) => ({ id: `zex-${i}`, ...t, active: true }));
    // preenche com bots até a capacidade (botFill limita o máximo de bots)
    const botCount = Math.max(0, Math.min(this.botFill, this.capacity - this.humans.size));
    this.bots = Array.from({ length: botCount }, (_, i) => this.#spawnBot(i));
    // Fase 4 — infiltração aérea: humanos e bots entram caindo do céu
    if (this.airdrop) {
      let idx = 0;
      for (const h of this.humans.values()) this.#airdropActor(h, idx++, this.world.lootSpots);
      for (const b of this.bots) this.#airdropActor(b, idx++, this.world.lootSpots);
    }
    for (const [pid, a] of this.humans) this.#emitTo(pid, 'matchStart', { seed: this.seed, entry, bots: this.bots.length });
    this.#emitAll('pulse', { pulse: 0, target: this.ring.target });
    this.lastActivity = Date.now();
    return true;
  }
  #spawnLoot() {
    // mesmo gerador da sim offline (catálogo/raridades idênticos), remapeado para
    // o formato serializável da sala: id da instância ≠ id do catálogo.
    const zones = ['armory', 'industrial', 'park', 'extraction'];
    const items = Array.from({ length: 24 }, (_, i) => {
      const spot = this.world.lootSpots[i % this.world.lootSpots.length];
      const drop = rollLoot(this.rng, zones[i % zones.length], 1)[0];
      const { id: dropId, weapon, ...rest } = drop;
      return {
        id: `loot-${i}`, x: spot.x, z: spot.z, y: 0.55, ...rest,
        name: drop.kind === 'weapon' ? drop.name : `${dropId}${drop.amount ? ` ×${drop.amount}` : ''}`.toUpperCase(),
        weaponId: drop.kind === 'weapon' ? dropId : undefined,
        ammoId: drop.kind === 'ammo' ? dropId : undefined,
        resourceId: drop.kind === 'resource' ? dropId : undefined,
        active: true,
      };
    });
    // Fase 4 — arremessáveis táticos espalhados deterministamente (FRAG/GLOO)
    const bonus = ['frag', 'gloo', 'frag', 'frag', 'gloo', 'frag'];
    for (let i = 0; i < bonus.length; i++) {
      const spot = this.world.lootSpots[(i * 7 + 3) % this.world.lootSpots.length];
      items.push({ id: `loot-t${i}`, x: spot.x + ((i % 2) - 0.5) * 1.6, z: spot.z + ((i % 3) - 1) * 1.4,
        y: 0.55, kind: bonus[i], name: bonus[i] === 'frag' ? 'Granada FRAG' : 'Gloo Wall', active: true });
    }
    return items;
  }
  input(id, input) {
    const actor = this.humans.get(id);
    if (!actor || !actor.alive || this.state !== ROOM_STATES.IN_PROGRESS) return;
    // rtt (reportado pelo cliente no input) alimenta a lag compensation
    if (Number.isFinite(input?.rtt)) actor.rtt = clamp(input.rtt, 0, 600);
    actor.lastInput = input;
    if (Number.isFinite(input?.seq)) {
      actor.lastSeq = input.seq;
      // fila em ordem de seq: ignora replays/duplicados, limita rajadas
      if (input.seq > (actor.lastQueuedSeq ?? 0)) {
        actor.lastQueuedSeq = input.seq;
        actor.inputQueue.push(input);
        if (actor.inputQueue.length > INPUT_QUEUE_CAP) actor.inputQueue.shift();
      }
    }
  }

  // ---------- tick ----------
  tick(dt = 1 / 20) {
    if (this.state !== ROOM_STATES.IN_PROGRESS) return;
    this.tickCount++;
    this.time = Math.max(0, this.time - dt);

    // --- zona segura (mesmas constantes da sim offline) ---
    this.pulseTimer += dt;
    if (this.pulseTimer >= PULSE_INTERVAL && this.ring.radius > 42) {
      this.pulseTimer = 0;
      this.ring.pulse++;
      this.ring.target = Math.max(42, 168 - this.ring.pulse * 30);
      this.#emitAll('pulse', { pulse: this.ring.pulse, target: this.ring.target });
    }
    if (this.ring.radius > this.ring.target) this.ring.radius = Math.max(this.ring.target, this.ring.radius - dt * 1.15);
    for (const actor of this.#actors()) {
      if (actor.alive && dist2d(actor.x, actor.z, this.ring.x, this.ring.z) > this.ring.radius) {
        this.#damage(actor, (4 + this.ring.pulse * 1.4) * dt, null, 'ring');
      }
    }

    // --- atores: humanos (fila de inputs, até 3 por tick) + bots (IA) ---
    for (const actor of this.humans.values()) {
      if (!actor.alive) continue;
      const queue = actor.inputQueue;
      if (queue.length > 0) {
        const n = Math.min(MAX_INPUTS_PER_TICK, queue.length);
        for (let i = 0; i < n; i++) {
          const input = queue.shift();
          this.#stepActor(actor, input, INPUT_DT);
          if (Number.isFinite(input.seq)) actor.lastProcessedSeq = input.seq;
        }
      } else {
        // sem inputs novos (jogador inativo/conexão instável): passo padrão
        this.#stepActor(actor, actor.lastInput ?? this.defaultInputFor(actor), dt);
      }
    }
    for (const bot of this.bots) if (bot.alive) this.#stepBot(bot, dt);

    // --- histórico de posições p/ lag compensation (após o movimento do tick) ---
    const positions = this.#actors()
      .filter((a) => a.alive)
      .map((a) => ({ id: a.id, x: a.x, y: a.y, z: a.z }));
    this.history.push({ tick: this.tickCount, at: positions });
    if (this.history.length > HISTORY_TICKS) this.history.shift();

    // --- projéteis e arremessáveis ---
    this.#stepBullets(dt);
    this.#stepThrowables(dt);

    // --- fim de partida ---
    const aliveAll = this.#actors().filter((a) => a.alive);
    if (this.time <= 0 || aliveAll.length <= 1 || [...this.humans.values()].every((a) => !a.alive)) {
      this.state = ROOM_STATES.FINISHED;
      // 'eliminated' já foi emitido no momento da morte (#damage); aqui só falta a vitória
      for (const a of this.humans.values()) {
        if (a.alive) this.#emitTo(a.id, 'victory', { kills: a.kills, xp: a.xp, krc: a.krc });
      }
      this.#emitAll('matchEnd', { reason: this.time <= 0 ? 'time' : aliveAll.length <= 1 ? 'last_alive' : 'humans_down' });
    }
    this.lastActivity = Date.now();
  }
  #actors() { return [...this.humans.values(), ...this.bots]; }

  defaultInputFor(actor) {
    return { seq: actor.lastSeq, dx: 0, dy: 0, yaw: actor.yaw, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, slot: 0 };
  }

  // ---------- passo de ator (idêntico à sim offline) ----------
  #stepActor(a, input, dt) {
    a.cooldown = Math.max(0, a.cooldown - dt);
    if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) this.#finishReload(a); }
    a.yaw = input.yaw; a.pitch = input.pitch ?? 0;
    stepActorMovement(a, input, dt, this.physicsWorld);
    if (a.landed) {
      a.landed = false;
      if (!a.isBot) this.#emitTo(a.id, 'land', { x: a.x, z: a.z });
    }
    const airborne = !!a.dropPhase; // sem combate/coleta no ar (Fase 4)
    if (!airborne) {
      const w = WEAPONS3D[a.weapon] ?? WEAPONS3D.g19;
      if (input.reload) this.#tryReload(a);
      if (input.medkit) this.#useMedkit(a);
      if (input.interact) this.#interact(a);
      if (input.throw) this.#throwFrag(a);
      if (input.gloo) this.#deployGloo(a);
      if (input.slot && a.slots[input.slot] && input.slot !== a.activeSlot) this.#switchSlot(a, input.slot);
      if (input.fire && w.category === 'melee') this.#meleeSwing(a, w);
      else if (input.fire) this.#fire(a, w);
    }
  }

  // ---------- arremessáveis táticos (Fase 4) ----------
  #throwFrag(a) {
    if ((a.inventory.frag ?? 0) <= 0 || a.reloadT > 0) return;
    a.inventory.frag--;
    const g = throwFragProjectile(a, this.nextThrowableId++);
    this.grenades.push(g);
    if (!a.isBot) this.#emitTo(a.id, 'frag', { owner: a.id, x: g.x, y: g.y, z: g.z });
    for (const h of this.humans.values()) {
      if (h.id === a.id || !h.alive) continue;
      if (dist2d(h.x, h.z, a.x, a.z) < 90) this.#emitTo(h.id, 'frag', { owner: a.id, x: g.x, y: g.y, z: g.z, isBot: a.isBot });
    }
  }
  #deployGloo(a) {
    if ((a.inventory.gloo ?? 0) <= 0) return;
    const place = glooDeployPlacement(a);
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
    // deploy é global (a parede é visível/replicada para todos)
    for (const h of this.humans.values()) {
      if (!h.alive) continue;
      this.#emitTo(h.id, 'gloo', { owner: a.id, id: wall.id, x: wall.x, z: wall.z, rot: wall.rot, isBot: a.isBot });
    }
  }
  #stepThrowables(dt) {
    for (const g of this.grenades) {
      stepFragProjectile(g, dt, this.physicsWorld.colliders);
      if (g.fuse <= 0) { g.dead = true; this.#detonate(g); }
    }
    this.grenades = this.grenades.filter((g) => !g.dead);
    let changed = false;
    for (const w of this.walls) {
      if (!w.active) continue;
      w.age += dt;
      if (w.hp <= 0 || w.age >= GLOO.duration) {
        w.active = false; changed = true;
        for (const h of this.humans.values()) {
          if (!h.alive) continue;
          if (dist2d(h.x, h.z, w.x, w.z) < 110) this.#emitTo(h.id, 'glooDown', { id: w.id, destroyed: w.hp <= 0 });
        }
      }
    }
    if (changed) this.#syncPhysicsWorld();
  }
  #detonate(g) {
    const actors = this.#actors();
    for (const a of actors) {
      if (!a.alive) continue;
      const dmg = explosionDamage(g.x, g.y, g.z, a, this.physicsWorld.colliders);
      if (dmg <= 0) continue;
      this.#damage(a, dmg, g.owner === a.id ? null : g.owner, 'explosion');
    }
    let changed = false;
    for (const w of this.walls) {
      if (!w.active) continue;
      const box = glooCollider(w);
      const cx = clamp(g.x, box.minX, box.maxX), cz = clamp(g.z, box.minZ, box.maxZ);
      const cy = clamp(g.y, box.yMin, box.yMax);
      const d = Math.hypot(g.x - cx, g.y - cy, g.z - cz);
      if (d <= FRAG.radius) { w.hp -= FRAG.damage * (1 - d / FRAG.radius) * 2; changed = true; }
    }
    if (changed) {
      for (const w of this.walls) {
        if (w.active && w.hp <= 0) {
          w.active = false;
          for (const h of this.humans.values()) {
            if (!h.alive) continue;
            if (dist2d(h.x, h.z, w.x, w.z) < 110) this.#emitTo(h.id, 'glooDown', { id: w.id, destroyed: true });
          }
        }
      }
      this.#syncPhysicsWorld();
    }
    // explosão é evento global próximo (flash/áudio/shake)
    for (const h of this.humans.values()) {
      if (!h.alive) continue;
      if (dist2d(h.x, h.z, g.x, g.z) < 130) this.#emitTo(h.id, 'explosion', { x: g.x, y: g.y, z: g.z, owner: g.owner });
    }
  }
  #switchSlot(a, slot) {
    const old = WEAPONS3D[a.weapon];
    if (old && old.ammo !== 'none') a.inventory.ammo[old.ammo] = (a.inventory.ammo[old.ammo] || 0) + a.ammoMag;
    a.activeSlot = slot; a.weapon = a.slots[slot];
    const w = WEAPONS3D[a.weapon];
    a.ammoMag = Math.min(w.magazine, a.inventory.ammo[w.ammo] || 0);
    if (a.inventory.ammo[w.ammo] > 0) a.inventory.ammo[w.ammo] -= a.ammoMag;
    a.reloadT = 0;
    if (!a.isBot) this.#emitTo(a.id, 'weaponSwitch', { weapon: a.weapon });
  }

  // ---------- IA dos bots (engajar → caçar → patrulhar) ----------
  #stepBot(b, dt) {
    // Fase 4 — na queda: deriva para o destino de aterrissagem, sem combate
    if (b.dropPhase) {
      const tx = b.dropTarget?.x ?? 0, tz = b.dropTarget?.z ?? 0;
      const inAngle = Math.atan2(-(tx - b.x), -(tz - b.z));
      b.yaw += Math.atan2(Math.sin(inAngle - b.yaw), Math.cos(inAngle - b.yaw)) * Math.min(1, dt * 4);
      const dist = dist2d(b.x, b.z, tx, tz);
      this.#stepActor(b, { dx: 0, dy: dist > 6 ? -1 : 0, yaw: b.yaw, pitch: 0 }, dt);
      return;
    }
    // alvo: ator vivo mais próximo com linha de visão
    let target = null, bestD = BOT_SIGHT;
    for (const other of this.#actors()) {
      if (other === b || !other.alive) continue;
      const d = dist2d(b.x, b.z, other.x, other.z);
      if (d < bestD && this.#hasLos(b, other)) { bestD = d; target = other; }
    }
    b.ai.think -= dt;
    if (target) { b.ai.state = 'engage'; b.ai.lostT = 0; b.ai.lx = target.x; b.ai.lz = target.z; b.ai.targetId = target.id; }
    else if (b.ai.state === 'engage') { b.ai.lostT += dt; if (b.ai.lostT > 5) b.ai.state = 'hunt'; }
    if (b.ai.think <= 0) {
      b.ai.think = 0.4 + this.rng.next() * 0.5;
      if (b.ai.state !== 'engage' && (!b.ai.waypoint || dist2d(b.x, b.z, b.ai.waypoint.x, b.ai.waypoint.z) < 6)) {
        const ang = this.rng.next() * Math.PI * 2, rr = this.rng.next() * this.ring.radius * 0.85;
        b.ai.waypoint = { x: clamp(this.ring.x + Math.cos(ang) * rr, -190, 190), z: clamp(this.ring.z + Math.sin(ang) * rr, -190, 190) };
      }
    }
    let tx, tz, run = 0.62;
    if (b.ai.state === 'engage' && target) {
      const ideal = 16;
      const away = bestD < ideal ? -1 : 1;
      b.ai.strafe += dt * 1.7;
      tx = target.x + Math.cos(b.ai.strafe) * away * 6;
      tz = target.z + Math.sin(b.ai.strafe) * away * 6;
      run = 1;
    } else if (b.ai.state === 'hunt') {
      tx = b.ai.lx; tz = b.ai.lz;
      if (dist2d(b.x, b.z, tx, tz) < 5) b.ai.state = 'patrol';
    } else { tx = b.ai.waypoint?.x ?? this.ring.x; tz = b.ai.waypoint?.z ?? this.ring.z; }
    if (dist2d(tx, tz, this.ring.x, this.ring.z) > this.ring.radius * 0.92) {
      const ang = Math.atan2(tz - this.ring.z, tx - this.ring.x);
      tx = this.ring.x + Math.cos(ang) * this.ring.radius * 0.85;
      tz = this.ring.z + Math.sin(ang) * this.ring.radius * 0.85;
    }
    const ax = tx - b.x, az = tz - b.z;
    const inAngle = Math.atan2(-ax, -az);
    b.yaw += Math.atan2(Math.sin(inAngle - b.yaw), Math.cos(inAngle - b.yaw)) * Math.min(1, dt * 6);
    // frente do ator é -Z: para CAMINHAR na direção do yaw o input é dy negativo
    this.#stepActor(b, { dx: 0, dy: -run, yaw: b.yaw, pitch: 0 }, dt);
    const w = WEAPONS3D[b.weapon];
    if (target && b.cooldown <= 0 && b.reloadT <= 0) {
      const err = 0.45 + Math.min(1.2, bestD * 0.012);
      this.#spawnBullet(b, {
        tx: target.x + (this.rng.next() - 0.5) * err * 2,
        ty: target.y + 1.2 + (this.rng.next() - 0.5) * err,
        tz: target.z + (this.rng.next() - 0.5) * err * 2,
      }, 0.012, w, 0.55);
      b.burst = (b.burst ?? 0) + 1;
      if (b.burst >= (w.category === 'sniper' ? 1 : 3 + Math.floor(this.rng.next() * 4))) {
        b.burst = 0; b.cooldown = 1.1 + this.rng.next() * 1.4;
        if (this.rng.next() < 0.25) b.reloadT = w.reload;
      } else b.cooldown = 1 / w.fireRate;
      if (!target.isBot) {
        // som posicional do tiro dos bots para todos os humanos próximos (raio 90m)
        for (const h of this.humans.values()) {
          if (!h.alive) continue;
          if (dist2d(h.x, h.z, b.x, b.z) < 90) this.#emitTo(h.id, 'shot', { owner: b.id, weapon: b.weapon, x: b.x, y: b.y + 1.42, z: b.z, isBot: true });
        }
      }
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
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;
    return { x: a.x + fx * 0.55 + rx * 0.22, y: a.y + 1.42 + Math.sin(a.pitch ?? 0) * 0.3, z: a.z + fz * 0.55 + rz * 0.22 };
  }
  #fire(a, w) {
    if (a.cooldown > 0 || a.reloadT > 0) return false;
    if (w.category === 'melee') return this.#meleeSwing(a, w);
    if (a.ammoMag <= 0) {
      if (!a.isBot) { this.#emitTo(a.id, 'empty', { weapon: w.name }); this.#tryReload(a); }
      return false;
    }
    a.ammoMag--;
    a.cooldown = 1 / w.fireRate;
    const m = this.#muzzle(a);
    const cp = Math.cos(a.pitch ?? 0);
    const vdx = -Math.sin(a.yaw) * cp, vdy = Math.sin(a.pitch ?? 0), vdz = -Math.cos(a.yaw) * cp;
    const conv = Math.min(w.range, 60);
    const ax = a.x + vdx * conv, ay = a.y + 1.55 + vdy * conv, az = a.z + vdz * conv;
    let dx = ax - m.x, dy = ay - m.y, dz = az - m.z;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const spread = a.isBot ? 0
      : w.spread * (a.ads ? 0.35 : 1) * (a.sprinting ? 1.8 : 1) * (a.moving ? 1.35 : 1);
    // lag compensation: tiro humano é testado contra as posições que o ATIRADOR via
    // (rewind de rtt + buffer de interpolação); bots atiram no estado vivo atual.
    const lagTargets = a.isBot ? null : this.#lagTargetsFor(a);
    this.#spawnBullet(a, { dx, dy, dz, ox: m.x, oy: m.y, oz: m.z }, spread, w, 1, lagTargets);
    // áudio/flash do tiro: para o atirador e para humanos próximos (raio 90m)
    for (const h of this.humans.values()) {
      if (!h.alive) continue;
      if (h.id === a.id || dist2d(h.x, h.z, a.x, a.z) < 90) {
        this.#emitTo(h.id, 'shot', { owner: a.id, weapon: a.weapon, x: m.x, y: m.y, z: m.z, isBot: a.isBot });
      }
    }
    return true;
  }
  #spawnBullet(a, dir, spread, w, dmgScale = 1, lagTargets = null) {
    let { dx, dy, dz, ox, oy, oz } = dir;
    if (dir.tx !== undefined) {
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
    this.bullets.push({
      id: this.nextBulletId++, x: ox, y: oy, z: oz,
      vx: dx * w.bulletSpeed, vy: dy * w.bulletSpeed, vz: dz * w.bulletSpeed,
      owner: a.id, damage: w.damage * dmgScale, life: w.range / w.bulletSpeed, weapon: w.id,
      lagTargets,
    });
  }
  // rewind: posições dos outros atores no tick que o atirador estava vendo
  #lagTargetsFor(shooter) {
    if (this.history.length === 0) return null;
    const rtt = Number.isFinite(shooter.rtt) ? shooter.rtt : 90;
    const backMs = clamp(rtt + INTERP_DELAY_MS + HALF_TICK_MS, LAG_COMP_MIN_MS, LAG_COMP_MAX_MS);
    const wantTick = this.tickCount - Math.round(backMs / (1000 / 20));
    let entry = this.history[0];
    for (const h of this.history) {
      if (Math.abs(h.tick - wantTick) < Math.abs(entry.tick - wantTick)) entry = h;
    }
    if (entry.tick >= this.tickCount) return null; // sem rewind disponível ainda
    return entry.at.filter((p) => p.id !== shooter.id).map((p) => ({ ...p }));
  }
  #meleeSwing(a, w) {
    if (a.cooldown > 0) return false;
    a.cooldown = 1 / w.fireRate;
    const reach = 2.4;
    for (const other of this.#actors()) {
      if (other === a || !other.alive) continue;
      if (dist2d(a.x, a.z, other.x, other.z) < reach && Math.abs(a.y - other.y) < 2) {
        const facing = Math.atan2(-Math.sin(a.yaw), -Math.cos(a.yaw));
        const ang = Math.atan2(other.z - a.z, other.x - a.x);
        const diff = Math.abs(Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing)));
        if (diff < 1.2) { this.#damage(other, w.damage, a.id, false); this.#emitTo(a.id, 'melee', { target: other.id }); break; }
      }
    }
    return true;
  }
  #stepBullets(dt) {
    const actors = this.#actors();
    const actorById = new Map(actors.map((a) => [a.id, a]));
    for (const b of this.bullets) {
      b.life -= dt;
      const ox = b.x, oy = b.y, oz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0) { b.life = 0; this.#impactEvent(ox + (b.x - ox) * 0.5, 0.02, oz + (b.z - oz) * 0.5, 'ground', actors); continue; }
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
      if (b.lagTargets) {
        // lag compensation: colide com as posições rebobinadas do tiro;
        // só aplica dano se a vítima ainda estiver viva no presente
        for (const t of b.lagTargets) {
          const real = actorById.get(t.id);
          if (!real || !real.alive || t.id === b.owner) continue;
          const h = rayCharacter(ox, oy, oz, dx, dy, dz, t, len);
          if (h && h.t < charT) { charT = h.t; charHit = { ref: real, head: h.head }; }
        }
      } else {
        for (const actor of actors) {
          if (!actor.alive || actor.id === b.owner) continue;
          const h = rayCharacter(ox, oy, oz, dx, dy, dz, actor, len);
          if (h && h.t < charT) { charT = h.t; charHit = { ref: actor, head: h.head }; }
        }
      }
      if (charHit && charT < hitT) {
        b.life = 0;
        const dmg = b.damage * (charHit.head ? HEADSHOT_MULT : 1);
        const hx = ox + dx * charT, hy = oy + dy * charT, hz = oz + dz * charT;
        this.#damage(charHit.ref, dmg, b.owner, charHit.head ? 'headshot' : 'body');
        this.#impactEvent(hx, hy, hz, 'flesh', actors, charHit.ref, charHit.head, Math.round(dmg), b.owner);
        continue;
      }
      if (hitT < len) {
        b.life = 0;
        // Fase 4 — balas desgastam Gloo Walls (cobertura destrutível)
        if (hitBox?.wallId) {
          const w = this.walls.find((wl) => wl.id === hitBox.wallId && wl.active);
          if (w) w.hp -= b.damage;
        }
        this.#impactEvent(ox + dx * hitT, oy + dy * hitT, oz + dz * hitT, hitBox?.wallId ? 'gloo' : 'wall', actors);
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }
  #impactEvent(x, y, z, kind, actors, victim = null, head = false, damage = 0, owner = undefined) {
    // impactos são entregues apenas a humanos próximos (raio 110m) para economizar banda
    for (const h of this.humans.values()) {
      if (!h.alive) continue;
      const near = dist2d(h.x, h.z, x, z) < 110;
      if (!near) continue;
      if (kind === 'flesh' && victim) this.#emitTo(h.id, 'hit', { x, y, z, victim: victim.id, head, damage, owner, victimIsSelf: victim.id === h.id });
      else this.#emitTo(h.id, 'impact', { x, y, z, kind });
    }
  }
  #damage(actor, dmg, ownerId, kind) {
    if (!actor.alive || dmg <= 0) return;
    if (actor.armor > 0 && kind !== 'ring') { const soak = Math.min(actor.armor, dmg * 0.6); actor.armor -= soak; dmg -= soak; }
    actor.life -= dmg;
    if (ownerId) actor.lastHitBy = ownerId;
    if (!actor.isBot) {
      this.#emitTo(actor.id, 'hurt', { amount: dmg, from: ownerId, kind, life: Math.max(0, actor.life) });
    }
    if (actor.life <= 0) {
      actor.life = 0; actor.alive = false;
      const killer = ownerId ? this.#actors().find((a) => a.id === ownerId) : null;
      if (killer && killer.id !== actor.id) {
        killer.kills++;
        if (!killer.isBot) {
          const head = kind === 'headshot';
          killer.xp += head ? KILL_XP_HEAD : KILL_XP;
          killer.krc += KILL_KRC;
          this.#emitTo(killer.id, 'kill', { target: actor.name, head, xp: head ? KILL_XP_HEAD : KILL_XP, krc: KILL_KRC });
          this.#emitAll('killfeed', { killer: killer.name, victim: actor.name, head }, killer.id);
        } else {
          this.#emitAll('killfeed', { killer: killer.name, victim: actor.name, head: false });
        }
      } else {
        this.#emitAll('killfeed', { killer: kind === 'ring' ? 'RING' : 'CIGKV', victim: actor.name, head: false });
      }
      // feedback imediato de eliminação para a vítima humana (o modal de fim usa este evento)
      if (!actor.isBot) {
        this.#emitTo(actor.id, 'eliminated', { kills: actor.kills, by: killer && killer.id !== actor.id ? killer.name : (kind === 'ring' ? 'RING' : 'CIGKV') });
      }
    }
  }

  // ---------- inventário ----------
  #tryReload(a) {
    const w = WEAPONS3D[a.weapon];
    if (!w || w.ammo === 'none' || a.reloadT > 0) return;
    const reserve = a.isBot ? 999 : (a.inventory.ammo[w.ammo] || 0);
    if (reserve <= 0 || a.ammoMag >= w.magazine) return;
    a.reloadT = w.reload;
    if (!a.isBot) this.#emitTo(a.id, 'reload', { weapon: w.name });
  }
  #finishReload(a) {
    const w = WEAPONS3D[a.weapon];
    if (a.isBot) { a.ammoMag = w.magazine; return; }
    const reserve = a.inventory.ammo[w.ammo] || 0;
    const need = Math.min(w.magazine - a.ammoMag, reserve);
    a.ammoMag += need; a.inventory.ammo[w.ammo] = reserve - need;
    this.#emitTo(a.id, 'reloaded', { weapon: w.name, mag: a.ammoMag });
  }
  #useMedkit(a) {
    if (a.inventory.medkit <= 0 || a.life >= 100) return;
    a.inventory.medkit--; a.life = Math.min(100, a.life + 30);
    if (!a.isBot) this.#emitTo(a.id, 'medkit', { life: a.life });
  }
  #interact(a) {
    const item = this.loot.find((i) => i.active && dist2d(i.x, i.z, a.x, a.z) < 2.6 && Math.abs(i.y - a.y) < 2.2);
    if (item) { item.active = false; this.#pickup(a, item); return; }
    const t = this.terminals.find((t) => t.active && dist2d(t.x, t.z, a.x, a.z) < 3.4);
    if (t) {
      t.active = false; a.extracted++; a.xp += EXTRACT_XP;
      if (!a.isBot) this.#emitTo(a.id, 'extract', { count: a.extracted, x: t.x, z: t.z });
    }
  }
  #pickup(a, item) {
    if (item.kind === 'weapon') {
      const id = item.weaponId || item.id, w = WEAPONS3D[id] || WEAPONS3D.g19;
      a.slots[a.activeSlot] = id; a.weapon = id;
      a.ammoMag = Math.min(w.magazine, a.inventory.ammo[w.ammo] || 0);
      if (a.inventory.ammo[w.ammo] > 0) a.inventory.ammo[w.ammo] -= a.ammoMag;
      a.reloadT = 0;
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: item.name || id, rarity: item.rarity, kind: 'weapon' });
    } else if (item.kind === 'ammo') {
      const cap = AMMO_CAP[item.ammoId] || 100;
      a.inventory.ammo[item.ammoId] = Math.min(cap, (a.inventory.ammo[item.ammoId] || 0) + item.amount);
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: `${item.amount}× ${item.ammoId}`, kind: 'ammo' });
    } else if (item.kind === 'consumable') {
      a.inventory.medkit = Math.min(5, (a.inventory.medkit || 0) + 1);
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: 'Kit Médico', kind: 'consumable' });
    } else if (item.kind === 'armor') {
      a.armor = Math.min(100, a.armor + (item.amount || 18));
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: 'Placa Cerâmica', kind: 'armor' });
    } else if (item.kind === 'resource') {
      a.inventory[item.resourceId] = (a.inventory[item.resourceId] || 0) + (item.amount || 1);
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: item.resourceId, kind: 'resource' });
    } else if (item.kind === 'frag') {
      a.inventory.frag = Math.min(FRAG.cap, (a.inventory.frag || 0) + 1);
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: 'Granada FRAG', kind: 'frag' });
    } else if (item.kind === 'gloo') {
      a.inventory.gloo = Math.min(GLOO.cap, (a.inventory.gloo || 0) + 1);
      if (!a.isBot) this.#emitTo(a.id, 'loot', { item: 'Gloo Wall', kind: 'gloo' });
    }
  }

  // ---------- snapshot ----------
  snapshot(forId) {
    const self = this.humans.get(forId) ?? null;
    const actors = this.#actors();
    return {
      mode: '3d', roomId: this.id, region: this.region, seed: this.seed,
      tick: this.tickCount, time: this.time,
      state: this.state, started: this.started,
      over: this.state === ROOM_STATES.FINISHED,
      ring: { ...this.ring },
      aliveCount: actors.filter((a) => a.alive).length,
      player: self ? this.#selfView(self) : null,
      others: actors.filter((a) => a.id !== forId).map((a) => this.#otherView(a)),
      bullets: this.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, owner: b.owner, weapon: b.weapon })),
      grenades: this.grenades.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, owner: g.owner })),
      walls: this.walls.filter((w) => w.active).map((w) => ({ id: w.id, x: w.x, z: w.z, rot: w.rot, hp: Math.round(w.hp), owner: w.owner })),
      loot: this.loot.map((i) => ({ id: i.id, x: i.x, y: i.y, z: i.z, name: i.name, kind: i.kind, rarity: i.rarity, active: i.active })),
      terminals: this.terminals.map((t) => ({ id: t.id, x: t.x, z: t.z, label: t.label, active: t.active })),
      events: forId ? this.drainEvents(forId) : [],
      online: true,
    };
  }
  #selfView(a) {
    return {
      id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, vy: a.vy, yaw: a.yaw, pitch: a.pitch,
      life: a.life, armor: a.armor, xp: a.xp, krc: a.krc, kills: a.kills, extracted: a.extracted,
      speed: a.speed, weapon: a.weapon, ammoMag: a.ammoMag, reloadT: a.reloadT, activeSlot: a.activeSlot,
      inventory: { ammo: { ...a.inventory.ammo }, medkit: a.inventory.medkit, frag: a.inventory.frag ?? 0, gloo: a.inventory.gloo ?? 0 },
      slots: { ...a.slots }, alive: a.alive, onGround: a.onGround,
      moving: a.moving, sprinting: a.sprinting, ads: a.ads, stamina: a.stamina,
      crouching: a.crouching, sliding: a.sliding, slideT: a.slideT,
      dropPhase: a.dropPhase ?? null,
      ackSeq: a.lastProcessedSeq,
    };
  }
  #otherView(a) {
    return {
      id: a.id, name: a.name, isBot: a.isBot,
      x: a.x, y: a.y, z: a.z, yaw: a.yaw, life: a.life,
      weapon: a.weapon, alive: a.alive, onGround: a.onGround,
      moving: a.moving, sprinting: a.sprinting, ads: a.ads, crouching: a.crouching, sliding: a.sliding, kills: a.kills,
      dropPhase: a.dropPhase ?? null,
    };
  }

  metrics() {
    return {
      id: this.id, mode: this.mode, seed: this.seed, region: this.region,
      players: this.humans.size, capacity: this.capacity,
      bots: this.bots.length, botsAlive: this.bots.filter((b) => b.alive).length,
      state: this.state, started: this.started,
      ageMs: Date.now() - this.createdAt, lastActivityMs: Date.now() - this.lastActivity,
      alive: this.#actors().filter((a) => a.alive).length,
    };
  }
}
