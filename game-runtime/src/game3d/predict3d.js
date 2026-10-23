// Khaaos Run — Predição client-side com reconciliação servidor-autoritativa (Fase 3).
// O cliente prevê o próprio movimento com o MESMO stepActorMovement da MatchRoom3D;
// a cada snapshot o erro (servidor − previsto no ack) é absorvido por um offset
// visual que decai exponencialmente — correção suave sem "rubber band".
// Módulo puro (sem THREE) para testabilidade em Node.
import { stepActorMovement } from './sim3d.js';

export const INPUT_DT = 1 / 30;          // cadência de envio/predição do cliente
export const SNAP_DISTANCE = 8;          // acima disso = teleport/spawn: snap seco
export const MAX_PENDING = 90;           // ~3s de inputs pendentes (rede degradada)
export const HISTORY_SIZE = 240;         // estados previstos por seq (para o ack)
export const ERROR_DECAY = 12;           // taxa de decaimento do offset visual (1/s)

export class LocalPredictor {
  constructor({ world, weapon = 'g19', speed = 5.2 } = {}) {
    this.world = world;
    this.actor = {
      x: 0, y: 0, z: 150, vy: 0, yaw: 0, pitch: 0,
      speed, weapon, alive: true,
      onGround: true, moving: false, sprinting: false, ads: false,
    };
    this.err = { x: 0, y: 0, z: 0 };   // offset suavizado aplicado só ao RENDER
    this.pending = [];                  // inputs não confirmados (seq > ack)
    this.history = new Map();           // seq → { x, y, z } previsto
    this.lastAck = 0;
    this.synced = false;
  }

  // posição final para render: previsão + offset de correção
  get pos() {
    const a = this.actor;
    return { x: a.x + this.err.x, y: a.y + this.err.y, z: a.z + this.err.z };
  }

  // input local (já com seq monotônica) — prevê imediatamente e guarda p/ replay
  onInput(input) {
    if (!this.synced || !this.actor.alive) return;
    this.pending.push(input);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    stepActorMovement(this.actor, input, INPUT_DT, this.world);
    this.history.set(input.seq, { x: this.actor.x, y: this.actor.y, z: this.actor.z });
    if (this.history.size > HISTORY_SIZE) {
      const first = this.history.keys().next().value;
      this.history.delete(first);
    }
  }

  // estado autoritativo do jogador local (snapshot do servidor)
  reconcile(player, ackSeq) {
    if (!player) return;
    // primeira amostra: teleporta para o spawn autoritativo
    if (!this.synced) {
      this.#adoptServer(player);
      this.synced = true;
      this.pending = [];
      this.history.clear();
      this.err = { x: 0, y: 0, z: 0 };
      return;
    }
    // morto: segue o servidor sem prever
    if (!player.alive) {
      this.actor.alive = false;
      this.#adoptServer(player);
      this.err = { x: 0, y: 0, z: 0 };
      return;
    }
    if (!this.actor.alive) { // respawn/reação: volta a prever a partir do servidor
      this.actor.alive = true;
      this.#adoptServer(player);
      this.pending = [];
      this.history.clear();
      this.err = { x: 0, y: 0, z: 0 };
      return;
    }
    this.actor.speed = Number.isFinite(player.speed) ? player.speed : this.actor.speed;
    this.actor.weapon = player.weapon ?? this.actor.weapon;

    if (Number.isFinite(ackSeq) && ackSeq > this.lastAck) {
      this.lastAck = ackSeq;
      this.pending = this.pending.filter((i) => i.seq > ackSeq);
    }

    // posição prevista no momento do ack (fallback: posição atual)
    const at = this.history.get(ackSeq);
    const ax = at ? at.x : this.actor.x, ay = at ? at.y : this.actor.y, az = at ? at.z : this.actor.z;
    const drift = Math.hypot(player.x - ax, player.y - ay, player.z - az);

    // render contínuo: onde o jogador estava sendo desenhado agora
    const rendered = { x: this.actor.x + this.err.x, y: this.actor.y + this.err.y, z: this.actor.z + this.err.z };

    if (drift > SNAP_DISTANCE) {
      // teleport (spawn/reatribuição): snap seco, descarta histórico
      this.#adoptServer(player);
      this.pending = this.pending.filter((i) => i.seq > (ackSeq ?? 0));
      this.history.clear();
      this.err = { x: 0, y: 0, z: 0 };
      return;
    }

    // rewinda para o estado autoritativo e replays os inputs pendentes
    this.actor.x = player.x; this.actor.y = player.y; this.actor.z = player.z;
    this.actor.vy = Number.isFinite(player.vy) ? player.vy : this.actor.vy;
    this.actor.onGround = player.onGround ?? this.actor.onGround;
    for (const input of this.pending) {
      stepActorMovement(this.actor, input, INPUT_DT, this.world);
      this.history.set(input.seq, { x: this.actor.x, y: this.actor.y, z: this.actor.z });
    }

    // erro = render contínuo − nova posição prevista (decai em update)
    this.err.x = rendered.x - this.actor.x;
    this.err.y = rendered.y - this.actor.y;
    this.err.z = rendered.z - this.actor.z;
  }

  // decaimento do offset visual (por frame)
  update(dt) {
    const k = Math.min(1, dt * ERROR_DECAY);
    this.err.x -= this.err.x * k;
    this.err.y -= this.err.y * k;
    this.err.z -= this.err.z * k;
    if (Math.hypot(this.err.x, this.err.y, this.err.z) < 0.001) this.err = { x: 0, y: 0, z: 0 };
  }

  #adoptServer(player) {
    this.actor.x = player.x; this.actor.y = player.y; this.actor.z = player.z;
    this.actor.vy = Number.isFinite(player.vy) ? player.vy : 0;
    this.actor.onGround = player.onGround ?? true;
    this.actor.alive = !!player.alive;
    this.actor.speed = Number.isFinite(player.speed) ? player.speed : this.actor.speed;
    this.actor.weapon = player.weapon ?? this.actor.weapon;
  }
}
