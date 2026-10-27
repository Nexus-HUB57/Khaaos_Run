// Fase 9 — realismo anatômico dos operativos (estilo FreeFire).
// Valida a reconstrução procedural dos personagens em node puro (sem WebGL):
// anatomia curva (fim das caixas cúbicas), API de parts preservada, orçamento de
// polígonos p/ 24 atores, compartilhamento de geometria, determinismo, continui-
// dade da animação (anti-teleporte), movimento secundário (peso/micro-olhar/roll),
// braços sob regime de arma, sombra de contato com fade e memoização de pele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D: textures3d desenha em <canvas>; em node só precisamos
// das chamadas como no-ops (as texturas nunca são rasterizadas sem GPU) ----
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
const { skinMaterial, faceTexture } = await import('../src/game3d/textures3d.js');

// ---------- helpers ----------
function meshStats(group) {
  let tris = 0;
  const kinds = {};
  const boxes = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    tris += n;
    kinds[g.type] = (kinds[g.type] || 0) + 1;
    if (g.type === 'BoxGeometry') boxes.push(o);
  });
  return { tris, kinds, boxes };
}
// serializa a estrutura (tipos + nº de filhos, recursivo) p/ comparação determinística
function structure(node) {
  return node.children.map((c) => ({
    t: c.isMesh ? c.geometry.type : 'group',
    n: c.children.length,
    ch: structure(c),
  }));
}
const JOINTS = (p) => [p.legL.hip, p.legR.hip, p.legL.knee, p.legR.knee, p.armL.shoulder, p.armR.shoulder, p.armL.elbow, p.armR.elbow, p.head, p.torso];

test('anatomia curva: crânio/membros não são mais caixas — esferas, cápsulas e rosto em calota', () => {
  const { group, parts } = createOperative({ variant: 'onith' });
  const { kinds } = meshStats(group);
  assert.ok(kinds.SphereGeometry >= 15, `esferas anatômicas suficientes (${kinds.SphereGeometry})`);
  assert.equal(kinds.CapsuleGeometry, 8, '8 segmentos de membro em cápsula (2 braços + 2 pernas × 2)');
  assert.ok(kinds.CapsuleGeometry >= 8);
  // único plano permitido = sombra de contato; a máscara facial plana morreu
  assert.equal(kinds.PlaneGeometry, 1, 'só a sombra é plano');
  // calota facial é esfera PARCIAL (phiLength < 2π) — acompanha o volume do crânio
  let facePatch = null;
  parts.head.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.phiLength < Math.PI) facePatch = o;
  });
  assert.ok(facePatch, 'rosto é calota esférica parcial');
  assert.ok(facePatch.geometry.parameters.phiLength <= 2.2, 'calota cobre só a frente');
  // centro da calota está no hemisfério frontal (-z)
  facePatch.geometry.computeBoundingBox();
  const bb = facePatch.geometry.boundingBox;
  assert.ok((bb.min.z + bb.max.z) / 2 < 0, 'rosto voltado para -z (frente do modelo)');
});

test('API preservada: parts e pivôs idênticos à Fase 7 (armas/câmera não quebram)', () => {
  const { group, parts } = createOperative({ variant: 'vrekai' });
  for (const k of ['head', 'torso', 'legL', 'legR', 'armL', 'armR']) assert.ok(parts[k], `parts.${k} existe`);
  for (const k of ['hip', 'knee']) assert.ok(parts.legL[k] && parts.legR[k], `leg.*.${k} existe`);
  for (const k of ['shoulder', 'elbow']) assert.ok(parts.armL[k] && parts.armR[k], `arm.*.${k} existe`);
  assert.equal(parts.legL.hip.position.y, .84, 'pivô do quadril inalterado');
  assert.equal(parts.torso.position.y, 1.22, 'base do tronco inalterada');
  assert.equal(parts.head.position.y, .46, 'pivô da cabeça inalterado (mundo 1.68)');
  assert.ok(parts.shadow, 'sombra de contato exposta em parts');
});

test('orçamento de polígonos: personagem inteiro ≤ 6500 tris (24 atores fluidos)', () => {
  for (const variant of ['onith', 'vrekai', 'bot-aleatorio-73']) {
    const { group } = createOperative({ variant });
    const { tris } = meshStats(group);
    assert.ok(tris <= 6500, `${variant}: ${tris} tris dentro do orçamento`);
    assert.ok(tris >= 2500, `${variant}: ${tris} tris — detalhe anatômico presente`);
  }
});

test('geometrias compartilhadas entre instâncias; materiais de equipe NÃO vazam', () => {
  const a = createOperative({ skin: SKIN_TONES[0], vest: '#3a3f47', variant: 'x1' });
  const b = createOperative({ skin: SKIN_TONES[1], vest: '#8a1f2b', variant: 'x2' });
  // mesma cápsula de coxa reutilizada (memória de malha)
  const capA = [], capB = [];
  a.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'CapsuleGeometry') capA.push(o.geometry); });
  b.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'CapsuleGeometry') capB.push(o.geometry); });
  assert.ok(capA.some((g) => capB.includes(g)), 'cápsulas compartilhadas via cache');
  // material do colete é por instância (recolor não vaza p/ outros personagens)
  const vestA = a.parts.torso.children.find((o) => o.isMesh && o.material.color.getHexString() === '3a3f47');
  const vestB = b.parts.torso.children.find((o) => o.isMesh && o.material.color.getHexString() === '8a1f2b');
  assert.ok(vestA && vestB, 'cada colete com sua cor');
  assert.notEqual(vestA.material, vestB.material, 'materiais de colete distintos por instância');
});

test('determinismo: mesmo variant → árvore de cena idêntica (acessórios estáveis)', () => {
  const a = createOperative({ variant: 'onith', helmet: true });
  const b = createOperative({ variant: 'onith', helmet: true });
  assert.deepEqual(structure(a.group), structure(b.group), 'mesma estrutura de malha');
});

test('continuidade: animação a 30 Hz sem saltos de junta (fim do movimento robótico-teleporte)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  const DT = 1 / 30;
  for (let i = 0; i < 60; i++) animateOperative(parts, { t: i * DT, speedNorm: 1, pitch: .05 }); // warm-up: sai da pose de repouso
  let prev = JOINTS(parts).map((j) => ({ x: j.rotation.x, y: j.rotation.y, z: j.rotation.z }));
  for (let i = 60; i <= 150; i++) { // 3 s correndo já em regime
    animateOperative(parts, { t: i * DT, speedNorm: 1, pitch: .05 });
    const cur = JOINTS(parts).map((j) => ({ x: j.rotation.x, y: j.rotation.y, z: j.rotation.z }));
    cur.forEach((c, k) => {
      for (const ax of ['x', 'y', 'z']) {
        const d = Math.abs(c[ax] - prev[k][ax]);
        assert.ok(Number.isFinite(d), 'rotação finita');
        // derivada legítima máx. (joelho: .8·9/30 ≈ .24/frame); teleporte seria ≫ .28
        assert.ok(d < .28, `Δ${ax} por frame ${d.toFixed(3)} < .28 (junta ${k})`);
      }
    });
    prev = cur;
  }
});

test('movimento secundário: roll de passada, transferência de peso e micro-olhar', () => {
  const { parts } = createOperative({ variant: 'onith' });
  // corrida: tronco rola com a passada; quadril gira; cabeça contra-rota
  const rollZ = new Set(), hipZ = new Set(), headY = new Set();
  for (let i = 0; i < 90; i++) {
    animateOperative(parts, { t: i / 30, speedNorm: 1 });
    rollZ.add(parts.torso.rotation.z.toFixed(3));
    hipZ.add(parts.legL.hip.rotation.z.toFixed(3));
    headY.add(parts.head.rotation.y.toFixed(3));
  }
  assert.ok(rollZ.size > 12, `roll de tronco varia na passada (${rollZ.size} valores)`);
  assert.ok(hipZ.size > 12, 'quadril tem rotação lateral de peso');
  assert.ok(headY.size > 8, 'cabeça contra-rota/estabiliza');
  // idle: transferência de peso lenta + respiração no peito + micro-olhar
  const px = new Set(), sx = new Set(), glance = new Set();
  for (let i = 0; i < 300; i++) { // 10 s parado
    animateOperative(parts, { t: i / 30, speedNorm: 0 });
    px.add(parts.torso.position.x.toFixed(4));
    sx.add(parts.torso.scale.x.toFixed(4));
    glance.add(parts.head.rotation.y.toFixed(4));
  }
  assert.ok(px.size > 20, `peso desloca no idle (${px.size} posições)`);
  assert.ok(sx.size > 10, 'peito respira (escala)');
  assert.ok(glance.size > 40, `micro-olhar varre no idle (${glance.size} ângulos)`);
});

test('braços sob regime de arma: oscilação micro na corrida (sem swing macro)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  const aim = -Math.PI / 2; // pitch 0
  let min = Infinity, max = -Infinity;
  for (let i = 0; i <= 63; i++) { // uma passada completa (2π/9 ≈ .7 s)
    animateOperative(parts, { t: i / 30, speedNorm: 1, pitch: 0 });
    const x = parts.armR.shoulder.rotation.x;
    min = Math.min(min, x); max = Math.max(max, x);
  }
  assert.ok(max - min < .16, `braço oscila ${(max - min).toFixed(3)} rad por passada (< .16 — segura a arma)`);
  assert.ok(Math.abs(max - aim) < .32 && Math.abs(min - aim) < .32, 'braço nunca abandona a pose de tiro');
});

test('sombra de contato: opaca no chão, esvanece com altitude e morre com o corpo', () => {
  const { parts } = createOperative({ variant: 'onith' });
  animateOperative(parts, { t: 0, speedNorm: 0, air: 0 });
  const ground = parts.shadow.material.opacity;
  assert.ok(ground > .6, `opaca no chão (${ground})`);
  animateOperative(parts, { t: 0, speedNorm: 0, air: 3 });
  const mid = parts.shadow.material.opacity;
  assert.ok(mid < ground && mid > 0, `meia-altitude esvanece (${mid.toFixed(2)})`);
  animateOperative(parts, { t: 0, speedNorm: 0, air: 9 });
  assert.equal(parts.shadow.material.opacity, 0, 'some no paraquedas alto');
  animateOperative(parts, { t: 0, speedNorm: 0, dead: true });
  assert.equal(parts.shadow.material.opacity, 0, 'corpo morto não projeta blob');
  assert.ok(parts.shadow.material.transparent, 'material transparente');
});

test('poses especiais preservadas: crouch, rastejo DBNO e morte sem NaN', () => {
  const { parts } = createOperative({ variant: 'onith' });
  animateOperative(parts, { t: 1, speedNorm: .5, crouch: true });
  assert.equal(parts.torso.position.y, .88, 'tronco abaixa no crouch');
  assert.equal(parts.legL.knee.rotation.x, -1.45, 'joelho dobra');
  animateOperative(parts, { t: 2, speedNorm: 0, knocked: true });
  assert.equal(parts.torso.rotation.x, 1.22, 'rastejo deita o tronco');
  for (let i = 0; i < 40; i++) animateOperative(parts, { t: 3 + i / 30, speedNorm: 0, dead: true });
  assert.ok(Math.abs(parts.legL.hip.rotation.x) < .05, 'pernas decaem p/ repouso em ~40 frames');
  for (const j of JOINTS(parts)) {
    assert.ok(Number.isFinite(j.rotation.x + j.rotation.y + j.rotation.z), 'juntas finitas');
  }
});

test('pele realista: poros no roughnessMap + pseudo-SSS, memoizada por tom', () => {
  const s1 = skinMaterial(SKIN_TONES[0]);
  const s2 = skinMaterial(SKIN_TONES[0]);
  const s3 = skinMaterial(SKIN_TONES[3]);
  assert.equal(s1, s2, 'mesmo tom → mesma instância (sem regenerar canvas)');
  assert.notEqual(s1, s3, 'tons diferentes → materiais distintos');
  assert.ok(s1.roughnessMap, 'roughnessMap de poros presente');
  assert.ok(s1.emissiveIntensity > 0 && s1.emissiveIntensity < .08, `pseudo-SSS sutil (${s1.emissiveIntensity})`);
  assert.equal(s1.metalness, 0, 'pele não é metal');
  const f1 = faceTexture(SKIN_TONES[0], '#f59e0b', '#171717');
  const f2 = faceTexture(SKIN_TONES[0], '#f59e0b', '#171717');
  assert.equal(f1, f2, 'rosto memoizado por (skin, eyes, hair)');
});

test('variedade de operativos: 16 variantes constroem sem erro e com estruturas válidas', () => {
  for (let i = 0; i < 16; i++) {
    const { group, parts } = createOperative({ variant: `operativo-${i}`, helmet: i % 2 === 0 });
    const { tris } = meshStats(group);
    assert.ok(tris > 0 && tris <= 6500, `operativo ${i}: ${tris} tris`);
    animateOperative(parts, { t: i * .37, speedNorm: .7 });
    for (const j of JOINTS(parts)) {
      assert.ok(Number.isFinite(j.rotation.x), `operativo ${i} sem NaN`);
    }
  }
});

// ---------- Fase 16 (P1) — locomoção HUMANA (fim da robotização na passada) ----------
test('pivô do tornozelo existe e os pés rolam calcanhar→ponta em contrafase', () => {
  const { parts } = createOperative({ variant: 'onith' });
  assert.ok(parts.legL.foot && parts.legR.foot, 'parts.leg*.foot expostos (additivo)');
  // em uma passada completa os dois pés variam (rolagem) e ficam em contrafase
  const footL = [], footR = [];
  for (let i = 0; i <= 40; i++) {
    animateOperative(parts, { t: i / 30, speedNorm: 1 });
    footL.push(parts.legL.foot.rotation.x);
    footR.push(parts.legR.foot.rotation.x);
  }
  const range = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(range(footL) > .3, `pé esquerdo rola na passada (${range(footL).toFixed(2)})`);
  assert.ok(range(footR) > .3, `pé direito rola na passada (${range(footR).toFixed(2)})`);
  // contrafase: as trajetórias dos dois pés nunca coincidem (fases opostas)
  assert.notEqual(footL.map((v) => v.toFixed(3)).join(','), footR.map((v) => v.toFixed(3)).join(','), 'fases opostas entre os pés');
  // repouso: peso desloca nos pés (sem rigidez de estátua)
  const idleZ = new Set();
  for (let i = 0; i < 120; i++) {
    animateOperative(parts, { t: i / 30, speedNorm: 0 });
    idleZ.add(parts.legL.foot.rotation.z.toFixed(4));
  }
  assert.ok(idleZ.size > 10, `transferência de peso no pé no idle (${idleZ.size})`);
  // poses especiais também controlam os pés (sem congelar no último passo)
  animateOperative(parts, { t: 1, speedNorm: .5, crouch: true });
  assert.ok(Math.abs(parts.legL.foot.rotation.x - .2) < 1e-9, 'agachado apoia nos antepés');
  animateOperative(parts, { t: 2, speedNorm: 0, knocked: true });
  assert.ok(parts.legL.foot.rotation.x > .2, 'rastejo arrasta a ponta do pé');
});

test('cadência escala com a velocidade (andar ≠ sprint no relógio da passada)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  // conta zero-crossings de hip.x (passos) em 3 s para cada velocidade
  const steps = (speedNorm) => {
    let crossings = 0, prev = null;
    for (let i = 0; i <= 90; i++) {
      animateOperative(parts, { t: i / 30, speedNorm });
      const v = Math.sign(parts.legL.hip.rotation.x);
      if (prev !== null && v !== prev && v !== 0) crossings++;
      prev = v;
    }
    return crossings;
  };
  const walk = steps(.35);
  const sprint = steps(1);
  assert.ok(sprint > walk, `sprint cadencia mais que caminhada (${sprint} > ${walk})`);
});

test('inércia de sprint: tronco inclina para dentro proporcional à velocidade', () => {
  const { parts } = createOperative({ variant: 'onith' });
  // mesma fase de passada em duas velocidades — a inclinação média cresce
  const leanAt = (speedNorm) => {
    let sum = 0;
    for (let i = 0; i <= 45; i++) {
      animateOperative(parts, { t: i / 30, speedNorm });
      sum += parts.torso.rotation.x;
    }
    return sum / 46;
  };
  const slow = leanAt(.2);
  const fast = leanAt(1);
  assert.ok(fast > slow + .05, `lean sprint (${fast.toFixed(3)}) > andando (${slow.toFixed(3)})`);
});

test('pelve gira contra o tronco (transferência de peso real, não torso de placa)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  const pelvisY = new Set(), footFin = [];
  for (let i = 0; i < 90; i++) {
    animateOperative(parts, { t: i / 30, speedNorm: 1 });
    pelvisY.add(parts.legL.hip.rotation.y.toFixed(3));
    footFin.push(Number.isFinite(parts.legL.foot.rotation.x + parts.legR.foot.rotation.x));
  }
  assert.ok(pelvisY.size > 12, `pelve oscila no eixo Y (${pelvisY.size})`);
  assert.ok(footFin.every(Boolean), 'pés sempre finitos');
  // e a rotação da pelve é ANTI-correlata ao sway do tronco (mesma frequência, sinais opostos)
  animateOperative(parts, { t: .04, speedNorm: 1 });
  const pelv = parts.legL.hip.rotation.y;
  const sway = parts.torso.rotation.y;
  assert.ok(Math.sign(pelv) === -Math.sign(sway) || Math.abs(pelv) < .005 || Math.abs(sway) < .005,
    `pelve (${pelv.toFixed(3)}) contra o tronco (${sway.toFixed(3)})`);
});
