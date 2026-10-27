// Khaaos Run — Fase 17: sistema de partículas REAL (pooled, determinístico).
// ==========================================================================
// Um único THREE.Points por cena (1 draw call) com ShaderMaterial próprio:
// tamanho com atenuação por distância, cor/alpha por partícula e falloff
// radial PROCEDURAL (sem textura — testável headless e sem document).
// Pool fixo em ring buffer: spawn acima da capacidade recicla o slot mais
// antigo (FIFO aproximado) — zero alocação por frame, budget constante.
//
// Contratos:
//   - spawn() nunca falha: sempre escreve (reciclando se preciso)
//   - update(dt) integra idade/velocidade/drag/gravidade e mata por life
//   - determinístico: dada a sequência de spawns e dts, o estado é idêntico
//     (nenhum Math.random interno — o chamador injeta SeededRng)
//   - partícula morta: aSize=0 + position.y=-9999 (nunca rasteriza)
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (140.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float falloff = smoothstep(0.5, 0.12, r);
  float a = vAlpha * falloff;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

const DEAD_Y = -9999;

/** Spawn config: { x,y,z, vx,vy,vz, size, growth, life, drag, gravity, alpha, color:[r,g,b], endColor:[r,g,b] } */

export class ParticleSystem {
  constructor({ capacity = 1024, name = 'particles' } = {}) {
    this.capacity = capacity;
    this.name = name;
    const n = capacity;
    // estado de simulação (SOA — integração sem alocação)
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size0 = new Float32Array(n); this.growth = new Float32Array(n);
    this.drag = new Float32Array(n); this.gravity = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.cr = new Float32Array(n); this.cg = new Float32Array(n); this.cb = new Float32Array(n);
    this.tr = new Float32Array(n); this.tg = new Float32Array(n); this.tb = new Float32Array(n);
    this.cursor = 0;
    this.live = 0;
    // buffers de render
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.posAttr.array.fill(0); this.posAttr.array[1] = DEAD_Y; // fora de cena até o 1º spawn
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6; // após terreno/entidades, antes do HUD 3D
    this.points.name = name;
  }

  /**
   * Escreve uma partícula no slot corrente do ring buffer (recicla o mais
   * antigo quando cheio). `cfg` parcial é válido: defaults por campo.
   * @returns {number} índice do slot escrito
   */
  spawn(cfg = {}) {
    const i = this.cursor;
    const wasAlive = this.age[i] < this.life[i];
    this.px[i] = cfg.x ?? 0; this.py[i] = cfg.y ?? 0; this.pz[i] = cfg.z ?? 0;
    this.vx[i] = cfg.vx ?? 0; this.vy[i] = cfg.vy ?? 0; this.vz[i] = cfg.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = Math.max(0.05, cfg.life ?? 1);
    this.size0[i] = Math.max(0.01, cfg.size ?? 1);
    this.growth[i] = cfg.growth ?? 0;
    this.drag[i] = Math.min(0.99, Math.max(0, cfg.drag ?? 0));
    this.gravity[i] = cfg.gravity ?? 0;
    this.alpha0[i] = Math.min(1, Math.max(0, cfg.alpha ?? 1));
    const c = cfg.color ?? [1, 1, 1];
    const e = cfg.endColor ?? c;
    this.cr[i] = c[0]; this.cg[i] = c[1]; this.cb[i] = c[2];
    this.tr[i] = e[0]; this.tg[i] = e[1]; this.tb[i] = e[2];
    if (!wasAlive) this.live++;
    this.cursor = (this.cursor + 1) % this.capacity;
    return i;
  }

  /** Integração determinística: idade, drag, gravidade, envelope alpha, cor. */
  update(dt) {
    if (dt <= 0) return;
    const { capacity: n } = this;
    for (let i = 0; i < n; i++) {
      if (this.age[i] >= this.life[i]) continue; // morta
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // morte: nunca rasteriza
        this.sizeAttr.array[i] = 0;
        this.alphaAttr.array[i] = 0;
        this.posAttr.array[i * 3 + 1] = DEAD_Y;
        this.live--;
        continue;
      }
      const dragK = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dragK; this.vy[i] *= dragK; this.vz[i] *= dragK;
      this.vy[i] -= this.gravity[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const k = this.age[i] / this.life[i];
      // envelope: fade-in 12% da vida, fade-out no restante
      const env = k < .12 ? k / .12 : 1 - (k - .12) / .88;
      this.alphaAttr.array[i] = this.alpha0[i] * env;
      this.sizeAttr.array[i] = this.size0[i] + this.growth[i] * this.age[i];
      this.posAttr.array[i * 3] = this.px[i];
      this.posAttr.array[i * 3 + 1] = this.py[i];
      this.posAttr.array[i * 3 + 2] = this.pz[i];
      this.colorAttr.array[i * 3] = this.cr[i] + (this.tr[i] - this.cr[i]) * k;
      this.colorAttr.array[i * 3 + 1] = this.cg[i] + (this.tg[i] - this.cg[i]) * k;
      this.colorAttr.array[i * 3 + 2] = this.cb[i] + (this.tb[i] - this.cb[i]) * k;
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  get activeCount() { return this.live; }

  /** Snapshot p/ testes: partículas vivas com posição e envelope atual. */
  snapshot() {
    const out = [];
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue;
      out.push({
        x: this.px[i], y: this.py[i], z: this.pz[i],
        vx: this.vx[i], vy: this.vy[i], vz: this.vz[i],
        age: this.age[i], life: this.life[i],
        alpha: this.alphaAttr.array[i], size: this.sizeAttr.array[i],
      });
    }
    return out;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Emissor contínuo/determinístico: acumula dívida rate·dt e dispara
 * floor(debt) partículas por update (resto carrega p/ o próximo frame).
 * `origin` é {x,y,z} fixo ou fn(t)→{x,y,z}; `params()` devolve o spawn
 * RELATIVO à origem (dx/dy/dz) e é injetado pelo chamador com SeededRng.
 */
export class Emitter {
  constructor(system, { origin = { x: 0, y: 0, z: 0 }, rate = 0, params = () => ({}), enabled = true } = {}) {
    this.system = system;
    this.origin = origin;
    this.rate = rate;
    this.params = params;
    this.enabled = enabled;
    this.debt = 0;
    this.emittedTotal = 0;
  }

  burst(n, t = 0) {
    if (!this.enabled) return;
    const o = typeof this.origin === 'function' ? this.origin(t) : this.origin;
    for (let k = 0; k < n; k++) this.#emit(o);
  }

  #emit(origin) {
    const p = this.params();
    this.system.spawn({
      x: origin.x + (p.dx ?? 0), y: origin.y + (p.dy ?? 0), z: origin.z + (p.dz ?? 0),
      vx: p.vx ?? 0, vy: p.vy ?? 0, vz: p.vz ?? 0,
      size: p.size ?? 1, growth: p.growth ?? 0, life: p.life ?? 1,
      drag: p.drag ?? 0, gravity: p.gravity ?? 0, alpha: p.alpha ?? 1,
      color: p.color, endColor: p.endColor,
    });
    this.emittedTotal++;
  }

  update(dt, t = 0) {
    if (!this.enabled || this.rate <= 0 || dt <= 0) { this.debt = 0; return 0; }
    this.debt += this.rate * dt;
    let count = Math.floor(this.debt);
    this.debt -= count;
    const o = typeof this.origin === 'function' ? this.origin(t) : this.origin;
    while (count-- > 0) this.#emit(o);
    return this.emittedTotal;
  }
}
