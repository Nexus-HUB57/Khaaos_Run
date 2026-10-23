// Khaaos Run — Áudio procedural (WebAudio): tiros, impacto, recarga, zona, UI.
// Nenhum arquivo externo — tudo sintetizado em tempo real.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.#startAmbient();
  }
  resume() { this.ctx?.resume?.(); }

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
    src.connect(lp); lp.connect(g); g.connect(this.master);
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
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + cfg.dur * 2 + .05);
    // crack inicial
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + .06);
    const og = this.ctx.createGain();
    this.#env(og, t, .001, .06, .3 * vol);
    osc.connect(og); og.connect(this.master);
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
    osc.connect(g); g.connect(this.master);
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
    osc.connect(g); g.connect(this.master);
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
      src.connect(hp); hp.connect(g); g.connect(this.master);
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
      osc.connect(g); g.connect(this.master);
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
      osc.connect(g); g.connect(this.master);
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
      osc.connect(g); g.connect(this.master);
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
      osc.connect(g); g.connect(this.master);
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
    osc.connect(g); g.connect(this.master);
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
      src.connect(bp); bp.connect(g); g.connect(this.master);
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
    src.connect(bp); bp.connect(g); g.connect(this.master);
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
    osc.connect(g); g.connect(this.master);
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
    src.connect(bp); bp.connect(g); g.connect(this.master);
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
    sub.connect(sg); sg.connect(this.master);
    sub.start(t); sub.stop(t + .5);
    // corpo
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(.7);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + .5);
    const g = this.ctx.createGain();
    this.#env(g, t, .003, .55, .75 * vol);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t);
    // estilhaços (curtos pings metálicos decrescentes)
    for (let i = 0; i < 5; i++) {
      const off = .06 + i * .05;
      const ping = this.ctx.createOscillator();
      ping.type = 'triangle'; ping.frequency.value = 1800 + Math.random() * 2200;
      const pg = this.ctx.createGain();
      this.#env(pg, t + off, .001, .05, .1 * vol);
      ping.connect(pg); pg.connect(this.master);
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
      osc.connect(g); g.connect(this.master);
      osc.start(t + off); osc.stop(t + off + .18);
    });
  }
}
