// F41 — Realismo FÍSICO: perfis de luz por cenário (reconfiguração de parâmetros)
// + personagens ergonômicos (estabilização de olhar, contra-rolagem de ombros,
// micro-balço ADS) + acessórios no padrão FF (jugular, dedos na luva, bota).
// Validação headless: perfis puros, integração buildScene, ergonomia
// determinística em node puro (sem WebGL), orçamento de polígonos intacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- stub de Canvas2D: texturas procedurais desenham em <canvas>; em node as
// chamadas viram no-ops (as texturas nunca são rasterizadas sem GPU) ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
  putImageData() {},
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const { createOperative, animateOperative, SKIN_TONES } = await import('../src/game3d/entities3d.js');
const { buildScene, LIGHTING_PROFILES, lightingProfile } = await import('../src/game3d/world3d.js');
const { groundTexture, asphaltTexture, skinMaterial } = await import('../src/game3d/textures3d.js');

const JOINTS = (p) => [p.legL.hip, p.legR.hip, p.legL.knee, p.legR.knee, p.armL.shoulder, p.armR.shoulder, p.armL.elbow, p.armR.elbow, p.head, p.torso];

// ---------- F41 · perfis de luz por cenário ----------
test('perfis de luz: cada cenário tem perfil próprio, congelado e completo', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const lp = lightingProfile(id);
    assert.equal(LIGHTING_PROFILES[id], lp, `${id} resolve pelo mapa`);
    for (const k of ['sunColor', 'sunIntensity', 'hemiSky', 'hemiGround', 'hemiIntensity', 'fillColor', 'fillIntensity', 'backColor', 'backIntensity', 'exposure', 'envIntensity', 'shadowBias', 'shadowNormalBias']) {
      assert.ok(k in lp, `${id}.${k} presente`);
    }
    assert.equal(Object.isFrozen(lp), true, `${id} congelado`);
    assert.ok(lp.sunIntensity >= 1.8 && lp.sunIntensity <= 2.8, `${id}: sol plausível (${lp.sunIntensity})`);
    assert.ok(lp.exposure >= 1.0 && lp.exposure <= 1.4, `${id}: exposição ACES plausível (${lp.exposure})`);
    assert.ok(lp.envIntensity >= .3 && lp.envIntensity <= .8, `${id}: IBL plausível (${lp.envIntensity})`);
    assert.ok(lp.shadowBias < 0 && lp.shadowBias > -0.001, `${id}: bias negativo contido (${lp.shadowBias})`);
    assert.ok(lp.shadowNormalBias >= .015 && lp.shadowNormalBias <= .03, `${id}: normalBias mata acne sem destacar (${lp.shadowNormalBias})`);
  }
});

test('perfis distintos entre mundos — fim da régua quente única', () => {
  const ids = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
  const exposures = new Set(ids.map((id) => lightingProfile(id).exposure));
  assert.ok(exposures.size >= 4, `exposições variam por mood (${[...exposures].join(', ')})`);
  const suns = new Set(ids.map((id) => lightingProfile(id).sunColor));
  assert.ok(suns.size >= 4, 'temperatura do sol varia por mundo');
  // noite gélida é a mais escura; deserto a mais exposta
  assert.ok(lightingProfile('Priadus').exposure < lightingProfile('CIGKV').exposure, 'Priadus (noite) < baseline');
  assert.ok(lightingProfile('Arukheea').exposure > lightingProfile('CIGKV').exposure, 'Arukheea (deserto) > baseline');
});

test('cenário desconhecido cai na baseline violeta sem explodir', () => {
  const lp = lightingProfile('Mundo-Futuro-99');
  assert.equal(lp, LIGHTING_PROFILES.default, 'fallback = default');
  assert.equal(lightingProfile(), LIGHTING_PROFILES.default, 'sem argumento também');
});

test('baseline histórica preservada: Barburhen mantém os valores F7 recalibrados', () => {
  const b = lightingProfile('Barburhen');
  assert.equal(b.sunIntensity, 2.05, 'sol Barburhen F7');
  assert.equal(b.hemiIntensity, 1.04, 'hemisfério F7');
  assert.equal(b.fillIntensity, 0.5, 'fill F7');
  assert.equal(b.backIntensity, 0.42, 'back F7');
  assert.equal(b.sunColor, '#f0c7a2', 'cor do sol F7');
  const d = lightingProfile('CIGKV');
  assert.equal(d.sunIntensity, 2.35, 'sol CIGKV histórico');
  assert.equal(d.hemiIntensity, 1.18, 'hemisfério CIGKV histórico');
});

test('buildScene consome o perfil: luzes, sombras e nightBase nascem do perfil', () => {
  const { scene, sun } = buildScene('f41-perfil', 'Arukheea', null, 'low');
  const lp = lightingProfile('Arukheea');
  assert.equal(scene.userData.lighting, lp, 'perfil exposto em userData');
  assert.equal(sun.color.getHexString(), new (sun.color.constructor)(lp.sunColor).getHexString(), 'sol do perfil');
  assert.equal(sun.intensity, lp.sunIntensity, 'intensidade do perfil');
  assert.equal(sun.shadow.normalBias, lp.shadowNormalBias, 'normalBias do perfil (anti-acne em cápsulas)');
  assert.equal(sun.shadow.bias, lp.shadowBias, 'bias do perfil');
  const base = scene.userData.nightBase;
  assert.equal(base.sunIntensity, lp.sunIntensity, 'anoitecer captura o perfil como base');
  assert.equal(base.hemiIntensity, lp.hemiIntensity, 'hemi do perfil no nightBase');
});

// ---------- F41 · ergonomia do movimento (determinística, sem estado) ----------
test('estabilização vestibular: o olhar contra-move o bounce da passada', () => {
  const { parts } = createOperative({ variant: 'f41-olhar' });
  // pico do bounce (|sin| = 1): cabeça CONTRA-move 30% do sinal
  animateOperative(parts, { t: Math.PI / (2 * 10.8), speedNorm: 1 });
  const peak = parts.head.position.y;
  const bouncePeak = 1 * (.045 + .02 * 1) * 1;
  assert.ok(Math.abs(peak - (.46 - bouncePeak * .3)) < 1e-9, `pico do bounce contra-movido (${peak.toFixed(4)})`);
  // repouso: sem bounce, pivô canônico
  animateOperative(parts, { t: 0, speedNorm: 0 });
  assert.equal(parts.head.position.y, .46, 'parado, a cabeça volta ao pivô 1.68');
  // criação NUNCA anima: API preservada
  const fresh = createOperative({ variant: 'f41-olhar' });
  assert.equal(fresh.parts.head.position.y, .46, 'pivô da cabeça inalterado na criação');
});

test('cabeça contra-move o sway lateral (linha de mira nivelada)', () => {
  const { parts } = createOperative({ variant: 'f41-sway' });
  for (let i = 0; i <= 20; i++) {
    animateOperative(parts, { t: i / 30, speedNorm: 1 });
    const sway = parts.torso.rotation.y;
    const headX = parts.head.position.x;
    if (Math.abs(sway) > .01) {
      assert.ok(Math.sign(headX) === -Math.sign(sway) || Math.abs(headX) < 1e-9,
        `cabeça (${headX.toFixed(4)}) contra o tronco (${sway.toFixed(4)})`);
    }
  }
});

test('ombros contra-rolam a passada — mãos niveladas sob regime de arma', () => {
  const { parts } = createOperative({ variant: 'f41-ombros' });
  animateOperative(parts, { t: .37, speedNorm: 1 });
  const roll = Math.sin(.37 * 10.8 + .4) * .05 * 1;
  assert.ok(Math.abs(parts.armR.shoulder.rotation.z - (-roll * .35)) < 1e-9, 'ombro R contra-rota 35% do roll');
  assert.ok(Math.abs(parts.armL.shoulder.rotation.z - (-roll * .35)) < 1e-9, 'ombro L contra-rota 35% do roll');
  // parado: roll = 0 → ombros em z = 0 (regime neutro preservado p/ o hit reativo)
  animateOperative(parts, { t: 0, speedNorm: 0 });
  assert.ok(Math.abs(parts.armR.shoulder.rotation.z) < 1e-9, 'parado, ombro R neutro');
  assert.ok(Math.abs(parts.armL.shoulder.rotation.z) < 1e-9, 'parado, ombro L neutro');
});

test('micro-balço ADS: respiração do atirador em 2 eixos, contida e dessintonizada', () => {
  const { parts } = createOperative({ variant: 'f41-ads' });
  const range = (withAds) => {
    let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i <= 90; i++) { // 3 s mirando
      animateOperative(parts, { t: i / 30, speedNorm: 0, ads: withAds });
      minZ = Math.min(minZ, parts.armR.shoulder.rotation.z); maxZ = Math.max(maxZ, parts.armR.shoulder.rotation.z);
      minX = Math.min(minX, parts.armR.shoulder.rotation.x); maxX = Math.max(maxX, parts.armR.shoulder.rotation.x);
    }
    return { z: maxZ - minZ, x: maxX - minX };
  };
  const ads = range(true);
  const hip = range(false);
  assert.ok(ads.z > 0, `balço em z presente (${ads.z.toFixed(4)})`);
  assert.ok(ads.z <= .025, `balço z contido (${ads.z.toFixed(4)} ≤ .025)`);
  // o eixo x herda a respiração F16 (±.022): o balço ADS é o EXCESSO sobre a base
  assert.ok(ads.x > hip.x, `balço x aumenta no ADS (${ads.x.toFixed(4)} > ${hip.x.toFixed(4)})`);
  assert.ok(ads.x - hip.x <= .017, `excesso de x contido (${(ads.x - hip.x).toFixed(4)} ≤ .017)`);
  // sem ADS: nenhum balço (z volta ao contra-roll puro = 0 em speedNorm 0)
  animateOperative(parts, { t: 1.23, speedNorm: 0, ads: false });
  assert.ok(Math.abs(parts.armR.shoulder.rotation.z) < 1e-9, 'hip fire não herda o balço');
});

test('determinismo: mesma entrada → pose idêntica (sem estado oculto de animação)', () => {
  const a = createOperative({ variant: 'f41-det' });
  const b = createOperative({ variant: 'f41-det' });
  for (const t of [0, .19, .73, 1.41]) {
    animateOperative(a.parts, { t, speedNorm: .8, pitch: .1, ads: true });
    animateOperative(b.parts, { t, speedNorm: .8, pitch: .1, ads: true });
    a.parts.head.position.x = b.parts.head.position.x; // posição animada, comparada igual
    a.parts.head.position.y = b.parts.head.position.y;
  }
  const sig = (parts) => JOINTS(parts).map((j) => `${j.rotation.x.toFixed(6)},${j.rotation.y.toFixed(6)},${j.rotation.z.toFixed(6)}`).join('|');
  assert.equal(sig(a.parts), sig(b.parts), 'poses byte-idênticas');
});

test('continuidade preservada: 30 Hz sem saltos de junta com as novas camadas', () => {
  const { parts } = createOperative({ variant: 'f41-cont' });
  const DT = 1 / 30;
  for (let i = 0; i < 60; i++) animateOperative(parts, { t: i * DT, speedNorm: 1, pitch: .05 });
  let prev = JOINTS(parts).map((j) => ({ x: j.rotation.x, y: j.rotation.y, z: j.rotation.z }));
  for (let i = 60; i <= 150; i++) {
    animateOperative(parts, { t: i * DT, speedNorm: 1, pitch: .05, ads: i > 100 });
    const cur = JOINTS(parts).map((j) => ({ x: j.rotation.x, y: j.rotation.y, z: j.rotation.z }));
    cur.forEach((c, k) => {
      for (const ax of ['x', 'y', 'z']) {
        const d = Math.abs(c[ax] - prev[k][ax]);
        assert.ok(d < .28, `Δ${ax} ${d.toFixed(3)} < .28 (junta ${k})`);
      }
    });
    prev = cur;
  }
});

test('poses canônicas intactas: crouch .88 exato, pivôs e morte sem NaN', () => {
  const { parts } = createOperative({ variant: 'f41-poses' });
  animateOperative(parts, { t: 1, speedNorm: .5, crouch: true });
  assert.equal(parts.torso.position.y, .88, 'tronco do crouch exato');
  assert.equal(parts.head.position.y, .46, 'crouch não herda bounce no olhar');
  animateOperative(parts, { t: 2, speedNorm: 0, knocked: true });
  assert.equal(parts.torso.rotation.x, 1.22, 'rastejo deita o tronco');
  for (let i = 0; i < 40; i++) animateOperative(parts, { t: 3 + i / 30, speedNorm: 0, dead: true });
  for (const j of JOINTS(parts)) {
    assert.ok(Number.isFinite(j.rotation.x + j.rotation.y + j.rotation.z), 'juntas finitas na morte');
  }
});

// ---------- F41 · acessórios no padrão FF ----------
function headGearBoxes(head) {
  const out = [];
  head.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry') out.push(o); });
  return out;
}
test('capacete ganha jugular (2 tiras sob o queixo) — lê como capacete real', () => {
  const { parts } = createOperative({ variant: 'f41-cap', helmet: true });
  const straps = headGearBoxes(parts.head).filter((o) => Math.abs(o.position.y + .045) < 1e-6 && Math.abs(o.position.x) === .118);
  assert.equal(straps.length, 2, 'duas tiras laterais simétricas');
  for (const s of straps) {
    assert.ok(s.userData.baseHeadGear, 'jugular é substituída pelo gear Nv2+ (contrato F28)');
  }
  // boina: sem jugular (o acessório é do capacete)
  const cap = createOperative({ variant: 'f41-cap', helmet: false });
  const capStraps = headGearBoxes(cap.parts.head).filter((o) => Math.abs(o.position.y + .045) < 1e-6);
  assert.equal(capStraps.length, 0, 'boina não recebe jugular');
});

test('luva 3ª pessoa: dedos enrolando o grip + polegar oposto nas duas mãos', () => {
  const { parts } = createOperative({ variant: 'f41-luva' });
  for (const [arm, side] of [[parts.armR, 1], [parts.armL, -1]]) {
    const fingers = arm.elbow.children.find((o) => o.isMesh && Math.abs(o.position.y + .335) < 1e-6);
    assert.ok(fingers, 'placa de dedos presente');
    assert.ok(Math.abs(fingers.rotation.x - .55) < 1e-9, 'dedos enrolam o grip (curl .55)');
    const thumb = arm.elbow.children.filter((o) => o.isMesh && o.geometry.type === 'SphereGeometry' && Math.abs(o.position.y + .298) < 1e-6);
    assert.equal(thumb.length, 1, 'polegar único');
    assert.ok(Math.sign(thumb[0].position.x) === -side, 'polegar no lado interno (oposto ao cotovelo)');
  }
});

test('bota: cadarço no peito do pé + colarinho do cano nas duas pernas', () => {
  const { parts } = createOperative({ variant: 'f41-bota' });
  for (const leg of [parts.legL, parts.legR]) {
    const laces = leg.foot.children.find((o) => o.isMesh && Math.abs(o.position.z + .078) < 1e-6);
    assert.ok(laces, 'cadarço no peito do pé');
    const collar = leg.foot.children.find((o) => o.isMesh && o.geometry.type === 'CylinderGeometry' && Math.abs(o.position.y + .045) < 1e-6);
    assert.ok(collar, 'colarinho do cano');
  }
});

test('orçamento de polígonos sobrevive aos acessórios (≤ 6500 tris por ator)', () => {
  for (const variant of ['f41-onith', 'f41-vrekai', 'f41-bot']) {
    const { group, parts } = createOperative({ variant, helmet: variant !== 'f41-vrekai' });
    let tris = 0, planes = 0, capsules = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      if (g.type === 'PlaneGeometry') planes++;
      if (g.type === 'CapsuleGeometry') capsules++;
    });
    assert.ok(tris <= 6500, `${variant}: ${Math.round(tris)} tris ≤ 6500`);
    assert.equal(planes, 1, 'só a sombra é plano');
    assert.equal(capsules, 8, '8 cápsulas de membro (jugular/dedos são caixa/esfera)');
    animateOperative(parts, { t: .5, speedNorm: 1 });
  }
});

// ---------- F41 · materiais e texturas ----------
test('anisotropia 8: chão e asfalto nítidos em ângulo raso (TPS a correr)', () => {
  assert.equal(groundTexture().anisotropy, 8, 'ground anisotropy 8');
  assert.equal(asphaltTexture().anisotropy, 8, 'asphalt anisotropy 8');
});

test('pele: memo por tom intacta + poros no roughness + metal zero (relevo é browser-only)', () => {
  const s1 = skinMaterial(SKIN_TONES[0]);
  const s2 = skinMaterial(SKIN_TONES[0]);
  assert.equal(s1, s2, 'mesmo tom → mesma instância');
  assert.ok(s1.roughnessMap, 'poros no roughnessMap');
  assert.equal(s1.metalness, 0, 'pele não é metal');
  assert.ok(s1.emissiveIntensity > 0 && s1.emissiveIntensity < .08, 'pseudo-SSS sutil');
});
