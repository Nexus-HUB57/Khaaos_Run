// Khaaos Run — Task 67: testes da IDENTIDADE SONORA DOS MUNDOS (ambience3d.js).
// Contratos: tabelas puras canônicas, paridade fauna↔mundo (o pedido do
// titular: floresta = pássaros/animais, ilha = mar/gaivotas/ondas, deserto =
// fogo/explosões/vento, urbano = eco/queda/gritos), mix por fase do anel,
// determinismo (SeededRng, zero Math.random), contrato headless e integração
// GameAudio/main3d sem AudioContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENCE_LAYERS, WORLD_AMBIENCE, FAUNA_CALLS, URBAN_CALLS,
  worldAmbience, AmbienceEngine,
} from '../src/game3d/ambience3d.js';
import { GameAudio } from '../src/game3d/audio3d.js';

const WORLDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
const run = (world, seconds = 60, opts = {}) => {
  const e = new AmbienceEngine(world);
  if (opts.urbanProximity !== undefined) e.setUrbanProximity(opts.urbanProximity);
  if (opts.phase !== undefined) e.setPhase(opts.phase);
  if (opts.weather !== undefined) e.state.weather = opts.weather;
  if (opts.interior) e.setInterior(true);
  for (let i = 0; i < seconds * 60; i++) e.tick(1 / 60, { x: 0, z: 0, yaw: 0 });
  return e;
};

test('os cinco mundos possuem identidade sonora canônica completa', () => {
  assert.deepEqual(Object.keys(WORLD_AMBIENCE), WORLDS);
  for (const [id, p] of Object.entries(WORLD_AMBIENCE)) {
    assert.equal(p.world ?? id, id);
    assert.ok(Object.keys(p.layers).length >= 4, `${id} precisa de camadas suficientes`);
    for (const [layer, cfg] of Object.entries(p.layers)) {
      assert.ok(layer in AMBIENCE_LAYERS, `${id}: camada ${layer} é tipo canônico`);
      assert.ok(typeof cfg.base === 'number' && cfg.base >= 0 && cfg.base <= 1, `${id}/${layer} base em [0,1]`);
      assert.ok(Array.isArray(cfg.phase) && cfg.phase.length === 5, `${id}/${layer} tem peso por fase (cânon safeZone)`);
      for (const w of cfg.phase) assert.ok(Number.isFinite(w) && w >= 0, `${id}/${layer} peso finito`);
    }
    // reverb é o ESPAÇO do mundo (eco urbano, slap do deserto) — obrigatório
    assert.ok(p.reverb.rt60 > 0 && p.reverb.rt60 <= 4, `${id}: rt60 plausível`);
    assert.ok(p.reverb.wetSfx >= 0 && p.reverb.wetSfx <= .5, `${id}: wet de passos calibrado`);
    assert.ok(p.reverb.wetAmb >= 0 && p.reverb.wetAmb <= 1, `${id}: wet de ambiência`);
    assert.ok(Array.isArray(p.reverb.taps) && p.reverb.taps.length >= 2, `${id}: reflexos discretos (taps)`);
    // fauna e vida urbana com chamadas conhecidas
    assert.ok(p.fauna.length >= 2, `${id}: fauna audível`);
    for (const [call] of p.fauna) assert.ok(call in FAUNA_CALLS, `${id}: chamada de fauna ${call} existe`);
    assert.ok(p.urban.calls.length >= 3, `${id}: vida urbana audível`);
    for (const [call] of p.urban.calls) assert.ok(call in URBAN_CALLS, `${id}: chamada urbana ${call} existe`);
  }
});

test('o pedido do titular virou identidade: floresta/ilha/deserto/urbano', () => {
  // floresta (CIGKV): pássaros silvestres e animais
  const c = WORLD_AMBIENCE.CIGKV;
  assert.ok(c.fauna.some(([call]) => ['songbird', 'crow', 'woodpecker', 'owl'].includes(call)), 'CIGKV tem pássaros silvestres');
  assert.ok('birds' in c.layers, 'CIGKV tem camada de densidade de pássaros');
  // ilha (Arukheea): mar + gaivotas + ondas quebrando
  const a = WORLD_AMBIENCE.Arukheea;
  assert.ok('waves' in a.layers && a.layers.waves.crestRate > 0, 'Arukheea tem ondas que quebram (cristas)');
  assert.ok(a.fauna.some(([call]) => call === 'gull'), 'Arukheea tem gaivotas');
  assert.ok(a.fauna.some(([call]) => call === 'whaleMoan'), 'Arukheea tem o lamento da baleia (esqueletos canônicos)');
  // deserto (Ckesalth): chamas, explosões e vento
  const k = WORLD_AMBIENCE.Ckesalth;
  assert.ok('fire' in k.layers, 'Ckesalth tem camada de fogo (chamas)');
  assert.ok(k.urban.calls.some(([call]) => call === 'distantExplosion'), 'Ckesalth tem explosões');
  assert.ok(k.layers.wind.base >= .2 && k.layers.wind.sand > 0, 'Ckesalth tem vento de duna com chiado de areia');
  // pântano (Priadus): rãs e o jacaré canônico
  assert.ok(WORLD_AMBIENCE.Priadus.fauna.some(([call]) => call === 'crocBellow'), 'Priadus tem o jacaré');
  assert.ok('waterAnimals' in WORLD_AMBIENCE.Priadus.layers, 'Priadus tem camada de fauna aquática');
  // urbano: eco (reverb longo), queda, grito em TODOS os mundos
  for (const [id, p] of Object.entries(WORLD_AMBIENCE)) {
    assert.ok(p.urban.calls.some(([call]) => ['debrisConcrete', 'metalFall', 'windowGlass'].includes(call)), `${id}: coisas caindo`);
    assert.ok(p.urban.calls.some(([call]) => call === 'screamFar'), `${id}: gritos distantes`);
  }
  assert.ok(WORLD_AMBIENCE.Barburhen.layers.rain.acid === true, 'Barburhen: chuva ácida com sizzle');
});

test('a mistura segue a fase do anel: pressão cresce, pássaros esvaziam', () => {
  for (const [id, p] of Object.entries(WORLD_AMBIENCE)) {
    if ('birds' in p.layers) {
      const [b0, , , , b4] = p.layers.birds.phase;
      assert.ok(b4 < b0, `${id}: pássaros esvaziam com o fechamento do anel`);
    }
    for (const pressure of ['hum', 'waves', 'fire'].filter((k) => k in p.layers)) {
      const ph = p.layers[pressure].phase;
      assert.ok(ph[4] >= ph[0], `${id}: camada de pressão ${pressure} cresce com a fase`);
    }
  }
  // monotonia da vida urbana (pressão da partida)
  for (const p of Object.values(WORLD_AMBIENCE)) {
    assert.ok(p.urban.calls.length >= 3);
    assert.ok(p.layers.urban.phase[4] >= p.layers.urban.phase[0], 'urbano engrossa no fim');
  }
});

test('agenda de eventos é determinística (mesma seed → mesma trilha)', () => {
  const a = run('Ckesalth', 30);
  const b = run('Ckesalth', 30);
  assert.deepEqual(
    a.state.events.map((e) => [e.t, e.family, e.call]),
    b.state.events.map((e) => [e.t, e.family, e.call]),
  );
});

test('densidade de fauna é viva e diferencia os mundos (60 s)', () => {
  const birds = run('CIGKV').state.events.filter((e) => ['songbird', 'crow', 'woodpecker'].includes(e.call)).length;
  const frogs = run('Priadus').state.events.filter((e) => e.call === 'frog').length;
  const gulls = run('Arukheea').state.events.filter((e) => e.call === 'gull').length;
  assert.ok(birds >= 10, `CIGKV: coro de pássaros vivo (${birds} em 60 s)`);
  assert.ok(frogs >= 5, `Priadus: coro de rãs (${frogs} em 60 s)`);
  assert.ok(gulls >= 6, `Arukheea: gaivotas presentes (${gulls} em 60 s)`);
});

test('explosão remota e trovão são do MUNDO (audíveis longe dos distritos)', () => {
  const longe = run('Ckesalth', 120, { urbanProximity: 0 }).state.events.filter((e) => e.call === 'distantExplosion').length;
  const perto = run('Ckesalth', 120, { urbanProximity: 1 }).state.events.filter((e) => e.call === 'distantExplosion').length;
  assert.ok(longe > 0, 'o deserto explode em qualquer ponto do mapa');
  assert.ok(perto > 0, 'e continua explodindo perto dos distritos');
});

test('proximidade urbana e interior modulam a vida sonora', () => {
  const perto = run('Barburhen', 120, { urbanProximity: 1 }).state.events.filter((e) => e.family === 'urban').length;
  const longe = run('Barburhen', 120, { urbanProximity: 0 }).state.events.filter((e) => e.family === 'urban').length;
  assert.ok(perto > longe, `eco urbano cresce perto dos distritos (${perto} > ${longe})`);
  const fora = run('CIGKV', 120);
  const dentro = run('CIGKV', 120, { interior: true });
  const foraBirds = fora.state.events.filter((e) => ['songbird', 'crow', 'woodpecker', 'owl'].includes(e.call)).length;
  const dentroBirds = dentro.state.events.filter((e) => ['songbird', 'crow', 'woodpecker', 'owl'].includes(e.call)).length;
  assert.ok(dentroBirds < foraBirds, 'interior abafa o exterior (damp por camada)');
});

test('contrato de estado headless: setWorld/setPhase/tick funcionam sem AudioContext', () => {
  const e = new AmbienceEngine('CIGKV');
  const snap = e.setWorld('Arukheea', { weather: 'rain', interior: false });
  assert.equal(snap.world, 'Arukheea');
  assert.equal(snap.weather, 'rain');
  assert.equal(e.setPhase(7), 4);          // clamp do cânon 0..4
  assert.equal(e.setPhase(-1), 0);
  e.setUrbanProximity(1.7);                // clamp 0..1
  assert.equal(e.getSnapshot().urbanProximity, 1);
  const s = e.tick(1 / 60, { x: 10, z: 20, yaw: 1, districts: [{ cx: 0, cz: 0 }] });
  assert.equal(typeof s.layerGains, 'object');
  // snapshot não vaza referências mutáveis
  s.layerGains.foo = 1;
  assert.ok(!('foo' in e.getSnapshot().layerGains));
  e.dispose();
});

test('fases mudam os ganhos de camada (crossfade canônico)', () => {
  const e = new AmbienceEngine('Arukheea', { weather: 'rain' });
  e.setPhase(0);
  const f0 = e.state.layerGains.waves;
  e.setPhase(4);
  const f4 = e.state.layerGains.waves;
  assert.ok(f4 > f0, `mar engrossa para o tsunami (${f0} → ${f4})`);
});

test('attach() constrói o grafo e respeita o mundo/clima correntes', () => {
  const e = new AmbienceEngine('Ckesalth');
  e.setWorld('Priadus', { weather: 'clear' });
  // mock mínimo de AudioContext (contrato de nós usado pelo motor)
  class Param { constructor(v = 0) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} setTargetAtTime() {} }
  class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.positionX = new Param(); this.positionY = new Param(); this.positionZ = new Param(); this.forwardX = new Param(); this.forwardY = new Param(); this.forwardZ = new Param(-1); this.upX = new Param(); this.upY = new Param(1); this.upZ = new Param(); } connect() { return this; } disconnect() {} start() {} stop() {} }
  class Ctx { constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = new Node(); this.listener = new Node(); } createGain() { return new Node(); } createOscillator() { return new Node(); } createBufferSource() { return new Node(); } createBiquadFilter() { const n = new Node(); n.type = 'lowpass'; return n; } createPanner() { return new Node(); } createConvolver() { const n = new Node(); n.buffer = null; return n; } createBuffer(c, l) { return { length: l, getChannelData: () => new Float32Array(l) }; } }
  const ctx = new Ctx();
  assert.equal(e.attach(ctx, ctx.destination, ctx.destination), true);
  assert.ok(e._space.buffer.length > 0, 'IR sintetizada');
  assert.ok(Object.keys(e._layers).length >= 4, 'camadas contínuas construídas');
  assert.ok(!('rain' in e._layers), 'chuva sem clima não nasce (gate de weather)');
  assert.ok(e._sfxWet, 'envio wet de SFX (passos no espaço)');
  e.setPhase(3);
  e.tick(1 / 60, { x: 0, z: 0, yaw: 0 });
  e.dispose();
  assert.equal(e.ctx, null);
});

test('renderAudit só roda em browser (Node devolve null sem OfflineAudioContext)', async () => {
  const out = await AmbienceEngine.renderAudit('CIGKV', { seconds: 2 });
  assert.equal(out, null);
});

test('GameAudio integra o motor sem AudioContext (contratos preservados)', () => {
  const audio = new GameAudio();
  // contrato antigo intacto (world-audio-profiles.test.js)
  const profile = audio.setWorldAmbience('Barburhen', { weather: 'acid-rain', interior: true });
  assert.equal(profile.world, 'Barburhen');
  assert.equal(audio.worldAmbience.rain, .72);
  // Task 67: o motor segue a troca de mundo
  assert.equal(audio.ambience.state.world, 'Barburhen');
  assert.equal(audio.ambience.state.weather, 'acid-rain');
  assert.equal(audio.ambience.state.interior, true);
  // fase do anel registra no contrato mesmo sem ctx
  assert.equal(audio.setZonePhase(3, 'Anel Térmico 4'), 3);
  assert.equal(audio.zonePhase.name, 'Anel Térmico 4');
  // tick por frame no-op seguro em headless
  const snap = audio.ambienceTick(1 / 60, { x: 1, z: 2, yaw: 0, districts: [{ cx: 0, cz: 0 }] });
  assert.ok(snap);
  // step sem ctx continua no-op (não explode)
  audio.step(.6, 0, 'metal');
});

test('worldAmbience() cai no contrato seguro para mundo desconhecido', () => {
  assert.equal(worldAmbience('missing').label, WORLD_AMBIENCE.CIGKV.label);
});
