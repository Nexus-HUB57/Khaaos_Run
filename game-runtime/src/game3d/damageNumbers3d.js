// Khaaos Run — Fase 27: números de dano flutuantes (assinatura Free Fire).
//
// Módulo PURO + pool de DOM: a projeção mundo→tela é matemática determinística
// (mesma câmera => mesmos pixels), a subida/fade são funções da IDADE (dt
// acumulado — sem relógio de parede, sem CSS animation) e o pool é um ring
// buffer com teto. Sem `document` (node/testes) tudo continua funcionando:
// o pool só pula os nós — mesma filosofia headless-safe do SpectatorHUD.
//
// Contrato com a sim/servidor (Fase 27):
//   evento 'hit'  { x, y, z, victim, head, damage, owner, kind? }
//     → número SÓ quando owner === 'player' (acerto PRÓPRIO; bots entre si
//       nunca poluem a tela — e o hitmarker da Fase 4 fica preciso de verdade).
//   popup de NOCAUTE: 'botKnocked' (offline) e 'knock' (online) chegam no
//     MESMO batch do hit letal — o pool lembra a última posição de acerto e
//     o popup nasce ali (janela curta, determinística pela idade).

import * as THREE from 'three';

// vida do número na tela (s) — curta: informação, não decoração
export const DMG_LIFE_S = 0.9;
// subida vertical total em px (mundo-ancorado: re-projeta a cada frame)
export const DMG_RISE_PX = 46;
// teto do pool (ring buffer) — pior caso (metralhadora) sem flood de nós
export const DMG_MAX = 24;
// anti-sobreposição: deslocamento horizontal por hash do alvo (-1|0|1)
export const DMG_STAGGER_PX = 26;
// headshot: maior e vermelho (gramática Free Fire)
export const DMG_HEAD_SCALE = 1.45;
// popup de nocaute vive mais (é recompensa, não telemetria)
export const DMG_KNOCK_LIFE_S = 1.5;
// janela em que um hit ainda "explica" um nocaute subsequente
export const KNOCK_MEMORY_S = 1.2;
// pop de escala no nascimento (0.12 s) — impacto sem flicker
export const DMG_POP_S = 0.12;
// Fase 29 — dano AMBIENTAL: maior que corpo, menor que headshot (o mundo
// mordeu — destaque sem roubar a cena do headshot).
export const DMG_HAZARD_SCALE = 1.2;

/** Fase 29 — sufixo de cor por kind de hazard (MESMA paleta do banner). */
export const HAZARD_TIER_CLASSES = Object.freeze({
  tsunami: 'hz-tsunami',
  eruption: 'hz-lava',
  ring: 'hz-ring',
  acid: 'hz-acid',
  quantum: 'hz-gravity',
});

/** Gramática visual por tier — tests fixam as classes. */
export function damageTier({ head = false, knock = false, hazard = false, kind = null } = {}) {
  if (knock) return { cls: 'dmg-knock', scale: 1.18, text: 'NOCAUTE' };
  if (head) return { cls: 'dmg-head', scale: DMG_HEAD_SCALE };
  if (hazard) return { cls: `dmg-hazard ${HAZARD_TIER_CLASSES[kind] ?? 'hz-ring'}`, scale: DMG_HAZARD_SCALE };
  return { cls: 'dmg-body', scale: 1 };
}

/**
 * Projeção mundo→tela pura. `visible: false` cobre atrás da câmera (w>=1)
 * e fora da tela com folga de 5% (números nascem/morrem suave na borda).
 * Sem alocação por chamada além do Vector3 — chamado ~24×/frame no pior caso.
 */
export function projectToScreen(x, y, z, camera, width, height) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z >= 1) {
    return { x: 0, y: 0, visible: false };
  }
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    visible: v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05,
  };
}

/** Hash determinístico de string → deslocamento anti-sobreposição em px. */
export function hashOffset(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (((h % 3) + 3) % 3 - 1) * DMG_STAGGER_PX;
}

// easing local (sem deps): saída suave — o número desacelera ao subir
const easeOut = (p) => 1 - (1 - p) * (1 - p);

/**
 * Pool de números de dano. Uso:
 *   const pool = new DamageNumbers3D({ container, camera });
 *   pool.spawn({ x, y, z, damage, head, victim });   // no caso 'hit'
 *   pool.popupKnock();                               // botKnocked/knock
 *   pool.update(dt, { camera, width, height });      // no loop, antes do render
 */
export class DamageNumbers3D {
  constructor({ container = null, max = DMG_MAX } = {}) {
    this.container = (typeof document !== 'undefined' && container) ? container : null;
    this.max = Math.max(1, max | 0);
    this.pool = [];        // entradas vivas (ring: mais antigo reciclado no teto)
    this._mem = null;      // último acerto lembrado { x, y, z, age }
  }

  get size() { return this.pool.length; }

  /** Registra um número. `victim` só alimenta o stagger anti-sobreposição.
   * Fase 29 — `hazard` + `kind` escolhem o tier ambiental (cor por hazard). */
  spawn({ x, y, z, damage, head = false, knock = false, victim = null, hazard = false, kind = null } = {}) {
    const dmg = Math.max(0, Math.round(Number(damage) || 0));
    if (!knock && dmg <= 0) return null; // dano zero não é informação
    const tier = damageTier({ head, knock, hazard, kind });
    // lembra o acerto (popup de nocaute nasce aqui se vier no mesmo batch)
    if (!knock) this._mem = { x, y, z, age: 0 };
    const entry = {
      x, y, z,
      age: 0,
      life: knock ? DMG_KNOCK_LIFE_S : DMG_LIFE_S,
      stagger: hashOffset(victim),
      tier,
      text: knock ? tier.text : String(dmg),
      el: this.#makeEl(tier.cls, knock ? tier.text : String(dmg)),
    };
    this.pool.push(entry);
    if (this.pool.length > this.max) this.#release(this.pool.shift());
    return entry;
  }

  /** Popup "NOCAUTE" na posição do último acerto (janela KNOCK_MEMORY_S). */
  popupKnock() {
    if (!this._mem || this._mem.age > KNOCK_MEMORY_S) return null;
    const { x, y, z } = this._mem;
    return this.spawn({ x, y: y + 0.4, z, knock: true });
  }

  /**
   * Avança a idade e re-projeta. Determinística: mesma sequência de
   * (dt, camera) => mesmos pixels/opacidade — a UI é função pura do estado.
   */
  update(dt, { camera = null, width = 0, height = 0 } = {}) {
    if (this._mem) {
      this._mem.age += dt;
      if (this._mem.age > KNOCK_MEMORY_S) this._mem = null;
    }
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const e = this.pool[i];
      e.age += dt;
      if (e.age >= e.life) { this.#release(e); this.pool.splice(i, 1); continue; }
      if (!e.el || !camera || width <= 0 || height <= 0) continue;
      const p = e.age / e.life;
      const s = projectToScreen(e.x, e.y, e.z, camera, width, height);
      if (!s.visible) { e.el.style.display = 'none'; continue; }
      const rise = DMG_RISE_PX * easeOut(p);
      const pop = 1 + 0.28 * (1 - Math.min(1, e.age / DMG_POP_S));
      const opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      e.el.style.display = 'block';
      e.el.style.left = `${Math.round(s.x + e.stagger)}px`;
      e.el.style.top = `${Math.round(s.y - rise)}px`;
      e.el.style.opacity = opacity.toFixed(3);
      e.el.style.transform = `translate(-50%, -50%) scale(${(e.tier.scale * pop).toFixed(3)})`;
    }
  }

  /** Zera tudo (nova partida / restart) — nós voltam ao pool limpo. */
  clear() {
    for (const e of this.pool) this.#release(e);
    this.pool.length = 0;
    this._mem = null;
  }

  #makeEl(cls, text) {
    if (!this.container || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = `dmg-num ${cls}`;
    el.textContent = text;
    el.style.display = 'none';
    this.container.appendChild(el);
    return el;
  }

  #release(e) {
    if (e?.el) { e.el.remove?.(); e.el = null; }
  }
}
