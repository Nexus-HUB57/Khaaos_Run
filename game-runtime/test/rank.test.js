// Khaaos Run — Fase 10: patente do perfil (liderança). A hierarquia canônica do
// POJ alimenta a progressão KRC — mesmo módulo lido pelo cliente e pelo servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankForXp, rankProgress, RANK_THRESHOLDS } from '../src/shared/rank.js';
import { PATENTE_HIERARQUIA, pesoPatente } from '../src/game3d/poj.js';

test('fase10 rank: hierarquia da progressão casa 1:1 com a canônica do POJ', () => {
  assert.deepEqual(
    RANK_THRESHOLDS.map((t) => t.patente),
    PATENTE_HIERARQUIA,
    'patente do perfil usa exatamente a hierarquia do 1º critério de desempate',
  );
});

test('fase10 rank: limiares determinísticos — patente correta por valor acumulado', () => {
  assert.equal(rankForXp(0).patente, 'Recruta');
  assert.equal(rankForXp(1).patente, 'Recruta');
  assert.equal(rankForXp(499).patente, 'Recruta');
  assert.equal(rankForXp(500).patente, 'Soldado');
  assert.equal(rankForXp(1499).patente, 'Soldado');
  assert.equal(rankForXp(1500).patente, 'Cabo');
  assert.equal(rankForXp(3500).patente, 'Sargento');
  assert.equal(rankForXp(7000).patente, 'Sargento-Mor');
  assert.equal(rankForXp(12000).patente, 'Tenente');
  assert.equal(rankForXp(20000).patente, 'Capitão');
  assert.equal(rankForXp(32000).patente, 'Major');
  assert.equal(rankForXp(50000).patente, 'Coronel');
  assert.equal(rankForXp(75000).patente, 'General');
  assert.equal(rankForXp(999999).patente, 'General', 'teto da carreira');
});

test('fase10 rank: valores inválidos pesam como Recruta (nunca explodem)', () => {
  for (const v of [null, undefined, NaN, -100, 'abc', Infinity]) {
    assert.equal(rankForXp(v).patente, 'Recruta');
    assert.equal(rankProgress(v).patente, 'Recruta');
  }
});

test('fase10 rank: rankProgress devolve degrau seguinte, falta de XP e fração', () => {
  const p1 = rankProgress(0);
  assert.equal(p1.peso, 0);
  assert.equal(p1.nextPatente, 'Soldado');
  assert.equal(p1.xpForNext, 500);
  assert.equal(p1.progress, 0);
  const p2 = rankProgress(250);
  assert.equal(p2.peso, pesoPatente('Recruta'), 'peso casa com pesoPatente do POJ');
  assert.ok(Math.abs(p2.progress - 0.5) < 1e-9);
  const p3 = rankProgress(3500);
  assert.equal(p3.patente, 'Sargento');
  assert.equal(p3.nextPatente, 'Sargento-Mor');
  assert.equal(p3.xpForNext, 3500);
  // topo da carreira: progresso 1, sem próxima patente
  const top = rankProgress(120000);
  assert.equal(top.patente, 'General');
  assert.equal(top.nextPatente, null);
  assert.equal(top.xpForNext, 0);
  assert.equal(top.progress, 1);
  assert.equal(top.peso, pesoPatente('General'));
});
