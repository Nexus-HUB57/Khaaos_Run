// Khaaos Run — Fase 13 — Replay da ata da Corte Marcial na UI do jogador eliminado
// Cobre: construção dos passos da ata (pendente/julgado, variantes de KRC),
// rótulos canônicos e o escopo privacidade do docket (courtCases mine).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtaSteps, rotuloKrc, rotuloMotivo, rotuloVeredito, rotuloRegistro } from '../src/game3d/courtAta.js';
import { createPojService } from '../server/poj.js';
import { MOTIVOS_CORTE_MARCIAL, VEREDITOS_CORTE_MARCIAL, FASES } from '../src/game3d/poj.js';

const casoPendente = {
  id: 'cm-7', playerId: 'p2', name: 'Bravo', patente: 'Sargento',
  motivo: 'evasao', clock: 42, world: 'Barburhen', day: 3,
  evidencia: { evasoes: 3, incursoes: 1, kills: 2, xp: 180, patente: 'Sargento', statusAnterior: 'ativo' },
  status: 'pendente', veredito: null, juiz: null, nota: null, julgadoEm: null,
};

const casoJulgado = {
  ...casoPendente,
  status: 'julgado', veredito: 'honras_de_guerra', juiz: 'Marechal-Khaaos',
  nota: 'Serviu com honra até a queda.', julgadoEm: 51,
  registro: 'honrado', xpVeredito: 200, patenteFinal: 'Sargento',
  krc: { kind: 'grant', amount: 200, delta: 200, applied: true, balance: 4200 },
};

test('ata pendente: 5 passos, veredito/registro aguardando e KRC a definir', () => {
  const steps = buildAtaSteps(casoPendente);
  assert.equal(steps.length, 5);
  const [abertura, evidencia, veredito, registro, fim] = steps;
  assert.ok(abertura.tag.includes('ABERTURA'));
  assert.ok(abertura.lines.some((l) => l.includes('cm-7')));
  assert.ok(abertura.lines.some((l) => l.includes('Bravo')));
  assert.ok(abertura.lines.some((l) => l.includes('vida única')));
  assert.ok(evidencia.lines.some((l) => l.includes('3'))); // evasões
  assert.ok(veredito.lines[0].includes('AGUARDANDO JULGAMENTO'));
  assert.ok(registro.lines[0].includes('ainda não definido'));
  assert.ok(fim.lines.some((l) => l.includes('reingressa')));
});

test('ata julgada: 6 passos com veredito, juiz, nota, registro, XP e KRC', () => {
  const steps = buildAtaSteps(casoJulgado);
  assert.equal(steps.length, 6);
  const [, , veredito, registro, krc] = steps;
  assert.equal(veredito.lines[0], 'Veredito: HONRAS DE GUERRA.');
  assert.ok(veredito.lines.some((l) => l.includes('Marechal-Khaaos')));
  assert.ok(veredito.lines.some((l) => l.includes('Serviu com honra')));
  assert.ok(registro.lines.some((l) => l.includes('HONRADO')));
  assert.ok(registro.lines.some((l) => l.includes('+200 XP')));
  assert.equal(krc.lines[0], '+200 KRC · saldo 4200');
  assert.equal(krc.cls, 'good');
});

test('rótulos canônicos: motivo, veredito e registro', () => {
  assert.equal(rotuloMotivo('evasao'), 'Evasão (8º artigo)');
  assert.equal(rotuloMotivo('desobediencia_final'), 'Desobediência na hora final (10º artigo)');
  assert.equal(rotuloMotivo('desconhecido'), 'desconhecido');
  assert.equal(rotuloVeredito('reducao_patente'), 'REDUÇÃO DE PATENTE');
  assert.equal(rotuloVeredito('absolvicao'), 'ABSOLVIÇÃO');
  assert.equal(rotuloRegistro('desonrado'), 'DESONRADO');
  assert.equal(rotuloRegistro('xyz'), 'xyz');
});

test('rotuloKrc cobre as 6 variantes do efeito econômico', () => {
  assert.equal(rotuloKrc({ kind: 'grant', amount: 200, delta: 200, applied: true, balance: 4200 }), '+200 KRC · saldo 4200');
  assert.equal(rotuloKrc({ kind: 'fine', amount: 250, delta: -100, applied: true, balance: 0 }), '-100 KRC · saldo 0');
  assert.equal(rotuloKrc({ kind: 'fine', amount: 250, delta: 0, applied: false, skipped: 'zero_balance' }), 'multa integralmente presa ao saldo zero — sem efeito em KRC');
  assert.equal(rotuloKrc({ kind: 'none', amount: 0, delta: 0, applied: false }), 'sem efeito em KRC');
  assert.equal(rotuloKrc({ kind: 'grant', amount: 200, delta: 0, applied: false, error: 'economy_unavailable' }), 'movimentação recusada pelo QG (economy_unavailable) — sem efeito em KRC');
  // fonte alternativa: evento court_verdict ao vivo (extra)
  assert.equal(rotuloKrc(null, { krcDelta: -250, krcApplied: true, krcBalance: 150 }), '-250 KRC · saldo 150');
});

test('ata aceita extra do evento ao vivo quando o caso não tem krc gravado', () => {
  const steps = buildAtaSteps({ ...casoJulgado, krc: undefined }, { krcDelta: -250, krcApplied: true, krcBalance: 150 });
  const krcStep = steps[4];
  assert.equal(krcStep.lines[0], '-250 KRC · saldo 150');
});

test('buildAtaSteps rejeita entrada inválida sem lançar', () => {
  assert.deepEqual(buildAtaSteps(null), []);
  assert.deepEqual(buildAtaSteps(undefined), []);
});

// ---------- privacidade do docket: courtCases(status, mineSub) ----------

const mkService = () => {
  const service = createPojService({ daySeconds: 240, enlistmentTotal: 2, cigkvTrigger: 1 });
  service.register({ sub: 'p1', username: 'Alfa', role: 'player' }, {});
  service.register({ sub: 'p2', username: 'Bravo', role: 'player' }, { patente: 'Sargento' });
  service.advance({ seconds: 86400 }); // contagem 24h → GUERRA (o CIGKV fecha com o Ring)
  return service;
};

test('courtCases mine: devolve SOMENTE os casos do próprio militar (contagens escopadas)', () => {
  const service = mkService();
  service.courtMartial({ playerId: 'p1', motivo: MOTIVOS_CORTE_MARCIAL.EVASAO });
  service.courtMartial({ playerId: 'p2', motivo: MOTIVOS_CORTE_MARCIAL.COVARDIA });
  const full = service.courtCases();
  assert.equal(full.cases.length, 2);
  const mine = service.courtCases(null, 'p2');
  assert.equal(mine.mine, true);
  assert.equal(mine.cases.length, 1);
  assert.equal(mine.cases[0].playerId, 'p2');
  assert.equal(mine.pendentes, 1);
  assert.equal(mine.julgados, 0);
  // sem mine, comportamento canônico preservado (console do Marechal)
  assert.equal('mine' in full, false);
});

test('courtCases mine após veredito: julgados escopados e krc visível na ata', async () => {
  const service = mkService();
  service.courtMartial({ playerId: 'p2', motivo: MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL });
  const caseId = service.courtCases('pendente').cases[0].id;
  await service.courtVerdict({ username: 'Marechal-X' }, { caseId, veredito: VEREDITOS_CORTE_MARCIAL.ABSOLVICAO });
  const mine = service.courtCases(null, 'p2');
  assert.equal(mine.julgados, 1);
  assert.equal(mine.pendentes, 0);
  const caso = mine.cases.find((c) => c.id === caseId);
  assert.equal(caso.registro, 'absolvido');
  assert.equal(caso.juiz, 'Marechal-X');
});

test('fumaça do motor: guerra não mudou de fase por conta da Corte', () => {
  const service = mkService();
  service.courtMartial({ playerId: 'p2', motivo: MOTIVOS_CORTE_MARCIAL.EVASAO });
  assert.equal(service.state().phase, FASES.GUERRA);
});
