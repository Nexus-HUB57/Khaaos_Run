// Khaaos Run — Fase 12 — Corte Marcial ao vivo: vereditos movem KRC REAL na
// economia (ledger dupla entrada, idempotência por caso), notifier entrega o
// court_verdict ao Ring e a sala anuncia o trem do ZU autoritativamente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Economy, Ledger } from '../server/economy.js';
import { createPojService, KRC_POR_VEREDITO } from '../server/poj.js';
import { MatchRoom3D } from '../server/room3d.js';
import { TRAIN_INTRO_DURATION_MS, estimateClockOffset, serverElapsedMs } from '../src/shared/clock.js';
import { FASES, MOTIVOS_CORTE_MARCIAL, VEREDITOS_CORTE_MARCIAL } from '../src/game3d/poj.js';

const mkService = async ({ balance = 0, enlistmentTotal = 2, cigkvTrigger = 1 } = {}) => {
  const economy = new Economy({ store: new Ledger() });
  if (balance > 0) {
    // semeadura: concessão direta no ledger para o militar ter saldo a multar
    // (await — ledger assíncrono: a multa lê o saldo e precisa da entrada aqui)
    await economy.grant({ userId: 'p2', amount: balance, reason: 'seed', idempotencyKey: `seed:${balance}` });
  }
  const svc = createPojService({ economy, daySeconds: 240, enlistmentTotal, cigkvTrigger });
  return { economy, svc };
};

function startGuerra(svc) {
  svc.proto.register('p1', { name: 'Alfa' });
  svc.proto.register('p2', { name: 'Bravo', patente: 'Sargento' });
  svc.proto.advance(svc.proto.countdown);
  assert.equal(svc.proto.phase, FASES.GUERRA);
}

test('KRC_POR_VEREDITO: tabela canônica dos 4 vereditos', () => {
  assert.deepEqual(KRC_POR_VEREDITO.afastamento, { kind: 'fine', amount: 250 });
  assert.deepEqual(KRC_POR_VEREDITO.reducao_patente, { kind: 'fine', amount: 100 });
  assert.deepEqual(KRC_POR_VEREDITO.honras_de_guerra, { kind: 'grant', amount: 200 });
  assert.deepEqual(KRC_POR_VEREDITO.absolvicao, { kind: 'grant', amount: 100 });
});

test('honras_de_guerra credita +200 KRC reais com idempotência court:caso:veredito', async () => {
  const { economy, svc } = await mkService();
  startGuerra(svc);
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = svc.proto.courtDocket('pendente').cases[0].id;
  const actor = { username: 'kr_admin', role: 'admin', sub: 'kr_admin' };
  const r = await svc.courtVerdict(actor, { caseId, veredito: VEREDITOS_CORTE_MARCIAL.HONRAS_DE_GUERRA, nota: 'Caiu cobrindo a retirada' });
  assert.equal(r.ok, true);
  assert.equal(r.krc.kind, 'grant');
  assert.equal(r.krc.delta, 200);
  assert.equal(r.krc.applied, true);
  assert.equal(r.krc.balance, 200);
  // caso carrega o efeito (ata/histórico do console) + registro canônico
  assert.equal(r.caso.krc.delta, 200);
  assert.equal(r.caso.registro, 'honrado');
  const ledger = economy.store;
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].idempotencyKey, `court:${caseId}:honras_de_guerra`);
  assert.equal(ledger.entries[0].creditAccount, 'player:p2');
  assert.equal(ledger.entries[0].debitAccount, 'treasury:rewards');
  assert.equal(await ledger.balance('player:p2'), 200);
});

test('afastamento aplica multa cheia (250) quando há saldo; reducao_patente multa 100 e degrada patente', async () => {
  const { economy, svc } = await mkService({ balance: 400, enlistmentTotal: 3, cigkvTrigger: 2 });
  // p3 participa do protocolo com saldo próprio (o caído NÃO volta: 2º caso é de OUTRO militar)
  await economy.grant({ userId: 'p3', amount: 100, reason: 'seed', idempotencyKey: 'seed:p3' });
  svc.proto.register('p1', { name: 'Alfa' });
  svc.proto.register('p2', { name: 'Bravo', patente: 'Sargento' });
  svc.proto.register('p3', { name: 'Charlie', patente: 'Tenente' });
  svc.proto.advance(svc.proto.countdown);
  assert.equal(svc.proto.phase, FASES.GUERRA);
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL);
  const caseId1 = svc.proto.courtDocket('pendente').cases[0].id;
  const actor = { username: 'kr_admin', role: 'admin', sub: 'kr_admin' };
  const r1 = await svc.courtVerdict(actor, { caseId: caseId1, veredito: VEREDITOS_CORTE_MARCIAL.AFASTAMENTO });
  assert.equal(r1.krc.applied, true);
  assert.equal(r1.krc.delta, -250);
  assert.equal(r1.krc.balance, 150); // 400 (seed) − 250 (multa)
  const fineEntry = economy.store.entries.find((e) => e.type === 'fine');
  assert.equal(fineEntry.debitAccount, 'player:p2');
  assert.equal(fineEntry.creditAccount, 'treasury:fines');

  // segundo caso: militar DIFERENTE (vida única — p2 não volta a ser julgado)
  svc.proto.courtMartial('p3', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId2 = svc.proto.courtDocket('pendente').cases[0].id;
  assert.notEqual(caseId2, caseId1);
  const r2 = await svc.courtVerdict(actor, { caseId: caseId2, veredito: VEREDITOS_CORTE_MARCIAL.REDUCAO_PATENTE });
  assert.equal(r2.krc.applied, true);
  assert.equal(r2.krc.delta, -100);
  assert.equal(r2.krc.balance, 0); // 100 (seed p3) − 100 (multa)
  // patente no registro degrada um degrau (Tenente → Sargento-Mor) e o caso carrega
  assert.equal(r2.caso.patenteFinal, 'Sargento-Mor');
  assert.equal(r2.caso.registro, 'degradado');
});

test('multa com saldo zero é presa (applied:false, skipped zero_balance) — sem saldo negativo', async () => {
  const { economy, svc } = await mkService({ balance: 0 });
  startGuerra(svc);
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = svc.proto.courtDocket('pendente').cases[0].id;
  const r = await svc.courtVerdict({ username: 'kr_admin', role: 'admin', sub: 'kr_admin' },
    { caseId, veredito: VEREDITOS_CORTE_MARCIAL.AFASTAMENTO });
  assert.equal(r.ok, true);                       // veredito válido — registro aplicado
  assert.equal(r.caso.registro, 'desonrado');
  assert.equal(r.krc.applied, false);
  assert.equal(r.krc.skipped, 'zero_balance');
  assert.equal(r.krc.delta, 0);
  assert.equal(economy.store.entries.length, 0);  // nenhuma entrada no ledger
  assert.equal((await economy.balance('p2')).amount, 0);
});

test('veredito repetido falha (caso_julgado) e NÃO duplica lançamento no ledger', async () => {
  const { economy, svc } = await mkService();
  startGuerra(svc);
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = svc.proto.courtDocket('pendente').cases[0].id;
  const actor = { username: 'kr_admin', role: 'admin', sub: 'kr_admin' };
  await svc.courtVerdict(actor, { caseId, veredito: VEREDITOS_CORTE_MARCIAL.HONRAS_DE_GUERRA });
  assert.equal(economy.store.entries.length, 1);
  assert.throws(
    () => svc.proto.courtVerdict(caseId, VEREDITOS_CORTE_MARCIAL.HONRAS_DE_GUERRA),
    (e) => e.code === 'caso_julgado',
  );
  await svc.courtVerdict(actor, { caseId, veredito: VEREDITOS_CORTE_MARCIAL.HONRAS_DE_GUERRA }).catch(() => {});
  assert.equal(economy.store.entries.length, 1);
  assert.equal((await economy.balance('p2')).amount, 200);
});

test('notifier recebe court_verdict com krc/patente; ledger intacto (dupla entrada)', async () => {
  const { economy, svc } = await mkService({ balance: 30 });
  startGuerra(svc);
  const events = [];
  svc.setNotifier((playerId, event) => events.push({ playerId, event }));
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = svc.proto.courtDocket('pendente').cases[0].id;
  await svc.courtVerdict({ username: 'kr_admin', role: 'admin', sub: 'kr_admin' },
    { caseId, veredito: VEREDITOS_CORTE_MARCIAL.REDUCAO_PATENTE });
  assert.equal(events.length, 1);
  const { playerId, event } = events[0];
  assert.equal(playerId, 'p2');
  assert.equal(event.type, 'court_verdict');
  assert.equal(event.caseId, caseId);
  assert.equal(event.veredito, 'reducao_patente');
  assert.equal(event.patente, 'Cabo');       // Sargento degradado
  assert.equal(event.krcDelta, -30);          // saldo 30 < multa 100 → multa presa em 30
  assert.equal(event.krcApplied, true);
  assert.equal(event.krcBalance, 0);
  assert.equal(await economy.store.integrity(), true);
});

test('serviço sem economia aplica veredito puro (krc none) — retrocompatível', async () => {
  const svc = createPojService({ daySeconds: 240, enlistmentTotal: 2, cigkvTrigger: 1 });
  svc.proto.register('p1', { name: 'Alfa' });
  svc.proto.register('p2', { name: 'Bravo' });
  svc.proto.advance(svc.proto.countdown);
  svc.proto.courtMartial('p2', MOTIVOS_CORTE_MARCIAL.EVASAO);
  const caseId = svc.proto.courtDocket('pendente').cases[0].id;
  const r = await svc.courtVerdict({ username: 'm', sub: 'm' }, { caseId, veredito: VEREDITOS_CORTE_MARCIAL.ABSOLVICAO });
  assert.equal(r.ok, true);
  assert.equal(r.krc.kind, 'none');
  assert.equal(r.caso.registro, 'absolvido');
});

// ---------- Fase 12 — trem do ZU autoritativo na sala ----------
test('room3d: start anuncia o trem (matchStart.train) e o snapshot carrega o anúncio', () => {
  const room = new MatchRoom3D({ id: 'ring3d-train', seed: 'TREME-12', region: 'sa-east', capacity: 4, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'ALFA');
  room.addPlayer('p2', 'BRAVO');
  const lobby = room.snapshot('p1');
  assert.equal(lobby.train, null); // antes do start não há trem
  const before = Date.now();
  assert.ok(room.start('p1', 'belt'));
  const after = Date.now();
  const snap = room.snapshot('p2');
  const evt = snap.events.find((e) => e.type === 'matchStart');
  assert.ok(evt, 'matchStart no snapshot do remoto');
  assert.ok(evt.train, 'anúncio do trem no matchStart');
  assert.ok(evt.train.startedAt >= before && evt.train.startedAt <= after);
  assert.equal(evt.train.durationMs, TRAIN_INTRO_DURATION_MS);
  assert.deepEqual(snap.train, evt.train, 'snapshot carrega o MESMO anúncio (late join/reconexão)');
  // anúncio é único e estável entre snapshots
  assert.deepEqual(room.snapshot('p1').train, evt.train);
});

test('room3d: emitExternal entrega evento externo (court_verdict) ao alvo no snapshot', () => {
  const room = new MatchRoom3D({ id: 'ring3d-ext', seed: 'EXT-12', region: 'sa-east', capacity: 4, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'ALFA');
  room.addPlayer('p2', 'BRAVO');
  room.start('p1', 'belt');
  room.snapshot('p1'); room.snapshot('p2'); // drena eventos do start
  assert.equal(room.emitExternal('ghost', 'court_verdict', { caseId: 'cm-x' }), false);
  assert.equal(room.emitExternal('p2', 'court_verdict', { caseId: 'cm-1', veredito: 'honras_de_guerra', krcDelta: 200 }), true);
  const snap = room.snapshot('p2');
  const evt = snap.events.find((e) => e.type === 'court_verdict');
  assert.ok(evt, 'evento externo no snapshot do alvo');
  assert.equal(evt.caseId, 'cm-1');
  assert.equal(evt.krcDelta, 200);
  // alvo errado não vê o evento do outro
  assert.equal(room.snapshot('p1').events.some((e) => e.type === 'court_verdict'), false);
  // emitExternal também funciona em LOBBY (julgamento entre partidas)
  const lobbyRoom = new MatchRoom3D({ id: 'ring3d-ext2', seed: 'EXT-13', region: 'sa-east', capacity: 4, botFill: 0, airdrop: false });
  lobbyRoom.addPlayer('p1', 'ALFA');
  assert.equal(lobbyRoom.emitExternal('p1', 'court_verdict', { caseId: 'cm-2' }), true);
  assert.ok(lobbyRoom.snapshot('p1').events.some((e) => e.type === 'court_verdict'));
});

test('clock: offset do pong e elapsed do trem (matemática pura da sincronia)', () => {
  // servidor datou now=1000 quando o cliente enviou te=980 com rtt=30 →
  // offset = 1000 − 980 − 15 = 5 ms (servidor à frente)
  assert.equal(estimateClockOffset({ serverNow: 1000, clientSentAt: 980, rtt: 30 }), 5);
  assert.equal(estimateClockOffset({ serverNow: 1000, clientSentAt: 980, rtt: -5 }), 20); // rtt negativo clampado
  assert.equal(estimateClockOffset({ serverNow: NaN, clientSentAt: 980 }), null);
  assert.equal(estimateClockOffset({}), null);
  const offset = 5;
  const startedAt = 900;
  assert.equal(serverElapsedMs(startedAt, offset), Date.now() + offset - startedAt);
  assert.equal(serverElapsedMs(null, offset), null);
  assert.equal(serverElapsedMs(startedAt, null), null);
});
