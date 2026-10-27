// Khaaos Run — Fase 18 — áudio imersivo das sobrevivências + game feel de abate.
// Headless: node não tem AudioContext (window ausente) → ctx null. O CONTRATO
// de estado (survivalLayers) continua registrado; todos os caminhos sonoros
// são no-op seguros. Nenhum setTimeout de duration é agendado sem ctx real
// (a suíte nunca pendura o event loop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game3d/audio3d.js';

test('survival: liga camada por hazard e registra kind/intensity no contrato', () => {
  const a = new GameAudio();
  a.survival('tsunami', true);
  a.survival('lava', true, { intensity: .5 });
  assert.equal(a.survivalLayers.tsunami.kind, 'tsunami');
  assert.equal(a.survivalLayers.lava.intensity, .5);
  // sem ctx (headless) nenhum nó é criado
  assert.deepEqual(a.survivalNodes, {});
});

test('survival: intensity default 1 e startedAt preenchido', () => {
  const a = new GameAudio();
  a.survival('gravity', true);
  assert.equal(a.survivalLayers.gravity.intensity, 1);
  assert.ok(Number.isFinite(a.survivalLayers.gravity.startedAt));
});

test('survival: off remove a camada e ignora teardown sem nós', () => {
  const a = new GameAudio();
  a.survival('tsunami', true);
  a.survival('tsunami', false);
  assert.equal('tsunami' in a.survivalLayers, false);
  a.survival('tsunami', false); // off repetido nunca quebra
  assert.deepEqual(a.survivalNodes, {});
});

test('survival: duration não agenda timer headless (ctx null)', async () => {
  const a = new GameAudio();
  a.survival('acid', true, { duration: 2.2 });
  assert.ok(a.survivalLayers.acid, 'camada registrada');
  // se um timer tivesse sido agendado, ele dispararia e a camada sumiria;
  // sem ctx o contrato é determinístico: camada permanece até off manual.
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(a.survivalLayers.acid, 'sem auto-off headless');
});

test('stopAllSurvival: mata TODAS as camadas de uma vez', () => {
  const a = new GameAudio();
  a.survival('tsunami', true);
  a.survival('lava', true);
  a.survival('gravity', true);
  a.survival('acid', true);
  assert.equal(Object.keys(a.survivalLayers).length, 4);
  a.stopAllSurvival();
  assert.deepEqual(a.survivalLayers, {});
});

test('stopAllSurvival sem camadas é no-op', () => {
  const a = new GameAudio();
  a.stopAllSurvival();
  assert.deepEqual(a.survivalLayers, {});
});

test('stingers e confirmações são no-op seguros sem AudioContext', () => {
  const a = new GameAudio();
  for (const kind of ['tsunami', 'lava', 'gravity', 'acid', 'desconhecido']) {
    a.hazardStinger(kind); // nunca lança
  }
  a.killConfirm(false);
  a.killConfirm(true);
  a.knockTick();
  assert.ok(true);
});

test('hazards distintos coexistem como camadas independentes', () => {
  const a = new GameAudio();
  a.survival('tsunami', true);
  a.survival('gravity', true);
  a.survival('tsunami', false); // só o tsunami termina
  assert.deepEqual(Object.keys(a.survivalLayers), ['gravity']);
});

test('enabled=false mantém o contrato de estado (mesma gramática do legado)', () => {
  const a = new GameAudio();
  a.enabled = false;
  a.survival('lava', true);
  assert.ok(a.survivalLayers.lava, 'estado registrado mesmo silenciado');
  a.survival('lava', false);
  assert.deepEqual(a.survivalLayers, {});
});
