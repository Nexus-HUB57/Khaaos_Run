// Task 61 — movimento DIRECIONAL no mobile (regressão do bug "só anda
// frente/trás"). O sim sempre suportou strafe (dx relativo ao yaw); o gap era
// a ausência de look/aim touch (yaw congelado) — estes testes travam a
// gramática de movimento que o joystick touch entrega ao sim:
//   1. dx puro desliza lateralmente (strafe) sem avançar;
//   2. dy puro avança NA DIREÇÃO DO OLHAR (yaw rotacionado pelo lookPad);
//   3. diagonal compõe frente + strafe;
//   4. a rotação de yaw pelo look muda o eixo mundo do avanço (câmera-relativo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorldLayout, stepActorMovement } from '../src/game3d/sim3d.js';

const world = getWorldLayout('mobile-directional-touch');
const baseActor = () => ({
  x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, speed: 5.2, weapon: 'g19',
  stamina: 100, onGround: true, moving: false, sprinting: false, ads: false,
  crouching: false, sliding: false, slideT: 0, dropPhase: null,
});

test('task61: joystick dx puro = strafe lateral (não anula o eixo X)', () => {
  const a = baseActor();
  stepActorMovement(a, { dx: 1, dy: 0, yaw: 0 }, 0.2, world);
  assert.ok(a.x > 0.8, `strafe direita esperado Δx>0.8, veio ${a.x}`);
  assert.ok(Math.abs(a.z) < 1e-6, `strafe não pode avançar em Z, veio Δz=${a.z}`);

  const b = baseActor();
  stepActorMovement(b, { dx: -1, dy: 0, yaw: 0 }, 0.2, world);
  assert.ok(b.x < -0.8, `strafe esquerda esperado Δx<-0.8, veio ${b.x}`);
});

test('task61: dy puro com yaw do lookPad avança NA DIREÇÃO DO OLHAR', () => {
  // look girou a câmera para yaw=+π/2 (olhando −X mundo); joystick "cima" (dy=-1)
  const a = baseActor();
  a.yaw = Math.PI / 2;
  stepActorMovement(a, { dx: 0, dy: -1, yaw: Math.PI / 2 }, 0.2, world);
  assert.ok(a.x < -0.8, `avanço deve seguir o olhar (−X mundo), veio Δx=${a.x}`);
  assert.ok(Math.abs(a.z) < 1e-6, `avanço puro não desliza em Z, veio Δz=${a.z}`);
});

test('task61: diagonal do joystick compõe frente + strafe relativos ao olhar', () => {
  const a = baseActor();
  stepActorMovement(a, { dx: 0.7071, dy: -0.7071, yaw: 0 }, 0.2, world);
  // normalização do sim: vetor unitário → frente(-Z) + direita(+X) equilibrados
  assert.ok(a.x > 0.7 && a.z < -0.7, `diagonal esperada (x>0.7, z<-0.7), veio (${a.x}, ${a.z})`);
});

test('task61: mesma entrada de joystick, yaws diferentes = eixos mundo diferentes', () => {
  // O bug do mobile: sem look, o yaw fica congelado e o jogador não "dirige".
  // Aqui provamos que a rotação do yaw REDIRECIONA o avanço (movimento
  // câmera-relativo — contrato do lookPad).
  const p = (yaw) => {
    const a = baseActor();
    a.yaw = yaw;
    stepActorMovement(a, { dx: 0, dy: -1, yaw }, 0.2, world);
    return { x: +a.x.toFixed(4), z: +a.z.toFixed(4) };
  };
  const north = p(0);           // frente = −Z mundo
  const west = p(Math.PI / 2);  // frente = −X mundo
  const south = p(Math.PI);     // frente = +Z mundo
  assert.ok(north.z < -0.8 && Math.abs(north.x) < 1e-6, `yaw 0 → −Z, veio ${JSON.stringify(north)}`);
  assert.ok(west.x < -0.8 && Math.abs(west.z) < 1e-6, `yaw π/2 → −X, veio ${JSON.stringify(west)}`);
  assert.ok(south.z > 0.8 && Math.abs(south.x) < 1e-6, `yaw π → +Z, veio ${JSON.stringify(south)}`);
});
