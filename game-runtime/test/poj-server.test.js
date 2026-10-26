// Khaaos Run — POJ na superfície HTTP: /poj/state público, alistamento com
// identidade do token, comandos do Marechal sob RBAC (poj:command) e preceito
// da vida única refletido nos códigos de erro (sem_reingresso → 403).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAuthoritativeServer } from '../server/server.js';
import { createPojService } from '../server/poj.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

const users = [
  { id: 'admin-1', username: 'kr_admin', role: 'admin', region: 'sa-east', passwordHash: hashPassword('kr123') },
  { id: 'player-1', username: 'kr_player', role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') },
  { id: 'player-2', username: 'kr_player2', role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') },
  { id: 'player-3', username: 'kr_player3', role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') },
  { id: 'player-4', username: 'kr_player4', role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') },
];

const login = async (port, username) => (await (await fetch(`http://127.0.0.1:${port}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password: 'kr123' }),
})).json());

test('poj http: estado público, alistamento autenticado e comandos sob RBAC', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-poj-'));
  const app = createAuthoritativeServer({
    port: 0,
    auth: new AuthService({ secret: 'poj-secret', users }),
    store: new DurableJsonStore(path.join(dir, 's.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy-ops',
    // protocolo comprimido p/ o smoke de integração
    poj: createPojService({ daySeconds: 240, enlistmentTotal: 4, cigkvTrigger: 2 }),
  });
  const port = await listen(app.server);
  try {
    // 1) estado público (sem token)
    const state0 = await (await fetch(`http://127.0.0.1:${port}/poj/state`)).json();
    assert.equal(state0.phase, 'alistamento');
    assert.equal(state0.registrations, 0);

    // 2) alistamento exige identidade
    const anon = await fetch(`http://127.0.0.1:${port}/poj/register`, { method: 'POST', body: '{}' });
    assert.equal(anon.status, 401);

    const loginPlayer = await login(port, 'kr_player');
    const loginAdmin = await login(port, 'kr_admin');

    // 3) jogador se alista (patente fora da hierarquia cai para Recruta)
    const reg = await fetch(`http://127.0.0.1:${port}/poj/register`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ patente: 'Almirante' }),
    });
    assert.equal(reg.status, 200);
    const regBody = await reg.json();
    assert.equal(regBody.registrations, 1);
    const dup = await fetch(`http://127.0.0.1:${port}/poj/register`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(dup.status, 409);

    // 4) comandos do Marechal exigem poj:command (player → 403)
    const playerSummon = await fetch(`http://127.0.0.1:${port}/poj/summon`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}` }, body: '{}',
    });
    assert.equal(playerSummon.status, 403);

    // completa a cota de alistamento com os demais alistados reais
    for (const name of ['kr_player2', 'kr_player3', 'kr_player4']) {
      const tok = await login(port, name);
      const r = await fetch(`http://127.0.0.1:${port}/poj/register`, {
        method: 'POST', headers: { authorization: `Bearer ${tok.token}`, 'content-type': 'application/json' }, body: '{}',
      });
      assert.equal(r.status, 200, `${name} alistado`);
    }
    let snap = await (await fetch(`http://127.0.0.1:${port}/poj/state`)).json();
    assert.equal(snap.phase, 'contagem_regressiva', 'alistamento fechou na cota');

    // adianta 24 h do 3º artigo (Marechal)
    const adv = await fetch(`http://127.0.0.1:${port}/poj/advance`, {
      method: 'POST', headers: { 'x-admin-token': 'legacy-ops', 'content-type': 'application/json' },
      body: JSON.stringify({ seconds: 86400 }),
    });
    assert.equal(adv.status, 200);
    snap = await (await fetch(`http://127.0.0.1:${port}/poj/state`)).json();
    assert.equal(snap.phase, 'guerra');
    assert.equal(snap.world, 'Barburhen');
    assert.equal(snap.cigkvOpen, false, 'CIGKV fecha com o início dos Rings');

    // 5) incursão: player não convoca; admin convoca; player atende por si
    const inc = await fetch(`http://127.0.0.1:${port}/poj/summon`, {
      method: 'POST', headers: { 'x-admin-token': 'legacy-ops' }, body: '{}',
    });
    assert.equal(inc.status, 200);
    const incBody = await inc.json();
    assert.ok(incBody.id && Array.isArray(incBody.summoned));

    const attend = await fetch(`http://127.0.0.1:${port}/poj/attend`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ incursionId: incBody.id }),
    });
    assert.equal(attend.status, 200);

    const attendBad = await fetch(`http://127.0.0.1:${port}/poj/attend`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ incursionId: 'inc-999' }),
    });
    assert.equal(attendBad.status, 400);

    const close = await fetch(`http://127.0.0.1:${port}/poj/close`, {
      method: 'POST', headers: { 'x-admin-token': 'legacy-ops', 'content-type': 'application/json' },
      body: JSON.stringify({ incursionId: incBody.id }),
    });
    assert.equal(close.status, 200);

    // 6) preceito: baixa direta do próprio jogador; reingresso negado (403)
    const die = await fetch(`http://127.0.0.1:${port}/poj/eliminate`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ cause: 'kia_incursao' }),
    });
    assert.equal(die.status, 200);
    const dieAgain = await fetch(`http://127.0.0.1:${port}/poj/eliminate`, {
      method: 'POST', headers: { authorization: `Bearer ${loginPlayer.token}`, 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(dieAgain.status, 403);
    const body = await dieAgain.json();
    assert.equal(body.error, 'sem_reingresso');

    // 7) julgamento só fecha com a guerra concluída
    const championEarly = await fetch(`http://127.0.0.1:${port}/poj/champion`, {
      method: 'POST', headers: { 'x-admin-token': 'legacy-ops' }, body: '{}',
    });
    assert.equal(championEarly.status, 409);
  } finally {
    try { app.server.closeAllConnections?.(); } catch {}
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
