// Khaaos Run — Fase 10: ponte partida 3D → POJ (reportMatchResult) e o modo
// de integração do fechamento de incursão (evaluateAbsentees). O canônico dos
// 11 artigos permanece intacto; a ponte espelha UMA partida = UMA incursão.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocoloDeOrdemDeJogo, PojError, FASES, MOTIVOS_CORTE_MARCIAL,
} from '../src/game3d/poj.js';
import { createPojService } from '../server/poj.js';

const DAY = 60; // dia comprimido p/ testes (60 s)

// Alista n jogadores e arma a guerra (24 h de contagem → 1 s comprimido).
function warService(ids = ['a', 'b', 'c'], { daySeconds = DAY } = {}) {
  const svc = createPojService({ daySeconds, enlistmentTotal: ids.length, cigkvTrigger: Math.ceil(ids.length / 2) });
  for (const id of ids) svc.register({ sub: id, username: id.toUpperCase(), role: 'player' });
  svc.advance({ seconds: 24 * 3600 }); // contagem canônica do 3º artigo (constante fixa)
  assert.equal(svc.proto.phase, FASES.GUERRA);
  return svc;
}

// ---------- engine: closeIncursion evaluateAbsentees ----------
// Preceito anti-covardia: cada fechamento de mundo elimina quem não fez NENHUMA
// incursão nele. Para alcançar as janelas do 7º dia de Arukheea os sobreviventes
// marcham 1 incursão/dia (todos presentes, ninguém morre) — mesma lição dos
// testes canônicos da Fase 9.
const ARUKHEEA_DAY7 = 27 * DAY; // 3 mundos × 7 dias + 6 dias de Arukheea (tempo DE GUERRA)
function marchTo(proto, warTargetSeconds) {
  let remaining = warTargetSeconds - proto.warElapsed;
  while (remaining > 0) {
    const step = Math.min(remaining, proto.daySeconds - proto.dayElapsed || remaining);
    proto.advance(step);
    remaining -= step;
    if (proto.phase !== FASES.GUERRA) return;
    const inc = proto.summonIncursion();
    for (const id of proto.survivorIds) proto.attendIncursion(inc.id, id);
    proto.closeIncursion(inc.id);
  }
}

test('fase10 poj: closeIncursion canônico avalia ausentes (artigos 8º/10º preservados)', () => {
  const proto = new ProtocoloDeOrdemDeJogo({ daySeconds: DAY, enlistmentTotal: 4, cigkvTrigger: 2 });
  for (const id of ['a', 'b', 'c', 'd']) proto.register(id);
  proto.advance(24 * 3600);
  marchTo(proto, ARUKHEEA_DAY7 + DAY / 4); // dia 7 de Arukheea, 1/4 do dia
  assert.ok(proto.snapshot().windows.regra8_evasao, 'janela do 8º ativa');
  const inc = proto.summonIncursion();
  proto.attendIncursion(inc.id, 'a');
  proto.closeIncursion(inc.id); // canônico: b/c/d evasores
  const snap = proto.snapshot();
  const evaded = snap.players.filter((p) => p.evasions > 0);
  assert.equal(evaded.length, 3, 'ausentes marcados com evasão');
});

test('fase10 poj: closeIncursion({ evaluateAbsentees:false }) NÃO marca evasão — via da ponte', () => {
  const proto = new ProtocoloDeOrdemDeJogo({ daySeconds: DAY, enlistmentTotal: 4, cigkvTrigger: 2 });
  for (const id of ['a', 'b', 'c', 'd']) proto.register(id);
  proto.advance(24 * 3600);
  marchTo(proto, ARUKHEEA_DAY7 + DAY / 4);
  const inc = proto.summonIncursion();
  proto.attendIncursion(inc.id, 'a');
  proto.closeIncursion(inc.id, { evaluateAbsentees: false });
  const snap = proto.snapshot();
  assert.ok(snap.players.every((p) => p.evasions === 0), 'ninguém marcado — presença é resultado da sala');
  assert.equal(snap.incursionsOpen.length, 0, 'incursão fechada');
});

// ---------- service: reportMatchResult ----------
test('fase10 poj-link: reportMatchResult fora de GUERRA não faz nada (e é idempotente)', () => {
  const svc = createPojService({ enlistmentTotal: 2, cigkvTrigger: 1 });
  svc.register('a');
  const summary = svc.reportMatchResult({ matchId: 'm1', results: [{ userId: 'a', survived: true, kills: 3, xp: 40 }] });
  assert.equal(summary.reported, false);
  assert.equal(summary.reason, 'fora_de_guerra');
  const replay = svc.reportMatchResult({ matchId: 'm1', results: [{ userId: 'a', survived: true }] });
  assert.equal(replay.reported, false, 'cache devolve o mesmo resumo');
  assert.equal(svc.proto.incursions.size, 0, 'nenhuma incursão criada');
});

test('fase10 poj-link: fim de partida 3D → attend + eliminate + carreira automáticos', () => {
  const svc = warService(['a', 'b', 'c']);
  const summary = svc.reportMatchResult({
    matchId: 'ring3d-1#1',
    results: [
      { userId: 'a', survived: true, kills: 4, xp: 120 },
      { userId: 'b', survived: false, kills: 1, xp: 30 },
      { userId: 'desconhecido', survived: true, kills: 0, xp: 0 }, // não alistado
      { userId: null, survived: true, kills: 0, xp: 0 },           // sem identidade
    ],
  });
  assert.equal(summary.reported, true);
  assert.ok(summary.incursionId);
  assert.equal(summary.attended, 2, 'a e b compareceram (b morreu)');
  assert.equal(summary.eliminated, 1, 'b caiu — ÚNICA vida consumida');
  assert.equal(summary.skipped, 2, 'não alistado e sem identidade são skipped');
  const snap = svc.proto.snapshot();
  const pa = snap.players.find((p) => p.id === 'a');
  const pb = snap.players.find((p) => p.id === 'b');
  assert.equal(pa.alive, true);
  assert.equal(pa.kills, 4, 'carreira automática: kills');
  assert.equal(pa.xp, 120, 'carreira automática: XP');
  assert.equal(pb.alive, false, 'sem reingresso');
  assert.equal(pb.eliminatedBy, 'kia_incursao');
  assert.equal(snap.survivorsCount, 2);
  assert.equal(snap.incursionsOpen.length, 0, 'incursão espelho fechada');
  // a contagem anti-covardia do mundo NÃO é acionada pela ponte (evaluateAbsentees:false)
  assert.ok(snap.players.every((p) => p.status !== 'corte_marcial'));
});

test('fase10 poj-link: idempotência por matchId — callback repetido não consome vida', () => {
  const svc = warService(['a', 'b']);
  const first = svc.reportMatchResult({ matchId: 'ring3d-2#1', results: [{ userId: 'b', survived: false, kills: 0, xp: 0 }] });
  assert.equal(first.eliminated, 1);
  const replay = svc.reportMatchResult({ matchId: 'ring3d-2#1', results: [{ userId: 'b', survived: false }] });
  assert.equal(replay.replay, true, 'replay sinalizado');
  assert.equal(replay.eliminated, 1, 'mesmo resumo em cache');
  const snap = svc.proto.snapshot();
  assert.equal(snap.incursionsOpen.length, 0);
  assert.equal(svc.proto.incursions.size, 1, 'nenhuma incursão extra criada');
  // partida diferente cria incursão nova normalmente
  const second = svc.reportMatchResult({ matchId: 'ring3d-2#2', results: [{ userId: 'a', survived: true, kills: 2, xp: 50 }] });
  assert.equal(second.reported, true);
  assert.notEqual(second.incursionId, first.incursionId);
});

test('fase10 poj-link: reatendimento de caído cai em failures com código sem_reingresso', () => {
  const svc = warService(['a', 'b']);
  svc.reportMatchResult({ matchId: 'm-x1', results: [{ userId: 'b', survived: false }] });
  // jogador eliminado tenta atender manualmente outra incursão → 403 no HTTP;
  // na ponte, quem caiu nunca volta: attendIncursion lança sem_reingresso
  const inc = svc.proto.summonIncursion();
  assert.throws(() => svc.proto.attendIncursion(inc.id, 'b'), (e) => e instanceof PojError && e.code === 'sem_reingresso');
  assert.equal(svc.proto.players.get('b').alive, false);
});

test('fase10 poj-link: a ponte NÃO aciona a Corte Marcial por desobediência (10º) — só incursões canônicas', () => {
  const svc = warService(['a', 'b', 'c', 'd']);
  // pula para a última hora do 7º dia de Arukheea (janela do 10º)
  marchTo(svc.proto, ARUKHEEA_DAY7 + svc.proto.daySeconds * 0.98);
  assert.ok(svc.proto.snapshot().windows.regra10_horaFinal, 'última hora ativa');
  // duas partidas rodam em paralelo: cada uma espelha sua incursão
  svc.reportMatchResult({ matchId: 'ring-a#1', results: [{ userId: 'a', survived: true, kills: 1, xp: 10 }] });
  svc.reportMatchResult({ matchId: 'ring-b#1', results: [{ userId: 'b', survived: false, kills: 0, xp: 0 }] });
  const snap = svc.proto.snapshot();
  for (const id of ['c', 'd']) {
    const p = snap.players.find((x) => x.id === id);
    assert.equal(p.status, 'ativo', `${id} não é punido pela ponte de outra sala`);
    assert.equal(p.alive, true);
  }
  // já o fechamento CANÔNICO convoca todos e pune ausentes na última hora:
  const inc = svc.proto.summonIncursion();
  svc.proto.attendIncursion(inc.id, 'a');
  svc.proto.closeIncursion(inc.id); // c/d ausentes na última hora → Corte Marcial
  const after = svc.proto.snapshot();
  assert.equal(after.players.find((p) => p.id === 'c').status, 'corte_marcial');
  assert.equal(after.players.find((p) => p.id === 'd').status, 'corte_marcial');
  assert.equal(after.players.find((p) => p.id === 'c').eliminatedBy, MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL);
});

test('fase10 poj-link: officerPlan expõe o plano canônico sem snapshot completo', () => {
  const svc = createPojService({ enlistmentTotal: 1, cigkvTrigger: 1 });
  svc.register('a');
  const plan = svc.officerPlan();
  assert.equal(plan.allowed, false);
  assert.equal(plan.article, null, 'fora do 7º dia de Arukheea');
  assert.ok('reason' in plan);
});
