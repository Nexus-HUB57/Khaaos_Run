// Fase 10 — LOD de personagens à distância.
// Valida em node puro: decisão com histerese (sem vibrar na fronteira), tiers
// por qualidade, proxy low-poly com A MESMA API de parts/pivôs do modelo
// detalhado, equivalência de animação (animateOperative anima os dois níveis),
// orçamento de polígonos do proxy e transições de visibilidade do wrapper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D (createOperative → textures3d desenha em <canvas>) ----
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

const { lodDecision, lodThresholds, LOD_TIERS, buildOperativeProxy, createCharacterLOD } = await import('../src/game3d/lod3d.js');
const { createOperative, animateOperative } = await import('../src/game3d/entities3d.js');

const trisOf = (group) => {
  let n = 0;
  group.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return n;
};

test('decisão: full perto, proxy médio, hidden longe (limiares do tier high)', () => {
  const th = LOD_TIERS.high;
  assert.equal(lodDecision(5, 'full', th), 'full');
  assert.equal(lodDecision(th.full - .1, 'full', th), 'full');
  assert.equal(lodDecision(th.full + .1, 'full', th), 'proxy');
  assert.equal(lodDecision(th.cull - 1, 'proxy', th), 'silhouette', 'Fase 12: além do limiar sil o proxy cede p/ silhueta');
  assert.equal(lodDecision(th.cull + 1, 'full', th), 'hidden');
  assert.equal(lodDecision(400, undefined, th), 'hidden', 'primeira chamada sem nível atual');
});

test('histerese: oscilar na fronteira NÃO alterna o nível a cada frame', () => {
  const th = LOD_TIERS.high;
  // entra em proxy em full=30; só volta a full abaixo de 30*.85=25.5
  assert.equal(lodDecision(30.1, 'full', th), 'proxy');
  assert.equal(lodDecision(29.9, 'proxy', th), 'proxy', 'abaixo do limiar mas acima da histerese: permanece proxy');
  assert.equal(lodDecision(27, 'proxy', th), 'proxy');
  assert.equal(lodDecision(25.4, 'proxy', th), 'full', 'só retorna com ~15% de folga');
  // entra em hidden em cull=280; só sai abaixo de 238 — e volta como SILHUETA (≥ sil)
  assert.equal(lodDecision(281, 'proxy', th), 'hidden');
  assert.equal(lodDecision(250, 'hidden', th), 'hidden');
  assert.equal(lodDecision(237, 'hidden', th), 'silhouette', 'Fase 12: re-entrada além de sil = silhueta, não proxy');
});

test('tiers: mobile simplifica mais perto e culla antes (low < medium < high)', () => {
  assert.ok(LOD_TIERS.low.full < LOD_TIERS.medium.full && LOD_TIERS.medium.full < LOD_TIERS.high.full);
  assert.ok(LOD_TIERS.low.cull < LOD_TIERS.medium.cull && LOD_TIERS.medium.cull < LOD_TIERS.high.cull);
  assert.deepEqual(lodThresholds('low'), LOD_TIERS.low);
  assert.deepEqual(lodThresholds('inexistente'), LOD_TIERS.high, 'tier desconhecido cai no high');
});

test('proxy: mesma API de parts e MESMOS pivôs do modelo detalhado', () => {
  const proxy = buildOperativeProxy({ skin: '#d9a06b', vest: '#3a3f47' });
  for (const k of ['head', 'torso', 'legL', 'legR', 'armL', 'armR', 'shadow']) assert.ok(proxy.parts[k], `parts.${k} existe no proxy`);
  assert.equal(proxy.parts.legL.hip.position.y, .84, 'pivô do quadril idêntico');
  assert.equal(proxy.parts.torso.position.y, 1.22, 'base do tronco idêntica');
  assert.equal(proxy.parts.head.position.y, .46, 'pivô da cabeça idêntico (mundo 1.68)');
  for (const k of ['hip', 'knee']) assert.ok(proxy.parts.legL[k] && proxy.parts.legR[k]);
  for (const k of ['shoulder', 'elbow']) assert.ok(proxy.parts.armL[k] && proxy.parts.armR[k]);
});

test('orçamento do proxy: ≤ 900 tris e ≥ 8× mais leve que o detalhado', () => {
  const proxy = buildOperativeProxy({});
  assert.ok(proxy.tris <= 900, `proxy ${proxy.tris} tris ≤ 900`);
  assert.ok(proxy.tris >= 150, `proxy ${proxy.tris} tris — silhueta presente`);
  const full = trisOf(createOperative({ variant: 'onith' }).group);
  assert.ok(full / proxy.tris >= 4, `detalhado (${full}) ≥ 4× proxy (${proxy.tris})`);
});

test('wrapper: update() alterna visibilidade e activeParts() segue o nível', () => {
  const detail = createOperative({ variant: 'onith' });
  const proxy = buildOperativeProxy({ vest: '#3a3f47' });
  const lod = createCharacterLOD(detail, proxy, { tier: 'high' });
  assert.equal(lod.parts, detail.parts, 'parts expostas = detalhadas (armas continuam anexando)');
  lod.update(5);
  assert.equal(lod.level, 'full');
  assert.ok(detail.group.visible && !proxy.group.visible && lod.group.visible);
  assert.equal(lod.activeParts(), detail.parts);
  lod.update(60);
  assert.equal(lod.level, 'proxy');
  assert.ok(!detail.group.visible && proxy.group.visible, 'só o proxy desenha');
  assert.equal(lod.activeParts(), proxy.parts);
  lod.update(400);
  assert.equal(lod.level, 'hidden');
  assert.ok(!lod.group.visible, 'ator todo escondido (nametag some junto)');
  lod.update(5);
  assert.equal(lod.level, 'full');
  assert.ok(lod.group.visible && detail.group.visible);
});

test('equivalência de animação: proxy responde aos mesmos ângulos do detalhado', () => {
  const { parts: full } = createOperative({ variant: 'onith' });
  const { parts: low } = buildOperativeProxy({});
  animateOperative(full, { t: .83, speedNorm: 1, pitch: .1 });
  animateOperative(low, { t: .83, speedNorm: 1, pitch: .1 });
  // a animação só toca transformadas de junta — idênticas nos dois níveis
  assert.ok(Math.abs(full.legL.hip.rotation.x - low.legL.hip.rotation.x) < 1e-10, 'passada idêntica');
  assert.ok(Math.abs(full.armR.shoulder.rotation.x - low.armR.shoulder.rotation.x) < 1e-10, 'pose de arma idêntica');
  assert.ok(Math.abs(full.head.rotation.y - low.head.rotation.y) < 1e-10, 'micro-olhar idêntico');
  assert.ok(Math.abs(full.torso.position.y - low.torso.position.y) < 1e-10, 'bob de corrida idêntico');
  // transição full↔proxy não teleporta a junta (pop imperceptível no pivô)
  animateOperative(low, { t: .87, speedNorm: 1, pitch: .1 });
  animateOperative(full, { t: .87, speedNorm: 1, pitch: .1 });
  const d = Math.abs(full.legR.knee.rotation.x - low.legR.knee.rotation.x);
  assert.ok(d < 1e-10, `troca de nível não muda o ângulo da junta (${d})`);
});

test('proxy anima todas as poses especiais sem NaN (crouch/DBNO/morte/sombra)', () => {
  const { parts } = buildOperativeProxy({});
  animateOperative(parts, { t: 1, speedNorm: .5, crouch: true });
  assert.equal(parts.torso.position.y, .88, 'crouch abaixa o tronco no proxy também');
  animateOperative(parts, { t: 2, speedNorm: 0, knocked: true });
  assert.equal(parts.torso.rotation.x, 1.22, 'rastejo DBNO no proxy');
  animateOperative(parts, { t: 0, speedNorm: 0, air: 9 });
  assert.equal(parts.shadow.material.opacity, 0, 'sombra some com altitude');
  animateOperative(parts, { t: 3, speedNorm: 0, dead: true });
  for (const j of [parts.head, parts.torso, parts.legL.hip, parts.armR.elbow]) {
    assert.ok(Number.isFinite(j.rotation.x + j.rotation.y + j.rotation.z), 'juntas finitas');
  }
});

test('flinch no proxy: animateOperative com hit funciona nos dois níveis', () => {
  const { parts: full } = createOperative({ variant: 'onith' });
  const { parts: low } = buildOperativeProxy({});
  for (const p of [full, low]) {
    animateOperative(p, { t: 1, speedNorm: 0, hit: { angle: 0, power: 1, age: .05 } });
    assert.ok(p.torso.rotation.x > 0, 'impacto frontal empurra o tronco p/ trás');
  }
  assert.ok(Math.abs(full.torso.rotation.x - low.torso.rotation.x) < 1e-10, 'flinch idêntico nos dois níveis');
});

test('16 variantes: proxies com paletas distintas constroem dentro do orçamento', () => {
  const skins = ['#f2c9a0', '#d9a06b', '#b97a4b', '#8a5632'];
  for (let i = 0; i < 16; i++) {
    const proxy = buildOperativeProxy({ skin: skins[i % skins.length], vest: `#${(i * 0x111111 + 0x2a2f35).toString(16).padStart(6, '0')}` });
    assert.ok(proxy.tris <= 900, `proxy ${i}: ${proxy.tris} tris`);
    animateOperative(proxy.parts, { t: i * .31, speedNorm: .7 });
    assert.ok(Number.isFinite(proxy.parts.head.rotation.x), `proxy ${i} sem NaN`);
  }
});
