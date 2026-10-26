// Khaaos Run — Efeitos: tracers, muzzle flash, impactos, explosões e partículas (pooled).
import * as THREE from 'three';
import { radialSprite } from './textures3d.js';

export class Effects {
  #restoreMuzzleColor = 0;
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flashes = [];
    this.particles = [];
    this.explosions = [];
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
  }

  impact(pos, kind = 'wall') {
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

  hitFlesh(pos) { this.impact(pos, 'blood'); }

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
