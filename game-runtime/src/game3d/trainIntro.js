// Khaaos Run — Fase 11 — ZU: chegada de TREM no Ring.
//
// Cinemática de infiltração ferroviária: o trem do ZU cruza a zona na abertura
// da partida e os operativos desembarcam direto na infiltração aérea (o
// dropPhase 'sky' da sim/da sala). É APENAS visual + câmera: nenhum input é
// bloqueado, nada de física muda — servidor e sim continuam autoritativos.
// Determinística no tempo (timeline em segundos), skippável (clique/tecla/toque)
// e sem dependência de rede — o mesmo módulo serve offline e online.
import * as THREE from 'three';

const TIMELINE = Object.freeze({
  APPROACH: 0,      // trem surge na borda, câmera acompanha
  OVERSPAWN: 2.0,   // trem cruza a zona de desembarque (pico da cena)
  SETTLE: 3.4,      // handover para a câmera do jogador
  DURATION: 3.4,
});

export class TrainIntro {
  // spawn = { x, z } do jogador local; onDone chamado UMA vez no fim/skip.
  constructor({ scene, spawn = { x: 0, z: 118 }, onDone = null, skippable = true } = {}) {
    this.scene = scene;
    this.spawn = spawn;
    this.onDone = onDone;
    this.skippable = skippable;
    this.t = 0;
    this.done = false;
    this.group = new THREE.Group();
    this.group.name = 'zu-train-intro';
    this.#build();
    scene.add(this.group);
    this._skip = () => this.skip();
    if (this.skippable && typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._skip, { once: false });
      window.addEventListener('keydown', this._skip, { once: false });
      window.addEventListener('touchstart', this._skip, { once: false, passive: true });
    }
  }

  // Trem de 4 segmentos + trilho na direção X, passando a ~28 m do spawn.
  #build() {
    const metal = new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: .55, metalness: .65 });
    const accent = new THREE.MeshStandardMaterial({ color: '#b98a1e', roughness: .4, metalness: .5, emissive: '#4a3405', emissiveIntensity: .5 });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd75e', emissive: '#ffd75e', emissiveIntensity: 1.4, roughness: .3 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#191d22', roughness: .8, metalness: .3 });
    const dir = this.spawn.x >= 0 ? 1 : -1;
    this.dir = dir;
    // trilho reto atravessando a zona (placa fina, Some de longe — custo zero)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(520, 0.12, 3.4), railMat);
    rail.position.set(0, 0.1, this.spawn.z + (this.spawn.z >= 0 ? 30 : -30));
    this.group.add(rail);
    this.railZ = rail.position.z;
    // composição do trem: locomotiva + 3 vagões, em fila no eixo X
    this.cars = [];
    const specs = [
      { len: 14, h: 4.4, lead: true },
      { len: 11, h: 3.8 },
      { len: 11, h: 3.8 },
      { len: 11, h: 3.8 },
    ];
    let offset = 0;
    for (const s of specs) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(s.len, s.h, 4.2), s.lead ? accent : metal);
      car.position.y = s.h / 2 + 1.1;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(s.len * .92, .34, .2), glow);
      strip.position.set(0, s.h * .55, 2.2);
      car.add(strip);
      car.userData.offset = offset;
      offset += s.len + 2.4;
      this.cars.push(car);
      this.group.add(car);
    }
    this.trainLength = offset;
    // entrada: da borda contrária ao spawn, alinhada com o trilho
    this.startX = -dir * (260 + this.trainLength);
    this.endX = dir * (260 + this.trainLength);
    this.speed = (this.endX - this.startX) / 9.5; // atravessa a zona em ~9.5 s
  }

  // posição da cabeça do trem no tempo t (determinística)
  headX(t) { return this.startX + this.speed * t; }

  update(dt) {
    if (this.done) return true;
    this.t += dt;
    const head = this.headX(this.t);
    for (const car of this.cars) car.position.x = head - this.dir * car.userData.offset;
    // farol da locomotiva pulsa levemente (presença noturna)
    const lead = this.cars[0];
    if (lead) lead.material.emissiveIntensity = .5 + Math.sin(this.t * 9) * .18;
    if (this.t >= TIMELINE.DURATION) this.#finish();
    return this.done;
  }

  // Câmera cinematográfica: acompanha o trem, aproxima do ponto de desembarque
  // no OVERSPAWN e devolve o controle em SETTLE. Chamada pelo Game3D quando ativa.
  cameraPose(cam, playerPos) {
    const head = this.headX(this.t);
    const k = Math.min(1, this.t / TIMELINE.OVERSPAWN);
    // da cauda à zona de desembarque: interpolação suave (smoothstep)
    const ease = k * k * (3 - 2 * k);
    const focusX = head - this.dir * 26;
    const camX = focusX - this.dir * (34 - 16 * ease);
    const camZ = this.railZ + this.dir * (26 - 8 * ease) * (this.spawn.z >= 0 ? 1 : 1);
    const camY = 16 - 5 * ease;
    cam.position.set(camX, camY, camZ);
    cam.lookAt(focusX, 6 - 2 * ease, this.railZ);
  }

  skip() {
    if (this.done || !this.skippable) return;
    this.#finish();
  }

  #finish() {
    if (this.done) return;
    this.done = true;
    this.dispose();
    this.onDone?.();
  }

  dispose() {
    if (this.skippable && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._skip);
      window.removeEventListener('keydown', this._skip);
      window.removeEventListener('touchstart', this._skip);
    }
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
  }
}

// banner DOM (reuso do feed + status do HUD — sem markup novo)
export function trainIntroBanner(hud) {
  hud?.feed('ZU', 'Trem de infiltração chegando — desembarque no Ring autorizado.', 'warn');
}
