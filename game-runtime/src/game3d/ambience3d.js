// Khaaos Run — Task 67: IDENTIDADE SONORA DOS MUNDOS (ambiência procedural
// de nível sênior). AUDITORIA Task 67: até a F43 a ambiência dos 5 mundos era
// UMA camada — ruído branco → lowpass com filtro por mundo (audio3d.js
// #startAmbient) + chuva highpass estática. A fauna canônica (fauna3d.js:
// ratos, gaivotas, gafanhotos, mosquitos, jacarés, tubarões) era MUDA;
// Arukheea não tinha mar nem gaivotas; Ckesalth não tinha chamas nem
// explosões; os distritos urbanos não tinham ECO, queda de destroços, gritos
// distantes nem passos dentro de um espaço. Este módulo fecha essas lacunas
// SEM tocar no áudio de combate/UI (F4–F42) e SEM arquivos externos: tudo
// sintetizado (WebAudio), determinístico (SeededRng — nada de Math.random) e
// auditável offline (renderAudit → números, não opinião).
//
// Arquitetura:
//   TABELAS PURAS (congeladas; contratos testados em node --test):
//     AMBIENCE_LAYERS — tipos de camada contínua + abafamento em interiores
//     WORLD_AMBIENCE  — identidade POR MUNDO: camadas com peso POR FASE do
//                       anel (cânon safeZone.js), fauna audível, vida urbana
//                       (eco/cânion) e reverb do espaço
//     FAUNA_CALLS     — receitas de vocalização por espécie (síntese)
//     URBAN_CALLS     — receitas de eventos urbanos (destroços, metal, vidro,
//                       grito distante, porta, creak, explosão, trovão)
//   MOTOR (AmbienceEngine):
//     attach()                    — constrói o grafo (camadas + reverb + panners)
//     setWorld/setPhase/setInterior/setUrbanProximity — contratos de estado
//                                   headless (funcionam SEM AudioContext, igual
//                                   ao padrão survivalLayers do audio3d.js)
//     tick(dt, pos)               — listener 3D + proximidade urbana + agenda de
//                                   eventos com RNG semeado (mesma seed → mesma
//                                   trilha — reproduzível em E2E)
//     getSnapshot()               — estado canônico p/ testes e probe __kr
//     static renderAudit()        — OfflineAudioContext: renderiza cada camada
//                                   solo + o mix completo e devolve métricas
//                                   (RMS, pico, razão grave/agudo) — a auditoria
//                                   end-to-end vira número por mundo.

import { SeededRng } from '../shared/rng.js';

// ---------------------------------------------------------------------------
// TABELAS PURAS
// ---------------------------------------------------------------------------

/** Camadas contínuas: damp = multiplicador do ganho em INTERIORES. */
export const AMBIENCE_LAYERS = Object.freeze({
  wind:         Object.freeze({ damp: .42, desc: 'vento do mundo (corpo grave + uivo médio)' }),
  waves:        Object.freeze({ damp: .28, desc: 'mar: ondulação contínua + cristas que quebram' }),
  rain:         Object.freeze({ damp: .30, desc: 'chuva: pancada no material + goteja + sizzle ácido' }),
  fire:         Object.freeze({ damp: .40, desc: 'fogo: rolar grave + crepitar de eventos' }),
  insects:      Object.freeze({ damp: .22, desc: 'cama de insetos (cigarra/gafanhoto) com tremolo' }),
  shimmer:      Object.freeze({ damp: .50, desc: 'aura orgânica (esporos/gravidade)' }),
  hum:          Object.freeze({ damp: .45, desc: 'aura do anel ZU (identidade do mundo)' }),
  urban:        Object.freeze({ damp: .50, desc: 'leito urbano distante + eventos com eco' }),
  // camadas de EVENTO (sem cama contínua): regulam a DENSIDADE de chamadas
  birds:        Object.freeze({ damp: .30, desc: 'densidade de pássaros (coro → esvazia com a fase)' }),
  waterAnimals: Object.freeze({ damp: .25, desc: 'densidade de fauna aquática (rãs/jacaré)' }),
});

/** Espécies audíveis: params de síntese + taxa base (eventos/s). */
export const FAUNA_CALLS = Object.freeze({
  songbird:      Object.freeze({ gain: .20, wet: .35, desc: 'pássaro silvestre (arpejo de gorjeios)' }),
  crow:          Object.freeze({ gain: .17, wet: .45, desc: 'corvo/cança áspera' }),
  woodpecker:    Object.freeze({ gain: .17, wet: .30, desc: 'pica-pau (marteladas no tronco)' }),
  owl:           Object.freeze({ gain: .15, wet: .40, desc: 'coruja (dois pios graves)' }),
  gull:          Object.freeze({ gain: .24, wet: .55, desc: 'gaivota (gritos com glide)' }),
  frog:          Object.freeze({ gain: .12, wet: .35, desc: 'coro de rãs (croacos vibrados)' }),
  crocBellow:    Object.freeze({ gain: .40, wet: .45, desc: 'jacaré (roar grave com growl)' }),
  ratSqueak:     Object.freeze({ gain: .10, wet: .30, desc: 'rato (chilido agudo)' }),
  vultureScreech:Object.freeze({ gain: .17, wet: .55, desc: 'abutre (rasgado ascendente)' }),
  whaleMoan:     Object.freeze({ gain: .28, wet: .45, desc: 'baleia distante (lamento sub)' }),
  locustChirp:   Object.freeze({ gain: .07, wet: .25, desc: 'gafanhoto (série de cliques)' }),
});

/** Eventos urbanos: o pedido do titular — "ecoando coisas caindo, gritos, passos". */
export const URBAN_CALLS = Object.freeze({
  debrisConcrete: Object.freeze({ gain: .30, wet: .65, desc: 'destroço de concreto caindo (baque + escombro)' }),
  metalFall:      Object.freeze({ gain: .26, wet: .70, desc: 'chapa/tubo metálico caindo (clangor inarmônico)' }),
  windowGlass:    Object.freeze({ gain: .18, wet: .70, desc: 'vidro estilhaçando longe' }),
  doorBang:       Object.freeze({ gain: .22, wet: .60, desc: 'porta batendo no vento (tranco + trinco)' }),
  whistleCreak:   Object.freeze({ gain: .14, wet: .75, desc: 'estrutura gemendo (creak metálico)' }),
  screamFar:      Object.freeze({ gain: .09, wet: .85, desc: 'grito humano distante (formantes, horripilante)' }),
  distantExplosion:Object.freeze({ gain: .22, wet: .55, desc: 'explosão remota (sub + rumble)' }),
  thunderFar:     Object.freeze({ gain: .18, wet: .50, desc: 'trovão distante (varredura grave)' }),
});

/**
 * Identidade POR MUNDO. layers[id] = { base, phase:[w0..w4] } — o motor faz
 * ganho = base × phase[fase] × clima × interior. Camadas de evento (birds,
 * waterAnimals) multiplicam a DENSIDADE das chamadas, não o ganho de cama.
 * reverb: rt60 s, color Hz (corpo do IR), wetSfx (passos/tiros no espaço),
 * wetAmb (one-shots da ambiência), taps = ecos discretos (cânion urbano,
 * slap do deserto) em [atraso s, ganho].
 */
export const WORLD_AMBIENCE = Object.freeze({
  CIGKV: Object.freeze({
    label: 'floresta de treinamento militar — coro de pássaros ao amanhecer',
    layers: Object.freeze({
      wind:    Object.freeze({ base: .15, phase: Object.freeze([.9, 1, 1, 1.05, 1.15]), body: 320, howl: 560, howlQ: 8 }),
      birds:   Object.freeze({ base: .34, phase: Object.freeze([1.25, 1, .8, .55, .3]) }),
      insects: Object.freeze({ base: .06, phase: Object.freeze([.55, 1, 1.25, 1.35, 1.45]), freq: 4300 }),
      hum:     Object.freeze({ base: .05, phase: Object.freeze([1, 1, 1.15, 1.35, 1.6]), f: 220 }),
      urban:   Object.freeze({ base: .13, phase: Object.freeze([1, 1, 1.1, 1.25, 1.4]) }),
    }),
    fauna: Object.freeze([Object.freeze(['songbird', .9]), Object.freeze(['crow', .18]),
      Object.freeze(['woodpecker', .14]), Object.freeze(['owl', .06]), Object.freeze(['ratSqueak', .12])]),
    urban: Object.freeze({ calls: Object.freeze([Object.freeze(['debrisConcrete', .09]),
      Object.freeze(['doorBang', .07]), Object.freeze(['whistleCreak', .06]),
      Object.freeze(['screamFar', .03])]), density: .5 }),
    reverb: Object.freeze({ rt60: .9, color: 1400, wetSfx: .12, wetAmb: .35,
      taps: Object.freeze([Object.freeze([.031, .5]), Object.freeze([.047, .34]), Object.freeze([.071, .22])]) }),
  }),
  Barburhen: Object.freeze({
    label: 'ruínas industriais sob chuva ácida — pancada em metal + trovão',
    layers: Object.freeze({
      wind:    Object.freeze({ base: .16, phase: Object.freeze([.9, 1, 1, 1.1, 1.2]), body: 240, howl: 430, howlQ: 7 }),
      rain:    Object.freeze({ base: .34, phase: Object.freeze([1, 1, 1.05, 1.15, 1.25]), patter: 3200, acid: true }),
      birds:   Object.freeze({ base: .10, phase: Object.freeze([1, .85, .7, .5, .3]) }),
      insects: Object.freeze({ base: .05, phase: Object.freeze([.5, 1, 1.2, 1.35, 1.5]), freq: 4600 }),
      hum:     Object.freeze({ base: .05, phase: Object.freeze([1, 1, 1.15, 1.35, 1.6]), f: 185 }),
      urban:   Object.freeze({ base: .18, phase: Object.freeze([1, 1.05, 1.15, 1.25, 1.4]) }),
    }),
    fauna: Object.freeze([Object.freeze(['gull', .16]), Object.freeze(['ratSqueak', .14]),
      Object.freeze(['crow', .1])]),
    urban: Object.freeze({ calls: Object.freeze([Object.freeze(['metalFall', .14]),
      Object.freeze(['whistleCreak', .12]), Object.freeze(['debrisConcrete', .09]),
      Object.freeze(['doorBang', .07]), Object.freeze(['screamFar', .04]),
      Object.freeze(['thunderFar', .09])]), density: .7 }),
    reverb: Object.freeze({ rt60: 1.7, color: 1000, wetSfx: .18, wetAmb: .5,
      taps: Object.freeze([Object.freeze([.038, .55]), Object.freeze([.062, .4]), Object.freeze([.093, .3]), Object.freeze([.131, .2])]) }),
  }),
  Priadus: Object.freeze({
    label: 'selva úmida com esporos — cigarra, rãs e o bellow do jacaré',
    layers: Object.freeze({
      wind:         Object.freeze({ base: .09, phase: Object.freeze([.9, 1, 1.05, 1.1, 1.2]), body: 210, howl: 380, howlQ: 6 }),
      rain:         Object.freeze({ base: .10, phase: Object.freeze([1, 1.05, 1.1, 1.2, 1.3]), patter: 2900, acid: false }),
      insects:      Object.freeze({ base: .17, phase: Object.freeze([.8, 1, 1.2, 1.35, 1.5]), freq: 3800 }),
      waterAnimals: Object.freeze({ base: .30, phase: Object.freeze([1, 1.05, 1.1, 1.15, 1.2]) }),
      shimmer:      Object.freeze({ base: .10, phase: Object.freeze([.8, 1, 1.2, 1.4, 1.6]), f: 196.5 }),
      hum:          Object.freeze({ base: .05, phase: Object.freeze([1, 1, 1.15, 1.35, 1.6]), f: 165 }),
      urban:        Object.freeze({ base: .10, phase: Object.freeze([1, 1, 1.1, 1.2, 1.35]) }),
    }),
    fauna: Object.freeze([Object.freeze(['frog', 1.1]), Object.freeze(['crocBellow', .16]),
      Object.freeze(['owl', .07]), Object.freeze(['ratSqueak', .08])]),
    urban: Object.freeze({ calls: Object.freeze([Object.freeze(['debrisConcrete', .07]),
      Object.freeze(['doorBang', .05]), Object.freeze(['screamFar', .03]),
      Object.freeze(['metalFall', .05])]), density: .3 }),
    reverb: Object.freeze({ rt60: 1.3, color: 800, wetSfx: .2, wetAmb: .45,
      taps: Object.freeze([Object.freeze([.029, .5]), Object.freeze([.051, .3])]) }),
  }),
  Ckesalth: Object.freeze({
    label: 'bacia desértica em chamas — vento de duna, fogo e explosões longe',
    layers: Object.freeze({
      wind:    Object.freeze({ base: .26, phase: Object.freeze([.95, 1, 1.05, 1.15, 1.25]), body: 300, howl: 690, howlQ: 9, sand: .5 }),
      fire:    Object.freeze({ base: .14, phase: Object.freeze([.7, .9, 1.15, 1.5, 1.9]), roar: 220 }),
      insects: Object.freeze({ base: .06, phase: Object.freeze([.6, 1, 1.25, 1.4, 1.55]), freq: 4700 }),
      hum:     Object.freeze({ base: .05, phase: Object.freeze([1, 1, 1.15, 1.35, 1.6]), f: 147 }),
      urban:   Object.freeze({ base: .14, phase: Object.freeze([1, 1.05, 1.15, 1.3, 1.45]) }),
    }),
    fauna: Object.freeze([Object.freeze(['vultureScreech', .09]), Object.freeze(['locustChirp', .3]),
      Object.freeze(['ratSqueak', .05])]),
    urban: Object.freeze({ calls: Object.freeze([Object.freeze(['distantExplosion', .16]),
      Object.freeze(['debrisConcrete', .08]), Object.freeze(['doorBang', .05]),
      Object.freeze(['screamFar', .03]), Object.freeze(['metalFall', .06])]), density: .45 }),
    reverb: Object.freeze({ rt60: .42, color: 2200, wetSfx: .06, wetAmb: .3,
      // slap echoes do deserto: duas réplicas discretas e secas
      taps: Object.freeze([Object.freeze([.09, .34]), Object.freeze([.17, .17])]) }),
  }),
  Arukheea: Object.freeze({
    label: 'ilha costeira — ondas quebrando, gaivotas e o lamento longe',
    layers: Object.freeze({
      waves:   Object.freeze({ base: .26, phase: Object.freeze([.85, 1, 1.35, 1.8, 2.3]), crestRate: .14, tsunami: true }),
      wind:    Object.freeze({ base: .15, phase: Object.freeze([.9, 1, 1.1, 1.25, 1.4]), body: 260, howl: 520, howlQ: 7 }),
      birds:   Object.freeze({ base: .30, phase: Object.freeze([1.15, 1, .85, .6, .4]) }),
      rain:    Object.freeze({ base: .16, phase: Object.freeze([1, 1, 1.05, 1.15, 1.25]), patter: 3400, acid: false }),
      shimmer: Object.freeze({ base: .05, phase: Object.freeze([.8, 1, 1.2, 1.4, 1.6]), f: 174.6 }),
      hum:     Object.freeze({ base: .05, phase: Object.freeze([1, 1, 1.15, 1.35, 1.6]), f: 110 }),
      urban:   Object.freeze({ base: .11, phase: Object.freeze([1, 1, 1.1, 1.2, 1.35]) }),
    }),
    fauna: Object.freeze([Object.freeze(['gull', 1.0]), Object.freeze(['whaleMoan', .05]),
      Object.freeze(['ratSqueak', .06])]),
    urban: Object.freeze({ calls: Object.freeze([Object.freeze(['debrisConcrete', .07]),
      Object.freeze(['doorBang', .05]), Object.freeze(['screamFar', .03]),
      Object.freeze(['windowGlass', .03])]), density: .35 }),
    reverb: Object.freeze({ rt60: 1.2, color: 1500, wetSfx: .12, wetAmb: .4,
      taps: Object.freeze([Object.freeze([.041, .45]), Object.freeze([.077, .28])]) }),
  }),
});

export function worldAmbience(worldId = 'CIGKV') {
  return WORLD_AMBIENCE[worldId] ?? WORLD_AMBIENCE.CIGKV;
}

// ---------------------------------------------------------------------------
// MOTOR
// ---------------------------------------------------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

export class AmbienceEngine {
  constructor(worldId = 'CIGKV', { weather = 'clear', interior = false } = {}) {
    this.ctx = null;          // AudioContext (browser) — null = headless/teste
    this.worldBus = null;     // barramento 'world' do audio3d
    this.sfxBus = null;       // barramento 'sfx' do audio3d (wet de passos)
    this.state = {
      world: worldId, phase: 0, weather, interior: !!interior,
      urbanProximity: 0, layerGains: {}, events: [], attached: false,
    };
    this._t = 0;
    this._rng = new SeededRng(`${worldId}:ambience:T67`);
    this._layers = null;      // grafo contínuo { id → { nodes, gains } }
    this._space = null;       // convolver do mundo
    this._spaceSend = null;   // entrada wet dos one-shots
    this._sfxWet = null;      // entrada wet de SFX (passos/tiros)
    this._districts = null;   // cache dos centros urbanos (layout3d)
  }

  get profile() { return worldAmbience(this.state.world); }
  get sfxWet() { return this._sfxWet; }

  /**
   * Conecta ao AudioContext real. Idempotente e defensivo: em contextos
   * restritos (mocks mínimos dos testes F19, ambientes sem ConvolverNode)
   * o motor permanece em modo ESTADO (identidade auditável via layerGains/
   * events) — só o grafo é abstraído. Nunca quebra o init do GameAudio.
   */
  attach(ctx, worldBus, sfxBus = null) {
    if (!ctx || this.ctx) return false;
    this.ctx = ctx; this.worldBus = worldBus ?? ctx.destination; this.sfxBus = sfxBus;
    try {
      // espaço do mundo: convolver com IR sintetizado (Task 67 — antes não
      // existia ConvolverNode em lugar nenhum do jogo)
      const rev = this.profile.reverb;
      this._space = ctx.createConvolver();
      this._space.buffer = this.#makeIR(rev);
      this._spaceSend = ctx.createGain(); this._spaceSend.gain.value = rev.wetAmb;
      this._spaceSend.connect(this._space);
      this._space.connect(this.worldBus);
      if (sfxBus) {
        this._sfxWet = ctx.createGain(); this._sfxWet.gain.value = rev.wetSfx;
        this._sfxWet.connect(this._space);
      }
      this.#buildLayers();
      this.#applyLayerGains(.05);
      this.state.attached = true;
    } catch {
      this.#disposeLayers();
      for (const n of [this._space, this._spaceSend, this._sfxWet]) { try { n?.disconnect?.(); } catch { /* já solto */ } }
      this._space = this._spaceSend = this._sfxWet = null;
      this.state.attached = false;
      return false;
    }
    return true;
  }

  /** Troca a identidade sonora do mundo (contrato idempotente, headless-safe). */
  setWorld(worldId = 'CIGKV', { weather = 'clear', interior = false } = {}) {
    const changed = this.state.world !== worldId
      || this.state.weather !== weather
      || this.state.interior !== !!interior;
    this.state.world = worldId;
    this.state.weather = weather;
    this.state.interior = !!interior;
    this._rng = new SeededRng(`${worldId}:ambience:T67`);
    this.state.events.length = 0;
    this.#refreshStateGains();
    if (this.ctx && changed) {
      this.#disposeLayers();
      if (this._space) { try { this._space.disconnect(); } catch { /* já solto */ } }
      const rev = this.profile.reverb;
      this._space.buffer = this.#makeIR(rev);
      this._spaceSend.gain.value = rev.wetAmb;
      if (this._sfxWet) this._sfxWet.gain.value = rev.wetSfx;
      this._space.connect(this.worldBus);
      this.#buildLayers();
    }
    if (this.ctx) this.#applyLayerGains(.05);
    return this.getSnapshot();
  }

  /** Fase canônica do anel (0..4 — cânon safeZone.js) com crossfade suave. */
  setPhase(idx = 0) {
    this.state.phase = Math.min(4, Math.max(0, Math.floor(idx)));
    this.#refreshStateGains();
    if (this.ctx) this.#applyLayerGains(.9);
    return this.state.phase;
  }

  setInterior(on = false) {
    this.state.interior = !!on;
    this.#refreshStateGains();
    if (this.ctx) this.#applyLayerGains(.5);
    return this.state.interior;
  }

  setUrbanProximity(v = 0) {
    this.state.urbanProximity = clamp01(Number(v) || 0);
    this.#refreshStateGains();
    if (this.ctx && this._layers?.urban) {
      this._layers.urban.gain.gain.setTargetAtTime(this.#layerTarget('urban'), this.ctx.currentTime, .4);
    }
    return this.state.urbanProximity;
  }

  setDistricts(districts = null) { this._districts = Array.isArray(districts) ? districts : null; }

  /**
   * Atualiza listener 3D + proximidade urbana + agenda de eventos.
   * Headless (sem ctx) a agenda CONTINUA registrada no contrato de estado
   * (mesma filosofia do survivalLayers do audio3d.js) — só a síntese é no-op.
   */
  tick(dt = 0, pos = {}) {
    this._t += dt;
    if (Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
      this.setListenerPos(pos.x, pos.z, pos.yaw ?? 0);
      if (Array.isArray(pos.districts)) this.setDistricts(pos.districts);
      if (this._districts?.length) this.setUrbanProximity(this.#urbanAt(pos.x, pos.z));
    }
    this.#scheduleEvents(dt, this.ctx ? this.ctx.currentTime : this._t);
    return this.getSnapshot();
  }

  dispose() {
    this.#disposeLayers();
    for (const n of [this._space, this._spaceSend, this._sfxWet]) {
      try { n?.disconnect?.(); } catch { /* já solto */ }
    }
    this._space = this._spaceSend = this._sfxWet = null;
    this.ctx = null; this.state.attached = false;
  }

  getSnapshot() {
    const s = this.state;
    return {
      world: s.world, phase: s.phase, weather: s.weather, interior: s.interior,
      urbanProximity: r3(s.urbanProximity), attached: s.attached,
      layerGains: { ...s.layerGains }, events: s.events.slice(-12),
    };
  }

  // ---------- internals: estado e ganhos ----------

  /** Espelho dos ganhos no CONTRATO DE ESTADO (vale headless e live). */
  #refreshStateGains() {
    for (const id of Object.keys(this.profile.layers)) {
      this.state.layerGains[id] = r3(this.#layerTarget(id));
    }
  }

  #layerTarget(id) {
    const p = this.profile;
    const l = p.layers[id];
    if (!l) return 0;
    let g = l.base * (l.phase?.[this.state.phase] ?? 1);
    if (this.state.weather === 'clear' && id === 'rain') g = 0;
    if (this.state.interior) g *= AMBIENCE_LAYERS[id]?.damp ?? 1;
    if (id === 'urban') g *= .25 + .75 * this.state.urbanProximity;
    return Math.max(0, Number.isFinite(g) ? g : 0);
  }

  #applyLayerGains(tau = .7) {
    if (!this.ctx || !this._layers) return;
    const t = this.ctx.currentTime;
    for (const [id, layer] of Object.entries(this._layers)) {
      const target = this.#layerTarget(id);
      layer.gain.gain.setTargetAtTime(target, t, tau);
      this.state.layerGains[id] = r3(target);
    }
  }

  #setListener(x, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // yaw=0 olha −Z (Three.js)
    const L = this.ctx.listener;
    try {
      if (L.positionX) {
        L.positionX.value = x; L.positionY.value = 0; L.positionZ.value = z;
        L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else {
        L.setPosition?.(x, 0, z);
        L.setOrientation?.(fx, 0, fz, 0, 1, 0);
      }
    } catch { /* listener só de leitura em alguns contextos */ }
  }

  #urbanAt(x, z) {
    let best = 0;
    for (const d of this._districts ?? []) {
      const dist = Math.hypot(x - (d.cx ?? 0), z - (d.cz ?? 0));
      best = Math.max(best, clamp01(1 - (dist - 55) / 85)); // cheio ≤55 m, zero ≥140 m
    }
    return best;
  }

  // ---------- internals: grafo de camadas contínuas ----------

  #buildLayers() {
    if (!this.ctx) return;
    const ctx = this.ctx, p = this.profile;
    this._layers = {};
    for (const id of Object.keys(p.layers)) {
      const cfg = p.layers[id];
      if (id === 'birds' || id === 'waterAnimals') continue; // camadas de evento
      if (id === 'rain' && this.state.weather === 'clear') continue; // sem clima, sem chuva (economia de nós)
      const gain = ctx.createGain(); gain.gain.value = this.#layerTarget(id);
      gain.connect(this.worldBus);
      const nodes = [];
      const lfo = (freq, depth, dest) => {
        const o = ctx.createOscillator(); o.frequency.value = freq;
        const g = ctx.createGain(); g.gain.value = depth;
        o.connect(g); g.connect(dest); o.start(); nodes.push(o, g);
        return o;
      };
      const noiseSrc = () => {
        const s = ctx.createBufferSource(); s.buffer = this.#noise(.6 + this._rng.next() * .9);
        s.loop = true; s.start(); nodes.push(s); return s;
      };
      if (id === 'wind') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.body; lp.Q.value = .6;
        noiseSrc().connect(lp); lp.connect(gain);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = cfg.howl; bp.Q.value = cfg.howlQ;
        noiseSrc().connect(bp); bp.connect(gain);
        this._windHowl = bp; this._windHowlAt = 0;
        lfo(.07 + this._rng.next() * .06, gain.gain.value * .3, gain.gain);
        if (cfg.sand) { // chiado de areia na duna (Ckesalth)
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200; hp.Q.value = .4;
          const sg = ctx.createGain(); sg.gain.value = cfg.sand * .5;
          noiseSrc().connect(hp); hp.connect(sg); sg.connect(gain); nodes.push(hp, sg);
        }
      } else if (id === 'waves') {
        const s = ctx.createBufferSource(); s.buffer = this.#brown(3); s.loop = true; s.start();
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 470; lp.Q.value = .5;
        s.connect(lp); lp.connect(gain); nodes.push(s, lp);
        this._waveSwell = lfo(.085, this.#layerTarget(id) * .45, gain.gain);
        this._waveCrestAt = 0;
      } else if (id === 'rain') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = cfg.patter; bp.Q.value = .35;
        noiseSrc().connect(bp); bp.connect(gain);
        if (cfg.acid) { // sizzle corrosivo da chuva ácida (Barburhen)
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6200; hp.Q.value = .4;
          const sg = ctx.createGain(); sg.gain.value = .5;
          noiseSrc().connect(hp); hp.connect(sg); sg.connect(gain); nodes.push(hp, sg);
          lfo(.5, .2, sg.gain);
        }
        this._rainDripAt = 0;
      } else if (id === 'fire') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.roar; lp.Q.value = .7;
        noiseSrc().connect(lp); lp.connect(gain);
        lfo(.37, gain.gain.value * .4, gain.gain);
        this._fireCrackleAt = 0;
      } else if (id === 'insects') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = cfg.freq; bp.Q.value = 3.5;
        noiseSrc().connect(bp); bp.connect(gain);
        lfo(24, this.#layerTarget(id) * .4, gain.gain);
        lfo(.27, this.#layerTarget(id) * .25, gain.gain);
        this._insectChirpAt = 0;
      } else if (id === 'shimmer' || id === 'hum') {
        const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = cfg.f;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = cfg.f * 1.007;
        o1.connect(gain); o2.connect(gain); o1.start(); o2.start(); nodes.push(o1, o2);
        const hi = ctx.createOscillator(); hi.type = 'sine'; hi.frequency.value = cfg.f * 6;
        const hg = ctx.createGain(); hg.gain.value = .18;
        hi.connect(hg); hg.connect(gain); hi.start(); nodes.push(hi, hg);
        lfo(1.7, .1, hg.gain);
      } else if (id === 'urban') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = .6;
        const s = ctx.createBufferSource(); s.buffer = this.#brown(3); s.loop = true; s.start();
        s.connect(lp); lp.connect(gain); nodes.push(s, lp);
        this._urbanEventAt = 0;
      }
      this._layers[id] = { gain, nodes };
      this.state.layerGains[id] = r3(this.#layerTarget(id));
    }
  }

  #disposeLayers() {
    if (!this._layers) return;
    for (const { nodes, gain } of Object.values(this._layers)) {
      for (const n of nodes) { try { n.stop?.(); } catch { /* já parado */ } try { n.disconnect?.(); } catch { /* já solto */ } }
      try { gain.disconnect?.(); } catch { /* já solto */ }
    }
    this._layers = null;
  }

  // ---------- internals: buffers/IR sintetizados ----------

  #noise(dur = .8) {
    const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
    const d = buf.getChannelData(0);
    const rng = this._rng;
    for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
    return buf;
  }

  #brown(dur = 3) {
    const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    const rng = this._rng; let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rng.next() * 2 - 1;
      last = (last + .02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  /** IR procedural: cauda exponencial (rt60) + COR (lowpass 1-pólo no
   *  cutoff `color` Hz) + reflexos discretos (taps) — cânon do espaço. */
  #makeIR({ rt60 = 1, color = 1200, taps = [] } = {}) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * Math.min(4, Math.max(.3, rt60 * 1.6)));
    const buf = this.ctx.createBuffer(2, len, sr);
    const rng = this._rng;
    const a = 1 - Math.exp(-2 * Math.PI * color / sr); // cutoff do corpo do IR
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const w = rng.next() * 2 - 1;
        lp += a * (w - lp);
        const env = Math.exp(-6.9 * (i / sr) / rt60);
        d[i] = lp * env;
      }
      for (const [at, g] of taps) {
        const idx = Math.min(len - 1, Math.floor(at * sr));
        if (idx >= 0) d[idx] += (rng.next() * 2 - 1) * g;
      }
    }
    return buf;
  }

  // ---------- internals: síntese de one-shots ----------

  #panner(x, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 10; p.rolloffFactor = 1.3; p.maxDistance = 220;
    try {
      if (p.positionX) { p.positionX.value = x; p.positionY.value = 0; p.positionZ.value = z; }
      else p.setPosition?.(x, 0, z);
    } catch { /* posição fixa */ }
    p.connect(this.worldBus);
    p.connect(this._spaceSend);
    return p;
  }

  /** Envelope padrão (attack/decay exponencial) — mesmo vocabulário do audio3d. */
  #env(g, t0, attack, decay, peak) {
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(Math.max(.0001, peak), t0 + Math.max(.001, attack));
    g.gain.exponentialRampToValueAtTime(.0005, t0 + Math.max(.001, attack) + Math.max(.01, decay));
  }

  #tone({ when, type = 'sine', f0, f1 = f0, at = 0, dur = .2, attack = .005, peak = .3, filter = null, q = 1, trem = null, pan = null }) {
    const ctx = this.ctx, t0 = when + at;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    let tail = osc;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = q; f.frequency.value = Math.max(40, f1 === f0 ? f0 : (f0 + f1) / 2); osc.connect(f); tail = f; }
    const g = ctx.createGain();
    this.#env(g, t0, attack, dur, peak);
    if (trem) { const o = ctx.createOscillator(); o.frequency.value = trem.f; const tg = ctx.createGain(); tg.gain.value = peak * trem.d; o.connect(tg); tg.connect(g.gain); o.start(t0); o.stop(t0 + dur + .3); }
    tail.connect(g);
    const dest = pan ? this.#panner(pan.x, pan.z) : this.worldBus;
    g.connect(dest);
    osc.start(t0); osc.stop(t0 + dur + .3);
    return osc;
  }

  #noiseHit({ when, at = 0, dur = .2, attack = .004, peak = .3, f0, f1 = f0, type = 'bandpass', q = 1, wet = 0, pan = null }) {
    const ctx = this.ctx, t0 = when + at;
    const src = ctx.createBufferSource(); src.buffer = this.#noise(dur * 1.4 + .05);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(30, f0), t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ctx.createGain();
    this.#env(g, t0, attack, dur, peak);
    src.connect(f); f.connect(g);
    const dest = pan ? this.#panner(pan.x, pan.z) : this.worldBus;
    g.connect(dest);
    if (wet > 0 && this._spaceSend) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this._spaceSend); }
    src.start(t0); src.stop(t0 + dur * 1.4 + .1);
  }

  /** Dispara uma chamada de fauna no instante `when` (world coords p/ panner).
   *  Headless: registra no contrato de estado e não sintetiza. */
  #spawnFauna(callId, when, x, z) {
    const meta = FAUNA_CALLS[callId]; if (!meta) return;
    this._logEvent('fauna', callId, when, x, z);
    if (!this.ctx || !this.state.attached) return;
    const rng = this._rng, gain = meta.gain, pan = { x, z };
    const jitter = (a, b) => a + rng.next() * (b - a);
    switch (callId) {
      case 'gull': {
        const cries = 2 + Math.floor(rng.next() * 2);
        for (let i = 0; i < cries; i++) {
          const f = 1450 + jitter(-90, 160);
          this.#tone({ when, type: 'sawtooth', f0: f + 420, f1: f - 180, at: i * jitter(.32, .42), dur: .3, attack: .02, peak: gain * .55, filter: 'bandpass', q: 2.1, trem: { f: 9.5, d: .5 }, pan });
        }
        break;
      }
      case 'songbird': {
        const notes = 4 + Math.floor(rng.next() * 4);
        let t = 0;
        for (let i = 0; i < notes; i++) {
          const f = 2500 + jitter(0, 1700);
          this.#tone({ when, type: 'sine', f0: f, f1: f * .72, at: t, dur: jitter(.07, .12), attack: .008, peak: gain * (.7 + rng.next() * .3), pan });
          t += jitter(.09, .16);
        }
        break;
      }
      case 'crow': {
        const caws = 2 + Math.floor(rng.next() * 2);
        for (let i = 0; i < caws; i++) {
          this.#tone({ when, type: 'sawtooth', f0: 640 + jitter(-40, 60), f1: 430, at: i * .34, dur: .24, attack: .01, peak: gain, filter: 'bandpass', q: 1.6, trem: { f: 16, d: .35 }, pan });
        }
        break;
      }
      case 'woodpecker': {
        const knocks = 5 + Math.floor(rng.next() * 5);
        for (let i = 0; i < knocks; i++) {
          this.#noiseHit({ when, at: i * .085, dur: .02, peak: gain, f0: 940 + jitter(-80, 80), type: 'bandpass', q: 6, pan });
        }
        break;
      }
      case 'owl': {
        for (let i = 0; i < 2; i++) {
          this.#tone({ when, type: 'sine', f0: 330, f1: 296, at: i * .55, dur: .5, attack: .06, peak: gain, pan });
        }
        break;
      }
      case 'frog': {
        const croaks = 3 + Math.floor(rng.next() * 6);
        let t = 0;
        for (let i = 0; i < croaks; i++) {
          this.#tone({ when, type: 'triangle', f0: 420 + jitter(-60, 110), at: t, dur: .16, attack: .015, peak: gain, trem: { f: 23, d: .6 }, pan });
          t += jitter(.11, .2);
        }
        break;
      }
      case 'crocBellow': {
        this.#tone({ when, type: 'sawtooth', f0: 62, f1: 54, dur: 1.3, attack: .09, peak: gain, filter: 'lowpass', q: 1.2, trem: { f: 13, d: .4 }, pan });
        this.#tone({ when, type: 'sine', f0: 41, f1: 37, dur: 1.3, attack: .1, peak: gain * .6, pan });
        this.#noiseHit({ when, at: 1.15, dur: .3, peak: gain * .3, f0: 700, f1: 320, type: 'bandpass', q: .9, pan }); // splash da cauda
        break;
      }
      case 'ratSqueak': {
        this.#tone({ when, type: 'sine', f0: 2600, f1: 3500, at: jitter(0, .2), dur: .09, attack: .006, peak: gain, pan });
        break;
      }
      case 'vultureScreech': {
        this.#tone({ when, type: 'sawtooth', f0: 850, f1: 1330, at: 0, dur: .32, attack: .03, peak: gain, filter: 'bandpass', q: 1.8, pan });
        this.#tone({ when, type: 'sawtooth', f0: 1330, f1: 690, at: .34, dur: .36, attack: .02, peak: gain, filter: 'bandpass', q: 1.8, pan });
        break;
      }
      case 'whaleMoan': {
        this.#tone({ when, type: 'sine', f0: 46, f1: 84, dur: 1.4, attack: .5, peak: gain, filter: 'lowpass', q: .8, pan });
        this.#tone({ when, at: 1.45, type: 'sine', f0: 84, f1: 58, dur: 1.3, attack: .25, peak: gain * .8, pan });
        break;
      }
      case 'locustChirp': {
        const clicks = 6 + Math.floor(rng.next() * 6);
        for (let i = 0; i < clicks; i++) {
          this.#noiseHit({ when, at: i * .022, dur: .012, peak: gain, f0: 3800 + jitter(-200, 400), type: 'bandpass', q: 5, pan });
        }
        break;
      }
      default: break;
    }
  }

  /** Dispara um evento urbano — o pedido do titular: "ecoando coisas caindo,
   *  gritos e passos". Grito/explosão têm wet alto (cânion). Headless: só log. */
  #spawnUrban(callId, when, x, z) {
    const meta = URBAN_CALLS[callId]; if (!meta) return;
    this._logEvent('urban', callId, when, x, z);
    if (!this.ctx || !this.state.attached) return;
    const rng = this._rng, gain = meta.gain, pan = { x, z };
    const jitter = (a, b) => a + rng.next() * (b - a);
    switch (callId) {
      case 'debrisConcrete':
        this.#tone({ when, type: 'sine', f0: 118, f1: 52, dur: .22, attack: .004, peak: gain, pan });
        this.#noiseHit({ when, at: .01, dur: .3, peak: gain * .8, f0: 520, f1: 180, type: 'bandpass', q: 1.1, wet: .5, pan });
        this.#noiseHit({ when, at: jitter(.14, .3), dur: .1, peak: gain * .35, f0: 380, type: 'bandpass', q: 1.4, wet: .5, pan }); // rebote
        break;
      case 'metalFall':
        for (const [f, d] of [[206, .7], [462, .5], [1203, .32], [2884, .18]]) {
          this.#tone({ when, type: 'triangle', f0: f * jitter(.98, 1.03), dur: d, attack: .003, peak: gain * (.5 + rng.next() * .5), pan });
        }
        this.#tone({ when, at: .12, type: 'sine', f0: 96, f1: 58, dur: .16, attack: .005, peak: gain * .7, pan });
        break;
      case 'windowGlass':
        this.#tone({ when, type: 'square', f0: 1700, f1: 560, dur: .05, attack: .001, peak: gain, pan });
        for (let i = 0; i < 6; i++) {
          this.#tone({ when, at: .02 + rng.next() * .3, type: 'triangle', f0: 1900 + rng.next() * 2400, dur: .07, attack: .001, peak: gain * .5, pan });
        }
        this.#noiseHit({ when, at: .03, dur: .35, peak: gain * .6, f0: 3400, type: 'highpass', wet: .5, pan });
        break;
      case 'doorBang':
        this.#noiseHit({ when, dur: .12, peak: gain, f0: 170, type: 'lowpass', wet: .4, pan });
        this.#noiseHit({ when, at: .02, dur: .03, peak: gain * .5, f0: 2200, type: 'bandpass', q: 4, pan }); // trinco
        break;
      case 'whistleCreak':
        this.#tone({ when, type: 'sawtooth', f0: 300, f1: 900, dur: .8, attack: .1, peak: gain, filter: 'bandpass', q: 9, trem: { f: 6, d: .35 }, pan });
        break;
      case 'screamFar': // grito distante: formantes + glide descendente, wet alto
        this.#tone({ when, type: 'sawtooth', f0: 340, f1: 244, dur: .9, attack: .08, peak: gain, filter: 'bandpass', q: 2.4, trem: { f: 5.5, d: .3 }, pan });
        this.#noiseHit({ when, dur: .8, attack: .1, peak: gain * .5, f0: 1500, type: 'bandpass', q: 1.2, wet: .7, pan });
        break;
      case 'distantExplosion':
        this.#tone({ when, type: 'sine', f0: 62, f1: 30, dur: .6, attack: .01, peak: gain, pan });
        this.#noiseHit({ when, at: .01, dur: 1.6, peak: gain * .9, f0: 170, f1: 60, type: 'lowpass', wet: .6, pan });
        break;
      case 'thunderFar':
        this.#noiseHit({ when, dur: 3.2, attack: .3, peak: gain, f0: 140, f1: 55, type: 'lowpass', wet: .7, pan });
        this.#noiseHit({ when, at: jitter(.5, 1.2), dur: 1.8, peak: gain * .6, f0: 110, f1: 48, type: 'lowpass', wet: .7, pan });
        break;
      default: break;
    }
  }

  _logEvent(family, call, when, x, z) {
    this.state.events.push({ t: r3(when), family, call, x: Math.round(x), z: Math.round(z) });
    if (this.state.events.length > 60) this.state.events.splice(0, this.state.events.length - 60);
  }

  // ---------- internals: agenda de eventos (RNG semeado — nada de Math.random) ----------

  /** Peso de fase da camada de evento (0..~2.5). */
  #eventWeight(layerId) {
    const l = this.profile.layers[layerId];
    if (!l) return 0;
    let w = l.base * (l.phase?.[this.state.phase] ?? 1);
    if (this.state.interior) w *= AMBIENCE_LAYERS[layerId]?.damp ?? 1;
    return w;
  }

  _positionAround(x, z, minR = 14, maxR = 58) {
    const a = this._rng.next() * Math.PI * 2;
    const r = minR + this._rng.next() * (maxR - minR);
    return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
  }

  // fenômenos do MUNDO (explosão remota, trovão): audíveis em qualquer ponto —
  // não dependem da proximidade urbana (o deserto explode longe dos distritos)
  static ALWAYS_HEARD = new Set(['distantExplosion', 'thunderFar']);

  #tryFauna(dt, x, z, when) {
    for (const [call, rate] of this.profile.fauna) {
      const w = call === 'gull' || call === 'songbird' || call === 'crow' || call === 'vultureScreech'
        ? this.#eventWeight('birds') : (call === 'frog' || call === 'crocBellow' ? this.#eventWeight('waterAnimals') : 1);
      const damp = this.state.interior ? .3 : 1;
      const p = rate * Math.max(.12, w) * damp * dt;
      if (this._rng.next() < p) {
        const { x: ex, z: ez } = this._positionAround(x, z);
        this.#spawnFauna(call, when, ex, ez);
      }
    }
  }

  #tryUrban(dt, x, z, when) {
    const u = this.profile.urban;
    const phaseUp = [1, 1.05, 1.15, 1.3, 1.45][this.state.phase];
    for (const [call, rate] of u.calls) {
      const prox = AmbienceEngine.ALWAYS_HEARD.has(call) ? 1 : (.15 + .85 * this.state.urbanProximity);
      const p = rate * u.density * prox * phaseUp * dt;
      if (this._rng.next() < p) {
        const far = AmbienceEngine.ALWAYS_HEARD.has(call) ? 90 : 70;
        const { x: ex, z: ez } = this._positionAround(x, z, 16, far);
        this.#spawnUrban(call, when, ex, ez);
      }
    }
  }

  #scheduleEvents(dt, when) {
    const now = when;
    const pl = this._lastPos ?? { x: 0, z: 0 };
    this.#tryFauna(dt, pl.x, pl.z, now);
    this.#tryUrban(dt, pl.x, pl.z, now);
    // micro-eventos contínuos por camada (cristas/goteja/crepitar/chirps)
    const p = this.profile;
    if (p.layers.waves?.crestRate && this._layers?.waves) {
      const w = this.#eventWeight('waves');
      if (this._t >= this._waveCrestAt && this._rng.next() < p.layers.waves.crestRate * Math.max(.5, w) * dt * 8) {
        this._waveCrestAt = this._t + 2.4 + this._rng.next() * 4;
        const dir = this._rng.next() * Math.PI * 2;
        const r = 60 + this._rng.next() * 40;
        const px = pl.x + Math.cos(dir) * r, pz = pl.z + Math.sin(dir) * r;
        this.#noiseHit({ when: now, dur: .5, peak: .22 * Math.min(2, w), f0: 700, f1: 1700, type: 'bandpass', q: .7, wet: .4, pan: { x: px, z: pz } });
        this.#noiseHit({ when: now + .04, dur: 1.3, peak: .18 * Math.min(2, w), f0: 2600, type: 'highpass', wet: .5, pan: { x: px, z: pz } }); // spray
        this._logEvent('world', 'waveCrest', now, px, pz);
      }
    }
    if (p.layers.rain && this._layers?.rain && !this.state.interior) {
      if (this._t >= this._rainDripAt && this._rng.next() < 2.4 * this.#eventWeight('rain') * dt) {
        this._rainDripAt = this._t + .08;
        this.#tone({ when: now, type: 'sine', f0: 1500 + this._rng.next() * 1400, dur: .09, attack: .002, peak: .05 + this._rng.next() * .04, pan: this._positionAround(pl.x, pl.z, 3, 26) });
      }
    }
    if (p.layers.fire && this._layers?.fire) {
      const w = this.#eventWeight('fire');
      if (this._t >= this._fireCrackleAt && this._rng.next() < 9 * Math.max(.3, w) * dt) {
        this._fireCrackleAt = this._t + .04;
        this.#noiseHit({ when: now, dur: .03 + this._rng.next() * .04, peak: (.06 + this._rng.next() * .08) * Math.max(.3, w), f0: 1100 + this._rng.next() * 1700, type: 'bandpass', q: 2.4 });
      }
    }
    if (p.layers.insects && this._layers?.insects) {
      if (this._t >= this._insectChirpAt && this._rng.next() < .5 * this.#eventWeight('insects') * dt) {
        this._insectChirpAt = this._t + .3 + this._rng.next() * 1.2;
        const { x: ex, z: ez } = this._positionAround(pl.x, pl.z, 4, 30);
        this.#spawnFauna('locustChirp', now, ex, ez);
      }
    }
    // uivo do vento: re-alvo espectral a cada 4–8 s (duna/gêtreo)
    if (this._windHowl && this._t >= this._windHowlAt) {
      this._windHowlAt = this._t + 4 + this._rng.next() * 4;
      const cfg = p.layers.wind;
      this._windHowl.frequency.setTargetAtTime((cfg.howl ?? 550) * (.7 + this._rng.next() * .8), now, 2.2);
    }
  }

  /** Posição do listener para o agendador (main3d fornece por frame). */
  setListenerPos(x, z, yaw = 0) { this._lastPos = { x, z }; if (this.ctx) this.#setListener(x, z, yaw); }

  // ---------- AUDITORIA OFFLINE (números, não opinião) ----------

  /**
   * Plano determinístico de eventos p/ N segundos (mesma seed → mesma trilha).
   * Usado pelo renderAudit; tick() usa probabilidades equivalentes ao vivo.
   */
  #planEvents(duration, x0 = 0, z0 = 0) {
    const plan = [];
    const push = (family, call, layerId, rate, opts = {}) => {
      const w = layerId ? this.#eventWeight(layerId) : 1;
      let n = Math.round(rate * Math.max(.12, w) * duration * (opts.damp ?? 1));
      if (opts.factor) n = Math.max(0, Math.round(n * opts.factor));
      for (let i = 0; i < n; i++) {
        const at = .1 + this._rng.next() * (duration - .2);
        const pos = this._positionAround(x0, z0, opts.minR ?? 14, opts.maxR ?? 58);
        plan.push({ at, family, call, x: pos.x, z: pos.z, layerId: opts.layer ?? layerId });
      }
    };
    for (const [call, rate] of this.profile.fauna) {
      const isBird = ['gull', 'songbird', 'crow', 'vultureScreech'].includes(call);
      const isWater = call === 'frog' || call === 'crocBellow';
      push('fauna', call, isBird ? 'birds' : (isWater ? 'waterAnimals' : null), rate, { damp: this.state.interior ? .3 : 1 });
    }
    const u = this.profile.urban;
    for (const [call, rate] of u.calls) {
      const prox = AmbienceEngine.ALWAYS_HEARD.has(call) ? 1 : (.15 + .85 * this.state.urbanProximity);
      push('urban', call, 'urban', rate, { factor: u.density * prox * [1, 1.05, 1.15, 1.3, 1.45][this.state.phase], minR: 16, maxR: AmbienceEngine.ALWAYS_HEARD.has(call) ? 90 : 70 });
    }
    const p = this.profile;
    if (p.layers.waves?.crestRate) {
      const w = this.#eventWeight('waves');
      const n = Math.round(p.layers.waves.crestRate * Math.max(.5, w) * duration);
      for (let i = 0; i < n; i++) {
        const pos = this._positionAround(x0, z0, 60, 100);
        plan.push({ at: .2 + this._rng.next() * (duration - .3), family: 'world', call: 'waveCrest', x: pos.x, z: pos.z, layerId: 'waves' });
      }
    }
    if (p.layers.fire) {
      const w = this.#eventWeight('fire');
      const n = Math.round(9 * Math.max(.3, w) * duration);
      for (let i = 0; i < n; i++) {
        const pos = this._positionAround(x0, z0, 4, 40);
        plan.push({ at: this._rng.next() * duration, family: 'world', call: 'fireCrackle', x: pos.x, z: pos.z, layerId: 'fire' });
      }
    }
    if (p.layers.rain && this.state.weather !== 'clear') {
      const n = Math.round(2.4 * this.#eventWeight('rain') * duration);
      for (let i = 0; i < Math.min(n, 160); i++) {
        const pos = this._positionAround(x0, z0, 3, 26);
        plan.push({ at: this._rng.next() * duration, family: 'world', call: 'rainDrip', x: pos.x, z: pos.z, layerId: 'rain' });
      }
    }
    return plan.sort((a, b) => a.at - b.at);
  }

  #spawnPlanned(ev, when) {
    if (ev.family === 'fauna') this.#spawnFauna(ev.call, when, ev.x, ev.z);
    else if (ev.family === 'urban') this.#spawnUrban(ev.call, when, ev.x, ev.z);
    else if (ev.call === 'waveCrest') {
      const w = this.#eventWeight('waves');
      this.#noiseHit({ when, dur: .5, peak: .22 * Math.min(2, w), f0: 700, f1: 1700, type: 'bandpass', q: .7, wet: .4, pan: { x: ev.x, z: ev.z } });
      this.#noiseHit({ when: when + .04, dur: 1.3, peak: .18 * Math.min(2, w), f0: 2600, type: 'highpass', wet: .5, pan: { x: ev.x, z: ev.z } });
    } else if (ev.call === 'fireCrackle') {
      const w = this.#eventWeight('fire');
      this.#noiseHit({ when, dur: .03 + this._rng.next() * .04, peak: (.06 + this._rng.next() * .08) * Math.max(.3, w), f0: 1100 + this._rng.next() * 1700, type: 'bandpass', q: 2.4, pan: { x: ev.x, z: ev.z } });
    } else if (ev.call === 'rainDrip') {
      this.#tone({ when, type: 'sine', f0: 1500 + this._rng.next() * 1400, dur: .09, attack: .002, peak: .05 + this._rng.next() * .04, pan: { x: ev.x, z: ev.z } });
    }
  }

  /**
   * Auditoria acústica END-TO-END (browser): renderiza via OfflineAudioContext
   * o MIX completo + cada camada solo, e devolve métricas reais — RMS, pico e
   * razão grave/agudo (energia <500 Hz vs >2 kHz). É o que fecha o ciclo
   * "criar sons → provar que soam" sem depender de ouvido humano.
   */
  static async renderAudit(worldId = 'CIGKV', { seconds = 6, phase = 2, urbanProximity = .7, weather = 'clear' } = {}) {
    if (typeof OfflineAudioContext === 'undefined') return null;
    const sr = 48000;
    const profile = worldAmbience(worldId);
    const layerIds = Object.keys(profile.layers).filter((id) => !['birds', 'waterAnimals'].includes(id));
    const mk = (solo = null) => {
      const oc = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const eng = new AmbienceEngine(worldId, { weather });
      eng.attach(oc, oc.destination, oc.destination);
      eng.state.phase = phase; eng.state.urbanProximity = clamp01(urbanProximity);
      // ganhos diretos (sem setTargetAtTime — render imediato); solo isola a camada
      if (eng._layers) {
        for (const [id, layer] of Object.entries(eng._layers)) {
          const g = solo ? (id === solo ? eng.#layerTarget(id) : 0) : eng.#layerTarget(id);
          layer.gain.gain.value = g;
        }
      }
      const plan = eng.#planEvents(seconds, 0, 0);
      for (const ev of plan) {
        if (solo && ev.layerId !== solo) continue;
        eng.#spawnPlanned(ev, ev.at);
      }
      return { oc, eng };
    };
    const analyze = (buffer) => {
      const n = buffer.length, L = buffer.getChannelData(0), R = buffer.getChannelData(1);
      let sum = 0, peak = 0, low = 0, high = 0;
      const k = Math.exp(-2 * Math.PI * 500 / sr);
      let lpL = 0, lpR = 0;
      for (let i = 0; i < n; i++) {
        const s = (L[i] + R[i]) * .5;
        sum += s * s;
        const a = Math.abs(s); if (a > peak) peak = a;
        lpL = k * lpL + (1 - k) * L[i]; lpR = k * lpR + (1 - k) * R[i];
        low += (lpL * lpL + lpR * lpR) * .5;
        const hL = L[i] - lpL, hR = R[i] - lpR;
        high += (hL * hL + hR * hR) * .5;
      }
      const rms = Math.sqrt(sum / n), lowRms = Math.sqrt(low / n), highRms = Math.sqrt(high / n);
      return { rms: r3(rms), peak: r3(peak), lowRatio: r3(lowRms / (lowRms + highRms || 1)) };
    };
    const mixR = await mk().oc.startRendering();
    const layers = {};
    for (const id of layerIds) {
      const buf = await mk(id).oc.startRendering();
      layers[id] = analyze(buf);
    }
    return { world: worldId, seconds, phase, weather, mix: analyze(mixR), layers };
  }
}
