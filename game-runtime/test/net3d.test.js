import assert from 'node:assert/strict';
import { test } from 'node:test';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closeCalls = 0;
    this.throwOnClose = false;
    FakeWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() {
    this.closeCalls++;
    if (this.throwOnClose) throw new Error('socket already closed');
    this.readyState = FakeWebSocket.CLOSED;
  }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  closeEvent(code = 1006) { this.onclose?.({ code }); }
  error() { this.onerror?.(); }
  message(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
}

async function withNetworkEnvironment(run) {
  const oldDescriptors = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    WebSocket: Object.getOwnPropertyDescriptor(globalThis, 'WebSocket'),
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'),
    fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
  };
  const oldDateNow = Date.now;
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  const oldSetInterval = globalThis.setInterval;
  const oldClearInterval = globalThis.clearInterval;
  let now = 1000;
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const storage = new MemoryStorage({ kr_token: 'token-1', kr_resume_3d: 'resume-1' });
  FakeWebSocket.instances = [];

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: FakeWebSocket });
  Object.defineProperty(globalThis, 'performance', { configurable: true, writable: true, value: { now: () => now } });
  Date.now = () => 5000;
  globalThis.setTimeout = (fn, delay = 0) => {
    const id = nextId++;
    timeouts.set(id, { fn, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timeouts.delete(id);
  globalThis.setInterval = (fn, delay = 0) => {
    const id = nextId++;
    intervals.set(id, { fn, delay });
    return id;
  };
  globalThis.clearInterval = (id) => intervals.delete(id);

  try {
    const { NetClient3D } = await import('../src/game3d/net3d.js');
    const env = {
      NetClient3D,
      storage,
      timeouts,
      intervals,
      sockets: FakeWebSocket.instances,
      now(value) { now = value; },
      runTimeout(id = timeouts.keys().next().value) {
        const timer = timeouts.get(id);
        if (!timer) return false;
        timeouts.delete(id);
        timer.fn();
        return true;
      },
      restore() {
        Date.now = oldDateNow;
        globalThis.setTimeout = oldSetTimeout;
        globalThis.clearTimeout = oldClearTimeout;
        globalThis.setInterval = oldSetInterval;
        globalThis.clearInterval = oldClearInterval;
        for (const [key, descriptor] of Object.entries(oldDescriptors)) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else delete globalThis[key];
        }
      },
    };
    await run(env);
  } finally {
    Date.now = oldDateNow;
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
    globalThis.setInterval = oldSetInterval;
    globalThis.clearInterval = oldClearInterval;
    for (const [key, descriptor] of Object.entries(oldDescriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('NetClient3D covers auth, matchmaking, rooms, telemetry, reconciliation and interpolation', async () => {
  await withNetworkEnvironment(async (env) => {
    const { NetClient3D } = env;
    const statuses = [];
    const snapshots = [];
    const events = [];
    const rejected = [];
    const privateCreated = [];
    const privateJoined = [];
    const privateErrors = [];
    const net = new NetClient3D({
      url: 'wss://game.example',
      onStatus: (status) => statuses.push(status),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onEvent: (event) => events.push(event),
      onRejected: (message) => rejected.push(message),
      onPrivateCreated: (code) => privateCreated.push(code),
      onPrivateJoined: (code) => privateJoined.push(code),
      onPrivateError: (message) => privateErrors.push(message),
    });
    assert.equal(net.token, 'token-1');
    assert.equal(net.resume, 'resume-1');
    assert.equal(net.latest(), null);
    assert.equal(net.serverNow(), 5000);
    assert.equal(net.serverElapsed(4000), 1000);
    assert.equal(net.serverElapsed(Number.NaN), null);
    assert.equal(net.recommendedDelay(), 110);

    const loginCalls = [];
    globalThis.fetch = async (url, options) => {
      loginCalls.push({ url, options });
      return { ok: true, json: async () => ({ token: 'fresh-token' }) };
    };
    const login = await NetClient3D.login('pilot', 'secret', 'https://api.example');
    assert.equal(login.token, 'fresh-token');
    assert.equal(loginCalls[0].url, 'https://api.example/auth/login');
    assert.deepEqual(JSON.parse(loginCalls[0].options.body), { username: 'pilot', password: 'secret' });
    assert.equal(env.storage.getItem('kr_token'), 'fresh-token');

    net.setOperative('OP_FEMALE_DISRUPTOR_MENA');
    net.connect();
    let socket = env.sockets.at(-1);
    const url = new URL(socket.url);
    assert.equal(url.pathname, '/ws');
    assert.equal(url.searchParams.get('token'), 'token-1');
    assert.equal(url.searchParams.get('mode'), '3d');
    assert.equal(url.searchParams.get('resume'), 'resume-1');
    socket.error();
    assert.equal(statuses.at(-1), 'FALHA DE REDE');
    socket.open();
    assert.equal(net.retry, 0);
    assert.equal(net.connectedAt, 1000);
    assert.equal(statuses.at(-1), 'AUTENTICADO // MATCHMAKING 3D');
    assert.equal(env.intervals.size, 1);
    const pingTimer = [...env.intervals.values()][0];
    const sendsBeforePing = socket.sent.length;
    socket.readyState = 0;
    pingTimer.fn();
    assert.equal(socket.sent.length, sendsBeforePing);
    socket.readyState = FakeWebSocket.OPEN;
    pingTimer.fn();
    assert.equal(socket.sent.at(-1).type, 'ping');

    env.now(1012);
    socket.message({ type: 'pong', t: 1000, te: 900, now: 970 });
    assert.equal(net.rtt, 12);
    assert.equal(net.clockOffset, 64);
    const savedOffset = net.clockOffset;
    socket.message({ type: 'pong', t: 1000, te: 'bad', now: 'bad' });
    assert.equal(net.clockOffset, savedOffset);
    assert.equal(net.serverNow(), 5064);
    assert.equal(net.serverElapsed(4000), 1064);

    net.pending = [{ input: { seq: 1 } }, { input: { seq: 2 } }, { input: { seq: 3 } }];
    socket.message({ type: 'match_found', id: 'player-1', region: 'eu', resumeToken: 'resume-2', snapshot: {
      player: { ackSeq: 2 }, events: [{ id: 'evt-match' }], seq: 1,
    } });
    assert.equal(net.myId, 'player-1');
    assert.equal(net.resume, 'resume-2');
    assert.equal(env.storage.getItem('kr_resume_3d'), 'resume-2');
    assert.equal(net.pending.length, 1);
    assert.equal(net.pending[0].input.seq, 3);
    assert.deepEqual(events, [{ id: 'evt-match' }]);
    assert.ok(socket.sent.some((message) => message.type === 'set_operative'));
    socket.message({ type: 'resumed', region: 'na', id: 'player-2' });
    assert.equal(net.myId, 'player-2');
    assert.match(statuses.at(-1), /SESSÃO RETOMADA/);
    socket.message({ type: 'auth_required' });
    assert.equal(statuses.at(-1), 'LOGIN NECESSÁRIO');
    socket.message({ type: 'private_created', id: 'private-owner', code: 'K7Q2', snapshot: { events: [] } });
    assert.deepEqual(privateCreated, ['K7Q2']);
    socket.message({ type: 'private_joined', id: 'private-guest', code: 'M4N8' });
    assert.deepEqual(privateJoined, ['M4N8']);
    socket.message({ type: 'private_not_found' });
    socket.message({ type: 'private_error' });
    assert.equal(privateErrors.length, 2);
    assert.match(privateErrors[0], /Código não encontrado/);
    assert.match(privateErrors[1], /modo 3D/);
    const rejectedMessage = { type: 'rejected', reason: 'bad input' };
    socket.message(rejectedMessage);
    assert.deepEqual(rejected, [rejectedMessage]);
    socket.message({ type: 'snapshot', snapshot: { seq: 4, events: [{ id: 'evt-snapshot' }] } });
    assert.equal(snapshots.length, 3);
    socket.message({ type: 'rate_limited' });
    assert.equal(statuses.at(-1), 'RATE LIMIT // AGUARDE');
    socket.message({ type: 'banned' });
    assert.equal(statuses.at(-1), 'BANIDO PELO ANTI-CHEAT');

    const initialLength = socket.sent.length;
    net.sendInput({ seq: 10, moveX: 1 });
    assert.equal(socket.sent.at(-1).type, 'input');
    assert.equal(socket.sent.at(-1).input.clientDt, 1 / 30);
    assert.equal(socket.sent.at(-1).input.rtt, 12);
    assert.equal(net.pending.at(-1).input.seq, 10);
    net.rtt = null;
    net.sendInput({ seq: 11 });
    assert.equal(Object.hasOwn(socket.sent.at(-1).input, 'rtt'), false);
    net.pending = Array.from({ length: 90 }, (_, seq) => ({ input: { seq } }));
    net.sendInput({ seq: 90 });
    assert.equal(net.pending.length, 90);
    assert.equal(net.pending[0].input.seq, 1);
    net.start('belt');
    net.createPrivate();
    net.joinPrivate('JOIN');
    net.setOperative('OP_MALE_RECON_ASIAN');
    assert.deepEqual(socket.sent.slice(-4).map((message) => message.type), ['start', 'create_private', 'join_private', 'set_operative']);
    net.setOperative('');
    const sentOpen = socket.sent.length;
    socket.readyState = FakeWebSocket.CLOSED;
    net.sendInput({ seq: 12 });
    net.start('rush');
    net.createPrivate();
    net.joinPrivate('CLOSED');
    assert.equal(socket.sent.length, sentOpen);
    socket.readyState = FakeWebSocket.OPEN;

    socket.throwOnClose = true;
    socket.message({ type: 'redirect', to: 'wss://room.example' });
    assert.equal(net.url, 'wss://room.example');
    assert.equal(socket.closeCalls, 1);
    socket.message({ type: 'owner_lost' });
    assert.equal(socket.closeCalls, 2);
    assert.equal(net.retry, 0);
    assert.match(statuses.at(-1), /MIGRANDO DE SERVIDOR/);

    const close401 = new NetClient3D({ onStatus: (status) => statuses.push(status) });
    close401.connect();
    const authSocket = env.sockets.at(-1);
    authSocket.closeEvent(4001);
    assert.equal(statuses.at(-1), 'LOGIN NECESSÁRIO');
    assert.equal(env.timeouts.size, 0);

    const reconnect = new NetClient3D({ url: 'wss://retry.example', onStatus: (status) => statuses.push(status) });
    reconnect.connect();
    const firstSocket = env.sockets.at(-1);
    firstSocket.closeEvent(1006);
    assert.equal(statuses.at(-1), 'RECONEXÃO EM CURSO');
    const retryJob = [...env.timeouts.entries()][0];
    assert.equal(retryJob[1].delay, 1000);
    env.runTimeout(retryJob[0]);
    assert.equal(reconnect.retry, 1);
    assert.equal(env.sockets.at(-1).url.startsWith('wss://retry.example'), true);
    reconnect.retry = 9;
    env.sockets.at(-1).closeEvent(1006);
    assert.equal([...env.timeouts.values()].at(-1).delay, 10000);
    const closed = new NetClient3D();
    closed.connect();
    const closedSocket = env.sockets.at(-1);
    closed.dispose();
    const timeoutsBeforeClosed = env.timeouts.size;
    closedSocket.closeEvent(1006);
    assert.equal(env.timeouts.size, timeoutsBeforeClosed);

    const interpolation = new NetClient3D({});
    assert.equal(interpolation.interpolate(), null);
    interpolation.push({ seq: 0, player: { x: 0, y: 0, z: 0 }, others: [{ id: 'ally', x: 0, y: 0, z: 0, yaw: 3.1 }], grenades: [{ id: 'g1', x: 0, y: 0, z: 0 }] });
    assert.equal(interpolation.latest().seq, 0);
    assert.equal(interpolation.interpolate().seq, 0);
    env.now(1050);
    interpolation.push({ seq: 1, player: { x: 10, y: 10, z: 10 }, others: [
      { id: 'ally', x: 10, y: 10, z: 10, yaw: -3.1 }, { id: 'new-ally', x: 8, y: 8, z: 8, yaw: 0 },
    ], grenades: [{ id: 'g1', x: 10, y: 10, z: 10 }, { id: 'new-g', x: 3, y: 3, z: 3 }] });
    env.now(1100);
    interpolation.push({ seq: 2, player: { x: 20, y: 20, z: 20 }, others: [
      { id: 'ally', x: 20, y: 20, z: 20, yaw: 3.12 }, { id: 'newest', x: 30, y: 30, z: 30, yaw: 0 },
    ], grenades: [{ id: 'g1', x: 20, y: 20, z: 20 }, { id: 'newest-g', x: 30, y: 30, z: 30 }] });
    env.now(1100);
    const view = interpolation.interpolate(25);
    assert.equal(view.player.x, 15);
    assert.equal(view.others[0].x, 15);
    assert.ok(Math.abs(Math.abs(view.others[0].yaw) - Math.PI) < .1);
    assert.equal(view.others[1].x, 30);
    assert.equal(view.grenades[0].x, 15);
    assert.equal(view.grenades[1].x, 30);
    assert.equal(interpolation.recommendedDelay() >= 95, true);
    env.now(1200);
    assert.equal(interpolation.interpolate(-50).player.x, 20);
    env.now(800);
    assert.equal(interpolation.interpolate(1000).player.x, 0);

    const sparse = new NetClient3D({});
    env.now(2000);
    sparse.push({ player: { x: 1, y: 2, z: 3 } });
    env.now(2000);
    sparse.push({ player: null, others: null, grenades: null });
    assert.equal(sparse.interpolate(0).player, null);
    assert.equal(sparse.interpolate(0).others, null);
    assert.equal(sparse.interpolate(0).grenades, null);
    const noPlayer = new NetClient3D({});
    env.now(3000);
    noPlayer.push({ seq: 'a' });
    env.now(3000);
    noPlayer.push({ seq: 'b' });
    assert.equal(noPlayer.interpolate(0).player, undefined);

    const overflow = new NetClient3D({});
    for (let i = 0; i < 4; i++) {
      env.now(4000 + i * 50);
      overflow.push({ seq: i, player: null });
    }
    assert.equal(overflow.buffer.length, 3);
    assert.equal(overflow.latest().seq, 3);
    overflow.pending = [{ input: { seq: 5 } }];
    overflow.push({ seq: 5, player: { ackSeq: 10 } });
    assert.equal(overflow.ackSeq, 10);
    assert.equal(overflow.pending.length, 0);
    overflow.push({ seq: 6, player: { ackSeq: 2 } });
    assert.equal(overflow.ackSeq, 10);
    assert.equal(overflow.serverElapsed(Number.POSITIVE_INFINITY), null);

    const noEvents = new NetClient3D({});
    env.now(5000);
    noEvents.push({ seq: 1, player: { ackSeq: 'bad' } });
    noEvents.push({ seq: 2 });
    assert.equal(noEvents.ackSeq, 0);
    assert.equal(noEvents.recommendedDelay() >= 95, true);

    socket.throwOnClose = false;
    net.dispose();
    assert.equal(env.intervals.size, 0);
    assert.equal(socket.closeCalls, 3);
  });
});
