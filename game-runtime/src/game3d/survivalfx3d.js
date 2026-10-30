// Khaaos Run — Fase 17: FX das SOBREVIVÊNCIAS de cada mundo, ligados aos marcos.
// ==============================================================================
// A sim/servidor já emite os eventos de sobrevivência (sim3d emit / room3d
// #emitAll) e o dano é POR ALTURA (submergeBelowY / lavaBelowY). O FX aqui
// materializa a MESMA regra no mundo visual:
//   Priadus  — TSUNAMI_WAVE: nível do mar sobe até submergeBelowY (lâmina
//              translúcida + espuma na borda do anel oceânico)
//   Ckesalth — VOLCANIC_LAVA: lava sobe até lavaBelowY (plano emissivo +
//              brasas + coluna de fumaça)
//   Arukheea — KHAOS_GRAVITY: domos de contenção nos ANCHORS oficiais +
//              motos ascendentes (gravidade invertida)
//   CIGKV    — acidRain: chuva ácida drizzle verde sobre a arena
// Puro visual: NENHUM dano é aplicado aqui (o dano continua autoritativo na
// sim/servidor — o FX só mostra a superfície da regra que já mata).
//
// Fase 26 — FX DOS MARCOS × MUNDOS: além da superfície na arena, o SurvivalFX
// ABASTECE os marcos do mundo (deps.landmarks = registro de scene.userData.
// worldMarks) com o estado do hazard a cada frame — kind + boost 0..1 (fade
// in na subida, 1 na sustentação, fade out no recuo) + surfaceY. Os marcos
// reagem: maré no anel oceânico (Priadus), erupção da tocha (CKESALTH),
// despertar dos pilões (Arukheea), estrobo dos beacons (ácido/CIGKV).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';

const ARENA_RADIUS = 172;   // parede do Ring — borda visual da superfície
const RISE_FRACTION = .28;  // sobe em ≤28% da duração (rápido, ameaça legível)
const RECEDE_SECONDS = 9;   // recuo após o evento de fim

export class SurvivalFX {
  /**
   * @param {THREE.Scene} scene
   * @param {object} scenario cenário ativo (id + survival)
   * @param {{ particles?: import('./particles3d.js').ParticleSystem, landmarks?: object }} deps
   *        Fase 26 — `landmarks` é o registro de buildWorldMarks (possui
   *        applyHazard(kind, boost, surfaceY)); opcional p/ testes headless.
   */
  constructor(scene, scenario, { particles = null, landmarks = null } = {}) {
    this.scene = scene;
    this.scenario = scenario;
    this.particles = particles;
    this.landmarks = landmarks;
    this._landmarkKind = null; // último kind empurrado (p/ zerar ao voltar a idle)
    this.rng = new SeededRng(`${scenario?.id ?? 'CIGKV'}:survival-fx`);

    this.group = new THREE.Group();
    this.group.name = 'survival-fx';
    scene.add(this.group);

    this.active = null;        // 'tsunami' | 'lava' | 'gravity' | null
    this.phase = 'idle';       // idle | rising | sustained | receding
    this.elapsed = 0;
    this.duration = 0;
    this.targetY = 0;
    this.acidT = 0;            // drizzle de ácido restante (s)
    this.gravityBoost = 0;     // 0..1 intensidade da anomalia (fade in/out)

    this.surface = null;       // lâmina d'água / lava
    this.surfaceMat = null;
    this.domes = [];           // domos de âncora (gravity)
    this.emitters = [];        // emitters de partículas geridos aqui
    this._disposables = [];
  }

  /** Contrato único p/ o switch de eventos do Game3D (offline E online). */
  handleEvent(e) {
    switch (e.type) {
      case 'tsunamiStart': this.#startSurface('tsunami', e.submergeBelowY ?? 90, e.durationSeconds ?? 40); break;
      case 'tsunamiEnd': if (this.active === 'tsunami') this.#recede(); break;
      case 'eruptionStart': this.#startSurface('lava', e.lavaBelowY ?? 180, e.durationSeconds ?? 35); break;
      case 'eruptionEnd': if (this.active === 'lava') this.#recede(); break;
      case 'gravityAnomalyStart': this.#startGravity(e); break;
      case 'gravityAnomalyEnd': if (this.active === 'gravity') this.#endGravity(); break;
      case 'acidRain': this.acidT = Math.max(this.acidT, 1.6); break;
      default: break; // evento de outro domínio — ignorado sem erro
    }
  }

  #startSurface(kind, targetY, duration) {
    this.active = kind;
    this.phase = 'rising';
    this.elapsed = 0;
    this.duration = Math.max(1, duration);
    this.targetY = Math.max(1, targetY);
    if (!this.surface) {
      const geo = new THREE.CircleGeometry(ARENA_RADIUS, 56);
      this._disposables.push(geo);
      this.surfaceMat = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      this._disposables.push(this.surfaceMat);
      this.surface = new THREE.Mesh(geo, this.surfaceMat);
      this.surface.rotation.x = -Math.PI / 2;
      this.surface.position.y = 0;
      this.surface.renderOrder = 4;
      this.group.add(this.surface);
    }
    if (kind === 'tsunami') {
      this.surfaceMat.color.set('#2a7d8c');
      this.surfaceMat.emissive.set('#0a2a34');
      this.surfaceMat.emissiveIntensity = .25;
      this.surfaceMat.opacity = .48;
      this.surfaceMat.roughness = .12;
      this.surfaceMat.metalness = .3;
    } else {
      this.surfaceMat.color.set('#3a120a');
      this.surfaceMat.emissive.set('#ff4a12');
      this.surfaceMat.emissiveIntensity = 1.5;
      this.surfaceMat.opacity = .88;
      this.surfaceMat.roughness = .85;
      this.surfaceMat.metalness = 0;
    }
    this.surface.name = kind === 'tsunami' ? 'tsunami-surface' : 'lava-surface';
    this.surface.visible = true;
    this.riseTime = Math.min(10, this.duration * RISE_FRACTION);
  }

  #recede() {
    this.phase = 'receding';
    this.elapsed = 0;
  }

  #startGravity(e) {
    this.active = 'gravity';
    this.phase = 'sustained';
    this.elapsed = 0;
    this.duration = Math.max(1, e.durationSeconds ?? 30);
    const anchors = e.anchors ?? this.scenario?.survival?.anchors ?? [];
    const radius = e.anchorRadius ?? this.scenario?.survival?.anchorRadius ?? 28;
    if (!this.domes.length) {
      const geo = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      this._disposables.push(geo);
      for (const a of anchors) {
        const mat = new THREE.MeshBasicMaterial({
          color: '#7fd8e8', transparent: true, opacity: .1, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        this._disposables.push(mat);
        const dome = new THREE.Mesh(geo, mat);
        dome.position.set(a.x, 0, a.z);
        dome.name = `gravity-dome:${a.id ?? 'anchor'}`;
        dome.visible = false;
        this.group.add(dome);
        this.domes.push(dome);
      }
    }
    for (const d of this.domes) d.visible = true;
  }

  #endGravity() {
    this.phase = 'receding';
    this.elapsed = 0;
  }

  /** Emissores locais p/ espuma/brasas/motos (só se há ParticleSystem). */
  #particleRate(dt, { rate, spawn }) {
    if (!this.particles || rate <= 0) return;
    this.#emitDebt[spawn.tag ?? 'x'] = (this.#emitDebt[spawn.tag ?? 'x'] ?? 0) + rate * dt;
    const n = Math.floor(this.#emitDebt[spawn.tag ?? 'x']);
    if (n > 0) {
      this.#emitDebt[spawn.tag ?? 'x'] -= n;
      for (let i = 0; i < n; i++) this.particles.spawn(spawn.fn());
    }
  }

  #emitDebt = {};

  /** Fase 26 — intensidade 0..1 do hazard corrente p/ os marcos do mundo:
   *  subida inclina (smoothstep do rise), sustentação = 1, recuo desce. */
  #landmarkBoost() {
    if (this.active === 'gravity') return this.gravityBoost;
    if (this.active === 'acid') return 1; // pulse ativo = alerta pleno nos marcos
    if (this.active === 'tsunami' || this.active === 'lava') {
      if (this.phase === 'rising') return Math.min(1, this.elapsed / Math.max(.001, this.riseTime));
      if (this.phase === 'sustained') return 1;
      if (this.phase === 'receding') return Math.max(0, 1 - this.elapsed / RECEDE_SECONDS);
    }
    return 0;
  }

  /** Empurra o estado corrente aos marcos (idempotente: idle zera 1×). */
  #pushLandmarks() {
    if (!this.landmarks?.applyHazard) return;
    if (this.active) {
      this.landmarks.applyHazard(this.active, this.#landmarkBoost(), this.surface?.position.y ?? 0);
      this._landmarkKind = this.active;
    } else if (this._landmarkKind) {
      this.landmarks.applyHazard(null, 0, 0);
      this._landmarkKind = null;
    }
  }

  update(dt, t) {
    // ---------- Fase 26 — estado p/ os marcos do mundo (sempre) ----------
    this.#pushLandmarks();

    // ---------- superfície (tsunami/lava) ----------
    if (this.surface && (this.active === 'tsunami' || this.active === 'lava')) {
      this.elapsed += dt;
      const y = this.surface.position.y;
      if (this.phase === 'rising') {
        const k = Math.min(1, this.elapsed / this.riseTime);
        this.surface.position.y = this.targetY * (k * k * (3 - 2 * k)); // smoothstep
        if (this.elapsed >= this.riseTime - 1e-9) this.phase = 'sustained'; // ε p/ drift float do acumulador
      } else if (this.phase === 'sustained') {
        // ondulação sutil (respiração) — não desmente a regra de dano
        this.surface.position.y = this.targetY + Math.sin(t * 1.3) * .6;
      } else if (this.phase === 'receding') {
        const k = Math.min(1, this.elapsed / RECEDE_SECONDS);
        this.surface.position.y = this.targetY * (1 - k) * (1 - k);
        if (this.elapsed >= RECEDE_SECONDS - 1e-9) {
          this.surface.visible = false;
          this.surface.position.y = 0;
          this.active = null;
          this.phase = 'idle';
        }
      }
      if (this.surfaceMat) {
        // lava pulsa emissiva; água cintila levemente
        const pulse = this.active === 'lava' ? 1.5 + Math.sin(t * 7.3) * .35 : .25 + Math.sin(t * 2.1) * .08;
        this.surfaceMat.emissiveIntensity = pulse;
      }
      // partículas de borda
      const rate = this.phase === 'receding' ? 8 : 26;
      if (this.active === 'tsunami') {
        this.#particleRate(dt, {
          rate,
          spawn: {
            tag: 'foam',
            fn: () => {
              const a = this.rng.next() * Math.PI * 2;
              const r = ARENA_RADIUS - this.rng.next() * 6;
              return {
                x: Math.cos(a) * r, y: this.surface.position.y + .4, z: Math.sin(a) * r,
                vx: -Math.cos(a) * 2.4, vy: 2.6 + this.rng.next() * 2.2, vz: -Math.sin(a) * 2.4,
                size: 1.4 + this.rng.next() * 1.4, growth: .8, life: 1.4 + this.rng.next() * .8,
                drag: .35, gravity: 3.4, alpha: .5,
                color: [.82, .93, .95], endColor: [.6, .8, .85],
              };
            },
          },
        });
      } else if (this.active === 'lava') {
        this.#particleRate(dt, {
          rate,
          spawn: {
            tag: 'ember',
            fn: () => {
              const a = this.rng.next() * Math.PI * 2;
              const r = 30 + this.rng.next() * (ARENA_RADIUS - 34);
              return {
                x: Math.cos(a) * r, y: this.surface.position.y + .5, z: Math.sin(a) * r,
                vx: (this.rng.next() - .5) * 2.2, vy: 4 + this.rng.next() * 4.4, vz: (this.rng.next() - .5) * 2.2,
                size: .5 + this.rng.next() * .7, growth: -.06, life: 1.2 + this.rng.next() * 1.1,
                drag: .12, gravity: 2.6, alpha: .9,
                color: [1, .62, .18], endColor: [.35, .08, .03],
              };
            },
          },
        });
        this.#particleRate(dt, {
          rate: 7,
          spawn: {
            tag: 'lavaSmoke',
            fn: () => {
              const a = this.rng.next() * Math.PI * 2;
              const r = this.rng.next() * ARENA_RADIUS;
              return {
                x: Math.cos(a) * r, y: this.surface.position.y + 1, z: Math.sin(a) * r,
                vx: (this.rng.next() - .5) * 1.4, vy: 3 + this.rng.next() * 2.4, vz: (this.rng.next() - .5) * 1.4,
                size: 2.4 + this.rng.next() * 2, growth: 1.6, life: 3 + this.rng.next() * 2,
                drag: .5, gravity: -0.8, alpha: .34,
                color: [.25, .22, .2], endColor: [.42, .4, .38],
              };
            },
          },
        });
      }
    }

    // ---------- gravidade (Arukheea) ----------
    if (this.active === 'gravity') {
      this.elapsed += dt;
      this.gravityBoost = Math.min(1, this.gravityBoost + dt * 2);
      const done = this.phase === 'receding' && this.elapsed >= 1.2;
      if (this.phase === 'receding') this.gravityBoost = Math.max(0, 1 - this.elapsed / 1.2);
      for (let i = 0; i < this.domes.length; i++) {
        const d = this.domes[i];
        d.material.opacity = (.08 + Math.sin(t * 2.4 + i * 1.7) * .04 + .06) * this.gravityBoost;
        d.rotation.y = t * .3 * this.gravityBoost;
      }
      if (done) {
        for (const d of this.domes) d.visible = false;
        this.active = null;
        this.phase = 'idle';
        this.gravityBoost = 0;
      } else if (this.particles) {
        this.#particleRate(dt, {
          rate: 14 * this.gravityBoost,
          spawn: {
            tag: 'motes',
            fn: () => {
              const d = this.domes[Math.floor(this.rng.next() * this.domes.length)] ?? this.domes[0];
              const a = this.rng.next() * Math.PI * 2;
              const r = this.rng.next() * 20;
              return {
                x: d.position.x + Math.cos(a) * r, y: .5 + this.rng.next() * 6, z: d.position.z + Math.sin(a) * r,
                vx: (this.rng.next() - .5) * .8, vy: 3.4 + this.rng.next() * 3, vz: (this.rng.next() - .5) * .8,
                size: .5 + this.rng.next() * .6, growth: 0, life: 2.2 + this.rng.next() * 1.6,
                drag: .1, gravity: -2.2, alpha: .8,
                color: [.5, .85, .91], endColor: [.24, .66, .78],
              };
            },
          },
        });
      }
    }

    // ---------- acidRain (CIGKV) ----------
    if (this.acidT <= 0 && this.active === 'acid') this.active = null; // pulse acabou
    if (this.acidT > 0) {
      this.acidT -= dt;
      // Fase 26 — ácido é pulse: marca 'acid' ativo enquanto o drizzle vive
      this.active ??= 'acid';
      this.#pushLandmarks();
      this.#particleRate(dt, {
        rate: 90,
        spawn: {
          tag: 'acid',
          fn: () => {
            const a = this.rng.next() * Math.PI * 2;
            const r = this.rng.next() * 160;
            return {
              x: Math.cos(a) * r, y: 96 + this.rng.next() * 24, z: Math.sin(a) * r,
              vx: (this.rng.next() - .5) * 1.6, vy: -34 - this.rng.next() * 8, vz: (this.rng.next() - .5) * 1.6,
              size: .38 + this.rng.next() * .3, growth: 0, life: 3.4,
              drag: 0, gravity: 6, alpha: .55,
              color: [.48, .85, .29], endColor: [.2, .45, .18],
            };
          },
        },
      });
    }
  }

  /** Estado p/ testes e HUD. */
  get state() {
    return {
      active: this.active,
      phase: this.phase,
      surfaceY: this.surface?.position.y ?? 0,
      targetY: this.targetY,
      domes: this.domes.length,
      acidT: Math.max(0, this.acidT),
      gravityBoost: this.gravityBoost,
    };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this._disposables) { try { d.dispose?.(); } catch { /* já descartado */ } }
    this._disposables.length = 0;
    this.domes.length = 0;
    this.emitters.length = 0;
    this.surface = null;
    this.surfaceMat = null;
    this.landmarks = null;
  }
}
