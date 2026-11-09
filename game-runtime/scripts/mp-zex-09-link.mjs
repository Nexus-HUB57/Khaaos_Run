// MP-ZEX-09 — Link de rede degradada (ambiente isolado).
// Modelo: RTT 100–150 ms aplicado a UM cliente, com jitter e perda moderada.
// Fundamento físico: WebSocket/TCP não descarta quadros — a perda de pacotes no
// TCP se manifesta exatamente como picos de atraso (retransmissão + RTO). A
// "perda" aqui é portanto modelada como spikes de +200–400 ms em ~2% dos
// quadros, o mesmo efeito que uma rodada exploratória de 2% PER observa na
// aplicação.
//
// ORDEM: TCP garante ordem por direção; o jitter aqui NUNCA reordena. Cada
// direção tem UMA fila FIFO e UM timer serializado — o quadro só sai quando o
// anterior saiu. (Timer por quadro com ms fracionário é INCORRETO: o libuv
// trunca para inteiro e a granularidade de 1 ms deixa o quadro seguinte "furar"
// o anterior sob jitter — regressão capturada no teste de ordem.)
//
// Uso no E2E (run-mp-zex-09-degraded.mjs): uplink agenda o envio real do
// quadro ao servidor; downlink agenda a entrega do quadro ao cliente.

const now = () => performance.now();

export class DegradedLink {
  /**
   * @param {object} opts
   * @param {number} opts.upMs   atraso base cliente→servidor (ms)
   * @param {number} opts.downMs atraso base servidor→cliente (ms)
   * @param {number} opts.jitterMs jitter uniforme ± aplicado a cada quadro
   * @param {number} opts.lossSpikeProbability probabilidade de spike por quadro
   * @param {number} opts.spikeMinMs pico mínimo de retransmissão (ms)
   * @param {number} opts.spikeMaxMs pico máximo de retransmissão (ms)
   * @param {(raw: string) => void} opts.onSendUp chamado para ENTREGAR o quadro ao servidor
   */
  constructor({
    upMs = 65, downMs = 65, jitterMs = 30,
    lossSpikeProbability = 0.02, spikeMinMs = 200, spikeMaxMs = 400,
    onSendUp = null, rng = Math.random,
  } = {}) {
    if (onSendUp !== null && typeof onSendUp !== 'function') throw new Error('DegradedLink: onSendUp deve ser função quando fornecido.');
    this.upMs = upMs; this.downMs = downMs; this.jitterMs = jitterMs;
    this.lossSpikeProbability = lossSpikeProbability;
    this.spikeMinMs = spikeMinMs; this.spikeMaxMs = spikeMaxMs;
    this.onSendUp = onSendUp; this.rng = rng;
    this.closed = false;
    this.#stats = {
      up: { frames: 0, spikes: 0, delays: [] },
      down: { frames: 0, spikes: 0, delays: [] },
    };
    this.#queues = { up: [], down: [] };
    this.#lastAt = { up: 0, down: 0 };
    this.#timers = { up: null, down: null };
    this.#drainWaiters = [];
  }

  #stats;
  #queues;
  #lastAt;
  #timers;
  #drainWaiters;

  /** Liga o remetente real (o ws só existe depois do handshake). */
  bindSender(fn) {
    if (typeof fn !== 'function') throw new Error('DegradedLink: bindSender exige função.');
    this.onSendUp = fn;
  }

  /** Agenda um quadro cliente→servidor (um `ws.send` atrasado). */
  uplink(raw) {
    if (this.closed || !this.onSendUp) return;
    this.#enqueue('up', this.upMs, () => {
      if (!this.closed) this.onSendUp(raw);
    });
  }

  /** Agenda a entrega server→cliente (o handler de mensagem do cliente). */
  downlink(deliver) {
    if (this.closed) { deliver(); return; }
    this.#enqueue('down', this.downMs, deliver);
  }

  #enqueue(direction, baseMs, emit) {
    if (direction === 'up' && !this.onSendUp) return;
    const jitter = baseMs > 0 ? (this.rng() * 2 - 1) * this.jitterMs : 0;
    const spiked = this.rng() < this.lossSpikeProbability;
    const spike = spiked ? this.spikeMinMs + this.rng() * (this.spikeMaxMs - this.spikeMinMs) : 0;
    const delay = Math.max(0, baseMs + jitter + spike);
    const frame = { at: Math.max(now() + delay, this.#lastAt[direction] + 0.25), emit };
    this.#lastAt[direction] = frame.at;
    const stat = this.#stats[direction];
    stat.frames += 1;
    if (spiked) stat.spikes += 1;
    stat.delays.push(frame.at - now());
    this.#queues[direction].push(frame);
    this.#arm(direction);
  }

  #arm(direction) {
    if (this.#timers[direction]) return;
    const step = () => {
      this.#timers[direction] = null;
      const queue = this.#queues[direction];
      if (!queue.length) return;
      const wait = queue[0].at - now();
      if (wait <= 0) {
        const frame = queue.shift();
        frame.emit();
        this.#resolveDrained();
        step(); // próximo quadro vencido na mesma cadeia — FIFO estrito
        return;
      }
      this.#timers[direction] = setTimeout(step, Math.ceil(wait));
    };
    step();
  }

  /** Aguarda todos os quadros pendentes dos dois sentidos serem entregues. */
  drain() {
    if (this.#queues.up.length === 0 && this.#queues.down.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#drainWaiters.push(resolve));
  }

  #resolveDrained() {
    if (this.#queues.up.length > 0 || this.#queues.down.length > 0) return;
    const waiters = this.#drainWaiters;
    this.#drainWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Congela o link: quadros pendentes nunca são entregues (queda de conexão). */
  close() {
    this.closed = true;
    this.#queues.up = []; this.#queues.down = [];
    if (this.#timers.up) { clearTimeout(this.#timers.up); this.#timers.up = null; }
    if (this.#timers.down) { clearTimeout(this.#timers.down); this.#timers.down = null; }
    this.#resolveDrained();
  }

  /** RTT efetivo medido (média up+down), em ms. */
  effectiveRttMs() {
    return this.#avg('up') + this.#avg('down');
  }

  #avg(direction) {
    const { delays } = this.#stats[direction];
    if (!delays.length) return 0;
    return delays.reduce((a, b) => a + b, 0) / delays.length;
  }

  /** Relatório legível por direção (min/média/p95/máx, spikes). */
  stats() {
    const build = (direction) => {
      const { frames, spikes, delays } = this.#stats[direction];
      if (!delays.length) return { frames, spikes, minMs: 0, avgMs: 0, p95Ms: 0, maxMs: 0 };
      const sorted = [...delays].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      return {
        frames,
        spikes,
        minMs: round1(sorted[0]),
        avgMs: round1(this.#avg(direction)),
        p95Ms: round1(p95),
        maxMs: round1(sorted[sorted.length - 1]),
      };
    };
    return { up: build('up'), down: build('down'), effectiveRttMs: round1(this.effectiveRttMs()) };
  }
}

const round1 = (value) => Math.round(value * 10) / 10;
