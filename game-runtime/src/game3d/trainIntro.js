// Khaaos Run — Fase 11 — ZU: chegada de TREM no Ring.
//
// Cinemática de infiltração ferroviária: o trem do ZU cruza a zona na abertura
// da partida e os operativos desembarcam direto na infiltração aérea (o
// dropPhase 'sky' da sim/da sala). É APENAS visual + câmera: nenhum input é
// bloqueado, nada de física muda — servidor e sim continuam autoritativos.
// Determinística no tempo (timeline em segundos), skippável (clique/tecla/toque)
// e sem dependência de rede — o mesmo módulo serve offline e online.
import * as THREE from 'three';
import { frustumPrism } from './prisms3d.js';
import { TRAIN_INTRO_DURATION_MS } from '../shared/clock.js';

const TIMELINE = Object.freeze({
  APPROACH: 0,      // trem surge na borda, câmera acompanha
  OVERSPAWN: 2.0,   // trem cruza a zona de desembarque (pico da cena)
  SETTLE: TRAIN_INTRO_DURATION_MS / 1000, // handover para a câmera do jogador
  DURATION: TRAIN_INTRO_DURATION_MS / 1000,
});

export class TrainIntro {
  // spawn = { x, z } do jogador local; onDone chamado UMA vez no fim/skip.
  // startAt (segundos) = entrada sincronizada no meio da timeline — o anúncio
  // autoritativo da sala traz startedAt do servidor e o cliente reconstrói
  // exatamente o mesmo frame do trem que os demais remotos estão vendo.
  constructor({ scene, spawn = { x: 0, z: 118 }, onDone = null, skippable = true, startAt = 0 } = {}) {
    this.scene = scene;
    this.spawn = spawn;
    this.onDone = onDone;
    this.skippable = skippable;
    this.t = Math.max(0, Number(startAt) || 0);
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

  // Trem de 4 veículos (locomotiva + 3 vagões) + via permanente completa,
  // na direção X, passando a ~28 m do spawn. Fase 16 (P0): fim das caixas
  // flutuando numa placa — agora há LASTRO, DORMENTES, 2 TRILHOS, BOGIES com
  // rodas cilíndricas, nariz inclinado, cabine envidraçada, exaustores, farol,
  // tetos com beiral, janelas iluminadas, portas e engates entre veículos.
  #build() {
    const dir = this.spawn.x >= 0 ? 1 : -1;
    this.dir = dir;
    const g = this.group;
    const railZ = this.spawn.z + (this.spawn.z >= 0 ? 30 : -30);
    this.railZ = railZ;

    // ---- materiais (assinatura Khaaos: metal frio + acento âmbar + glow ácido) ----
    const metal = new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: .55, metalness: .65 });
    const metalDark = new THREE.MeshStandardMaterial({ color: '#191d22', roughness: .7, metalness: .55 });
    const accent = new THREE.MeshStandardMaterial({ color: '#b98a1e', roughness: .4, metalness: .5, emissive: '#4a3405', emissiveIntensity: .5 });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd75e', emissive: '#ffd75e', emissiveIntensity: 1.4, roughness: .3 });
    const windowLit = new THREE.MeshStandardMaterial({ color: '#2a2118', emissive: '#ffcf7a', emissiveIntensity: .85, roughness: .3 });
    const ballastMat = new THREE.MeshStandardMaterial({ color: '#3b352c', roughness: .97 });
    const sleeperMat = new THREE.MeshStandardMaterial({ color: '#4a3a26', roughness: .95 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#565b63', roughness: .35, metalness: .85 });

    // ---- via permanente: lastro → dormentes instanciados → 2 trilhos ----
    const ballast = new THREE.Mesh(new THREE.BoxGeometry(520, .22, 4.4), ballastMat);
    ballast.position.set(0, .11, railZ);
    g.add(ballast);
    const SLEEPER_STEP = .75, SPAN = 520;
    const sleeperCount = Math.floor(SPAN / SLEEPER_STEP);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .1, .26), sleeperMat, sleeperCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < sleeperCount; i++) {
      dummy.position.set(-SPAN / 2 + i * SLEEPER_STEP, .24, railZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      sleepers.setMatrixAt(i, dummy.matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    g.add(sleepers);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(SPAN, .16, .1), railMat);
      rail.position.set(0, .34, railZ + side * .75);
      g.add(rail);
    }

    // ---- bogie: castelo + eixos com rodas cilíndricas (eixo ao longo do Z) ----
    const mkBogie = (wheelsPerSide, x) => {
      const bogie = new THREE.Group();
      bogie.position.set(x, .95, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, .5, 2.5), metalDark);
      frame.position.y = .25;
      bogie.add(frame);
      for (let a = 0; a < wheelsPerSide; a++) {
        for (const side of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .16, 12), metalDark);
          wheel.rotation.x = Math.PI / 2;                 // eixo Y → Z (rola no X)
          wheel.position.set((a - (wheelsPerSide - 1) / 2) * 1.15, 0, side * 1.18);
          bogie.add(wheel);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .18, 10), railMat);
          rim.rotation.x = Math.PI / 2;
          rim.position.copy(wheel.position);
          bogie.add(rim);
        }
      }
      return bogie;
    };

    // ---- composição: locomotiva + 3 vagões, em fila no eixo X ----
    this.cars = [];
    const specs = [
      { len: 14, lead: true },
      { len: 11 },
      { len: 11 },
      { len: 11 },
    ];
    let offset = 0;
    for (const s of specs) {
      const car = new THREE.Group();                       // grupo = veículo inteiro
      const L = s.len;
      if (s.lead) {
        // corpo principal + nariz inclinado (prisma frustrado)
        const body = new THREE.Mesh(new THREE.BoxGeometry(L - 3.2, 2.1, 3.0), metal);
        body.position.set(1.6 - (3.2 - 3.2) / 2, 2.25, 0);
        car.add(body);
        const nose = new THREE.Mesh(frustumPrism({ wB: 3.0, wT: 2.2, lB: 3.4, lT: 2.0, h: 2.1 }), accent);
        nose.position.set(-L / 2 + 1.7, 1.2, 0);
        nose.rotation.y = Math.PI;                         // afila para a frente (-x local)
        car.add(nose);
        // cabine envidraçada (faixa emissiva morna) + teto com beiral
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 2.7), metal);
        cab.position.set(L / 2 - 2.2, 3.55, 0);
        car.add(cab);
        const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.7, .5, 2.76), windowLit);
        cabGlass.position.set(L / 2 - 2.2, 3.72, 0);
        car.add(cabGlass);
        const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(3.7, .18, 2.9), metalDark);
        cabRoof.position.set(L / 2 - 2.2, 4.4, 0);
        car.add(cabRoof);
        // exaustores com anel emissivo
        for (const ex of [-.9, .2]) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .7, 8), metalDark);
          stack.position.set(L / 2 - 3.4 + ex + .5, 4.75, 0);
          car.add(stack);
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .1, 8), glow);
          ring.position.set(stack.position.x, 5.08, 0);
          car.add(ring);
        }
        // farol + faixa de comando na face frontal
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.17, 10, 8), glow);
        lamp.position.set(-L / 2 + .35, 1.75, 0);
        car.add(lamp);
        // saias laterais escondendo o rancho da carroceria
        for (const side of [-1, 1]) {
          const skirt = new THREE.Mesh(new THREE.BoxGeometry(L - 3.2, .55, .14), metalDark);
          skirt.position.set(1.6, 1.28, side * 1.5);
          car.add(skirt);
        }
        car.add(mkBogie(3, -L / 2 + 2.6));
        car.add(mkBogie(3, L / 2 - 2.6));
        this.leadAccentMat = accent;                       // pulso no update (fase anterior)
      } else {
        // vagão: corpo + teto com beiral + janelas iluminadas + portas + chassis
        const body = new THREE.Mesh(new THREE.BoxGeometry(L, 2.5, 3.0), metal);
        body.position.y = 2.4;
        car.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(L + .35, .18, 3.3), metalDark);
        roof.position.y = 3.74;
        car.add(roof);
        const band = new THREE.Mesh(new THREE.BoxGeometry(L * .86, .45, 3.04), windowLit);
        band.position.y = 2.95;
        car.add(band);
        for (const side of [-1, 1]) for (const dx of [-1.7, 1.7]) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, .08), metalDark);
          door.position.set(dx, 2.2, side * 1.52);
          car.add(door);
        }
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(L - .2, .4, 2.6), metalDark);
        chassis.position.y = 1.02;
        car.add(chassis);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * .9, .12, .06), glow);
        stripe.position.set(0, 1.62, 1.52);
        car.add(stripe);
        car.add(mkBogie(2, -L / 2 + 1.9));
        car.add(mkBogie(2, L / 2 - 1.9));
      }
      // engates nas duas extremidades (ponteiam o vão entre veículos)
      for (const end of [-1, 1]) {
        const coupler = new THREE.Mesh(new THREE.BoxGeometry(1.1, .24, .22), metalDark);
        coupler.position.set(end * (L / 2 + .55), 1.12, 0);
        car.add(coupler);
      }
      car.userData.offset = offset;
      offset += L + 2.4;
      this.cars.push(car);
      g.add(car);
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
    if (this.leadAccentMat) this.leadAccentMat.emissiveIntensity = .5 + Math.sin(this.t * 9) * .18;
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
