import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOTSTEP_PROFILES, WORLD_AUDIO_PROFILES, footstepProfile, worldAudioProfile } from '../src/game3d/worldAudioProfiles.js';
import { GameAudio } from '../src/game3d/audio3d.js';

test('todos os cinco mundos possuem assinatura acústica e superfície padrão', () => {
  assert.deepEqual(Object.keys(WORLD_AUDIO_PROFILES), ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']);
  for (const profile of Object.values(WORLD_AUDIO_PROFILES)) {
    assert.ok(profile.surface in FOOTSTEP_PROFILES);
    assert.ok(profile.wind >= 0 && profile.wind <= 1);
    assert.ok(profile.rain >= 0 && profile.rain <= 1);
    assert.ok(profile.filter > 0);
  }
});

test('perfis desconhecidos caem nos contratos seguros', () => {
  assert.equal(worldAudioProfile('missing').world, 'CIGKV');
  assert.equal(footstepProfile('missing').band, FOOTSTEP_PROFILES.concrete.band);
});

test('GameAudio troca ambiência sem AudioContext e preserva o estado canônico', () => {
  const audio = new GameAudio();
  const profile = audio.setWorldAmbience('Barburhen', { weather: 'acid-rain', interior: true });
  assert.equal(profile.world, 'Barburhen');
  assert.equal(profile.surface, 'metal');
  assert.equal(profile.weather, 'acid-rain');
  assert.equal(profile.interior, true);
  assert.equal(audio.worldAmbience.rain, .72);
});

test('assinaturas de passo diferenciam metal, lama, areia e pedra', () => {
  const bands = ['metal', 'mud', 'sand', 'stone'].map((surface) => footstepProfile(surface).band);
  assert.equal(new Set(bands).size, bands.length);
  assert.ok(footstepProfile('metal').decay > footstepProfile('sand').decay);
});
