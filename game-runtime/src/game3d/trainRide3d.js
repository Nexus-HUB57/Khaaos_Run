// Khaaos Run — Task 53 — TREM OFICIAL DO ZU: viagem a bordo (visual + câmera).
//
// Protocolo canônico de entrada dos Rings (SSOT src/shared/zuTrain.js):
//   EMBARQUE → EM ROTA (portas fechadas) → PORTAS ABERTAS (salto opcional =
//   entrada oficial) → CHEGADA (desembarque) → grace de 15 s → COMBATE LIVRE.
//
// Esta classe é APENAS apresentação (câmera no vagão + portas deslizantes +
// operativos a bordo): nenhuma regra vive aqui — posições são a pose PURA
// compartilhada (trainPoseAt/trainDoorJumpPose) e as fases vêm da SSOT. O
// servidor/sim permanecem autoritativos; o salto sai por onJump() (offline:
// sim.doorJump; online: WS door_jump validado).
//
// O vagão corre sobre um viaduto elevado (~4,2 m) — por isso o salto de porta
// nasce a JUMP_HEIGHT (5,5 m) e pousa pelo contrato canônico 'chute' da Fase 4.
import * as THREE from 'three';
import { ZU_TRAIN, zuTrainPhase, doorWindowOpen, trainPoseAt, trainDoorJumpPose } from '../shared/zuTrain.js';

const FLOOR_Y = 4.2;          // piso do vagão no viaduto (m)
const EYE_Y = 1.5;            // altura do olhar dentro do vagão
const DOOR_X0 = 1.2, DOOR_W = 3.0; // vão da porta (local X, lado +Z = lateral SSOT)

function box(w, h, d, color, { x = 0, y = 0, z = 0, metal = 0.55, rough = 0.55, opacity = 1 } = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, transparent: opacity < 1, opacity }),
  );
  m.position.set(x, y, z);
  m.castShadow = false; m.receiveShadow = false;
  return m;
}

export class TrainRide {
  constructor({ scene, route, startAt = 0, onJump = null, onDone = null, onPhase = null } = {}) {
    this.scene = scene; this.route = route;
    this.elapsedMs = Math.max(0, Number(startAt) || 0) * 1000;
    this.onJump = onJump; this.onDone = onDone; this.onPhase = onPhase;
    this.done = false; this.phase = null; this.doorOpenT = 0; // 0 fechada → 1 aberta

    this.group = new THREE.Group();
    this.group.userData.noCamBlock = true; // a câmera própria não colide com o vagão
    this.#buildWagon();
    scene.add(this.group);
  }

  #buildWagon() {
    const g = this.group;
    const STEEL = 0x53586a, DARK = 0x2c3038, AMBER = 0xd99a2b, FLOOR_C = 0x3a3f49, GLASS = 0x9fd0e8;
    // carcaça — piso/teto/laterais (comprimento local X, porta no lado +Z)
    g.add(box(16, 0.3, 3.4, FLOOR_C, { y: FLOOR_Y - 0.15 }));
    g.add(box(16, 0.28, 3.4, DARK, { y: FLOOR_Y + 2.55 }));
    g.add(box(16, 2.55, 0.16, STEEL, { z: -1.62, y: FLOOR_Y + 1.27 }));
    g.add(box(0.16, 2.55, 3.4, STEEL, { x: -7.92, y: FLOOR_Y + 1.27 }));
    g.add(box(0.16, 2.55, 3.4, DARK, { x: 7.92, y: FLOOR_Y + 1.27 })); // parede da cabine
    // lateral das portas (+Z): segmentos + faixa de vidro + viga sobre a porta
    g.add(box(1.5, 2.55, 0.16, STEEL, { x: -7.25, y: FLOOR_Y + 1.27, z: 1.62 }));
    g.add(box(6.0, 1.05, 0.07, GLASS, { x: -3.5, y: FLOOR_Y + 1.85, z: 1.62, opacity: 0.22, rough: 0.15 })); // vidro
    g.add(box(6.0, 0.7, 0.16, STEEL, { x: -3.5, y: FLOOR_Y + 0.62, z: 1.62 }));
    g.add(box(1.7, 2.55, 0.16, STEEL, { x: 0.35, y: FLOOR_Y + 1.27, z: 1.62 }));
    g.add(box(DOOR_W + 0.3, 0.35, 0.16, STEEL, { x: DOOR_X0 + DOOR_W / 2, y: FLOOR_Y + 2.37, z: 1.62 }));
    // folhas deslizantes (abrem para os lados na fase 'portas')
    this.doorL = box(DOOR_W / 2 + 0.02, 2.05, 0.12, AMBER, { x: DOOR_X0 + DOOR_W / 4, y: FLOOR_Y + 1.05, z: 1.68, metal: 0.35, rough: 0.4 });
    this.doorR = box(DOOR_W / 2 + 0.02, 2.05, 0.12, AMBER, { x: DOOR_X0 + 3 * DOOR_W / 4, y: FLOOR_Y + 1.05, z: 1.68, metal: 0.35, rough: 0.4 });
    this.doorL.userData.window = box(0.6, 0.7, 0.04, GLASS, { y: 0.45, opacity: 0.25 });
    this.doorL.userData.window.position.set(0, 0.45, 0);
    this.doorL.add(this.doorL.userData.window);
    this.doorR.userData.window = this.doorL.userData.window.clone();
    this.doorR.add(this.doorR.userData.window);
    g.add(this.doorL, this.doorR);
    // franja de identificação do ZU (âmbar) ao longo da lateral
    g.add(box(16, 0.16, 0.05, AMBER, { y: FLOOR_Y + 2.1, z: 1.72 }));
    g.add(box(16, 0.16, 0.05, AMBER, { y: FLOOR_Y + 2.1, z: -1.72 }));
    // bancos + operativos a bordo (todos seguem juntos — protocolo ZU)
    g.add(box(12, 0.45, 0.85, DARK, { x: -1.5, y: FLOOR_Y + 0.5, z: -1.05 }));
    g.add(box(3.2, 0.45, 0.85, DARK, { x: -6.2, y: FLOOR_Y + 0.5, z: 1.0 }));
    const vest = [0x4a6b8a, 0x6b4a4a, 0x506b4a, 0x5a4a6b, 0x6b5f4a, 0x44596b, 0x6b6b4a];
    for (let i = 0; i < 7; i++) {
      const seat = i < 4
        ? { x: -4.6 + i * 2.4, z: -0.98 }
        : { x: -6.9 + (i - 4) * 1.0, z: 1.02 };
      const op = new THREE.Group();
      op.add(box(0.52, 0.72, 0.34, vest[i], { y: 0.36, metal: 0.1, rough: 0.8 }));
      op.add(box(0.24, 0.24, 0.24, 0x8a7a66, { y: 0.86, metal: 0.05, rough: 0.9 }));
      op.position.set(seat.x, FLOOR_Y + 0.72, seat.z);
      op.userData.noCamBlock = true;
      g.add(op);
    }
    // bogies + locomotiva à frente (silhueta do trem completo)
    g.add(box(2.4, 0.8, 2.7, 0x20232a, { x: -4.6, y: FLOOR_Y - 0.7, metal: 0.2, rough: 0.8 }));
    g.add(box(2.4, 0.8, 2.7, 0x20232a, { x: 4.6, y: FLOOR_Y - 0.7, metal: 0.2, rough: 0.8 }));
    g.add(box(8.5, 3.3, 3.7, DARK, { x: 13.6, y: FLOOR_Y + 1.35, metal: 0.6, rough: 0.45 }));
    g.add(box(2.2, 2.0, 2.9, 0x1c1f26, { x: 17.4, y: FLOOR_Y + 1.7 }));
    g.add(box(8.5, 0.14, 0.05, AMBER, { x: 13.6, y: FLOOR_Y + 2.1, z: 1.88 }));
    // viaduto sob o trem (tábua de concreto — reforça a altura do salto)
    g.add(box(17, 0.5, 5.2, 0x4c4f56, { y: FLOOR_Y - 1.25, metal: 0.05, rough: 0.95 }));
    for (const px of [-7, 0, 7]) g.add(box(0.9, FLOOR_Y - 1.5, 0.9, 0x43464d, { x: px, y: (FLOOR_Y - 1.5) / 2, metal: 0.05, rough: 0.95 }));
  }

  // Elapsed sincronizado (online) e avanço por frame.
  update(dt) {
    if (this.done) return;
    this.elapsedMs += dt * 1000;
    const phase = zuTrainPhase(this.elapsedMs);
    if (phase !== this.phase) {
      this.phase = phase;
      this.onPhase?.(phase, this.#remainingToCombat());
    }
    // portas: abrem na janela 'portas', fecham ao fim (chegada)
    const want = doorWindowOpen(this.elapsedMs) ? 1 : 0;
    this.doorOpenT += (want - this.doorOpenT) * Math.min(1, dt * 2.6);
    const slide = this.doorOpenT * (DOOR_W / 2 + 0.06);
    this.doorL.position.x = DOOR_X0 + DOOR_W / 4 - slide;
    this.doorR.position.x = DOOR_X0 + 3 * DOOR_W / 4 + slide;
    // pose pura compartilhada (idêntica à autoridade) + balanço de via
    const pose = trainPoseAt(this.elapsedMs, this.route);
    const dx = this.route.x1 - this.route.x0, dz = this.route.z1 - this.route.z0;
    const len = Math.hypot(dx, dz) || 1;
    this.group.position.set(pose.x, 0, pose.z);
    this.group.rotation.y = -Math.atan2(dz, dx); // +X local alinha com a rota
    this.sway = Math.sin(this.elapsedMs / 1000 * 2.2) * 0.022 + Math.sin(this.elapsedMs / 1000 * 5.1) * 0.008;
    // chegada: pequeno assentamento e handover da câmera
    if (this.elapsedMs >= ZU_TRAIN.ARRIVAL_MS + 900) this.end('arrived');
  }

  cameraPose(camera) {
    // câmera na porta (lado +Z local = lateral SSOT do salto): vê a rota e o Ring
    const pose = trainPoseAt(this.elapsedMs, this.route);
    const dx = this.route.x1 - this.route.x0, dz = this.route.z1 - this.route.z0;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const rx = -uz, rz = ux; // lateral da porta (MESMA fórmula da SSOT)
    const localX = this.phase === 'portas' ? DOOR_X0 + DOOR_W / 2 : -2.6; // na janela: junto à porta
    const eye = new THREE.Vector3(
      pose.x + ux * localX + rx * 0.95,
      FLOOR_Y + EYE_Y + (this.sway ?? 0),
      pose.z + uz * localX + rz * 0.95,
    );
    camera.position.copy(eye);
    // olhar: para fora pela porta — rumo ao centro do Ring (spawn/desembarque)
    const look = new THREE.Vector3(-pose.x * 0.5, FLOOR_Y - 1.2, -pose.z * 0.5);
    look.x += rx * 6; look.z += rz * 6;
    camera.lookAt(look);
    camera.rotation.z += (this.sway ?? 0) * 0.6;
  }

  // Salto de porta (entrada oficial): disponível só na janela das portas.
  tryJump() {
    if (this.done || !doorWindowOpen(this.elapsedMs)) return null;
    return trainDoorJumpPose(this.elapsedMs, this.route);
  }
  elapsedS() { return this.elapsedMs / 1000; }
  remainingToCombatS() { return this.#remainingToCombat(); }
  #remainingToCombat() {
    return Math.max(0, (ZU_TRAIN.ARRIVAL_MS + ZU_TRAIN.GRACE_S * 1000 - this.elapsedMs) / 1000);
  }

  end(reason = 'done') {
    if (this.done) return;
    this.done = true;
    this.onDone?.(reason);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}
