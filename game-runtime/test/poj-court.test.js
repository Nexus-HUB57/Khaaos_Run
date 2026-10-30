// Khaaos Run — Fase 11 — Corte Marcial jogável (motor POJ puro).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocoloDeOrdemDeJogo, PojError, PATENTE_HIERARQUIA, FASES,
  MOTIVOS_CORTE_MARCIAL, VEREDITOS_CORTE_MARCIAL,
} from '../src/game3d/poj.js';

const mkProto = () => new ProtocoloDeOrdemDeJogo({ daySeconds: 240, enlistmentTotal: 2, cigkvTrigger: 1 });

function startGuerra(proto) {
  proto.register('p1', { name: 'Alfa' });
  proto.register('p2', { name: 'Bravo', patente: 'Sargento' });
  assert.equal(proto.phase, FASES.CONTAGEM);
  proto.advance(proto.countdown);
  assert.equal(proto.phase, FASES.GUERRA);
  return proto;
}

test('corte marcial gera caso pendente com evidência e derruba o militar (vida única)', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const docket = proto.courtDocket();
  assert.equal(docket.pendentes, 1);
  const caso = docket.cases[0];
  assert.equal(caso.playerId, 'p2');
  assert.equal(caso.motivo, 'evasao');
  assert.equal(caso.status, 'pendente');
  assert.equal(caso.evidencia.patente, 'Sargento');
  const p2 = proto.players.get('p2');
  assert.equal(p2.alive, false);            // vida única — queda imediata
  assert.equal(p2.status, 'corte_marcial');
  assert.equal(p2.registro, undefined);     // registro só é definido no julgamento
});

test('veredito afastamento: patente no registro reduzida a Recruta', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL);
  const caseId = proto.courtDocket('pendente').cases[0].id;
  const r = proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.AFASTAMENTO, { judge: 'Marechal-X' });
  assert.equal(r.ok, true);
  const p2 = proto.players.get('p2');
  assert.equal(p2.patente, 'Recruta');
  assert.equal(p2.registro, 'desonrado');
  assert.equal(p2.alive, false);            // NUNCA reingressa
  const caso = proto.courtDocket().cases.find((c) => c.id === caseId);
  assert.equal(caso.status, 'julgado');
  assert.equal(caso.juiz, 'Marechal-X');
});

test('veredito reducao_patente: degrada um degrau na hierarquia', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = proto.courtDocket('pendente').cases[0].id;
  proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.REDUCAO_PATENTE);
  const p2 = proto.players.get('p2');
  const idx = PATENTE_HIERARQUIA.indexOf('Sargento');
  assert.equal(p2.patente, PATENTE_HIERARQUIA[Math.max(0, idx - 1)]); // Cabo
  assert.equal(p2.registro, 'degradado');
});

test('veredito honras_de_guerra: +200 XP memorial e registro honrado', () => {
  const proto = startGuerra(mkProto());
  const xpAntes = proto.players.get('p2').xp;
  proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = proto.courtDocket('pendente').cases[0].id;
  proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.HONRAS_DE_GUERRA, { note: 'Caiu cobrindo a retirada' });
  const p2 = proto.players.get('p2');
  assert.equal(p2.xp, xpAntes + 200);
  assert.equal(p2.registro, 'honrado');
  const caso = proto.courtDocket('julgado').cases[0];
  assert.equal(caso.nota, 'Caiu cobrindo a retirada');
});

test('veredito absolvicao: +100 XP de reparação e registro limpo', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p1', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = proto.courtDocket('pendente').cases[0].id;
  proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.ABSOLVICAO);
  const p1 = proto.players.get('p1');
  assert.equal(p1.registro, 'absolvido');
  assert.ok(p1.xp >= 100);
});

test('vereditos inválidos: caso inexistente, caso julgado e veredito desconhecido', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p1', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = proto.courtDocket('pendente').cases[0].id;
  assert.throws(() => proto.courtVerdict('cm-999', 'afastamento'), (e) => e instanceof PojError && e.code === 'caso_invalido');
  assert.throws(() => proto.courtVerdict(caseId, 'fuzilamento'), (e) => e instanceof PojError && e.code === 'veredito_invalido');
  proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.ABSOLVICAO);
  assert.throws(() => proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.ABSOLVICAO), (e) => e instanceof PojError && e.code === 'caso_julgado');
});

test('8º artigo: 4ª evasão no dia 7 de Arukheea cria caso automaticamente', () => {
  const proto = startGuerra(mkProto());
  // 27 dias comparecidos (Barburhen→Priadus→Ckesalth + Arukheea dias 1–6):
  // covardia mundial nunca se aplica. O avanco pousa no INÍCIO do dia 7.
  for (let d = 1; d <= 27; d++) {
    const inc = proto.summonIncursion();
    proto.attendIncursion(inc.id, 'p1');
    proto.attendIncursion(inc.id, 'p2');
    proto.closeIncursion(inc.id);
    proto.advance(240 - proto.dayElapsed);
  }
  assert.equal(proto.snapshot().world, 'Arukheea');
  assert.equal(proto.day, 7);
  const p1 = proto.players.get('p1');
  const p2 = proto.players.get('p2');
  assert.ok(p1.alive && p2.alive, 'ambos vivos ao entrar no dia 7 (compareceram em todos os mundos)');
  // dia 7, primeiras 12 h (120 s de 240): 4 incursões evadidas → 4ª remete à Corte
  for (let e = 0; e < 4; e++) proto.closeIncursion(proto.summonIncursion().id);
  assert.ok(p1.evasions >= 4, 'p1 acumulou 4 evasões nas primeiras 12 h');
  assert.equal(p1.alive, false, '4ª evasão consome o militar (queda imediata)');
  assert.equal(p1.status, 'corte_marcial');
  const pend = proto.courtDocket('pendente').cases;
  assert.ok(pend.some((c) => c.playerId === 'p1' && c.motivo === MOTIVOS_CORTE_MARCIAL.EVASAO), '4ª evasão remete p1 à Corte Marcial');
});

test('snapshot carrega resumo da Corte (pendentes/julgados)', () => {
  const proto = startGuerra(mkProto());
  proto.courtMartial('p1', MOTIVOS_CORTE_MARCIAL.COVARDIA);
  const s = proto.snapshot();
  assert.equal(s.court.pendentes, 1);
  assert.equal(s.court.julgados, 0);
});
