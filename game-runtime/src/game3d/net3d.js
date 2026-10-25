// Khaaos Run — Cliente de rede 3D (netcode do Battle Royale online).
// Conecta no /ws com ?token&mode=3d, envia inputs a 30Hz (buffer de pendentes para
// a reconciliação da predição), recebe snapshots autoritativos a 20Hz e fornece
// interpolação (buffer de 3 snapshots) para o renderizador. Reconexão com backoff
// + resume token próprio do modo 3D.
import { NetworkClient } from '../network/client.js';

const RESUME_KEY = 'kr_resume_3d';
const BUFFER_SIZE = 3;

export class NetClient3D {
  constructor({ url = '', onStatus, onSnapshot, onEvent, onRejected } = {}) {
    this.url = url;
    this.token = localStorage.getItem('kr_token');
    this.resume = localStorage.getItem(RESUME_KEY);
    this.onStatus = onStatus;
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    this.onRejected = onRejected;
    this.socket = null;
    this.buffer = [];          // [{ snapshot, receivedAt }]
    this.pending = [];         // inputs não confirmados (predição client-side)
    this.ackSeq = 0;           // último seq processado pelo servidor
    this.retry = 0;
    this.closed = false;
    this.rtt = null;
    this.pingTimer = null;
    this.connectedAt = null;
  }

  static login = (username, password, baseUrl = '') => NetworkClient.login(baseUrl, username, password);

  connect() {
    this.closed = false;
    const query = new URLSearchParams({ token: this.token || '', mode: '3d' });
    if (this.resume) query.set('resume', this.resume);
    this.socket = new WebSocket(`${this.url}/ws?${query}`);
    this.socket.onopen = () => {
      this.retry = 0;
      this.connectedAt = performance.now();
      this.pingTimer ??= setInterval(() => this.#ping(), 2000);
      this.onStatus?.('AUTENTICADO // MATCHMAKING 3D');
    };
    this.socket.onclose = (e) => {
      if (this.closed) return;
      if (e.code === 4001) { this.onStatus?.('LOGIN NECESSÁRIO'); return; }
      this.onStatus?.('RECONEXÃO EM CURSO');
      setTimeout(() => { this.retry++; this.connect(); }, Math.min(1000 * 2 ** this.retry, 10000));
    };
    this.socket.onerror = () => this.onStatus?.('FALHA DE REDE');
    this.socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'pong') { this.rtt = Math.round(performance.now() - msg.t); return; }
      if (msg.type === 'auth_required') { this.onStatus?.('LOGIN NECESSÁRIO'); return; }
      if (msg.type === 'match_found' || msg.type === 'resumed') {
        this.myId = msg.id ?? this.myId;
        if (msg.resumeToken) { this.resume = msg.resumeToken; localStorage.setItem(RESUME_KEY, this.resume); }
        this.onStatus?.(`${msg.type === 'resumed' ? 'SESSÃO RETOMADA' : 'MATCHMAKING'} // ${msg.region || ''} // RING 3D`);
        if (msg.snapshot) this.push(msg.snapshot);
        return;
      }
      if (msg.type === 'snapshot') { this.push(msg.snapshot); return; }
      if (msg.type === 'rejected') { this.onRejected?.(msg); return; }
      if (msg.type === 'rate_limited') this.onStatus?.('RATE LIMIT // AGUARDE');
      if (msg.type === 'banned') this.onStatus?.('BANIDO PELO ANTI-CHEAT');
    };
  }

  #ping() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'ping', t: performance.now() }));
  }

  push(snapshot) {
    this.buffer.push({ snapshot, receivedAt: performance.now() });
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();
    // reconciliação: ack do servidor descarta inputs já processados
    const ack = snapshot.player?.ackSeq;
    if (Number.isFinite(ack)) {
      this.ackSeq = Math.max(this.ackSeq, ack);
      this.pending = this.pending.filter((p) => p.input.seq > ack);
    }
    this.onSnapshot?.(snapshot);
    for (const evt of snapshot.events ?? []) this.onEvent?.(evt);
  }

  latest() { return this.buffer.at(-1)?.snapshot ?? null; }

  // Interpolação entre os dois snapshots que cercam (agora - delayMs):
  // interpola posição do jogador local e dos demais atores; demais campos = mais recente.
  interpolate(delayMs = 110) {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0].snapshot;
    const now = performance.now() - delayMs;
    let a = this.buffer[0], b = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].receivedAt <= now && this.buffer[i + 1].receivedAt >= now) {
        a = this.buffer[i]; b = this.buffer[i + 1];
        break;
      }
    }
    if (a === b) return a.snapshot;
    const span = b.receivedAt - a.receivedAt || 1;
    const alpha = Math.max(0, Math.min(1, (now - a.receivedAt) / span));
    const A = a.snapshot, B = b.snapshot;
    const lerp = (x, y) => x + (y - x) * alpha;
    const view = { ...B };
    if (B.player && A.player) {
      view.player = {
        ...B.player,
        x: lerp(A.player.x, B.player.x),
        y: lerp(A.player.y, B.player.y),
        z: lerp(A.player.z, B.player.z),
      };
    } else view.player = B.player;
    if (B.others) {
      const byId = new Map((A.others ?? []).map((o) => [o.id, o]));
      view.others = B.others.map((o) => {
        const prev = byId.get(o.id);
        if (!prev) return o;
        return { ...o, x: lerp(prev.x, o.x), y: lerp(prev.y, o.y), z: lerp(prev.z, o.z) };
      });
    }
    // Fase 4 — granadas: lerp posicional pelo mesmo par de snapshots
    if (B.grenades) {
      const byIdG = new Map((A.grenades ?? []).map((g) => [g.id, g]));
      view.grenades = B.grenades.map((g) => {
        const prev = byIdG.get(g.id);
        if (!prev) return g;
        return { ...g, x: lerp(prev.x, g.x), y: lerp(prev.y, g.y), z: lerp(prev.z, g.z) };
      });
    }
    return view;
  }

  sendInput(input) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pending.push({ input, sentAt: performance.now() });
    if (this.pending.length > 90) this.pending.shift();
    this.socket.send(JSON.stringify({ type: 'input', input: { ...input, clientDt: 1 / 30, rtt: this.rtt ?? undefined } }));
  }
  start(entry) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'start', entry }));
  }

  dispose() {
    this.closed = true;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.socket?.close();
  }
}
