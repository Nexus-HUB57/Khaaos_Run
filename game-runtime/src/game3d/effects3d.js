// Khaaos Run — Efeitos: tracers, muzzle flash, impactos e partículas (pooled).
import * as THREE from 'three';
import { radialSprite } from './textures3d.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flashes = [];
    this.particles = [];
    this.spriteTex = radialSprite();
    this.sparkTex = radialSprite('rgba(255,240,200,1)', 'rgba(255,160,60,0)');
    this.bloodTex = radialSprite('rgba(200,30,30,1)', 'rgba(120,10,10,0)');

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
      this.muzzleLight.intensity = Math.max(0, this.muzzleLightT / .05) * 26;
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
  }
}
