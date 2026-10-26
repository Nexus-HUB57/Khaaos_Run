import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Economy, Ledger, PostgresEconomyStore, EconomyError, CURRENCY, REAL_MONEY_ENABLED, assertRealMoneyDisabled, registerOdds, requireOdds, publishedOdds, complianceReport, oddsCatalog } from '../server/economy.js';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

const codeOf = (promise) => promise.then(() => null, (error) => error.code);

test('ledger: dupla entrada, saldo derivado e histórico por conta', async () => {
  const ledger = new Ledger();
  await ledger.appendEntry({ type: 'grant', debitAccount: 'treasury:rewards', creditAccount: 'player:u1', amount: 500, reason: 'vitória' });
  await ledger.appendEntry({ type: 'spend', debitAccount: 'player:u1', creditAccount: 'treasury:spends', amount: 200, reason: 'cosmético' });
  await ledger.appendEntry({ type: 'grant', debitAccount: 'treasury:rewards', creditAccount: 'player:u2', amount: 300, reason: 'evento' });
  assert.equal(await ledger.balance('player:u1'), 300);
  assert.equal(await ledger.balance('player:u2'), 300);
  assert.equal(await ledger.balance('treasury:rewards'), -800); // tesouro emite, saldo negativo por design
  const history = await ledger.history('player:u1');
  assert.equal(history.length, 2);
  assert.equal(history[0].type, 'spend'); // mais recente primeiro
  assert.equal(await ledger.integrity(), true);
  // Invariâncias rejeitam lançamento inválido.
  assert.equal(await codeOf(ledger.appendEntry({ type: 'grant', debitAccount: 'a', creditAccount: 'b', amount: -5 })), 'invalid_amount');
  assert.equal(await codeOf(ledger.appendEntry({ type: 'grant', debitAccount: 'a', creditAccount: 'b', amount: 1.5 })), 'invalid_amount');
  assert.equal(await codeOf(ledger.appendEntry({ type: 'grant', debitAccount: 'same', creditAccount: 'same', amount: 10 })), 'self_transfer');
  assert.equal(await codeOf(ledger.appendEntry({ type: 'grant', debitAccount: '', creditAccount: 'b', amount: 10 })), 'invalid_account');
});

test('ledger: idempotência por chave — retry não duplica prêmio', async () => {
  const ledger = new Ledger();
  const key = crypto.randomUUID();
  const first = await ledger.appendEntry({ type: 'grant', debitAccount: 't', creditAccount: 'player:u1', amount: 100, idempotencyKey: key });
  const second = await ledger.appendEntry({ type: 'grant', debitAccount: 't', creditAccount: 'player:u1', amount: 100, idempotencyKey: key });
  assert.equal(first.id, second.id, 'segunda chamada devolve o lançamento original');
  assert.equal(await ledger.balance('player:u1'), 100);
  assert.equal(await ledger.count(), 1);
});

test('economia: grant com teto diário, spend sem saldo negativo e moeda única KRC', async () => {
  const economy = new Economy({ store: new Ledger(), dailyGrantCap: 1000 });
  assert.equal(CURRENCY, 'KRC');
  await economy.grant({ userId: 'u1', amount: 600, reason: 'vitória', idempotencyKey: 'g1' });
  assert.equal((await economy.balance('u1')).amount, 600);
  // Teto diário: 600 + 500 > 1000 → economy_cap_exceeded.
  assert.equal(await codeOf(economy.grant({ userId: 'u1', amount: 500, reason: 'bônus' })), 'economy_cap_exceeded');
  // Mesmo dia, outro jogador não herda o teto.
  await economy.grant({ userId: 'u2', amount: 500, reason: 'bônus' });
  // Spend até o limite; além disso falha sem negativar.
  await economy.spend({ userId: 'u1', amount: 600, reason: 'skin' });
  assert.equal((await economy.balance('u1')).amount, 0);
  assert.equal(await codeOf(economy.spend({ userId: 'u1', amount: 1, reason: 'skin' })), 'economy_insufficient_funds');
  assert.equal((await economy.balance('u1')).amount, 0);
  // Validações de entrada.
  assert.equal(await codeOf(economy.grant({ userId: '', amount: 10 })), 'invalid_user');
  assert.equal(await codeOf(economy.grant({ userId: 'u1', amount: 0 })), 'invalid_amount');
});

test('compliance: valor real bloqueado por construção e odds publicadas obrigatórias', async () => {
  // Trilhas reais desligadas e congeladas.
  assert.equal(REAL_MONEY_ENABLED, false);
  assert.throws(() => assertRealMoneyDisabled('checkout de KRC'), /real_money_disabled/);
  assert.equal((await complianceReport({ store: new Ledger() })).realMoneyEnabled, false);
  // Odds: sem publicação não há sorteio; soma != 1 rejeita; publicada congela.
  assert.throws(() => requireOdds('loot:airdrop'), /odds_not_published/);
  assert.throws(() => registerOdds('loot:ruim', { comum: 0.5, raro: 0.2 }), /odds_do_not_sum_to_one/);
  assert.throws(() => registerOdds('loot:ruim', { comum: 1.5 }), /invalid_probability/);
  const odds = registerOdds('loot:airdrop', { comum: 0.7, raro: 0.25, lendário: 0.05 });
  assert.equal(Object.isFrozen(odds), true);
  assert.deepEqual(requireOdds('loot:airdrop'), odds);
  assert.ok(oddsCatalog().includes('loot:airdrop'));
  const report = await complianceReport({ store: new Ledger() });
  assert.equal(report.ledgerIntact, true);
  assert.ok(report.guards.includes('no_real_money'));
  assert.ok(report.oddsPublished.includes('loot:airdrop'));
});

test('economia HTTP: saldo/histórico próprios via token, grant só para admin e compliance para admin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-economy-'));
  const auth = new AuthService({
    secret: 'economy-secret',
    users: [
      { id: 'u1', username: 'player', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') },
      { id: 'a1', username: 'chief', role: 'admin', region: 'sa-east', passwordHash: hashPassword('admin', 'salt') },
    ],
  });
  const economy = new Economy({ store: new Ledger() });
  const app = createAuthoritativeServer({ port: 0, auth, economy, store: new DurableJsonStore(path.join(dir, 'state.json')), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const playerToken = auth.login('player', 'pass').token;
  const adminToken = auth.login('chief', 'admin').token;
  try {
    // 401 sem credencial.
    assert.equal((await fetch(`http://127.0.0.1:${port}/economy/balance`)).status, 401);
    // Saldo inicial zero, derivado do token (nunca de parâmetro).
    const balance = await fetch(`http://127.0.0.1:${port}/economy/balance`, { headers: { authorization: `Bearer ${playerToken}` } }).then((r) => r.json());
    assert.equal(balance.amount, 0);
    assert.equal(balance.currency, 'KRC');
    assert.equal(balance.userId, 'u1');
    // Player NÃO concede (economy:grant é admin-only): 403 + rbac.deny na trilha.
    const denied = await fetch(`http://127.0.0.1:${port}/economy/grant`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${playerToken}` },
      body: JSON.stringify({ userId: 'u1', amount: 100 }),
    });
    assert.equal(denied.status, 403);
    const denies = app.audit.query({ action: 'rbac.deny' });
    assert.ok(denies.some((event) => event.detail?.permission === 'economy:grant'));
    // Admin concede com idempotência: retry devolve o mesmo lançamento.
    const grantBody = { userId: 'u1', amount: 750, reason: 'vitória CIGKV', idempotencyKey: 'prize-1' };
    const first = await fetch(`http://127.0.0.1:${port}/economy/grant`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: JSON.stringify(grantBody) });
    assert.equal(first.status, 200);
    const again = await fetch(`http://127.0.0.1:${port}/economy/grant`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: JSON.stringify(grantBody) });
    assert.equal(again.status, 200);
    const firstBody = await first.json();
    const againBody = await again.json();
    assert.equal(firstBody.entry.id, againBody.entry.id, 'idempotência via HTTP');
    // Saldo reflete efeito único; histórico do próprio jogador mostra o prêmio.
    const after = await fetch(`http://127.0.0.1:${port}/economy/balance`, { headers: { authorization: `Bearer ${playerToken}` } }).then((r) => r.json());
    assert.equal(after.amount, 750);
    const history = await fetch(`http://127.0.0.1:${port}/economy/history`, { headers: { authorization: `Bearer ${playerToken}` } }).then((r) => r.json());
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0].amount, 750);
    // Valor inválido → 400 com código de domínio; auditoria registra deny.
    const invalid = await fetch(`http://127.0.0.1:${port}/economy/grant`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ userId: 'u1', amount: -3 }) });
    assert.equal(invalid.status, 400);
    assert.deepEqual((await invalid.json()).error, 'invalid_amount');
    // Compliance: admin vê, player não.
    const compliance = await fetch(`http://127.0.0.1:${port}/economy/compliance`, { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(compliance.status, 200);
    assert.equal((await compliance.json()).realMoneyEnabled, false);
    assert.equal((await fetch(`http://127.0.0.1:${port}/economy/compliance`, { headers: { authorization: `Bearer ${playerToken}` } })).status, 403);
    // Concessões auditadas.
    assert.ok(app.audit.query({ action: 'economy.grant', outcome: 'allow' }).length >= 1);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PostgreSQL: ledger persistido com idempotência e saldo no servidor real', { skip: !(process.env.KR_DATABASE_TEST_URL || process.env.KR_DATABASE_URL) }, async () => {
  const store = new PostgresEconomyStore({ connectionString: process.env.KR_DATABASE_TEST_URL || process.env.KR_DATABASE_URL });
  const key = `test-${crypto.randomUUID()}`;
  try {
    await store.ready();
    const first = await store.appendEntry({ type: 'grant', debitAccount: 'treasury:rewards', creditAccount: 'player:test-economy', amount: 4321, idempotencyKey: key });
    const replay = await store.appendEntry({ type: 'grant', debitAccount: 'treasury:rewards', creditAccount: 'player:test-economy', amount: 4321, idempotencyKey: key });
    assert.equal(first.id, replay.id, 'idempotência no PostgreSQL');
    assert.equal(await store.balance('player:test-economy'), 4321);
    await store.appendEntry({ type: 'spend', debitAccount: 'player:test-economy', creditAccount: 'treasury:spends', amount: 321 });
    assert.equal(await store.balance('player:test-economy'), 4000);
    const history = await store.history('player:test-economy');
    assert.equal(history.length, 2);
    assert.equal(await store.integrity(), true);
    assert.equal(await store.dailyGrantTotal('player:test-economy', Date.now() - 60_000), 4321);
  } finally {
    await store.pool.query('DELETE FROM economy_entries WHERE idempotency_key = $1 OR credit_account = $2 OR debit_account = $2', [key, 'player:test-economy']);
    await store.close();
  }
});
