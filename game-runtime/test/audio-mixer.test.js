// Khaaos Run — Fase 19 — mixagem no GameAudio: barramentos sfx/world/ui →
// master (KR_AUDIO_*). Headless (sem AudioContext) o contrato é de ESTADO
// (this.mix normalizado); com FakeAudioContext mínimo validamos os GANHOS
// reais dos nós — init cria os buses e setMix aplica ao vivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game3d/audio3d.js';
import { DEFAULT_AUDIO_MIX, memoryStorage } from '../src/game3d/audiomix.js';

test('contrato headless: mix default + setMix parcial normalizado (sem ctx)', () => {
  const a = new GameAudio();
  assert.deepEqual(a.mix, DEFAULT_AUDIO_MIX);
  assert.equal(a.buses, null, 'buses só nascem no init');
  const ret = a.setMix({ sfx: .25, master: 7, lixo: 3 });
  assert.deepEqual(ret, { master: 1, sfx: .25, world: 1, ui: 1 }, 'clamp + desconhecidos fora');
  assert.deepEqual(a.mix, ret, 'estado registrado');
  assert.notEqual(a.mix, ret, 'retorno é cópia');
});

test('contrato headless: setMix antes do init é aplicado aos ganhos no init', () => {
  const a = new GameAudio();
  a.setMix({ master: .2, world: .5 });
  // sem ctx os métodos continuam no-op seguros
  assert.doesNotThrow(() => { a.shot('m4', 30); a.survival('tsunami', true); a.stopAllSurvival(); a.setMix({}); });
});

test('contrato headless: nós injetados recebem os ganhos ao vivo (master + buses)', () => {
  const a = new GameAudio();
  a.master = { gain: { value: 0 } };
  a.buses = { sfx: { gain: { value: 0 } }, world: { gain: { value: 0 } }, ui: { gain: { value: 0 } } };
  a.setMix({ master: .5, sfx: .8, world: .3, ui: .6 });
  assert.equal(a.master.gain.value, .5);
  assert.equal(a.buses.sfx.gain.value, .8);
  assert.equal(a.buses.world.gain.value, .3);
  assert.equal(a.buses.ui.gain.value, .6);
  // slider arrastando: cada mudança aplica só o canal pedido, resto intacto
  a.setMix({ sfx: .1 });
  assert.equal(a.buses.sfx.gain.value, .1);
  assert.equal(a.master.gain.value, .5, 'master intacto');
  assert.equal(a.buses.world.gain.value, .3, 'world intacto');
});

// ---------- FakeAudioContext mínimo (só o que init()/#startAmbient usam) ----------
class FakeParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() {} setTargetAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {}
}
class FakeNode {
  constructor() {
    this.gain = new FakeParam(1); this.frequency = new FakeParam(440); this.Q = new FakeParam(1);
    this.type = ''; this.buffer = null; this.loop = false;
  }
  connect() { return arguments[0]; }
  start() {} stop() {} disconnect() {}
}
class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = new FakeNode(); }
  createGain() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() {}
}

test('init com FakeAudioContext: master ganha mix.master e buses nascem por canal', () => {
  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const a = new GameAudio();
    a.setMix({ master: .32, world: .4 }); // ANTES do init (mixagem persistida)
    a.init();
    assert.ok(a.ctx, 'ctx criado');
    assert.equal(a.master.gain.value, .32, 'master recebe mix persistida');
    assert.deepEqual(Object.keys(a.buses), ['sfx', 'world', 'ui']);
    assert.equal(a.buses.sfx.gain.value, 1, 'default neutro');
    assert.equal(a.buses.world.gain.value, .4);
    assert.equal(a.buses.ui.gain.value, 1);
    // setMix AO VIVO depois do init aplica nos nós
    a.setMix({ world: .15, ui: 0 });
    assert.equal(a.buses.world.gain.value, .15);
    assert.equal(a.buses.ui.gain.value, 0);
    assert.equal(a.master.gain.value, .32, 'master intacto');
    // init repetido é idempotente
    const sameCtx = a.ctx;
    a.init();
    assert.equal(a.ctx, sameCtx);
  } finally {
    delete globalThis.window;
  }
});

test('famílias roteadas nos barramentos CERTOS (assinatura de conexão por família)', () => {
  // intercepta connect() p/ registrar o destino de cada nó de saída
  const log = [];
  class SpyCtx extends FakeAudioContext {
    createGain() {
      const node = new FakeNode();
      node.connect = (dest) => { log.push([node, dest]); return dest; };
      return node;
    }
  }
  globalThis.window = { AudioContext: SpyCtx };
  try {
    const a = new GameAudio();
    a.init();
    const { master, buses } = a;
    log.length = 0; // descarta as conexões estruturais do init/ambient
    a.ui();                    // INTERFACE
    a.ringWarn();              // INTERFACE
    a.stinger(false);          // INTERFACE
    a.shot('m4', 0);           // EFEITOS
    a.hit(true); a.hurt(); a.reload(); a.pickup(); a.heartbeat();
    a.chuteOpen(); a.land(); a.fragThrow(); a.explosion(0); a.gloo();
    a.killConfirm(true); a.knockTick(); a.ability('heal', 0);
    a.wind(true, .4);          // MUNDO
    a.survival('tsunami', true); // MUNDO
    for (const [node, dest] of log) {
      if (typeof dest?.connect !== 'function') continue; // modulação (Gain → AudioParam, ex: LFO do tsunami)
      const isBus = Object.values(buses).includes(dest);
      assert.ok(isBus || dest === master, 'toda saída desemboca num barramento ou master');
      assert.notEqual(dest, a.ctx.destination, 'ninguém fura a mixagem indo direto ao destino');
    }
    // no mínimo: ui chamou o canal ui; tiros chamaram o canal sfx; mundo chamou world
    assert.ok(log.some(([, d]) => d === buses.ui), 'sons de INTERFACE no canal ui');
    assert.ok(log.some(([, d]) => d === buses.sfx), 'sons de COMBATE no canal sfx');
    assert.ok(log.some(([, d]) => d === buses.world), 'sons de MUNDO no canal world');
    a.survival('tsunami', false);
  } finally {
    delete globalThis.window;
  }
});

test('mixagem não quebra o contrato Fase 18 (survivalLayers segue registrado)', () => {
  const a = new GameAudio();
  a.setMix({ world: 0 }); // mundo silenciado PELA MIXAGEM (não pelo enabled)
  a.survival('lava', true, { intensity: .5 });
  assert.equal(a.survivalLayers.lava.intensity, .5, 'estado continua canônico');
  assert.equal(a.enabled, true, 'mixagem é independente do mute global');
  a.survival('lava', false);
  assert.deepEqual(a.survivalLayers, {});
});
