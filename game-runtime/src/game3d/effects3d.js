// Khaaos Run — Efeitos: tracers, muzzle flash, impactos, explosões e partículas.
// Fase 18 — partículas de combate migram para o POOL da cena (particles3d.js,
// 1 draw call, determinístico com SeededRng injetado): impactos, sangue,
// fumaça/faíscas de explosão, cristais de gloo e fumaça de muzzle. Sem pool
// (testes headless antigos / fallback), o caminho legado de sprites segue
// intacto — zero quebra de contrato.
import * as THREE from 'three';
import { radialSprite } from './textures3d.js';

export class Effects {
  #restoreMuzzleColor = 0;
  constructor(scene, { particles = null, rng = null } = {}) {
    this.scene = scene;
    this.tracers = [];
    this.flashes = [];
    this.particles = [];
    this.explosions = [];
    this.abilityAuras = []; // Fase 9 — auras de habilidade (remotos vêem o cast)
    // Fase 18 — pool compartilhado + rng injetado (determinismo); null = legado
    this.pool = particles;
    this.rng = rng;
    this.spriteTex = radialSprite();
    this.sparkTex = radialSprite('rgba(255,240,200,1)', 'rgba(255,160,60,0)');
    this.bloodTex = radialSprite('rgba(200,30,30,1)', 'rgba(120,10,10,0)');
    this.smokeTex = radialSprite('rgba(120,112,104,1)', 'rgba(70,66,62,0)');
    this.fireTex = radialSprite('rgba(255,214,120,1)', 'rgba(255,90,20,0)');

    // pool de tracers: quads aditivos esticados
    const tracerMat = new THREE.MeshBasicMaterial({
      color: '#ffd9a0', transparent: true, opacity: .9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracerPool = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tracerMat.clone());
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracerPool.push({ mesh: m, life: 0 });
    }
    // luz de muzzle compartilhada
    this.muzzleLight = new THREE.PointLight('#ffb45e', 0, 18, 2);
    scene.add(this.muzzleLight);
    this.muzzleLightT = 0;
  }

  spawnTracer(from, to) {
    const t = this.tracerPool.find(t => t.life <= 0) ?? this.tracerPool[0];
    const m = t.mesh;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    m.position.copy(from).addScaledVector(dir, .5);
    m.scale.set(.05, len, 1);
    m.lookAt(to);
    m.rotateX(Math.PI / 2); // plane Y->Z orientado ao trajeto
    m.material.opacity = .85;
    m.visible = true;
    t.life = .09;
  }

  muzzleFlash(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 26;
    this.muzzleLightT = .05;
    // Fase 18 — fumaça de queima rápida + 2 faíscas no pool (envelope curto)
    if (this.pool) {
      const rnd = this.rng ? () => this.rng.next() : Math.random;
      this.pool.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * .6, vy: .9 + rnd() * .5, vz: (rnd() - .5) * .6,
        size: .3 + rnd() * .22, growth: .8, life: .3 + rnd() * .25, drag: .3, gravity: -0.4, alpha: .32,
        color: [.82, .78, .7], endColor: [.5, .48, .45],
      });
      for (let i = 0; i < 2; i++) {
        this.pool.spawn({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 5, vy: rnd() * 2.6, vz: (rnd() - .5) * 5,
          size: .05 + rnd() * .05, growth: -.04, life: .12 + rnd() * .12, drag: .08, gravity: 9, alpha: .95,
          color: [1, .8, .4], endColor: [.85, .3, .06],
        });
      }
    }
  }

  impact(pos, kind = 'wall') {
    // Fase 18 — caminho do POOL (determinístico): faíscas de solda em
    // superfície, poeira no chão e sangue — cores/verbos por kind.
    if (this.pool) {
      const rnd = this.rng ? () => this.rng.next() : Math.random;
      const burst = (n, fn) => { for (let i = 0; i < n; i++) this.pool.spawn(fn()); };
      if (kind === 'blood') {
        burst(9, () => ({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 4.6, vy: rnd() * 3.4 + .6, vz: (rnd() - .5) * 4.6,
          size: .1 + rnd() * .09, growth: -.02, life: .3 + rnd() * .28, drag: .06, gravity: 14, alpha: .92,
          color: [.55, .06, .05], endColor: [.25, .02, .02],
        }));
        return;
      }
      if (kind === 'ground') {
        burst(7, () => ({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 3.6, vy: 1.4 + rnd() * 2.6, vz: (rnd() - .5) * 3.6,
          size: .08 + rnd() * .08, growth: .05, life: .28 + rnd() * .3, drag: .05, gravity: 11, alpha: .85,
          color: [.5, .44, .34], endColor: [.3, .27, .22],
        }));
        burst(2, () => ({
          x: pos.x, y: pos.y + .05, z: pos.z, vx: (rnd() - .5) * .7, vy: .6 + rnd() * .5, vz: (rnd() - .5) * .7,
          size: .3 + rnd() * .2, growth: 1.1, life: .5 + rnd() * .25, drag: .4, gravity: -0.5, alpha: .3,
          color: [.55, .5, .42], endColor: [.38, .35, .3],
        }));
        return;
      }
      // Fase 25 — madeira (folha de porta levando bala): lascas marrons + serragem
      if (kind === 'wood') {
        burst(9, () => ({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 5.2, vy: rnd() * 3.6 + .7, vz: (rnd() - .5) * 5.2,
          size: .06 + rnd() * .07, growth: -.015, life: .26 + rnd() * .26, drag: .05, gravity: 12, alpha: .9,
          color: [.48, .33, .17], endColor: [.3, .2, .1],
        }));
        burst(2, () => ({
          x: pos.x, y: pos.y + .05, z: pos.z, vx: (rnd() - .5) * .8, vy: .5 + rnd() * .6, vz: (rnd() - .5) * .8,
          size: .24 + rnd() * .18, growth: 1, life: .45 + rnd() * .2, drag: .4, gravity: -0.5, alpha: .28,
          color: [.52, .42, .3], endColor: [.36, .3, .22],
        }));
        return;
      }
      // Fase 25.1 — METAL (folha do hangar levando bala): faíscas quentes +
      // fragmentos cinza de chapa (diferente da lascas marrons da madeira)
      if (kind === 'metal') {
        burst(12, () => ({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 7, vy: rnd() * 4.6 + 1, vz: (rnd() - .5) * 7,
          size: .04 + rnd() * .05, growth: -.02, life: .18 + rnd() * .22, drag: .05, gravity: 10, alpha: .95,
          color: [1, .85, .45], endColor: [.9, .4, .08],
        }));
        burst(3, () => ({
          x: pos.x, y: pos.y + .04, z: pos.z, vx: (rnd() - .5) * 3.4, vy: rnd() * 2.4 + .6, vz: (rnd() - .5) * 3.4,
          size: .07 + rnd() * .08, growth: -.02, life: .3 + rnd() * .2, drag: .1, gravity: 11, alpha: .85,
          color: [.52, .55, .58], endColor: [.3, .32, .34],
        }));
        return;
      }
      // Fase 26 — VIDRO (janela rachando/estilhaçando): cacos ciano-brancos
      // brilhantes e rápidos + lascas grandes caindo devagar (leitura de vidro,
      // não de poeira — contraste com madeira/metal)
      if (kind === 'glass') {
        burst(10, () => ({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 6.2, vy: rnd() * 4.2 + .8, vz: (rnd() - .5) * 6.2,
          size: .03 + rnd() * .05, growth: -.012, life: .2 + rnd() * .24, drag: .04, gravity: 13, alpha: .96,
          color: [.82, .94, .98], endColor: [.42, .66, .78],
        }));
        burst(4, () => ({
          x: pos.x, y: pos.y + .03, z: pos.z, vx: (rnd() - .5) * 2.6, vy: rnd() * 1.6 + .2, vz: (rnd() - .5) * 2.6,
          size: .09 + rnd() * .1, growth: -.01, life: .42 + rnd() * .26, drag: .06, gravity: 12, alpha: .8,
          color: [.7, .88, .95], endColor: [.3, .5, .62],
        }));
        return;
      }
      // wall / gloo: faíscas quentes + poeira de rasgo
      burst(10, () => ({
        x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 6.4, vy: rnd() * 4.4 + .8, vz: (rnd() - .5) * 6.4,
        size: .05 + rnd() * .06, growth: -.03, life: .22 + rnd() * .3, drag: .06, gravity: 9.5, alpha: .95,
        color: [1, .8, .38], endColor: [.85, .32, .07],
      }));
      burst(2, () => ({
        x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * .8, vy: .5 + rnd() * .6, vz: (rnd() - .5) * .8,
        size: .22 + rnd() * .18, growth: .9, life: .4 + rnd() * .2, drag: .4, gravity: -0.5, alpha: .3,
        color: [.6, .58, .54], endColor: [.42, .4, .38],
      }));
      return;
    }
    // ---------- caminho legado (sprites) — fallback sem pool ----------
    const n = kind === 'ground' ? 8 : 12;
    for (let i = 0; i < n; i++) {
      const p = this.#getParticle(kind === 'blood' ? this.bloodTex : this.sparkTex);
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - .5) * 7, Math.random() * 5 + 1, (Math.random() - .5) * 7);
      p.life = .25 + Math.random() * .3;
      p.size = kind === 'blood' ? .1 + Math.random() * .08 : .05 + Math.random() * .06;
      p.mesh.material.opacity = 1;
      p.mesh.visible = true;
      p.gravity = kind === 'blood' ? 14 : 9;
    }
    // poeira
    if (kind !== 'blood') {
      const p = this.#getParticle(this.spriteTex);
      p.mesh.position.copy(pos);
      p.vel.set(0, .8, 0);
      p.life = .5; p.size = .5; p.gravity = -0.5;
      p.mesh.material.opacity = .35;
      p.mesh.visible = true;
    }
  }

  hitFlesh(pos) { this.impact(pos, 'blood'); } // Fase 18 — pool já resolve 'blood' dentro de impact

  // Fase 5 — orifícios de bala: marcas escuras que grudam na superfície e somem.
  // Pool fixo (mais antigo é reciclado) — sem crescimento descontrolado.
  bulletHole(pos) {
    if (!this.holeTex) this.holeTex = radialSprite('rgba(24,22,20,1)', 'rgba(24,22,20,0)');
    this.holes ??= [];
    let h = this.holes.find(h => h.life <= 0);
    if (!h) {
      if (this.holes.length >= 30) {
        h = this.holes.reduce((a, b) => (a.life < b.life ? a : b)); // recicla o mais velho
      } else {
        const mesh = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.holeTex, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, rotation: Math.random() * Math.PI * 2,
        }));
        mesh.scale.set(.14, .14, 1);
        this.scene.add(mesh);
        h = { mesh, life: 0 };
        this.holes.push(h);
      }
    }
    h.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * .04, (Math.random() - .5) * .04, (Math.random() - .5) * .04));
    h.mesh.material.rotation = Math.random() * Math.PI * 2;
    h.mesh.material.opacity = .92;
    h.mesh.visible = true;
    h.life = 7;
    return h;
  }

  // Fase 4 — explosão de granada: flash de luz, bola de fogo, fumaça, debris e anel
  explosion(pos) {
    // luz da explosão (mais forte e duradoura que o muzzle)
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 220;
    this.muzzleLightT = .22;
    this.muzzleLight.color.set('#ffd27a');
    this.#restoreMuzzleColor = .3; // volta à cor de muzzle após o flash
    // bola de fogo (núcleo aditivo que expande e some)
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.fireTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fire.position.copy(pos);
    fire.scale.set(.5, .5, 1);
    this.scene.add(fire);
    this.explosions.push({ mesh: fire, life: .38, max: 4.6 });
    // Fase 18 — fumaça + faíscas no POOL (determinístico)
    if (this.pool) {
      const rnd = this.rng ? () => this.rng.next() : Math.random;
      for (let i = 0; i < 10; i++) {
        this.pool.spawn({
          x: pos.x + (rnd() - .5) * 1.4, y: pos.y + rnd() * .5, z: pos.z + (rnd() - .5) * 1.4,
          vx: (rnd() - .5) * 2.4, vy: 1.6 + rnd() * 2.2, vz: (rnd() - .5) * 2.4,
          size: .8 + rnd() * .9, growth: 1.5, life: .9 + rnd() * .7, drag: .5, gravity: -1.2, alpha: .5,
          color: [.3, .28, .26], endColor: [.46, .44, .42],
        });
      }
      for (let i = 0; i < 16; i++) {
        this.pool.spawn({
          x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - .5) * 15, vy: rnd() * 8.4 + 2, vz: (rnd() - .5) * 15,
          size: .07 + rnd() * .07, growth: -.05, life: .3 + rnd() * .35, drag: .04, gravity: 15, alpha: .95,
          color: [1, .66, .2], endColor: [.42, .1, .03],
        });
      }
      return;
    }
    // ---------- caminho legado (sprites) — fallback sem pool ----------
    // fumaça (normal blending, sobe lentamente)
    for (let i = 0; i < 10; i++) {
      const p = this.#getParticle(this.smokeTex);
      p.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * 1.4, Math.random() * .5, (Math.random() - .5) * 1.4));
      p.vel.set((Math.random() - .5) * 2.4, 1.6 + Math.random() * 2.2, (Math.random() - .5) * 2.4);
      p.life = .9 + Math.random() * .7;
      p.size = .8 + Math.random() * .9;
      p.gravity = -1.4;
      p.mesh.material.opacity = .5;
      p.mesh.visible = true;
    }
    // faíscas/debris
    for (let i = 0; i < 16; i++) {
      const p = this.#getParticle(this.sparkTex);
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - .5) * 16, Math.random() * 9 + 2, (Math.random() - .5) * 16);
      p.life = .3 + Math.random() * .35;
      p.size = .08 + Math.random() * .07;
      p.gravity = 16;
      p.mesh.material.opacity = 1;
      p.mesh.visible = true;
    }
  }

  // Fase 4 — impacto/deploy de Gloo Wall (cristalização)
  glooPuff(pos) {
    // Fase 18 — cristais no POOL (azul-gelo subindo)
    if (this.pool) {
      const rnd = this.rng ? () => this.rng.next() : Math.random;
      for (let i = 0; i < 8; i++) {
        this.pool.spawn({
          x: pos.x + (rnd() - .5) * 2.4, y: pos.y + rnd() * 2.2, z: pos.z + (rnd() - .5) * .8,
          vx: (rnd() - .5) * 1.2, vy: .6 + rnd(), vz: (rnd() - .5) * 1.2,
          size: .3 + rnd() * .3, growth: .5, life: .5 + rnd() * .4, drag: .3, gravity: -0.6, alpha: .55,
          color: [.6, .88, .96], endColor: [.36, .62, .82],
        });
      }
      return;
    }
    // ---------- caminho legado (sprites) ----------
    for (let i = 0; i < 8; i++) {
      const p = this.#getParticle(this.smokeTex);
      p.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * 2.4, Math.random() * 2.2, (Math.random() - .5) * .8));
      p.vel.set((Math.random() - .5) * 1.2, .6 + Math.random(), (Math.random() - .5) * 1.2);
      p.life = .5 + Math.random() * .4;
      p.size = .4 + Math.random() * .4;
      p.gravity = -0.6;
      p.mesh.material.opacity = .4;
      p.mesh.visible = true;
    }
  }

  // ---------- Fase 9 — VFX de habilidade p/ remotos (aura no caster) ----------
  // Aura curta no ponto do operativo que ativou a habilidade: anel aditivo que
  // expande no solo + coluna de partículas ascendentes + brilho pontual. Cor e
  // assinatura por família de efeito — remotos "leem" a habilidade de longe.
  #abilityColor(effect) {
    return {
      heal: '#4dff88', speed: '#4dd8ff', dash: '#4dd8ff', precision: '#ffc44d',
      damageReduction: '#9fb6c9', temporaryArmor: '#9fb6c9', recon: '#4d7dff',
      stun: '#b04dff', concealment: '#8f7dff', ringRead: '#ff9a4d',
      ringForecast: '#ff9a4d', terminalScan: '#59ffb0', ringResistance: '#7dffc9',
      fieldScan: '#fb923c', // Fase 26 — assinatura laranja da Invasão de Campo
    }[effect] ?? '#ffd9a0';
  }

  abilityAura(pos, effect = 'speed', radius = 18) {
    const color = this.#abilityColor(effect);
    // anel de solo que expande e some (0.55 s)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, Math.max(0.06, pos.y - 0.8), pos.z);
    this.scene.add(ring);
    this.abilityAuras.push({ mesh: ring, life: .55, max: .55, kind: 'ring', color: new THREE.Color(color) });
    // Fase 26 — Invasão de Campo (Talon): PULSO DE VARREDURA em escala real —
    // anel de raio ~params.radius que cresce do caster até o limite (0.9 s),
    // legível até 35 m (spec de skill ativa do BR).
    if (effect === 'fieldScan') {
      const R = Math.max(10, Math.min(28, radius));
      const scan = new THREE.Mesh(
        new THREE.RingGeometry(R * .82, R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      scan.rotation.x = -Math.PI / 2;
      scan.position.set(pos.x, Math.max(.08, pos.y - .8), pos.z);
      scan.scale.setScalar(.04);
      this.scene.add(scan);
      this.abilityAuras.push({ mesh: scan, life: .9, max: .9, kind: 'scan', color: new THREE.Color(color) });
    }
    // coluna de partículas ascendentes no caster
    for (let i = 0; i < 14; i++) {
      const p = this.#getParticle(this.spriteTex);
      p.mesh.material.color.set(color);
      p.mesh.position.set(pos.x + (Math.random() - .5) * .8, Math.max(.2, pos.y - .6) + Math.random() * 1.4, pos.z + (Math.random() - .5) * .8);
      p.vel.set((Math.random() - .5) * .9, 2.2 + Math.random() * 2.4, (Math.random() - .5) * .9);
      p.life = .4 + Math.random() * .45;
      p.size = .22 + Math.random() * .2;
      p.gravity = -1.2; // sobe acelerando (gravidade invertida)
      p.mesh.material.opacity = .9;
      p.mesh.visible = true;
    }
    // brilho pontual curto no peito do caster
    this.muzzleLight.color.set(color);
    this.muzzleLight.position.set(pos.x, pos.y + 1.2, pos.z);
    this.muzzleLight.intensity = 60;
    this.muzzleLightT = .16;
    this.#restoreMuzzleColor = .3;
  }

  #getParticle(tex) {
    let p = this.particles.find(p => p.life <= 0);
    if (!p) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Sprite(mat);
      mesh.scale.set(.1, .1, 1);
      this.scene.add(mesh);
      p = { mesh, vel: new THREE.Vector3(), life: 0, size: .1, gravity: 9 };
      this.particles.push(p);
    }
    p.mesh.material.map = tex;
    p.mesh.material.blending = tex === this.bloodTex ? THREE.NormalBlending : THREE.AdditiveBlending;
    return p;
  }

  update(dt) {
    // Fase 9 — auras de habilidade: anel expande e some (0.55 s)
    for (const a of this.abilityAuras) {
      if (a.life > 0) {
        a.life -= dt;
        const k = 1 - Math.max(0, a.life) / a.max;
        const s = a.kind === 'scan' ? .04 + (1 - Math.pow(1 - k, 3)) * .96 : .8 + k * 3.4; // scan cresce até o raio real
        a.mesh.scale.set(s, s, 1);
        a.mesh.material.opacity = Math.max(0, a.life / a.max) * (a.kind === 'scan' ? .55 : .85);
        if (a.life <= 0) { a.mesh.visible = false; this.scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); }
      }
    }
    if (this.abilityAuras.length) this.abilityAuras = this.abilityAuras.filter((a) => a.life > 0);
    for (const t of this.tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / .09) * .85;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    if (this.muzzleLightT > 0) {
      this.muzzleLightT -= dt;
      const frac = Math.max(0, this.muzzleLightT);
      this.muzzleLight.intensity = frac > .1 ? frac * 1000 : Math.max(0, frac / .05) * 26;
    }
    if (this.#restoreMuzzleColor > 0) {
      this.#restoreMuzzleColor -= dt;
      if (this.#restoreMuzzleColor <= 0 && this.muzzleLightT <= 0) this.muzzleLight.color.set('#ffb45e');
    }
    for (const e of this.explosions) {
      if (e.life > 0) {
        e.life -= dt;
        const k = 1 - e.life / .38;
        const s = .5 + e.max * Math.sqrt(k);
        e.mesh.scale.set(s, s, 1);
        e.mesh.material.opacity = Math.max(0, e.life / .38);
        if (e.life <= 0) { e.mesh.visible = false; this.scene.remove(e.mesh); }
      }
    }
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = p.size * Math.max(.2, p.life * 3);
        p.mesh.scale.set(s, s, 1);
        p.mesh.material.opacity = Math.min(1, p.life * 4);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    // Fase 5 — orifícios de bala: fade lento nos últimos 2s
    if (this.holes) {
      for (const h of this.holes) {
        if (h.life > 0) {
          h.life -= dt;
          if (h.life < 2) h.mesh.material.opacity = Math.max(0, h.life / 2) * .92;
          if (h.life <= 0) h.mesh.visible = false;
        }
      }
    }
  }
}
