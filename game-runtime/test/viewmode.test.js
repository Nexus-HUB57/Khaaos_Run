// Task 62 — MODO DE CÂMERA: resolução fps/tps (puro) + prioridades.
// URL ?view= > preferência salva (kr_view_mode) > default TPS (avatar à frente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewMode, sanitizeViewMode, VIEW_STORAGE_KEY } from '../src/game3d/viewmode.js';

test('default é TPS (avatar à frente do console)', () => {
  assert.equal(resolveViewMode({}), 'tps');
  assert.equal(resolveViewMode({ param: null, stored: null }), 'tps');
});

test('?view= da URL vence a preferência salva', () => {
  assert.equal(resolveViewMode({ param: 'fps', stored: 'tps' }), 'fps');
  assert.equal(resolveViewMode({ param: 'tps', stored: 'fps' }), 'tps');
  // legado: ?view=tps continua funcionando; ?view=fps agora também
  assert.equal(resolveViewMode({ param: 'tps' }), 'tps');
});

test('preferência salva vale quando a URL não traz ?view=', () => {
  assert.equal(resolveViewMode({ param: null, stored: 'fps' }), 'fps');
  assert.equal(resolveViewMode({ stored: 'fps' }), 'fps');
});

test('valores inválidos caem no fallback sem explodir', () => {
  assert.equal(resolveViewMode({ param: 'lado', stored: 'x' }), 'tps');
  assert.equal(resolveViewMode({ param: '', stored: '' }), 'tps');
  assert.equal(resolveViewMode({ param: 'FPS', stored: null }), 'fps', 'case-insensitive');
  assert.equal(resolveViewMode({ param: 42, stored: {} }), 'tps', 'tipos estranhos');
  assert.equal(resolveViewMode({ fallback: 'fps' }), 'fps', 'fallback configurável');
});

test('sanitize: só fps/tps são válidos', () => {
  assert.equal(sanitizeViewMode('fps'), 'fps');
  assert.equal(sanitizeViewMode(' TPS '), 'tps');
  assert.equal(sanitizeViewMode('primeira'), null);
  assert.equal(sanitizeViewMode(null), null);
});

test('chave de storage estável p/ o main3d e os testes de UI', () => {
  assert.equal(VIEW_STORAGE_KEY, 'kr_view_mode');
});
