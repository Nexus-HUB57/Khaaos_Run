// Khaaos Run — Áudio procedural (WebAudio): tiros, impacto, recarga, zona, UI.
// Nenhum arquivo externo — tudo sintetizado em tempo real.
// Fase 19 — mixagem: master + barramentos sfx/world/ui (KR_AUDIO_*, audiomix.js).
import { DEFAULT_AUDIO_MIX, normalizeAudioMix } from './audiomix.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    // Fase 19 — mixagem persistida (KR_AUDIO_*): master + barramentos por
    // família. buses só existem após init(); setMix funciona antes (contrato
    // de estado headless) e é aplicado aos ganhos no init.
    this.mix = { ...DEFAULT_AUDIO_MIX };
    this.buses = null; // { sfx, world, ui } → master (criados no init)
    // Fase 18 — camadas contínuas de sobrevivência (contrato de estado
    // testável sem AudioContext: kind → { kind, intensity, startedAt }).
    this.survivalLayers = {};
    this.survivalNodes = {};   // kind → nós WebAudio p/ teardown com fade
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.mix.master;
    this.master.connect(this.ctx.destination);
    // Fase 19 — barramentos da mixagem: cada família de som desemboca num
    // canal com volume próprio (sliders do HUD) antes do master.
    this.buses = {};
    for (const ch of ['sfx', 'world', 'ui']) {
      const g = this.ctx.createGain();
      g.gain.value = this.mix[ch];
      g.connect(this.master);
      this.buses[ch] = g;
    }
    this.#startAmbient();
  }
  resume() { this.ctx?.resume?.(); }

  // ---------- Fase 19 — mixagem de volume (KR_AUDIO_*) ----------
  /**
   * Aplica mixagem parcial (0..1 por canal). Normaliza (clamp/defaults via
   * audiomix.js), funciona ANTES do init (contrato de estado headless) e AO
   * VIVO com ctx (ganhos aplicados direto — sliders já são contínuos).
   * @returns mixagem normalizada completa (cópia).
   */
  setMix(partial = {}) {
    this.mix = normalizeAudioMix(partial, this.mix);
    if (this.master) this.master.gain.value = this.mix.master;
    if (this.buses) for (const ch of Object.keys(this.buses)) this.buses[ch].gain.value = this.mix[ch];
    return { ...this.mix };
  }

  // barramento de saída de uma família de sons (fallback master p/ robustez)
  #bus(ch) { return this.buses?.[ch] ?? this.master; }

  #noiseBuffer(dur = .5) {
    const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  #env(gain, t0, attack, decay, peak = 1) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
  }

  #startAmbient() {
    // vento constante + sub-bass tenso
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(2); src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = .4;
    const g = this.ctx.createGain(); g.gain.value = .05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = .13;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = .025;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.#bus('world'));
    src.start(); lfo.start();
  }

  shot(weapon = 'g19', distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(.08, 1 - distance / 120);
    const cfg = {
      g19: { dur: .12, freq: 1600, peak: .5 },
      mp5: { dur: .09, freq: 1900, peak: .42 },
      m4: { dur: .14, freq: 1200, peak: .58 },
      barrett: { dur: .3, freq: 700, peak: .85 },
      pulse: { dur: .18, freq: 2600, peak: .5 },
      sucata: { dur: .1, freq: 900, peak: .3 },
    }[weapon] ?? { dur: .12, freq: 1400, peak: .5 };
    // corpo do tiro: burst de ruído filtrado
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(cfg.dur * 2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'lowpass'; bp.frequency.setValueAtTime(cfg.freq, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + cfg.dur);
    const g = this.ctx.createGain();
    this.#env(g, t, .002, cfg.dur, cfg.peak * vol);
    src.connect(bp); bp.connect(g); g.connect(this.#bus('sfx'));
    src.start(t); src.stop(t + cfg.dur * 2 + .05);
    // crack inicial
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + .06);
    const og = this.ctx.createGain();
    this.#env(og, t, .001, .06, .3 * vol);
    osc.connect(og); og.connect(this.#bus('sfx'));
    osc.start(t); osc.stop(t + .1);
  }

  hit(head = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(head ? 1400 : 950, t);
    osc.frequency.exponentialRampToValueAtTime(head ? 900 : 650, t + .07);
    const g = this.ctx.createGain();
    this.#env(g, t, .001, .07, head ? .5 : .35);
    osc.connect(g); g.connect(this.#bus('sfx'));
    osc.start(t); osc.stop(t + .1);
  }

  hurt() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + .16);
    const g = this.ctx.createGain();
    this.#env(g, t, .004, .16, .4);
    osc.connect(g); g.connect(this.#bus('sfx'));
    osc.start(t); osc.stop(t + .2);
  }

  reload() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [0, .12, .28].forEach((off, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(.05);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2400;
      const g = this.ctx.createGain();
      this.#env(g, t + off, .002, .05, .25);
      src.connect(hp); hp.connect(g); g.connect(this.#bus('sfx'));
      src.start(t + off);
    });
  }

  pickup() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      this.#env(g, t + i * .07, .005, .1, .28);
      osc.connect(g); g.connect(this.#bus('sfx'));
      osc.start(t + i * .07); osc.stop(t + i * .07 + .15);
    });
  }

  ringWarn() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [0, .25, .5].forEach(off => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 520;
      const g = this.ctx.createGain();
      this.#env(g, t + off, .01, .2, .3);
      osc.connect(g); g.connect(this.#bus('ui'));
      osc.start(t + off); osc.stop(t + off + .3);
    });
  }

  heartbeat() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [0, .18].forEach((off, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, t + off);
      osc.frequency.exponentialRampToValueAtTime(40, t + off + .1);
      const g = this.ctx.createGain();
      this.#env(g, t + off, .005, .12, i ? .35 : .5);
      osc.connect(g); g.connect(this.#bus('sfx'));
      osc.start(t + off); osc.stop(t + off + .2);
    });
  }

  stinger(win = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const notes = win ? [392, 494, 587, 784] : [330, 277, 220, 165];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = win ? 'triangle' : 'sawtooth';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      this.#env(g, t + i * .16, .01, .4, .3);
      osc.connect(g); g.connect(this.#bus('ui'));
      osc.start(t + i * .16); osc.stop(t + i * .16 + .5);
    });
  }

  ui() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 1200;
    const g = this.ctx.createGain();
    this.#env(g, t, .001, .04, .12);
    osc.connect(g); g.connect(this.#bus('ui'));
    osc.start(t); osc.stop(t + .06);
  }

  // ---------- Fase 4 — infiltração aérea + arremessáveis ----------

  // vento de queda: camada temporária intensificada (quanto mais perto do chão, mais forte)
  wind(on, intensity = .3) {
    if (!this.ctx) return;
    if (on && !this.windGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(2); src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = .55;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.#bus('world'));
      src.start();
      this.windGain = g;
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(on ? intensity : 0, this.ctx.currentTime, .25);
      if (!on) { const old = this.windGain; setTimeout(() => old.disconnect?.(), 800); this.windGain = null; }
    }
  }

  // abertura do paraquedas (estalo + flap de tecido)
  chuteOpen() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(.25);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + .22);
    const g = this.ctx.createGain();
    this.#env(g, t, .01, .22, .5);
    src.connect(bp); bp.connect(g); g.connect(this.#bus('sfx'));
    src.start(t);
  }

  // aterrissagem (thud abafado)
  land() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + .12);
    const g = this.ctx.createGain();
    this.#env(g, t, .004, .14, .45);
    osc.connect(g); g.connect(this.#bus('sfx'));
    osc.start(t); osc.stop(t + .2);
  }

  // arremesso da granada (whoosh curto)
  fragThrow() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(.14);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + .12);
    const g = this.ctx.createGain();
    this.#env(g, t, .01, .12, .3);
    src.connect(bp); bp.connect(g); g.connect(this.#bus('sfx'));
    src.start(t);
  }

  // detonação: sub-bass + corpo de ruído + metálico de estilhaços
  explosion(distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(.12, 1 - distance / 90);
    // sub-bass
    const sub = this.ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + .4);
    const sg = this.ctx.createGain();
    this.#env(sg, t, .005, .42, .8 * vol);
    sub.connect(sg); sg.connect(this.#bus('sfx'));
    sub.start(t); sub.stop(t + .5);
    // corpo
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(.7);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + .5);
    const g = this.ctx.createGain();
    this.#env(g, t, .003, .55, .75 * vol);
    src.connect(lp); lp.connect(g); g.connect(this.#bus('sfx'));
    src.start(t);
    // estilhaços (curtos pings metálicos decrescentes)
    for (let i = 0; i < 5; i++) {
      const off = .06 + i * .05;
      const ping = this.ctx.createOscillator();
      ping.type = 'triangle'; ping.frequency.value = 1800 + Math.random() * 2200;
      const pg = this.ctx.createGain();
      this.#env(pg, t + off, .001, .05, .1 * vol);
      ping.connect(pg); pg.connect(this.#bus('sfx'));
      ping.start(t + off); ping.stop(t + off + .08);
    }
  }

  // deploy da Gloo Wall (cristalização ascendente)
  gloo() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [0, .07, .14].forEach((off, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300 + i * 260, t + off);
      osc.frequency.exponentialRampToValueAtTime(760 + i * 260, t + off + .1);
      const g = this.ctx.createGain();
      this.#env(g, t + off, .008, .12, .22);
      osc.connect(g); g.connect(this.#bus('sfx'));
      osc.start(t + off); osc.stop(t + off + .18);
    });
  }

  // ---------- Fase 25 — portas funcionais/destrutíveis ----------
  // dobradiça: ranger de serra (abrir sobe, fechar desce) + estalo do trinco
  door(open = true, distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(.1, .85 - distance / 60);
    // ranger: sawtooth com vibrato curto (a folha acelera na dobradiça)
    const creak = this.ctx.createOscillator();
    creak.type = 'sawtooth';
    if (open) creak.frequency.setValueAtTime(150, t);
    else creak.frequency.setValueAtTime(310, t);
    creak.frequency.exponentialRampToValueAtTime(open ? 330 : 145, t + .3);
    const wob = this.ctx.createOscillator(); wob.frequency.value = 11;
    const wobG = this.ctx.createGain(); wobG.gain.value = 24;
    wob.connect(wobG); wobG.connect(creak.frequency);
    const cg = this.ctx.createGain();
    this.#env(cg, t, .03, .3, .16 * vol);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 2.2;
    creak.connect(lp); lp.connect(cg); cg.connect(this.#bus('sfx'));
    creak.start(t); creak.stop(t + .4); wob.start(t); wob.stop(t + .4);
    // estalo do trinco no fim do curso (fechar: mais seco)
    const latch = this.ctx.createBufferSource();
    latch.buffer = this.#noiseBuffer(.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    const lg = this.ctx.createGain();
    this.#env(lg, t + (open ? .3 : .26), .001, .04, (open ? .18 : .3) * vol);
    latch.connect(hp); hp.connect(lg); lg.connect(this.#bus('sfx'));
    latch.start(t + (open ? .3 : .26));
  }

  // madeira ESTILHAÇANDO: trinca grave, rajada de lascas e tábuas no chão
  doorDown(distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(.12, .95 - distance / 70);
    // trinca inicial: corpo de ruído médio-grave caindo (a folha cede)
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.#noiseBuffer(.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(950, t);
    bp.frequency.exponentialRampToValueAtTime(240, t + .35);
    bp.Q.value = .8;
    const cg = this.ctx.createGain();
    this.#env(cg, t, .004, .38, .8 * vol);
    crack.connect(bp); bp.connect(cg); cg.connect(this.#bus('sfx'));
    crack.start(t);
    // estalos secos (fibras rompendo): 3 transientes quadrados descendentes
    [0, .07, .13].forEach((off, i) => {
      const snap = this.ctx.createOscillator();
      snap.type = 'square';
      snap.frequency.setValueAtTime(230 - i * 55, t + off);
      snap.frequency.exponentialRampToValueAtTime(70, t + off + .05);
      const sg = this.ctx.createGain();
      this.#env(sg, t + off, .001, .05, .34 * vol);
      snap.connect(sg); sg.connect(this.#bus('sfx'));
      snap.start(t + off); snap.stop(t + off + .08);
    });
    // lascas voando: pings de madeira (triangle, 600–1900 Hz, aleatórios)
    for (let i = 0; i < 6; i++) {
      const off = .04 + Math.random() * .3;
      const chip = this.ctx.createOscillator();
      chip.type = 'triangle';
      chip.frequency.value = 600 + Math.random() * 1300;
      const chg = this.ctx.createGain();
      this.#env(chg, t + off, .001, .06, .12 * vol);
      chip.connect(chg); chg.connect(this.#bus('sfx'));
      chip.start(t + off); chip.stop(t + off + .09);
    }
    // baque das tábuas no chão (sub grave amortecido)
    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(95, t + .12);
    thud.frequency.exponentialRampToValueAtTime(38, t + .4);
    const tg = this.ctx.createGain();
    this.#env(tg, t + .12, .006, .3, .5 * vol);
    thud.connect(tg); tg.connect(this.#bus('sfx'));
    thud.start(t + .12); thud.stop(t + .5);
  }

  // ---------- Fase 18 — sobrevivências imersivas + game feel de abate ----------
  // Camadas CONTÍNUAS de áudio por hazard do mundo (tsunami/lava/gravidade/
  // ácido): cada camada é um pequeno grafo WebAudio criado no start e
  // desvanecido no stop (setTargetAtTime) — identidade sonora POR MUNDO em
  // vez do ringWarn genérico. Sem ctx (headless/testes) tudo é no-op, mas o
  // CONTRATO de estado (survivalLayers) continua registrado p/ verificação.
  // Assinaturas curtas (hazardStinger/killConfirm/knockTick) fecham o game
  // feel: o jogador OUVE o que ameaça e CONFIRMA o que abate.

  // perfis de mixagem por hazard (ganho alvo da camada contínua)
  #SURVIVAL_GAIN = { tsunami: .5, lava: .55, gravity: .3, acid: .24 };

  /**
   * Liga/desliga a camada contínua de um hazard.
   * @param {'tsunami'|'lava'|'gravity'|'acid'} kind
   * @param {boolean} on
   * @param {{ intensity?: number, duration?: number }} opts
   *   intensity escala o ganho (0..1+); duration (s) agenda auto-off (hazard
   *   curto como a chuva ácida) — só agenda com ctx real (sem timer headless).
   */
  survival(kind, on = true, { intensity = 1, duration = 0 } = {}) {
    if (on) this.survivalLayers[kind] = { kind, intensity, startedAt: Date.now() };
    else delete this.survivalLayers[kind];
    if (!this.ctx || !this.enabled) return;
    if (on && !this.survivalNodes[kind]) {
      const t = this.ctx.currentTime;
      const base = (this.#SURVIVAL_GAIN[kind] ?? .3) * Math.max(0, intensity);
      const mkGain = (target) => {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.setTargetAtTime(target, t, .7); // fade-in ~2 s
        g.connect(this.#bus('world'));
        return g;
      };
      const mkNoise = () => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.#noiseBuffer(3); src.loop = true;
        return src;
      };
      const nodes = [], gains = [];
      if (kind === 'tsunami') {
        // rumble grave + rush de água modulado (massa d'água se aproximando)
        const rSrc = mkNoise();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 95; lp.Q.value = .5;
        const rG = mkGain(base * .8);
        rSrc.connect(lp); lp.connect(rG); rSrc.start();
        const wSrc = mkNoise();
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 560; bp.Q.value = .45;
        const wG = mkGain(base * .34);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = .18;
        const lfoG = this.ctx.createGain(); lfoG.gain.value = base * .18;
        lfo.connect(lfoG); lfoG.connect(wG.gain);
        wSrc.connect(bp); bp.connect(wG); wSrc.start(); lfo.start();
        nodes.push(rSrc, wSrc, lfo); gains.push(rG, wG);
      } else if (kind === 'lava') {
        // rumble vulcânico (sub oscilando) + corpo de fogo abafado
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(36, t);
        const wob = this.ctx.createOscillator(); wob.frequency.value = .9;
        const wobG = this.ctx.createGain(); wobG.gain.value = 6;
        wob.connect(wobG); wobG.connect(sub.frequency);
        const sG = mkGain(base * .9);
        sub.connect(sG); sub.start(); wob.start();
        const fSrc = mkNoise();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = .7;
        const fG = mkGain(base * .5);
        fSrc.connect(lp); lp.connect(fG); fSrc.start();
        nodes.push(sub, wob, fSrc); gains.push(sG, fG);
      } else if (kind === 'gravity') {
        // hum etéreo: par detunado (batimento) + shimmer alto em tremolo
        const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110;
        const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 113.7;
        const hG = mkGain(base * .8);
        o1.connect(hG); o2.connect(hG); o1.start(); o2.start();
        const sh = this.ctx.createOscillator(); sh.type = 'sine'; sh.frequency.value = 660;
        const shG = mkGain(base * .12);
        const tre = this.ctx.createOscillator(); tre.frequency.value = 2.4;
        const treG = this.ctx.createGain(); treG.gain.value = base * .1;
        tre.connect(treG); treG.connect(shG.gain);
        sh.connect(shG); sh.start(); tre.start();
        nodes.push(o1, o2, sh, tre); gains.push(hG, shG);
      } else if (kind === 'acid') {
        // hiss de chuva ácida (ruído filtrado agudo)
        const n = mkNoise();
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 3600; hp.Q.value = .4;
        const nG = mkGain(base);
        n.connect(hp); hp.connect(nG); n.start();
        nodes.push(n); gains.push(nG);
      }
      this.survivalNodes[kind] = { nodes, gains };
      if (duration > 0) {
        // hazard curto: auto-off programado (áudio real apenas)
        setTimeout(() => { if (this.survivalLayers[kind]) this.survival(kind, false); }, duration * 1000);
      }
    } else if (!on && this.survivalNodes[kind]) {
      // fade-out e teardown (nós param sozinhos; desconexão tardia segura)
      const t = this.ctx.currentTime;
      const { nodes, gains } = this.survivalNodes[kind];
      for (const g of gains) g.gain.setTargetAtTime(0, t, .45);
      setTimeout(() => {
        for (const n of nodes) { try { n.stop?.(); } catch { /* já parado */ } try { n.disconnect?.(); } catch { /* já solto */ } }
        for (const g of gains) { try { g.disconnect?.(); } catch { /* já solto */ } }
      }, 1600);
      delete this.survivalNodes[kind];
    }
  }

  /** Mata TODAS as camadas de sobrevivência (fim de partida/espectador sai). */
  stopAllSurvival() {
    for (const kind of Object.keys(this.survivalLayers)) this.survival(kind, false);
  }

  /** Alerta de ENTRADA de hazard — assinatura curta distinta por mundo. */
  hazardStinger(kind = 'tsunami') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const tone = (type, f0, f1, at, dur, peak, off = 0) => {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + off);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
      const g = this.ctx.createGain();
      this.#env(g, t + off, at, dur, peak);
      osc.connect(g); g.connect(this.#bus('ui'));
      osc.start(t + off); osc.stop(t + off + dur + .1);
    };
    const noise = (f0, f1, dur, peak, type = 'bandpass', off = 0) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(dur * 2);
      const bp = this.ctx.createBiquadFilter();
      bp.type = type;
      bp.frequency.setValueAtTime(f0, t + off);
      bp.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
      const g = this.ctx.createGain();
      this.#env(g, t + off, .01, dur, peak);
      src.connect(bp); bp.connect(g); g.connect(this.#bus('ui'));
      src.start(t + off); src.stop(t + off + dur * 2 + .05);
    };
    switch (kind) {
      case 'tsunami': // sirene de maremoto: dois dias descendo
        tone('sawtooth', 196, 98, .02, .9, .3);
        tone('sawtooth', 199, 100, .02, .9, .18, .02); // detune — batimento
        break;
      case 'lava': // duplo estrondo + fenda abrindo
        tone('sine', 70, 32, .005, .5, .6);
        tone('sine', 70, 32, .005, .5, .45, .3);
        noise(500, 90, .7, .3, 'lowpass');
        break;
      case 'gravity': // glissando INVERTIDO — o mundo de cabeça pra baixo
        tone('sine', 220, 880, .01, .55, .26);
        tone('sine', 227, 908, .01, .55, .18, .03);
        break;
      case 'acid': // duplo hiss corrosivo
        noise(4200, 2600, .16, .3, 'highpass');
        noise(4200, 2600, .16, .24, 'highpass', .22);
        break;
      default: tone('sine', 520, 520, .01, .2, .3);
    }
  }

  /** Confirmação de abate (estilo battle royale: tick seco; headshot pinga). */
  killConfirm(head = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const notes = head ? [[1180, 0], [1760, .07]] : [[720, 0], [540, .05]];
    notes.forEach(([f, off], i) => {
      const osc = this.ctx.createOscillator();
      osc.type = head ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(f, t + off);
      osc.frequency.exponentialRampToValueAtTime(f * .82, t + off + .05);
      const g = this.ctx.createGain();
      this.#env(g, t + off, .001, .05, i ? .32 : .26);
      osc.connect(g); g.connect(this.#bus('sfx'));
      osc.start(t + off); osc.stop(t + off + .09);
    });
  }

  /** Tick de nocaute (alvo derrubado — finalização disponível). */
  knockTick() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + .09);
    const g = this.ctx.createGain();
    this.#env(g, t, .002, .09, .3);
    osc.connect(g); g.connect(this.#bus('sfx'));
    osc.start(t); osc.stop(t + .12);
  }

  // ---------- Fase 9 — SFX de habilidade p/ remotos (assinatura por família) ----------
  // Cada família de habilidade tem uma assinatura sonora curta e distinta, com
  // atenuação por distância (o cast de um remoto soa mais baixo longe do jogador).
  ability(effect = 'speed', distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(.07, .9 - distance / 90);
    const tone = (type, f0, f1, at, dur, peak, off = 0) => {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + off);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
      const g = this.ctx.createGain();
      this.#env(g, t + off, at, dur, peak * vol);
      osc.connect(g); g.connect(this.#bus('sfx'));
      osc.start(t + off); osc.stop(t + off + dur + .1);
    };
    const noise = (f0, f1, dur, peak, type = 'bandpass', off = 0) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(dur * 2);
      const bp = this.ctx.createBiquadFilter();
      bp.type = type;
      bp.frequency.setValueAtTime(f0, t + off);
      bp.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
      const g = this.ctx.createGain();
      this.#env(g, t + off, .01, dur, peak * vol);
      src.connect(bp); bp.connect(g); g.connect(this.#bus('sfx'));
      src.start(t + off); src.stop(t + off + dur * 2 + .05);
    };
    switch (effect) {
      case 'heal': // brilho ascendente (dupla nota suave)
        tone('sine', 520, 660, .01, .16, .3); tone('sine', 660, 880, .01, .2, .3, .1);
        break;
      case 'speed': // whoosh crescente
        noise(420, 2400, .3, .4);
        break;
      case 'dash': // whoosh curto e grave
        noise(1800, 300, .22, .45);
        break;
      case 'precision': // ping agudo único
        tone('triangle', 1760, 1760, .002, .12, .3);
        break;
      case 'damageReduction': // clank metálico grave
      case 'temporaryArmor':
        tone('square', 180, 140, .004, .14, .26);
        tone('triangle', 320, 300, .004, .1, .2, .02);
        break;
      case 'recon': // sonar (ping + eco)
        tone('sine', 880, 880, .004, .14, .32);
        tone('sine', 880, 880, .004, .12, .14, .16);
        break;
      case 'stun': // zap descendente
        tone('sawtooth', 1400, 120, .003, .18, .34);
        break;
      case 'concealment': // sopro abafado
        noise(900, 220, .34, .3, 'lowpass');
        break;
      case 'ringRead': // pulso do anel (dois tons graves)
      case 'ringForecast':
        tone('sine', 392, 392, .006, .12, .3); tone('sine', 294, 294, .006, .14, .3, .13);
        break;
      case 'terminalScan': // chirp digital
        tone('square', 980, 1960, .004, .1, .2);
        break;
      case 'ringResistance': // shimmer com corpo
        tone('triangle', 440, 620, .01, .2, .26); noise(600, 1400, .2, .16);
        break;
      default: tone('sine', 660, 660, .005, .1, .22);
    }
  }
}
