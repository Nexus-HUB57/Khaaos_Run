// Khaaos Run — Fase 19 — mixagem de volume (KR_AUDIO_*): módulo PURO.
// Contrato de dados: canais canônicos, clamp 0..1, defaults por canal,
// persistência com storage injetável (localStorage real OU memória).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_CHANNELS, AUDIO_CHANNEL_LABELS, AUDIO_MIX_KEYS, DEFAULT_AUDIO_MIX,
  memoryStorage, clampVolume, normalizeAudioMix, loadAudioMix, saveAudioMix,
} from '../src/game3d/audiomix.js';

test('contrato: 4 canais canônicos + chaves KR_AUDIO_* + defaults congelados', () => {
  assert.deepEqual(AUDIO_CHANNELS, ['master', 'sfx', 'world', 'ui']);
  assert.deepEqual(AUDIO_CHANNEL_LABELS, { master: 'GERAL', sfx: 'EFEITOS', world: 'MUNDO', ui: 'INTERFACE' });
  assert.equal(AUDIO_MIX_KEYS.master, 'KR_AUDIO_MASTER');
  assert.equal(AUDIO_MIX_KEYS.sfx, 'KR_AUDIO_SFX');
  assert.equal(AUDIO_MIX_KEYS.world, 'KR_AUDIO_WORLD');
  assert.equal(AUDIO_MIX_KEYS.ui, 'KR_AUDIO_UI');
  // master .5 = volume histórico do jogo; barramentos nascem neutros
  assert.deepEqual(DEFAULT_AUDIO_MIX, { master: .5, sfx: 1, world: 1, ui: 1 });
  assert.ok(Object.isFrozen(DEFAULT_AUDIO_MIX));
  assert.ok(Object.isFrozen(AUDIO_CHANNELS));
});

test('clampVolume: intervalo 0..1, inválidos caem no fallback', () => {
  assert.equal(clampVolume(0), 0);
  assert.equal(clampVolume(1), 1);
  assert.equal(clampVolume(1.5), 1);
  assert.equal(clampVolume(-2), 0);
  assert.equal(clampVolume(.35), .35);
  assert.equal(clampVolume('0.8'), .8, 'string do localStorage');
  assert.equal(clampVolume(NaN, .7), .7);
  assert.equal(clampVolume(Infinity, .4), .4);
  assert.equal(clampVolume(null, .6), .6, 'chave ausente → fallback');
  assert.equal(clampVolume(undefined, .3), .3);
  assert.equal(clampVolume('', .2), .2);
  // arredondamento a 3 casas — zero sujeira de float
  assert.equal(clampVolume(0.123456), .123);
});

test('normalizeAudioMix: merge parcial, desconhecidos fora, base customizável', () => {
  assert.deepEqual(normalizeAudioMix({ sfx: .25 }), { master: .5, sfx: .25, world: 1, ui: 1 });
  assert.deepEqual(
    normalizeAudioMix({ master: 9, sfx: -1, lixo: 5 }, { master: .1, sfx: .2, world: .3, ui: .4 }),
    { master: 1, sfx: 0, world: .3, ui: .4 },
    'clamp + canais desconhecidos ignorados',
  );
  assert.deepEqual(normalizeAudioMix(null), { master: .5, sfx: 1, world: 1, ui: 1 });
  assert.deepEqual(normalizeAudioMix(), { master: .5, sfx: 1, world: 1, ui: 1 });
});

test('loadAudioMix: valores persistidos, ausentes → default, inválidos → default', () => {
  const s = memoryStorage();
  s.setItem('KR_AUDIO_MASTER', '0.9');
  s.setItem('KR_AUDIO_SFX', '0.1');
  s.setItem('KR_AUDIO_WORLD', '2');     // fora do intervalo → clamp
  s.setItem('KR_AUDIO_UI', ' abc ');    // inválido → default
  assert.deepEqual(loadAudioMix(s), { master: .9, sfx: .1, world: 1, ui: 1 });
  // storage vazio: tudo default
  assert.deepEqual(loadAudioMix(memoryStorage()), DEFAULT_AUDIO_MIX);
});

test('saveAudioMix → loadAudioMix: roundtrip fiel (persistência)', () => {
  const s = memoryStorage();
  const salvo = saveAudioMix({ master: .33, sfx: .77, world: 0, ui: 1 }, s);
  assert.deepEqual(salvo, { master: .33, sfx: .77, world: 0, ui: 1 });
  assert.deepEqual(loadAudioMix(s), { master: .33, sfx: .77, world: 0, ui: 1 });
  // save normaliza antes de gravar (nada inválido entra no storage)
  saveAudioMix({ master: 42 }, s);
  assert.equal(s.getItem('KR_AUDIO_MASTER'), '1');
});

test('saveAudioMix: storage que lança (modo privado) nunca quebra', () => {
  const hostil = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); },
    removeItem() { throw new Error('bloqueado'); },
  };
  assert.doesNotThrow(() => saveAudioMix({ master: .5 }, hostil));
  assert.deepEqual(loadAudioMix(hostil), DEFAULT_AUDIO_MIX, 'leitura bloqueada → defaults');
});

test('memoryStorage: isolamento entre instâncias (testes paralelos seguros)', () => {
  const a = memoryStorage(), b = memoryStorage();
  a.setItem('KR_AUDIO_MASTER', '.1');
  assert.equal(b.getItem('KR_AUDIO_MASTER'), null);
  assert.equal(a.getItem('KR_AUDIO_MASTER'), '.1');
  a.clear();
  assert.equal(a.getItem('KR_AUDIO_MASTER'), null);
});

test('node headless (sem localStorage): loadAudioMix() cai na memória → defaults', () => {
  // este processo não tem window/localStorage — o fallback de memória responde
  assert.deepEqual(loadAudioMix(), DEFAULT_AUDIO_MIX);
  assert.doesNotThrow(() => saveAudioMix({ world: .5 }));
});
