// Fase 34 — testes das settings gráficas do jogador (gfxsettings, módulo PURO).
// Cobre: defaults, sanitização (campos inválidos descartados, números clampados),
// round-trip de persistência (blob versionado KR_GFX_SETTINGS_V1), merge parcial,
// blob corrompido → defaults, storage de memória p/ headless e o override de tier
// manual sobre o auto-detect (effectiveBaseTier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GFX_STORAGE_KEY, GFX_DEFAULTS, memoryGfxStorage,
  sanitizeGfxSettings, loadGfxSettings, saveGfxSettings, effectiveBaseTier,
} from '../src/game3d/gfxsettings.js';

test('[gfx] defaults completos e imutáveis', () => {
  assert.deepEqual(GFX_DEFAULTS, { tier: 'auto', postfx: true, drs: true, fps: false, shake: 1, sens: 1 });
  assert.ok(Object.isFrozen(GFX_DEFAULTS));
});

test('[gfx] storage vazio → defaults', () => {
  assert.deepEqual(loadGfxSettings(memoryGfxStorage()), GFX_DEFAULTS);
});

test('[gfx] round-trip: save parcial → load devolve merge sanitizado', () => {
  const s = memoryGfxStorage();
  const saved = saveGfxSettings({ tier: 'medium', sens: 1.8, fps: true }, s);
  assert.equal(saved.tier, 'medium');
  assert.equal(saved.sens, 1.8);
  assert.equal(saved.fps, true);
  assert.equal(saved.postfx, true, 'campo não tocado preserva default');
  const loaded = loadGfxSettings(s);
  assert.deepEqual(loaded, saved);
  const raw = JSON.parse(s.getItem(GFX_STORAGE_KEY));
  assert.equal(raw.sens, 1.8, 'blob persistido contém o valor efetivo');
});

test('[gfx] sanitização: tier inválido descartado; números clampados ao domínio', () => {
  const out = sanitizeGfxSettings({ tier: 'ultra', sens: 99, shake: -3, postfx: 'sim' });
  assert.equal(out.tier, 'auto', 'tier inválido → default');
  assert.equal(out.sens, 2.5, 'sens clampada ao teto');
  assert.equal(out.shake, 0, 'shake clampado ao piso');
  assert.equal(out.postfx, true, 'boolean corrompido → default');
  assert.equal(sanitizeGfxSettings(null).tier, 'auto');
  assert.equal(sanitizeGfxSettings('lixo').sens, 1);
});

test('[gfx] blob corrompido no storage → defaults (nunca lança)', () => {
  const s = memoryGfxStorage();
  s.setItem(GFX_STORAGE_KEY, '{{{não-json');
  assert.deepEqual(loadGfxSettings(s), GFX_DEFAULTS);
});

test('[gfx] storage sem setItem (modo privado) não quebra o save', () => {
  const broken = { getItem: () => null }; // setItem ausente → quota/SecurityError real vira no-op
  const out = saveGfxSettings({ sens: 1.4 }, broken);
  assert.equal(out.sens, 1.4, 'merge devolve o valor efetivo mesmo sem persistir');
});

test('[gfx] effectiveBaseTier: override manual vence; auto preserva o auto-detect', () => {
  assert.equal(effectiveBaseTier('high', { tier: 'low' }), 'low');
  assert.equal(effectiveBaseTier('high', { tier: 'auto' }), 'high');
  assert.equal(effectiveBaseTier('medium', null), 'medium');
  assert.equal(effectiveBaseTier('medium', { tier: 'high' }), 'high');
});
