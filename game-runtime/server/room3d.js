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
import { resolveScenario } from '../src/game3d/scenarios.js';
import { ROOM_STATES } from './room.js';
import {
  WORLD, PLAYER_R, MATCH_TIME, PULSE_INTERVAL, WEAPONS3D, AMMO_CAP,
  FRAG, GLOO, DROP_START_Y, DBNO, BOT_COMBAT,
  getWorldLayout, circlePushAabb, rayAabb, rayCharacter, stepActorMovement,
  throwFragProjectile, stepFragProjectile, explosionDamage, glooCollider, glooDeployPlacement,
  knockActor, reviveTargetFor, stepRevive, assignSquads, botAimError, botDamageScale,
  botCanEngage, botTargetModifiers, // Fase 9 — paraquedistas intocáveis (mesma tabela offline)
} from '../src/game3d/sim3d.js';
// Fase 8 — habilidades autoritativas por operativo (mesma tabela da sim offline)
import { OPERATIVE_ABILITIES, getOperativeAbility } from '../src/game3d/operativeAbilities.js';
// Fase 10 — Oficiais de Classe Especial no Ring (7º/9º artigos do POJ)
import { officerDeployment, officerCombatParams, shouldWithdraw } from '../src/game3d/officers.js';
import { SPECIAL_CLASS_OFFICERS } from '../src/game3d/officers.js';
import { PATENTE_HIERARQUIA } from '../src/game3d/poj.js';
// Fase 12 — anúncio autoritativo do trem do ZU (duração canônica compartilhada)
import { TRAIN_INTRO_DURATION_MS } from '../src/shared/clock.js';
// Fase 11 — insígnias OCE jogáveis + patente no nametag (hierarquia canônica do POJ)
const OFFICER_IDS = SPECIAL_CLASS_OFFICERS.map((o) => o.id);

export const OPERATIVE_IDS = Object.keys(OPERATIVE_ABILITIES);
export const ABILITY_TICK_RATE = 30; // convenção de ticks no snapshot (igual à sim offline)

// Fase 11 — distribuição de patentes do efetivo bot (nametag/killfeed):
// base larga nas patências baixas, poucos generais — coerente com a hierarquia.
const BOT_PATENTES = Object.freeze([
  'Recruta', 'Soldado', 'Soldado', 'Cabo', 'Cabo', 'Sargento', 'Sargento',
  'Sargento-Mor', 'Tenente', 'Tenente', 'Capitão', 'Major', 'Coronel', 'General',
]);

// Fase 11 — rótulo de nome com patente (killfeed/feed): "Sargento ZHEERS-03".
// Oficiais OCE já carregam o callsign canônico — não recebem prefixo.
const patenteTag = (a) => (a?.patente && !a.officer ? `${a.patente} ${a.name}` : String(a?.name ?? '—'));

// Parâmetros de combate EFETIVOS dos oficiais: a tabela de elite deriva da
// canônica BOT_COMBAT (mesma curva de decaimento de dano, erro escalado) —
// calculada UMA vez no load, pura e determinística.
const OFFICER_COMBAT_EFFECTIVE = officerCombatParams(BOT_COMBAT);

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
  constructor({ id, seed, region = 'sa-east', capacity = 16, botFill, airdrop = true, scenarioId = 'CIGKV', squad = false, isPrivate = false, inviteCode = null, onMatchEnd = null, officerPlanFn = null } = {}) {
    this.id = id;
    this.seed = String(seed);
    this.region = region;
    // Recompensas KRC: callback único por partida com { matchId, reason,
    // winnerId, winnerName, results } (results = SOMENTE humanos, com id de
    // conexão — o servidor resolve userId). Falha no callback NUNCA propaga
    // para o tick da sala.
    this.onMatchEnd = typeof onMatchEnd === 'function' ? onMatchEnd : null;
    // Fase 10 — plano dos Oficiais de Classe Especial: função injetada pelo
    // servidor (() => pojService.officerPlan()) consultada no INÍCIO da partida;
    // a sala não importa o POJ — permanece desacoplada e testável.
    this.officerPlanFn = typeof officerPlanFn === 'function' ? officerPlanFn : null;
    this.officerMeta = null; // { count, article, deploySeconds, elapsed }
    this.officerClaims = new Map(); // Fase 11 — insígnia OCE → client-id humano (1 por insígnia)
    this.matchIndex = 0;      // nº da partida nesta sala (salas são single-match hoje)
    this.matchId = null;      // "<roomId>#<matchIndex>" — chave de idempotência das recompensas
    this.matchRewarded = false;
    this.capacity = capacity;
    this.botFill = Number.isFinite(botFill) ? botFill : capacity - 1;
    this.airdrop = !!airdrop; // Fase 4: infiltração aérea no início da partida
    this.squad = !!squad;     // Fase 7: squads com DBNO/revive (salas privadas)
    this.isPrivate = !!isPrivate;
    this.inviteCode = inviteCode ? String(inviteCode).toUpperCase() : null;
    this.scenario = resolveScenario(scenarioId);
    this.mode = '3d';
    this.is3d = true;
    this.rng = new SeededRng(`${this.seed}:room3d`);
    this.world = getWorldLayout(this.seed, this.scenario.id);
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
    this.acidTimer = 0;
    this.tsunamiTimer = 0;
    this.tsunamiRemaining = 0;
    this.tsunamiActive = false;
    this.volcanicTimer = 0;
    this.volcanicRemaining = 0;
    this.volcanicActive = false;
    this.quantumTimer = 0;
    this.quantumRemaining = 0;
    this.quantumActive = false;
    this.state = ROOM_STATES.LOBBY;
    this.started = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.history = [];         // [{tick, at: [{id,x,y,z}]}] — rewind p/ lag compensation
    // Fase 14 — log de eventos p/ ESPECTADORES (não-destrutivo, ao contrário
    // das filas por humano): traduzido já no vocabulário do pipeline
    // (ELIMINATION/RING_PHASE) — o pipeline /ws/spectator mescla no batch.
    this.spectatorLog = [];
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
    // Fase 14 — espelho dos eventos de interesse público para a transmissão
    // (killfeed já sai com patente/nome real; pulse vira RING_PHASE).
    if (type === 'killfeed') {
      this.spectatorLogEvent('ELIMINATION', {
        killer: payload.killer ?? '—', victim: payload.victim ?? '—',
        headshot: !!payload.head, knock: !!payload.knock,
      });
    } else if (type === 'pulse') {
      this.spectatorLogEvent('RING_PHASE', { phase: payload.pulse, isShrinking: true });
    }
  }
  // Fase 14 — evento para a transmissão (público: testes/pipeline externo).
  // Ring buffer de 24: batches consomem no máx. 20 eventos por lote.
  spectatorLogEvent(type, data = {}) {
    this.spectatorLog.push({ type, data, timestamp: Date.now() });
    if (this.spectatorLog.length > 24) this.spectatorLog.shift();
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
      speed: 5.2, weapon: 'g19', weaponSkin: null, cooldown: 0, reloadT: 0,
      ammoMag: WEAPONS3D.g19.magazine,
      inventory: { metal: 0, wood: 0, components: 0, medkit: 1, fuel: 0, frag: 1, gloo: 1, ammo: { '9MM': 45 } },
      slots: { 1: 'g19' }, activeSlot: 1,
      alive: true, onGround: true, moving: false, sprinting: false, ads: false,
      stamina: 100, crouching: false, sliding: false, slideT: 0,      dropPhase: null, dropTarget: null, landed: false,
      knocked: false, knockT: 0, reviveProgress: 0, downedCount: 0, lastReviveTick: -1, squad: null,
      // Fase 8 — identidade do operativo + estado de habilidade autoritativo
      operativeId: 'OP_MALE_VANGUARD', temporaryArmor: 0, revealedTicks: 0,
      abilityState: { cooldownT: 0, activeT: 0, effect: null, distanceRemaining: 0, targetIds: [], targetTerminalId: null },
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
  addPlayer(id, name = 'OPERATIVO', operativeId = null) {
    if (this.state !== ROOM_STATES.LOBBY || this.humans.size >= this.capacity) return null;
    const actor = this.#baseActor(id, String(name).slice(0, 24));
    // Fase 8 — identidade: operativo validado contra o catálogo (fallback VANGUARD)
    if (operativeId && OPERATIVE_IDS.includes(operativeId)) actor.operativeId = operativeId;
    // posições humanas distribuídas na borda do ring (determinístico por ordem de entrada)
    const angle = (this.humans.size / this.capacity) * Math.PI * 2;
    const radius = 118 + (this.humans.size % 3) * 12;
    actor.x = Math.cos(angle) * radius;
    actor.z = Math.sin(angle) * radius;
    actor.yaw = Math.atan2(-actor.x, -actor.z); // olhando para o centro
    // Fase 7 — esquadrão humano pela ordem de entrada (grupos de 4, estilo FreeFire)
    if (this.squad) actor.squad = `sq-${Math.floor(this.humans.size / 4) + 1}`;
    this.humans.set(id, actor);
    this.lastActivity = Date.now();
    return actor;
  }
  // Fase 8 — o cliente declara o operativo escolhido (apenas em LOBBY; validado).
  // Fase 11 — Oficiais de Classe Especial JOGÁVEIS: um humano pode reivindicar
  // uma das 3 insígnias OCE quando o regramento autoriza (officerPlan do POJ).
  // A insígnia é ÚNICA por partida (3 slots) e dá identidade dourada, arma,
  // blindagem e velocidade da tabela canônica (officers.js).
  setOperative(id, operativeId) {
    const actor = this.humans.get(id);
    if (!actor || this.state !== ROOM_STATES.LOBBY) return false;
    if (OFFICER_IDS.includes(operativeId)) return this.#claimOfficer(actor, operativeId);
    if (!OPERATIVE_IDS.includes(operativeId)) return false;
    // trocar para operativo regular libera a insígnia OCE reivindicada
    if (actor.officer) { this.officerClaims.delete(actor.officerId ?? actor.operativeId); actor.officer = false; actor.officerCallsign = null; actor.officerId = null; }
    actor.operativeId = operativeId;
    return true;
  }
  // Reivindicação de insígnia OCE por humano — gated pelo plano do POJ (7º/9º).
  // Online a fonte é sempre officerPlanFn (pojService.officerPlan()) — nunca
  // autoridade local; sala sem plano não autoriza (fail-closed).
  #claimOfficer(actor, officerId) {
    const plan = this.officerPlanFn?.() ?? null;
    if (!plan?.allowed) {
      this.#emitTo(actor.id, 'operative_error', { reason: 'oficiais_fora_da_janela', detail: plan?.reason ?? 'sem_plano_de_oficiais' });
      return false;
    }
    if (this.officerClaims.has(officerId) && this.officerClaims.get(officerId) !== actor.id) {
      this.#emitTo(actor.id, 'operative_error', { reason: 'insignia_ocupada', detail: officerId });
      return false;
    }
    const def = SPECIAL_CLASS_OFFICERS.find((o) => o.id === officerId);
    if (!def) return false;
    // liberar insígnia anterior, se trocando entre OCEs
    if (actor.officer && actor.officerId && actor.officerId !== officerId) this.officerClaims.delete(actor.officerId);
    this.officerClaims.set(officerId, actor.id);
    actor.officer = true;
    actor.officerId = officerId;
    actor.officerCallsign = def.callsign;
    actor.operativeId = officerId; // identidade canônica OCE (paleta dourada no cliente)
    actor.weapon = def.weapon;
    actor.ammoMag = WEAPONS3D[def.weapon].magazine;
    actor.armor = def.armor;
    actor.speed = def.speed;
    return true;
  }
  // Fase 11 — patente do perfil no nametag/killfeed (1º critério do 11º artigo).
  // Resolvida pelo servidor a partir do KRC do perfil; bots derivam por tier.
  // Mudança de patente emite evento ao vivo (snapshot do lobby não streama).
  setPatente(id, patente) {
    const actor = this.humans.get(id);
    if (!actor || !PATENTE_HIERARQUIA.includes(patente)) return false;
    const changed = actor.patente !== patente;
    actor.patente = patente;
    if (changed) this.#emitTo(id, 'patente', { patente });
    return true;
  }
  // Fase 12 — evento externo à sala (ex.: court_verdict do POJ) entra pela
  // MESMA fila dos eventos nativos: viaja no próximo snapshot do alvo, sem
  // canal novo e sem quebrar o contrato snapshot/events do cliente.
  emitExternal(humanId, type, payload = {}) {
    if (!this.humans.has(humanId)) return false;
    this.#emitTo(humanId, type, payload);
    return true;
  }
  removePlayer(id) {
    const actor = this.humans.get(id);
    this.humans.delete(id);
    this.events.delete(id);
    if (actor && this.state === ROOM_STATES.IN_PROGRESS) {
      this.#emitAll('killfeed', { killer: 'CONEXÃO', victim: patenteTag(actor), head: false });
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
    // Fase 8 — identidade dos bots: operativo determinístico (paleta/acessórios no cliente)
    bot.operativeId = this.rng.pick(OPERATIVE_IDS);
    // Fase 11 — patente dos bots no nametag/killfeed: derivada do tier do bot
    // (determinística por seed — os mesmos soldados, as mesmas patentes)
    bot.patente = BOT_PATENTES[i % BOT_PATENTES.length];
    // Fase 7 — bots formam esquadrões inimigos próprios (sqE-); não resgatam online
    if (this.squad) bot.squad = `sqE-${Math.floor(i / 4) + 1}`;
    bot.ai = { state: 'patrol', lx: 0, lz: 0, think: 0, lostT: 0, strafe: this.rng.next() * 6.28, waypoint: null, reactT: 0, reactTargetId: null };
    return bot;
  }

  // Fase 10 — Oficial de Classe Especial: entidade de elite com identidade
  // canônica (officers.js), blindagem/velocidade próprias e parâmetros de
  // combate efetivos (OFFICER_COMBAT_EFFECTIVE) — o #stepBot preferirá b.combat.
  #spawnOfficer(def) {
    const spot = this.world.botSpawns[(def.slot + 3) % this.world.botSpawns.length];
    const jx = (this.rng.next() - 0.5) * 10, jz = (this.rng.next() - 0.5) * 10;
    const o = this.#baseActor(`oce-${String(def.slot + 1).padStart(2, '0')}`, def.name);
    o.isBot = true;
    o.officer = true;
    o.officerCallsign = def.callsign;
    o.x = spot.x + jx; o.z = spot.z + jz;
    o.yaw = this.rng.next() * Math.PI * 2;
    o.armor = def.armor;
    o.speed = def.speed;
    o.weapon = def.weapon;
    o.ammoMag = WEAPONS3D[o.weapon].magazine;
    o.cooldown = this.rng.next() * 1.2;
    o.krc = 0;
    o.operativeId = def.operativeId; // identidade visual sincronizada (Fase 8)
    o.combat = OFFICER_COMBAT_EFFECTIVE;
    o.ai = { state: 'patrol', lx: 0, lz: 0, think: 0, lostT: 0, strafe: this.rng.next() * 6.28, waypoint: null, reactT: 0, reactTargetId: null };
    return o;
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
    this.matchIndex += 1;
    this.matchId = `${this.id}#${this.matchIndex}`;
    this.matchRewarded = false;
    this.loot = this.#spawnLoot();
    this.terminals = this.world.terminals.map((t, i) => ({ id: `zex-${i}`, ...t, active: true }));
    // preenche com bots até a capacidade (botFill limita o máximo de bots)
    const botCount = Math.max(0, Math.min(this.botFill, this.capacity - this.humans.size));
    this.bots = Array.from({ length: botCount }, (_, i) => this.#spawnBot(i));
    // Fase 10 — Oficiais de Classe Especial: implantados ACIMA do botFill quando
    // o regramento autoriza (dia 7 de Arukheea — artigos 7º/9º do POJ)
    const deployment = officerDeployment(this.officerPlanFn?.() ?? null);
    if (deployment.length) {
      for (const off of deployment) this.bots.push(this.#spawnOfficer(off));
      this.officerMeta = {
        count: deployment.length, article: deployment[0].article ?? null,
        deploySeconds: deployment[0].deploySeconds, elapsed: 0,
      };
      this.#emitAll('officers_deployed', {
        count: deployment.length, minutesPerRing: deployment[0].minutesPerRing,
        article: this.officerMeta.article, names: deployment.map((o) => o.name),
      });
    }
    // Fase 4 — infiltração aérea: humanos e bots entram caindo do céu
    if (this.airdrop) {
      let idx = 0;
      for (const h of this.humans.values()) this.#airdropActor(h, idx++, this.world.lootSpots);
      for (const b of this.bots) this.#airdropActor(b, idx++, this.world.lootSpots);
    }
    // Fase 12 — anúncio AUTORITATIVO do trem do ZU: startedAt é o relógio do
    // SERVIDOR; cada cliente reconstrói o mesmo frame da cinemática via offset
    // de relógio (ping/pong). Vai no matchStart e no snapshot (reconexão/late
    // join decidem tocar ou pular pelo elapsed).
    this.trainAnnounce = { startedAt: Date.now(), durationMs: TRAIN_INTRO_DURATION_MS };
    for (const [pid, a] of this.humans) this.#emitTo(pid, 'matchStart', { seed: this.seed, entry, bots: this.bots.length, train: this.trainAnnounce });
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
    if (this.scenario.id === 'Barburhen') this.#stepAcidRain(dt);
    if (this.scenario.id === 'Priadus') this.#stepTsunami(dt);
    if (this.scenario.id === 'Ckesalth') this.#stepVolcanicEruption(dt);
    if (this.scenario.id === 'Arukheea') this.#stepGravityAnomaly(dt);

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

    // --- Fase 7 — DBNO: sangramento, cancelamento de revive e mortes finais ---
    for (const actor of this.#actors()) {
      if (!actor.alive || !actor.knocked) continue;
      if ((actor.reviveProgress ?? 0) > 0 && actor.lastReviveTick !== this.tickCount) actor.reviveProgress = 0;
      actor.knockT -= dt;
      if (actor.knockT <= 0) this.#finalizeDeath(actor, null, 'bleedout');
    }

    // --- Fase 10 — retirada dos Oficiais ao fim da duração autorizada (7º/9º) ---
    // A saída NÃO é morte: eles deixam o Ring sem crédito de kill para ninguém
    // (corpos remanescentes de oficiais caídos saem junto — a intervenção acabou).
    if (this.officerMeta) {
      this.officerMeta.elapsed += dt;
      if (this.bots.some((b) => b.officer) && shouldWithdraw(this.officerMeta.elapsed, this.officerMeta.deploySeconds)) {
        this.bots = this.bots.filter((b) => !b.officer);
        this.#emitAll('officers_departed', { reason: 'duracao_autorizada_encerrada', article: this.officerMeta.article });
        this.officerMeta = null;
      }
    }

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
    // Fase 5 — espectador: humanos mortos PERMANECEM na sala acompanhando a partida;
    // o ring encerra apenas por tempo, último vivo ou sala vazia (todos desconectaram).
    if (this.time <= 0 || aliveAll.length <= 1 || this.humans.size === 0) {
      this.state = ROOM_STATES.FINISHED;
      // 'eliminated' já foi emitido no momento da morte (#damage); aqui só falta a vitória
      const winner = aliveAll.sort((a, b) => b.kills - a.kills)[0];
      for (const a of this.humans.values()) {
        if (a.alive) this.#emitTo(a.id, 'victory', { kills: a.kills, xp: a.xp, krc: a.krc });
      }
      this.#emitAll('matchEnd', {
        reason: this.time <= 0 ? 'time' : aliveAll.length <= 1 ? 'last_alive' : 'empty',
        winner: winner?.name ?? 'CIGKV',
      });
      // Recompensas KRC: um único disparo por partida, com resultados dos
      // humanos (id de conexão; o servidor resolve userId e concede via ledger
      // idempotente). Erro do callback é contido — fim de partida já foi emitido.
      if (!this.matchRewarded && this.onMatchEnd) {
        this.matchRewarded = true;
        try {
          const results = [...this.humans.values()].map((a) => ({
            id: a.id, name: a.name, kills: a.kills, krc: a.krc, xp: a.xp,
            survived: a.alive, winner: winner?.id === a.id,
          }));
          this.onMatchEnd({
            matchId: this.matchId ?? `${this.id}#0`,
            reason: this.time <= 0 ? 'time' : aliveAll.length <= 1 ? 'last_alive' : 'empty',
            winnerId: winner?.id ?? null, winnerName: winner?.name ?? 'CIGKV',
            results,
          });
        } catch { /* recompensa nunca derruba o fim de partida */ }
      }
    }
    this.lastActivity = Date.now();
  }
  #actors() { return [...this.humans.values(), ...this.bots]; }

  defaultInputFor(actor) {
    return { seq: actor.lastSeq, dx: 0, dy: 0, yaw: actor.yaw, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false, slot: 0 };  }

  // ---------- passo de ator (idêntico à sim offline) ----------
  #stepActor(a, input, dt) {
    a.cooldown = Math.max(0, a.cooldown - dt);
    // Fase 8 — avanço da habilidade no TEMPO DO ATOR (dt do input), como reloadT/cooldown:
    // 3 inputs/tick × 1/30s = 0,1s por tick — igual à sim offline (1 passo = 1/30s)
    this.#advanceAbilityState(a, dt);
    if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) this.#finishReload(a); }
    a.yaw = input.yaw; a.pitch = input.pitch ?? 0;
    // Fase 8 — derivadas da habilidade ativa (velocidade/dash/precisão),
    // mesma matemática da sim offline; stepActorMovement consome o orçamento do dash.
    this.#applyAbilityDerivatives(a);
    stepActorMovement(a, input, dt, this.physicsWorld);
    if (a.landed) {
      a.landed = false;
      if (!a.isBot) this.#emitTo(a.id, 'land', { x: a.x, z: a.z });
    }
    const airborne = !!a.dropPhase; // sem combate/coleta no ar (Fase 4)
    // Fase 7 — caído: rasteja apenas (sem combate/coleta/revive)
    if (a.knocked) return;
    // Fase 8 — dash: devolve o orçamento remanescente ao estado e encerra ao esgotar
    this.#syncDashBudget(a);
    // Fase 7 — revive: aliado de pé segura INTERAGIR perto de companheiro caído
    if (this.squad && input.interact) this.#tryRevive(a, dt);
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
      if (input.ability) this.#activateAbility(a); // Fase 8 — habilidade autoritativa
    }
  }

  // ---------- Fase 8 — habilidades por operativo (autoridade do servidor) ----------
  #applyAbilityDerivatives(a) {
    const ability = getOperativeAbility(a.operativeId);
    const st = a.abilityState;
    const active = st.activeT > 0;
    a.abilitySpeedMultiplier = active && (ability.effect === 'speed' || ability.effect === 'dash')
      ? ability.parameters.speedMultiplier : 1;
    a.abilityDistanceBudget = active && ability.effect === 'dash' ? st.distanceRemaining : undefined;
    a.abilityAccuracyMultiplier = active && ability.effect === 'precision' ? ability.parameters.accuracyMultiplier : 1;
  }
  #syncDashBudget(a) {
    const ability = getOperativeAbility(a.operativeId);
    if (ability.effect !== 'dash' || a.abilityState.activeT <= 0) return;
    a.abilityState.distanceRemaining = a.abilityDistanceBudget ?? 0;
    if (a.abilityState.distanceRemaining <= 0.001) a.abilityState.activeT = 0;
    delete a.abilityDistanceBudget;
  }
  #advanceAbilityState(a, dt) {
    const st = a.abilityState;
    if (!st) return;
    st.cooldownT = Math.max(0, st.cooldownT - dt);
    if (st.activeT > 0) {
      st.activeT -= dt;
      if (st.activeT <= 0) {
        st.activeT = 0;
        if (st.effect === 'temporaryArmor') a.temporaryArmor = 0;
        st.effect = null;
        st.targetTerminalId = null;
        st.targetIds = [];
      }
    }
    // marca de recon expira (apenas alvos recebem revealedTicks)
    if (a.revealedTicks > 0) a.revealedTicks = Math.max(0, a.revealedTicks - dt);
  }
  #activateAbility(a) {
    const ability = getOperativeAbility(a.operativeId);
    const state = a.abilityState;
    if (!this.started || !a.alive || a.knocked || a.dropPhase || state.cooldownT > 0) return false;
    if (ability.effect === 'heal' && a.life >= 100) {
      this.#emitTo(a.id, 'abilityUnavailable', { reason: 'life_full', name: ability.name });
      return false;
    }

    const params = ability.parameters;
    state.effect = ability.effect;
    state.cooldownT = ability.cooldownSeconds;
    state.activeT = ability.durationSeconds;
    state.distanceRemaining = params.maxDistance ?? 0;
    state.originX = a.x; state.originZ = a.z;
    state.targetIds = []; state.targetTerminalId = null;
    let details = {};
    const others = () => this.#actors().filter((o) => o !== a && o.alive && !(this.squad && o.squad && o.squad === a.squad));

    if (ability.effect === 'heal') {
      const healed = Math.min(params.heal, 100 - a.life);
      a.life += healed;
      details.healed = healed;
    } else if (ability.effect === 'recon') {
      const targets = others().filter((o) => o.isBot && dist2d(a.x, a.z, o.x, o.z) <= params.radius);
      for (const bot of targets) bot.revealedTicks = params.revealSeconds;
      state.targetIds = targets.map((bot) => bot.id);
      details.targets = targets.length;
    } else if (ability.effect === 'stun') {
      const targets = others().filter((o) => o.isBot && dist2d(a.x, a.z, o.x, o.z) <= params.radius);
      for (const bot of targets) bot.ai.stunT = Math.max(bot.ai.stunT ?? 0, params.stunSeconds);
      details.targets = targets.length;
    } else if (ability.effect === 'temporaryArmor') {
      a.temporaryArmor = params.armor;
    } else if (ability.effect === 'ringRead' || ability.effect === 'ringForecast') {
      details.nextPulseSeconds = Math.max(0, PULSE_INTERVAL - this.pulseTimer);
      details.targetRadius = this.ring.radius > 42
        ? Math.max(42, 168 - (this.ring.pulse + 1) * 30)
        : this.ring.radius;
    } else if (ability.effect === 'terminalScan') {
      const terminal = this.terminals.filter((item) => item.active)
        .sort((x, y) => dist2d(a.x, a.z, x.x, x.z) - dist2d(a.x, a.z, y.x, y.z))[0];
      if (terminal) {
        state.targetTerminalId = terminal.id;
        details.terminalLabel = terminal.label || terminal.id;
        details.terminalDistance = Math.round(dist2d(a.x, a.z, terminal.x, terminal.z));
      }
    }

    // evento para o autor (HUD/feed) e para humanos próximos (feedback de presença)
    for (const h of this.humans.values()) {
      if (!h.alive && h.id !== a.id) continue;
      if (h.id !== a.id && dist2d(h.x, h.z, a.x, a.z) > 90) continue;
      this.#emitTo(h.id, 'ability', {
        operativeId: ability.operativeId, by: a.name, isSelf: h.id === a.id,
        name: ability.name, effect: ability.effect,
        durationSeconds: ability.durationSeconds, cooldownSeconds: ability.cooldownSeconds,
        description: ability.description,
        x: a.x, y: a.y, z: a.z, // Fase 9 — posição p/ VFX/SFX (aura no caster remoto)
        ...details,
      });
    }
    if (ability.durationSeconds === 0) state.effect = null;
    return true;
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
    a.weaponSkin = null; // skin pertence à arma coletada, não ao slot
    const w = WEAPONS3D[a.weapon];
    a.ammoMag = Math.min(w.magazine, a.inventory.ammo[w.ammo] || 0);
    if (a.inventory.ammo[w.ammo] > 0) a.inventory.ammo[w.ammo] -= a.ammoMag;
    a.reloadT = 0;
    if (!a.isBot) this.#emitTo(a.id, 'weaponSwitch', { weapon: a.weapon });
  }

  // ---------- IA dos bots (engajar → caçar → patrulhar) ----------
  #stepBot(b, dt) {
    // Fase 8 — atordoado (Pulso de Desarme): bot congelado, sem mover/atirar
    if ((b.ai.stunT ?? 0) > 0) { b.ai.stunT -= dt; b.moving = false; return; }
    // Fase 7 — caído: rasteja rumo ao centro do anel, sem combate
    if (b.knocked) {
      const ang = Math.atan2(b.x, b.z); // yaw apontando para o centro (frente = -Z)
      b.yaw += Math.atan2(Math.sin(ang - b.yaw), Math.cos(ang - b.yaw)) * Math.min(1, dt * 4);
      this.#stepActor(b, { dx: 0, dy: -0.5, yaw: b.yaw, pitch: 0 }, dt);
      return;
    }
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
    // Fase 7 — ignora o próprio esquadrão; prioriza alvos de pé (caídos só quando
    // não há ninguém de pé à vista — finalização). Bots online não resgatam.
    let target = null, bestD = BOT_SIGHT;
    // Fase 10 — parâmetros efetivos do ator: oficiais usam a tabela de elite
    const C = b.combat ?? BOT_COMBAT;
    for (const passKnocked of [false, true]) {
      for (const other of this.#actors()) {
        if (other === b || !other.alive || !!other.knocked !== passKnocked) continue;
        // Fase 9 — paraquedistas intocáveis: queda livre e chute alto fora da seleção
        if (!botCanEngage(other)) continue;
        // Fase 8 — Véu Crepuscular: alvo ocultado é invisível para a IA
        if (other.abilityState?.effect === 'concealment' && other.abilityState.activeT > 0) continue;
        if (this.squad && other.squad === b.squad) continue;
        const d = dist2d(b.x, b.z, other.x, other.z);
        if (d < bestD && this.#hasLos(b, other)) { bestD = d; target = other; }
      }
      if (target) break;
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
    // Fase 7 — tempo de reação ao adquirir um NOVO alvo antes do 1º tiro
    if (target) {
      if (b.ai.reactTargetId !== target.id) {
        b.ai.reactTargetId = target.id;
        b.ai.reactT = C.reactionMin + this.rng.next() * (C.reactionMax - C.reactionMin);
      }
      b.ai.reactT -= dt;
    } else b.ai.reactTargetId = null;
    if (target && b.cooldown <= 0 && b.reloadT <= 0 && (b.ai.reactT ?? 0) <= 0) {
      // Fase 9 — modificadores contra alvo no ar / pós-pouso (paraquedista protegido)
      const mods = botTargetModifiers(target);
      // Fase 10 — erro de elite: mesma forma da curva canônica, parâmetros do ator
      const baseErr = C === BOT_COMBAT ? botAimError(bestD) : Math.min(C.aimErrMax, C.aimErrBase + bestD * C.aimErrPerM);
      const err = baseErr * mods.errMult;
      const dmgScale = botDamageScale(bestD) * mods.dmgMult * (C.dmgMult ?? 1);
      // FIX Fase 5: origem do cano passada explicitamente (sem ela, dir.tx - undefined
      // = NaN — os projéteis dos bots nasciam NaN e nunca acertavam ninguém)
      const m = this.#muzzle(b);
      this.#spawnBullet(b, {
        ox: m.x, oy: m.y, oz: m.z,
        tx: target.x + (this.rng.next() - 0.5) * err * 2,
        ty: target.y + 1.2 + (this.rng.next() - 0.5) * err,
        tz: target.z + (this.rng.next() - 0.5) * err * 2,
      }, 0.012, w, dmgScale);
      b.burst = (b.burst ?? 0) + 1;
      if (b.burst >= (w.category === 'sniper' ? 1 : C.burstMin + Math.floor(this.rng.next() * (C.burstMax - C.burstMin + 1)))) {
        b.burst = 0; b.cooldown = C.burstCooldownMin + this.rng.next() * (C.burstCooldownMax - C.burstCooldownMin);
        if (this.rng.next() < C.reloadChance) b.reloadT = w.reload;
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

  // Fase 7 — canalização de revive (aliado de pé, mesmo esquadrão, no alcance)
  #tryRevive(a, dt) {
    const mate = reviveTargetFor(a, this.#actors());
    if (!mate) return;
    mate.lastReviveTick = this.tickCount;
    if (stepRevive(mate, dt)) {
      for (const h of this.humans.values()) {
        this.#emitTo(h.id, 'revived', { by: a.name, target: mate.id, targetName: mate.name, life: mate.life, isSelf: mate.id === h.id });
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
      : w.spread * (a.ads ? 0.35 : 1) * (a.sprinting ? 1.8 : 1) * (a.moving ? 1.35 : 1) * (a.crouching ? 0.72 : 1)
        * (a.abilityAccuracyMultiplier ?? 1); // Fase 8 — precisão da habilidade
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
      owner: a.id, damage: w.damage * dmgScale, baseDamage: w.damage * dmgScale, distance: 0,
      gravity: (w.ballistic?.gravity ?? 0) * 9.81, drag: w.ballistic?.drag ?? 0,
      life: w.range / w.bulletSpeed, weapon: w.id,
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
      const drag = Math.max(0, 1 - (b.drag ?? 0) * dt * 60);
      b.vy -= (b.gravity ?? 0) * dt;
      b.vx *= drag; b.vy *= drag; b.vz *= drag;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0) { b.life = 0; this.#impactEvent(ox + (b.x - ox) * 0.5, 0.02, oz + (b.z - oz) * 0.5, 'ground', actors); continue; }
      const len = Math.hypot(b.x - ox, b.y - oy, b.z - oz);
      b.distance = (b.distance ?? 0) + len;
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
        const profile = WEAPONS3D[b.weapon]?.ballistic;
        const tFalloff = profile ? Math.max(0, Math.min(1, (b.distance - profile.falloffStart) / Math.max(0.001, profile.falloffEnd - profile.falloffStart))) : 0;
        const falloff = profile ? 1 - tFalloff * (1 - profile.minDamage) : 1;
        const dmg = (b.baseDamage ?? b.damage) * falloff * (charHit.head ? HEADSHOT_MULT : 1);
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
    // impactos são entregues apenas a humanos próximos (raio 110m) para economizar banda;
    // humanos MORTOS também recebem (modo espectador: som/FX perto do corpo/alvo)
    for (const h of this.humans.values()) {
      const near = dist2d(h.x, h.z, x, z) < 110;
      if (!near) continue;
      if (kind === 'flesh' && victim) this.#emitTo(h.id, 'hit', { x, y, z, victim: victim.id, head, damage, owner, victimIsSelf: victim.id === h.id });
      else this.#emitTo(h.id, 'impact', { x, y, z, kind });
    }
  }
  #stepAcidRain(dt) {
    this.acidTimer += dt;
    if (this.acidTimer < 10) return;
    const pulses = Math.floor(this.acidTimer / 10);
    this.acidTimer -= pulses * 10;
    for (let i = 0; i < pulses; i++) {
      for (const actor of this.#actors()) if (actor.alive) this.#damage(actor, 1, null, 'acid');
      this.#emitAll('acidRain', { damage: 1, intervalSeconds: 10 });
    }
  }
  #stepTsunami(dt) {
    const hazard = this.scenario.survival;
    if (!hazard) return;
    if (!this.tsunamiActive) {
      this.tsunamiTimer += dt;
      if (this.tsunamiTimer >= hazard.intervalSeconds) {
        this.tsunamiTimer -= hazard.intervalSeconds;
        this.tsunamiRemaining = hazard.durationSeconds;
        this.tsunamiActive = true;
        this.#emitAll('tsunamiStart', { durationSeconds: hazard.durationSeconds, submergeBelowY: hazard.submergeBelowY });
      }
    }
    if (!this.tsunamiActive) return;
    for (const actor of this.#actors()) {
      if (actor.alive && actor.y < hazard.submergeBelowY) this.#damage(actor, hazard.damagePerSecond * dt, null, 'tsunami');
    }
    this.tsunamiRemaining -= dt;
    if (this.tsunamiRemaining <= 0) {
      this.tsunamiRemaining = 0;
      this.tsunamiActive = false;
      this.#emitAll('tsunamiEnd', {});
    }
  }
  #stepVolcanicEruption(dt) {
    const hazard = this.scenario.survival;
    if (!hazard) return;
    if (!this.volcanicActive) {
      this.volcanicTimer += dt;
      if (this.volcanicTimer >= hazard.intervalSeconds) {
        this.volcanicTimer -= hazard.intervalSeconds;
        this.volcanicRemaining = hazard.durationSeconds;
        this.volcanicActive = true;
        this.#emitAll('eruptionStart', { durationSeconds: hazard.durationSeconds, lavaBelowY: hazard.lavaBelowY });
      }
    }
    if (!this.volcanicActive) return;
    for (const actor of this.#actors()) {
      if (actor.alive && actor.y < hazard.lavaBelowY) this.#damage(actor, hazard.damagePerSecond * dt, null, 'eruption');
    }
    this.volcanicRemaining -= dt;
    if (this.volcanicRemaining <= 0) {
      this.volcanicRemaining = 0;
      this.volcanicActive = false;
      this.#emitAll('eruptionEnd', {});
    }
  }
  #stepGravityAnomaly(dt) {
    const hazard = this.scenario.survival;
    if (!hazard) return;
    if (!this.quantumActive) {
      this.quantumTimer += dt;
      if (this.quantumTimer >= hazard.intervalSeconds) {
        this.quantumTimer -= hazard.intervalSeconds;
        this.quantumRemaining = hazard.durationSeconds;
        this.quantumActive = true;
        this.#emitAll('gravityAnomalyStart', {
          durationSeconds: hazard.durationSeconds,
          gravityScale: hazard.gravityScale,
          anchorRadius: hazard.anchorRadius,
          anchors: hazard.anchors,
        });
      }
    }
    const actors = this.#actors();
    for (const actor of actors) actor.gravityScale = this.quantumActive ? hazard.gravityScale : 1;
    if (!this.quantumActive) return;
    for (const actor of actors) {
      if (!actor.alive || hazard.anchors.some((anchor) => Math.hypot(actor.x - anchor.x, actor.z - anchor.z) <= hazard.anchorRadius)) continue;
      this.#drainQuantumShield(actor, hazard.damagePerSecond * dt);
    }
    this.quantumRemaining -= dt;
    if (this.quantumRemaining <= 0) {
      this.quantumRemaining = 0;
      this.quantumActive = false;
      for (const actor of actors) actor.gravityScale = 1;
      this.#emitAll('gravityAnomalyEnd', {});
    }
  }
  #drainQuantumShield(actor, amount) {
    let remaining = amount;
    const temporary = Math.min(actor.temporaryArmor ?? 0, remaining);
    actor.temporaryArmor = (actor.temporaryArmor ?? 0) - temporary;
    remaining -= temporary;
    const shield = Math.min(actor.armor ?? 0, remaining);
    actor.armor = Math.max(0, (actor.armor ?? 0) - shield);
    remaining -= shield;
    if (remaining > 0) actor.life = Math.max(0, actor.life - remaining);
    if (!actor.isBot) this.#emitTo(actor.id, 'shieldDrain', { amount, anchored: false, life: actor.life, armor: actor.armor });
    if (actor.life <= 0) actor.alive = false;
  }
  #damage(actor, dmg, ownerId, kind) {
    if (!actor.alive || dmg <= 0) return;
    // Fase 8 — mitigação por habilidade (espelha a sim offline): resistência ao Ring,
    // redução de dano direto e blindagem temporária (soak antes da armadura fixa).
    const st = actor.abilityState;
    if (st?.activeT > 0) {
      const ability = getOperativeAbility(actor.operativeId);
      if (kind === 'ring' && st.effect === 'ringResistance') {
        dmg *= 1 - (ability.parameters.ringDamageReduction ?? 0);
      } else if (kind !== 'ring' && st.effect === 'damageReduction') {
        dmg *= 1 - (ability.parameters.damageReduction ?? 0);
      }
    }
    if (kind !== 'ring' && kind !== 'acid' && kind !== 'tsunami' && kind !== 'eruption' && (actor.temporaryArmor ?? 0) > 0) {
      const soakT = Math.min(actor.temporaryArmor, dmg);
      actor.temporaryArmor -= soakT;
      dmg -= soakT;
    }
    if (actor.armor > 0 && kind !== 'ring' && kind !== 'acid' && kind !== 'tsunami' && kind !== 'eruption') { const soak = Math.min(actor.armor, dmg * 0.6); actor.armor -= soak; dmg -= soak; }
    actor.life -= dmg;
    if (ownerId) actor.lastHitBy = ownerId;
    if (!actor.isBot) {
      this.#emitTo(actor.id, 'hurt', { amount: dmg, from: ownerId, kind, life: Math.max(0, actor.life) });
    }
    if (actor.life <= 0) {
      // Fase 7 — squads: primeiro dano letal NOCAUTEIA; dano já caído é letal
      if (this.squad && !actor.knocked) {
        knockActor(actor, ownerId, kind === 'headshot' ? 'headshot' : kind);
        const knocker = ownerId ? this.#actors().find((a) => a.id === ownerId) : null;
        this.#emitAll('killfeed', { killer: knocker ? patenteTag(knocker) : (kind === 'ring' ? 'RING' : 'CIGKV'), victim: patenteTag(actor), head: kind === 'headshot', knock: true });
        if (!actor.isBot) {
          this.#emitTo(actor.id, 'knocked', { by: knocker?.name ?? null, kind, knockT: actor.knockT });
          // nocaute dá XP/KRC parcial ao caçador humano
          if (knocker && !knocker.isBot && knocker.id !== actor.id) {
            knocker.xp += kind === 'headshot' ? 60 : 40;
            knocker.krc += 5;
            this.#emitTo(knocker.id, 'knock', { target: actor.name, head: kind === 'headshot', xp: kind === 'headshot' ? 60 : 40, krc: 5 });
          }
        }
        return;
      }
      this.#finalizeDeath(actor, ownerId, kind);
    }
  }

  // Fase 7 — morte FINAL (finalização, sangramento, ring/caído)
  #finalizeDeath(actor, ownerId, kind) {
    actor.life = 0;
    actor.alive = false;
    actor.knocked = false;
    const killerId = ownerId ?? actor.lastHitBy ?? null;
    const killer = killerId ? this.#actors().find((a) => a.id === killerId) : null;
    if (killer && killer.id !== actor.id) {
      killer.kills++;
      if (!killer.isBot) {
        const head = kind === 'headshot';
        killer.xp += head ? KILL_XP_HEAD : KILL_XP;
        killer.krc += KILL_KRC;
        this.#emitTo(killer.id, 'kill', { target: actor.name, head, xp: head ? KILL_XP_HEAD : KILL_XP, krc: KILL_KRC, finish: kind === 'bleedout' });
      }
      this.#emitAll('killfeed', { killer: killer ? patenteTag(killer) : 'CIGKV', victim: patenteTag(actor), head: kind === 'headshot' });
    } else {
      this.#emitAll('killfeed', { killer: kind === 'ring' ? 'RING' : 'CIGKV', victim: patenteTag(actor), head: false });
    }
    // feedback imediato de eliminação para a vítima humana (o cliente entra em espectador)
    if (!actor.isBot) {
      const placement = this.#actors().filter((a) => a.alive).length + 1;
      this.#emitTo(actor.id, 'eliminated', { kills: actor.kills, placement, by: killer && killer.id !== actor.id ? killer.name : (kind === 'ring' ? 'RING' : 'CIGKV') });
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
      a.weaponSkin = item.rarity ?? null; // Fase 7 — skin por raridade do loot
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
      mode: '3d', roomId: this.id, region: this.region, seed: this.seed, scenarioId: this.scenario.id,
      tick: this.tickCount, time: this.time,
      state: this.state, started: this.started,
      over: this.state === ROOM_STATES.FINISHED,
      survival: { type: this.scenario.survival?.type ?? null, active: this.quantumActive || this.tsunamiActive || this.volcanicActive, remaining: this.quantumRemaining || this.tsunamiRemaining || this.volcanicRemaining, anchors: this.world.quantumAnchors ?? [] },
      ring: { ...this.ring },
      aliveCount: actors.filter((a) => a.alive).length,
      player: self ? this.#selfView(self) : null,
      others: actors.filter((a) => a.id !== forId).map((a) => this.#otherView(a)),
      bullets: this.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, owner: b.owner, weapon: b.weapon })),
      grenades: this.grenades.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, owner: g.owner })),
      walls: this.walls.filter((w) => w.active).map((w) => ({ id: w.id, x: w.x, z: w.z, rot: w.rot, hp: Math.round(w.hp), owner: w.owner })),
      loot: this.loot.map((i) => ({ id: i.id, x: i.x, y: i.y, z: i.z, name: i.name, kind: i.kind, rarity: i.rarity, active: i.active })),
      terminals: this.terminals.map((t) => ({ id: t.id, x: t.x, z: t.z, label: t.label, active: t.active })),
      // Fase 12 — anúncio autoritativo do trem (late join/reconexão sincronizam
      // ou pulam a cinemática pelo elapsed; null antes do primeiro start).
      train: this.trainAnnounce ?? null,
      events: forId ? this.drainEvents(forId) : [],
      online: true,
    };
  }
  // Fase 14 — payload da TRANSMISSÃO (pipeline /ws/spectator): contrato do
  // espectador com NOMES REAIS (displayName) — o standings do HUD mostra o
  // nome do operative/patente, não o id de conexão. Não-destrutivo: não drena
  // filas de eventos dos jogadores; usa o spectatorLog espelhado no #emitAll.
  spectatorView() {
    const actors = this.#actors();
    return {
      type: 'ROOM_TICK',
      roomId: this.id,
      timestamp: Date.now(),
      tick: this.tickCount,
      state: this.state,
      players: actors.map((a) => ({
        id: a.id,
        displayName: a.name ?? a.id,
        species: a.operativeId ?? null,
        posX: a.x, posY: a.z,
        yaw: a.yaw ?? 0,
        health: Math.max(0, Math.round(a.life ?? 0)),
        shield: Math.max(0, Math.round(a.armor ?? 0)),
        isDowned: !!a.knocked && !!a.alive,
        isEliminated: !a.alive,
        kills: a.kills ?? 0,
      })),
      ringState: {
        currentPhase: this.ring.pulse,
        currentRadius: Math.round(this.ring.radius),
        ringCenter: [this.ring.x, 0, this.ring.z],
        isShrinking: this.ring.radius > this.ring.target,
        nextPhaseIn: Math.max(0, Math.round(PULSE_INTERVAL - this.pulseTimer)),
      },
      events: this.spectatorLog.slice(-20).map((e) => ({ ...e })),
    };
  }
  #selfView(a) {
    const st = a.abilityState ?? {};
    return {
      id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, vy: a.vy, yaw: a.yaw, pitch: a.pitch,
      life: a.life, armor: a.armor, xp: a.xp, krc: a.krc, kills: a.kills, extracted: a.extracted,
      speed: a.speed, weapon: a.weapon, weaponSkin: a.weaponSkin ?? null, ammoMag: a.ammoMag, reloadT: a.reloadT, activeSlot: a.activeSlot,
      inventory: { ammo: { ...a.inventory.ammo }, medkit: a.inventory.medkit, frag: a.inventory.frag ?? 0, gloo: a.inventory.gloo ?? 0 },
      slots: { ...a.slots }, alive: a.alive, onGround: a.onGround,
      moving: a.moving, sprinting: a.sprinting, ads: a.ads, stamina: a.stamina,
      crouching: a.crouching, sliding: a.sliding, slideT: a.slideT,      dropPhase: a.dropPhase ?? null,
      knocked: !!a.knocked, knockT: a.knockT ?? 0, reviveProgress: a.reviveProgress ?? 0, downedCount: a.downedCount ?? 0,
      squad: a.squad ?? null,
      // Fase 11 — patente do perfil (nametag/HUD) + identidade OCE reivindicada
      patente: a.patente ?? null, officer: !!a.officer, officerCallsign: a.officerCallsign ?? null,
      // Fase 8 — identidade + habilidade (cooldown/duração em ticks @30Hz p/ HUD)
      operativeId: a.operativeId ?? null, temporaryArmor: a.temporaryArmor ?? 0,
      abilityState: {
        cooldownTicks: Math.round((st.cooldownT ?? 0) * ABILITY_TICK_RATE),
        activeTicks: Math.round((st.activeT ?? 0) * ABILITY_TICK_RATE),
        effect: st.effect ?? null,
      },
      ackSeq: a.lastProcessedSeq,
    };
  }
  #otherView(a) {
    return {
      id: a.id, name: a.name, isBot: a.isBot,
      x: a.x, y: a.y, z: a.z, yaw: a.yaw, life: a.life,
      weapon: a.weapon, weaponSkin: a.weaponSkin ?? null, alive: a.alive, onGround: a.onGround,
      moving: a.moving, sprinting: a.sprinting, ads: a.ads, crouching: a.crouching, sliding: a.sliding, kills: a.kills,      dropPhase: a.dropPhase ?? null,
      knocked: !!a.knocked, squad: a.squad ?? null,
      // Fase 8 — identidade do operativo + marca de recon p/ minimapa
      op: a.operativeId ?? null, revealed: (a.revealedTicks ?? 0) > 0,
      // Fase 10 — marca de Oficial de Classe Especial (render dourado + nametag)
      officer: !!a.officer, officerCallsign: a.officerCallsign ?? null,
      // Fase 11 — patente no nametag dos remotos/bots
      patente: a.patente ?? null,
    };
  }

  metrics() {
    return {
      id: this.id, mode: this.mode, seed: this.seed, region: this.region,
      players: this.humans.size, capacity: this.capacity,
      bots: this.bots.length, botsAlive: this.bots.filter((b) => b.alive).length,
      officers: this.bots.filter((b) => b.officer).length, // Fase 10
      state: this.state, started: this.started,
      private: this.isPrivate, squad: this.squad,
      ageMs: Date.now() - this.createdAt, lastActivityMs: Date.now() - this.lastActivity,
      alive: this.#actors().filter((a) => a.alive).length,
    };
  }
}
