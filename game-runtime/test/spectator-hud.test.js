// Fase 13 — Espectador remoto consumindo o pipeline /ws/spectator.
// Tudo testado headless: socket falso injetável (o mesmo contrato do WebSocket do
// navegador), view no contrato da sim e câmeras/HUD em funções puras.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  computeStandings, formatCountdown, ringSummary, eventToFeed, spectateHref,
  SPECTATOR_CAMERAS, SpectatorRemote, SpectatorView,
  spectatorCameraPose, spectatorViewModel, SpectatorHUD,
} = await import('../src/game3d/spectator3d.js');

class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  raw(text) { this.onmessage?.({ data: text }); }
}

const player = (over = {}) => ({ id: 'p1', species: 'HURAN', posX: 10, posY: 20, health: 80, shield: 25, isDowned: false, isEliminated: false, kills: 2, ...over });
const ringState = (over = {}) => ({ currentPhase: 1, currentRadius: 520, ringCenter: [30, 0, -40], isShrinking: true, nextPhaseIn: 95, ...over });

// ---------- helpers puros ----------
test('computeStandings: vivos primeiro, abates desc, vida desc, tiebreak por id (determinístico)', () => {
  const s = computeStandings([
    player({ id: 'z', kills: 3, health: 50 }),
    player({ id: 'a', kills: 3, health: 50 }),          // empate total com z → id decide
    player({ id: 'm', kills: 3, health: 90 }),          // mesma kills, mais vida
    player({ id: 'd', kills: 7 }),                      // mais abates
    player({ id: 'out', kills: 20, isEliminated: true }), // morto vai pro fim
  ]);
  assert.deepEqual(s.map((p) => p.id), ['d', 'm', 'a', 'z', 'out']);
  // determinismo: mesma entrada, mesma saída
  assert.deepEqual(computeStandings(s).map((p) => p.id), ['d', 'm', 'a', 'z', 'out']);
});

test('formatCountdown + ringSummary: fase 1-based, raio, estado e contagem MM:SS', () => {
  assert.equal(formatCountdown(95), '01:35');
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(formatCountdown(-3), '00:00');
  assert.equal(formatCountdown(NaN), '00:00');
  const r = ringSummary(ringState());
  assert.deepEqual(r, { fase: 'F2', raio: '520m', estado: 'ENCOLHENDO', contagem: '01:35', shrinking: true });
  assert.equal(ringSummary({ currentPhase: 0, currentRadius: 800, isShrinking: false, nextPhaseIn: 120 }).estado, 'ESTÁVEL');
  assert.equal(ringSummary({}).fase, 'F1', 'estado vazio não explode');
});

test('eventToFeed: os 5 tipos do pipeline viram linhas; tipo desconhecido → null', () => {
  assert.equal(eventToFeed({ type: 'ELIMINATION', data: { killer: 'ZU-1', victim: 'K-Vance', headshot: true } }).msg, 'ZU-1 eliminou K-Vance — HEADSHOT');
  assert.equal(eventToFeed({ type: 'ELIMINATION', data: { killer: 'A', victim: 'B', knock: true } }).msg, 'A nocauteou B');
  assert.equal(eventToFeed({ type: 'REVIVE', data: { by: 'Med', victim: 'K' } }).cls, 'good');
  assert.equal(eventToFeed({ type: 'AIRDROP' }).who, 'LOGÍSTICA');
  assert.equal(eventToFeed({ type: 'RING_PHASE', data: { phase: 3 } }).msg.includes('Fase 3'), true);
  assert.equal(eventToFeed({ type: 'WORLD_TRANSITION', data: { to: 'BARBURHEN' } }).msg, 'Transição de mundo → BARBURHEN');
  assert.equal(eventToFeed({ type: '???', data: {} }), null);
  assert.equal(eventToFeed({}), null, 'evento vazio não explode');
});

// ---------- SpectatorRemote ----------
test('remote: welcome define delayMs/status, batch alimenta last+feed, dedupe e JSON inválido ignorado', () => {
  const remote = new SpectatorRemote({ roomId: 'sala-9', url: 'ws://test', socketFactory: (u) => new FakeSocket(u) });
  const statuses = [];
  remote.onStatus = (s) => statuses.push(s);
  remote.connect();
  const ws = FakeSocket.last;
  assert.equal(ws.url, 'ws://test/ws/spectator?roomId=sala-9&camera=RING_CENTER');
  assert.equal(remote.status, 'CONECTANDO');
  ws.open();
  ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 'spec_1', roomId: 'sala-9', cameraMode: 'RING_CENTER', delayMs: 10000 });
  assert.equal(remote.status, 'LIVE');
  assert.equal(remote.delayMs, 10000);
  // batch 1
  ws.message({ type: 'SPECTATOR_BATCH', roomId: 'sala-9', data: { players: [player()], ringState: ringState() }, events: [{ type: 'AIRDROP', data: {}, timestamp: 1 }], batchSize: 1, timestamp: 2 });
  assert.equal(remote.last.players.length, 1);
  assert.equal(remote.last.ringState.currentRadius, 520);
  assert.equal(remote.feed.length, 1);
  // mesmo evento repetido em outro batch: dedupe
  ws.message({ type: 'SPECTATOR_BATCH', data: { players: [], ringState: ringState() }, events: [{ type: 'AIRDROP', data: {}, timestamp: 1 }], timestamp: 3 });
  assert.equal(remote.feed.length, 1, 'evento duplicado não entra de novo');
  // JSON inválido: nunca quebra
  ws.raw('{quebrado');
  assert.equal(remote.status, 'LIVE');
  assert.ok(statuses.includes('LIVE'));
  ws.close();
  assert.equal(remote.status, 'TRANSMISSÃO ENCERRADA');
  assert.equal(remote.ws, null);
});

test('remote: SET_CAMERA sai pelo socket, cycleFollow gira só entre VIVOS', () => {
  const remote = new SpectatorRemote({ url: 'ws://test', socketFactory: (u) => new FakeSocket(u) });
  remote.connect();
  const ws = FakeSocket.last;
  ws.open();
  remote.setCamera('FOLLOW_PLAYER', 'p2');
  assert.deepEqual(ws.sent.at(-1), { type: 'SET_CAMERA', cameraMode: 'FOLLOW_PLAYER', followPlayerId: 'p2' });
  remote.setCamera('MODO_INVENTADO'); // câmera inválida mantém a atual
  assert.deepEqual(ws.sent.at(-1).cameraMode, 'FOLLOW_PLAYER');
  // feed do pipeline: 2 vivos + 1 eliminado
  remote.last = { players: [player({ id: 'a' }), player({ id: 'b', kills: 4 }), player({ id: 'c', isEliminated: true })], ringState: ringState(), timestamp: 1 };
  remote.followPlayerId = 'a';
  assert.equal(remote.cycleFollow(1).id, 'b', 'next: a → b');
  assert.equal(remote.cycleFollow(1).id, 'a', 'b → volta pro a (c eliminado é pulado)');
  assert.equal(remote.cycleFollow(-1).id, 'b', 'prev volta');
  assert.ok(SPECTATOR_CAMERAS.includes('OVERHEAD') && SPECTATOR_CAMERAS.length === 4);
  remote.dispose();
  assert.equal(remote.status, 'ENCERRADO');
});

// ---------- SpectatorView (contrato da sim) ----------
test('view: batch atrasado vira contrato da sim (bots, knock, ring, vivos) e step é no-op', () => {
  const view = new SpectatorView();
  view.applyBatch({
    players: [
      player({ id: 'x1' }),
      player({ id: 'x2', isDowned: true }),
      player({ id: 'x3', isEliminated: true }),
    ],
    ringState: ringState(),
  });
  assert.equal(view.aliveCount, 2);
  assert.equal(view.bots.length, 3);
  const b1 = view.bots[0];
  assert.equal(b1.x, 10); assert.equal(b1.z, 20); assert.equal(b1.y, 0, 'pipeline é 2D: atores no chão');
  assert.equal(b1.alive, true); assert.equal(b1.knocked, false);
  assert.equal(view.bots[1].knocked, true, 'isDowned → knocked (rastejo DBNO do render)');
  assert.equal(view.bots[2].alive, false, 'eliminado → morte (queda direcional Fase 12)');
  assert.equal(view.ring.x, 30); assert.equal(view.ring.z, -40); assert.equal(view.ring.radius, 520);
  assert.equal(view.ring.pulse, 1, 'fase alimenta o céu dinâmico (skyPhase)');
  view.step(); // transmissão não tem tick local
  assert.deepEqual(view.consumeEvents(), []);
  assert.deepEqual(view.loot, []);
  assert.deepEqual(view.grenades, []);
  assert.equal(view.player.alive, false, 'placeholder do espectador nunca renderiza como jogador');
});

// ---------- câmeras de broadcast ----------
test('câmeras: 4 modos produzem poses distintas e FOLLOW usa o alvo', () => {
  const state = { ringCenter: { x: 100, z: -50 }, ringRadius: 200, follow: { x: 7, y: 0, z: -3 }, time: 10 };
  const poses = SPECTATOR_CAMERAS.map((m) => spectatorCameraPose(m, state));
  // todas acima do chão
  for (const p of poses) assert.ok(p.pos.y > 2, `${p.pos.y} > 2`);
  // FOLLOW mira no alvo
  const f = poses[SPECTATOR_CAMERAS.indexOf('FOLLOW_PLAYER')];
  assert.ok(Math.abs(f.look.x - 7) < 1e-6 && Math.abs(f.look.z + 3) < 1e-6);
  // as 4 poses são distintas entre si
  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j < poses.length; j++) {
      assert.ok(poses[i].pos.distanceTo(poses[j].pos) > 1, `modos ${i} e ${j} devem diferir`);
    }
  }
  // out reutilizado (zero alocação por frame no loop)
  const out = spectatorCameraPose('OVERHEAD', state);
  const out2 = spectatorCameraPose('OVERHEAD', state, out);
  assert.equal(out, out2);
  // modo desconhecido cai no FREECAM (orbita)
  const unk = spectatorCameraPose('???', state);
  const free = spectatorCameraPose('FREECAM', state);
  assert.ok(unk.pos.distanceTo(free.pos) < 1e-6);
});

// ---------- view model + HUD ----------
test('view model: top 8, vivos, followName e atraso em segundos', () => {
  const players = Array.from({ length: 12 }, (_, i) => player({ id: `p${i}`, kills: 11 - i }));
  const vm = spectatorViewModel({ players, ringState: ringState(), status: 'LIVE', delayMs: 10000, camMode: 'FOLLOW_PLAYER', followId: 'p0', feed: [] });
  assert.equal(vm.alive, 12);
  assert.equal(vm.top.length, 8, 'ranking corta em 8');
  assert.equal(vm.top[0].id, 'p0');
  assert.equal(vm.delaySec, 10);
  assert.equal(vm.followName, 'p0');
  assert.equal(vm.ring.estado, 'ENCOLHENDO');
});

test('SpectatorHUD: headless-safe (sem document não explode) e update devolve a VM', () => {
  const hud = new SpectatorHUD({}); // node: document não definido
  assert.equal(hud.root, null);
  hud.pushFeed({ who: 'RING', cls: 'kill', msg: 'teste' });
  const vm = hud.update({ players: [player()], ringState: ringState(), status: 'LIVE', delayMs: 10000 });
  assert.equal(vm.top[0].kills, 2);
  assert.equal(vm.status, 'LIVE');
  hud.show(); hud.hide(); // no-ops seguros
});

// ---------- Fase 14 — nomes reais no standings + botão ASSISTIR ----------
test('spectateHref: código da sala na URL ?spectate=; vazio cai na sala default', () => {
  assert.equal(spectateHref('ABC123'), '/?spectate=ABC123');
  assert.equal(spectateHref('  ABC123  '), '/?spectate=ABC123', 'espaços das bordas não vazam na URL');
  assert.equal(spectateHref(''), '/?spectate=default');
  assert.equal(spectateHref(), '/?spectate=default');
  assert.equal(spectateHref(null), '/?spectate=default');
  assert.equal(spectateHref('SALA 7'), '/?spectate=SALA%207', 'sala com espaço é codificada');
});

test('displayName do pipeline vence: standings do HUD e bots da view mostram o NOME REAL', () => {
  // antes: payload só trazia id/species → standings mostrava espécie ou cauda do id
  const view = new SpectatorView();
  view.applyBatch({
    players: [
      player({ id: 'conn_9f2', displayName: 'Sargento ZHEERS-03', species: 'ZHEERS' }),
      player({ id: 'conn_abc', name: 'Legado-Name', species: 'HURAN' }),   // name legado (2º na cadeia)
      player({ id: 'conn_x9', species: 'KHAEL' }),                          // sem nome → espécie
      player({ id: 'zz1', species: undefined, name: undefined }),           // nada → cauda do id
    ],
    ringState: ringState(),
  });
  assert.deepEqual(view.bots.map((b) => b.name), ['Sargento ZHEERS-03', 'Legado-Name', 'KHAEL', 'zz1']);

  const vm = spectatorViewModel({
    players: [player({ id: 'c1', displayName: 'Khael Vance', kills: 5 })],
    ringState: ringState(), status: 'LIVE', delayMs: 10000, followId: 'c1', feed: [],
  });
  assert.equal(vm.top[0].name, 'Khael Vance', 'ranking top 8 usa o displayName');
  assert.equal(vm.followName, 'Khael Vance', 'alvo seguido usa o displayName');
  assert.equal(vm.top[0].name.length > 0, true);
});

test('eventToFeed: eventos do MatchFlow traduzidos chegam com nomes reais', () => {
  // toSpectatorEvents (servidor) agora emite ELIMINATION/REVIVE com nomes —
  // o feed do espectador exibe exatamente esses dados.
  const elim = eventToFeed({ type: 'ELIMINATION', data: { killer: 'Operative Alpha', victim: 'Bravo', weapon: 'WPN_AssaultRifle_MK1', knock: false } });
  assert.equal(elim.msg, 'Operative Alpha eliminou Bravo');
  assert.equal(elim.cls, 'kill');
  const rev = eventToFeed({ type: 'REVIVE', data: { by: 'Med Alpha', victim: 'Bravo' } });
  assert.equal(rev.msg, 'Med Alpha revivendo Bravo');
});
