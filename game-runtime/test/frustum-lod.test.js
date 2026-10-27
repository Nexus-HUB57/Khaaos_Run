// Fase 13 — LOD por frustum: atores fora do cone de visão degradam mais rápido
// (distância efetiva penalizada) e congelam animação; atores próximos nunca são
// penalizados (a sombra precisa existir quando a câmera vira). Teste puro — sem
// renderer: frustumContains/createFrustumGate só usam vetores planos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { frustumContains, createFrustumGate, FRUSTUM_MARGIN, lodDecision, LOD_TIERS, createCharacterLOD } =
  await import('../src/game3d/lod3d.js');

const CAM = { fov: 75, aspect: 16 / 9 };          // half-FOV diagonal ≈ 51.2°
const ORIGIN = { x: 0, y: 1.6, z: 0 };
const FWD = { x: 0, y: 0, z: -1 };                // olhando -Z
const at = (x, y, z) => ({ x, y, z });

test('frustumContains: à frente dentro, atrás fora, bordas com margem de raio', () => {
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(0, 1.6, -30)), true, 'centro do quadro');
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(0, 1.6, 30)), false, 'atrás da câmera');
  // 30 m à frente: half-FOV horizontal = atan(tan(37.5°)*16/9) ≈ 55.7°; diagonal maior
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(40, 1.6, -30)), true, 'dentro do cone diagonal largo');
  // muito além do cone: tan⁻¹(80/30) ≈ 69.4° > diagonal 51.2° + raio/margem
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(80, 1.6, -30)), false, 'fora do cone mesmo com margem');
  assert.equal(frustumContains(ORIGIN, FWD, CAM, ORIGIN), true, 'ator na posição da câmera: dentro');
});

test('margem conservadora: ator na borda EXATA do FOV continua inside (meio visível não recorta)', () => {
  // distância 50 m, meio-FOV vertical 37.5° → borda em y ≈ 38.5 m
  const edge = 50 * Math.tan(37.5 * Math.PI / 180);
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(0, 1.6 + edge, -50), .9), true,
    'na borda vertical exata o raio do ator + margem mantêm inside');
  // half-FOV diagonal ≈ 57.4° → limite real ≈ 62° com raio+margem; 2.5×borda = 62.5°
  assert.equal(frustumContains(ORIGIN, FWD, CAM, at(0, 1.6 + edge * 2.5, -50), .9), false,
    'bem além do cone diagonal: fora');
  assert.ok(FRUSTUM_MARGIN > 0 && FRUSTUM_MARGIN < .12, 'margem de segurança pequena e positiva');
});

test('gate: penalidade só após framesOut frames consecutivos FORA', () => {
  const gate = createFrustumGate({ fovY: 75, aspect: 16 / 9, penalty: 1.4, framesOut: 3 });
  const far = at(0, 1.6, 120); // ATRÁS da câmera (fora do cone)
  // fora 1 frame e 2 frames: distância intacta (evita downgrade por flicker de borda)
  assert.equal(gate.update(120, ORIGIN, FWD, far).effectiveDist, 120);
  assert.equal(gate.update(120, ORIGIN, FWD, far).effectiveDist, 120);
  const third = gate.update(120, ORIGIN, FWD, far);
  assert.equal(third.inside, false);
  assert.equal(third.effectiveDist, 168, '3º frame fora: 120 × 1.4');
  // reentrada zera o contador
  assert.equal(gate.update(120, ORIGIN, FWD, at(0, 1.6, -120)).inside, true);
  assert.equal(gate.update(120, ORIGIN, FWD, far).effectiveDist, 120, 'contador zerado: sem penalidade');
});

test('gate: atores próximos (dist < minDist) NUNCA são penalizados — sombra sobrevive à virada', () => {
  const gate = createFrustumGate({ fovY: 75, aspect: 16 / 9, minDist: 30, penalty: 1.4, framesOut: 0 });
  const near = at(0, 1.6, 20); // 20 m ATRÁS da câmera, fora do frustum, mas < minDist
  for (let i = 0; i < 10; i++) {
    const r = gate.update(20, ORIGIN, FWD, near);
    assert.equal(r.effectiveDist, 20, `frame ${i}: próximo fora de tela mantém distância real`);
    assert.equal(r.inside, false);
  }
  const farGate = createFrustumGate({ fovY: 75, aspect: 16 / 9, minDist: 30, penalty: 1.4, framesOut: 0 });
  const r = farGate.update(120, ORIGIN, FWD, at(0, 1.6, 120));
  assert.equal(r.effectiveDist, 168, 'longe e fora: penalizado no 1º frame (framesOut 0)');
});

test('integração com a cadeia: penalidade do frustum derruba o nível do LOD sem tocar a histerese', () => {
  const th = LOD_TIERS.high; // full 30, sil 95, cull 280
  // 40 m dentro do frustum → proxy (dist real ≥ full); fora de tela há tempo → 56 m ainda proxy…
  assert.equal(lodDecision(40, 'full', th), 'proxy');
  // …mas 40 m penalizados ×1.4 = 56 continuam proxy; o ganho real está mais longe:
  // 70 m fora de tela ×1.4 = 98 ≥ sil 95 → silhouette (dentro de tela seria proxy)
  assert.equal(lodDecision(70, 'proxy', th), 'proxy', 'sem frustum: 70 m ficam no proxy');
  assert.equal(lodDecision(98, 'proxy', th), 'silhouette', 'com frustum: 70 m caem p/ silhueta');
  // e 210 m fora de tela ×1.4 = 294 ≥ cull 280 → hidden (não desenha nada)
  assert.equal(lodDecision(294, 'silhouette', th), 'hidden');
});

test('wrapper: LOD com gate congela nível abaixo quando fora de tela e volta com histerese', () => {
  const detail = { group: { visible: true }, parts: { head: 1 } };
  const proxy = { group: { visible: false }, parts: { head: 1 } };
  const lod = createCharacterLOD(detail, proxy, { tier: 'medium' });
  const gate = createFrustumGate({ fovY: 75, aspect: 16 / 9, minDist: LOD_TIERS.medium.full, penalty: 1.4, framesOut: 0 });
  const behind = at(0, 1.6, 100); // 100 m atrás: fora do frustum
  // 100 m × 1.4 = 140 < cull 220 → proxy (não hidden — fora de tela ainda existe no mundo)
  const fg = gate.update(100, ORIGIN, FWD, behind);
  assert.equal(lod.update(fg.effectiveDist), 'proxy');
  // volta a olhar: distância real 100 → proxy também (histerese estável, sem vibrar)
  const back = gate.update(100, ORIGIN, FWD, at(0, 1.6, -100));
  assert.equal(back.inside, true);
  assert.equal(lod.update(back.effectiveDist), 'proxy');
});
