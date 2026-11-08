// F49 — TERRENO POR BIOMA (textura própria por mundo — fim da terra seca única)
// + CABELO/CAPA com física de mola (rabo das operatrizes + capas por variant,
// mesma família das tiras do Talon). Validação headless: registros congelados,
// integração buildTerrain, determinística das molas, orçamento de polígonos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- stub de Canvas2D: texturas procedurais desenham em <canvas>; em node as
// chamadas viram no-ops (as texturas nunca são rasterizadas sem GPU) ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
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

const { createOperative, animateOperative } = await import('../src/game3d/entities3d.js');
const { GROUND_BIOMES, groundBiomeParams, groundMaterial, BIOME_SURFACE_PROFILES, biomeSurfaceProfile, asphaltMaterial } = await import('../src/game3d/textures3d.js');
const { buildTerrain } = await import('../src/game3d/terrain3d.js');

const trisOf = (g) => {
  let n = 0;
  g.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return n;
};
const WORLDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];

// ---------- F49 · terreno por bioma ----------
test('GROUND_BIOMES: 5 mundos congelados com física de solo própria', () => {
  assert.equal(Object.keys(GROUND_BIOMES).length, 5, '5 biomas (1 por mundo)');
  for (const id of WORLDS) {
    const p = GROUND_BIOMES[id];
    assert.ok(Object.isFrozen(p), `${id} congelado`);
    for (const k of ['rough', 'strength', 'label']) assert.ok(k in p, `${id}.${k} presente`);
    assert.ok(p.rough >= .6 && p.rough <= 1, `${id}: roughness plausível (${p.rough})`);
    assert.ok(p.strength >= .8 && p.strength <= 2, `${id}: relevo plausível (${p.strength})`);
  }
  assert.equal(Object.isFrozen(GROUND_BIOMES), true, 'registro congelado');
  // assinaturas físicas: neve compacta desliza; areia cede; basalto é áspero
  assert.ok(GROUND_BIOMES.Barburhen.rough < GROUND_BIOMES.CIGKV.rough, 'neve menos rugosa que savana');
  assert.ok(GROUND_BIOMES.Arukheea.rough > GROUND_BIOMES.Barburhen.rough, 'areia mais fosca que neve');
  assert.ok(GROUND_BIOMES.Ckesalth.strength > GROUND_BIOMES.Arukheea.strength, 'basalto com relevo mais forte que areia');
});

test('groundBiomeParams: mundo desconhecido cai na savana sem explodir', () => {
  assert.equal(groundBiomeParams('Mundo-Futuro-99'), GROUND_BIOMES.CIGKV, 'fallback = CIGKV');
  assert.equal(groundBiomeParams(), GROUND_BIOMES.CIGKV, 'sem argumento também');
  for (const id of WORLDS) assert.equal(groundBiomeParams(id), GROUND_BIOMES[id], `${id} resolve pelo mapa`);
});

test('groundMaterial por bioma: roughness/relevo do registro + par PBR (map+normal)', () => {
  for (const id of WORLDS) {
    const m = groundMaterial(34, null, id);
    const p = GROUND_BIOMES[id];
    assert.equal(m.roughness, p.rough, `${id}: roughness vem do registro`);
    assert.ok(m.map, `${id}: color map presente`);
    assert.ok(m.normalMap, `${id}: normal map presente`);
  }
  const snow = groundMaterial(2, null, 'Barburhen');
  const sand = groundMaterial(2, null, 'Arukheea');
  assert.notEqual(snow.roughness, sand.roughness, 'neve e areia não compartilham solo');
  const tinted = groundMaterial(2, '#886644', 'CIGKV');
  assert.ok(tinted.color, 'tint externo ainda aceito (IBL/legado)');
  assert.equal(groundMaterial(2, null, 'X-99').roughness, GROUND_BIOMES.CIGKV.rough, 'bioma desconhecido → savana');
});

test('BIOME_SURFACE_PROFILES: construções e asfalto mudam de resposta PBR por mundo', () => {
  assert.equal(Object.keys(BIOME_SURFACE_PROFILES).length, 5, 'um perfil de superfície por mundo');
  for (const id of WORLDS) {
    const p = biomeSurfaceProfile(id);
    assert.ok(p.concrete >= .7 && p.concrete <= 1, `${id}: concreto plausível`);
    assert.ok(p.metal >= .35 && p.metal <= .7, `${id}: metal plausível`);
    assert.ok(p.metalness >= .2 && p.metalness <= .7, `${id}: metalness plausível`);
    assert.ok(p.asphalt >= .5 && p.asphalt <= 1, `${id}: asfalto plausível`);
    assert.ok(p.env > 0, `${id}: ambiente PBR presente`);
    assert.equal(asphaltMaterial(4, id).roughness, p.asphalt, `${id}: asfalto usa o perfil`);
  }
  assert.notEqual(BIOME_SURFACE_PROFILES.Barburhen.asphalt, BIOME_SURFACE_PROFILES.Arukheea.asphalt, 'neve molhada e areia não compartilham brilho');
  assert.equal(biomeSurfaceProfile('futuro'), BIOME_SURFACE_PROFILES.CIGKV, 'fallback visual seguro');
});

test('buildTerrain: material da bioma do cenário + userData.biome p/ e2e', () => {
  for (const id of WORLDS) {
    const t = buildTerrain({ id, groundTint: '#ffffff' });
    assert.equal(t.userData.terrain, true, `${id}: flag terrain intacta`);
    assert.equal(t.userData.biome, id, `${id}: bioma exposta`);
    assert.equal(t.material.roughness, GROUND_BIOMES[id].rough, `${id}: solo da bioma`);
    assert.equal(t.material.vertexColors, true, `${id}: vertex colors preservados`);
    assert.ok(t.geometry.attributes.color, `${id}: atributo de cor presente`);
    assert.equal(t.receiveShadow, true, `${id}: recebe sombra`);
  }
});

// ---------- F49 · cabelo (rabo das operatrizes) ----------
test('rabo de cabelo: operatrizes FEMALE carregam 3 segmentos com fase semeada', () => {
  for (const v of ['OP_FEMALE_SNIPER', 'OP_MIL_FEMALE_NOTA', 'OP_GNG_FEMALE_TESOURA']) {
    const { parts } = createOperative({ vest: '#b3542e', variant: v });
    assert.ok(Array.isArray(parts.hairTail), `${v}: hairTail presente`);
    assert.equal(parts.hairTail.length, 3, `${v}: 3 segmentos`);
    let parent = parts.hairTail[0].parent;                       // cadeia ancorada na cabeça
    for (let i = 0; i < parts.hairTail.length; i++) {
      const seg = parts.hairTail[i];
      assert.equal(typeof seg.userData.hairPhase, 'number', `${v}.seg${i}: fase semeada`);
      assert.ok(Number.isFinite(seg.userData.hairPhase), `${v}.seg${i}: fase finita`);
      if (i > 0) assert.equal(seg.parent, parts.hairTail[i - 1], `${v}.seg${i}: filho do anterior`);
      else assert.equal(seg.parent.type, 'Group', `${v}.seg0: ancorado em grupo da cabeça`);
    }
    assert.ok(parent, `${v}: cadeia montada`);
  }
});

test('rabo de cabelo: homens e Talon NÃO ganham rabo (identidade preservada)', () => {
  for (const v of ['OP_MALE_VANGUARD', 'OP_MIL_MALE_ECO', 'bot-aleatorio-73']) {
    const { parts } = createOperative({ vest: '#3a3f47', variant: v });
    assert.equal(parts.hairTail ?? null, null, `${v}: sem rabo`);
  }
  const talon = createOperative({ vest: '#22262f', variant: 'OP_MALE_TALON' }).parts;
  assert.equal(talon.hairTail ?? null, null, 'Talon: sem rabo');
  assert.ok(Array.isArray(talon.straps) && talon.straps.length === 2, 'Talon: 2 tiras intactas (regressão F26)');
});

// ---------- F49 · capa (roll determinístico por variant) ----------
test('capa: 3 painéis em cadeia com fase semeada; roll estável por variant', () => {
  const soro = createOperative({ vest: '#b3542e', variant: 'OP_MIL_FEMALE_SORO' }).parts;
  assert.ok(Array.isArray(soro.cape) && soro.cape.length === 3, 'SORO: capa presente (roll travado por teste)');
  for (let i = 0; i < 3; i++) {
    const seg = soro.cape[i];
    assert.equal(typeof seg.userData.capePhase, 'number', `cape.seg${i}: fase semeada`);
    if (i > 0) assert.equal(seg.parent, soro.cape[i - 1], `cape.seg${i}: filho do anterior`);
  }
  const again = createOperative({ vest: '#b3542e', variant: 'OP_MIL_FEMALE_SORO' }).parts;
  assert.equal(Array.isArray(again.cape), true, 'mesma variant → mesma capa (determinismo)');
  const noCape = createOperative({ vest: '#3a3f47', variant: 'OP_MALE_VANGUARD' }).parts;
  assert.equal(noCape.cape ?? null, null, 'variant sem roll não ganha capa');
  // no roster inteiro o roll 1-em-5 dá capa pra alguém (variedade FF à distância)
  const roster = ['OP_MIL_FEMALE_SORO', 'OP_MIL_FEMALE_SIRENE', 'OP_GNG_MALE_RASH', 'OP_FEMALE_HEAVY_AFRICAN', 'OP_MIL_MALE_GRAU'];
  assert.ok(roster.some((v) => createOperative({ vest: '#b3542e', variant: v }).parts.cape), 'pelo menos 1 operante com capa');
});

// ---------- F49 · física de mola do cabelo/capa ----------
test('mola do cabelo: determinística, cresce com speedNorm e segue o pitch', () => {
  const mk = () => createOperative({ vest: '#b3542e', variant: 'OP_FEMALE_SNIPER' }).parts;
  const a = mk(), b = mk();
  animateOperative(a, { t: 2.4, speedNorm: .9, phase: 3.1, pitch: .3, air: .5 });
  animateOperative(b, { t: 2.4, speedNorm: .9, phase: 3.1, pitch: .3, air: .5 });
  for (let i = 0; i < 3; i++) {
    assert.equal(a.hairTail[i].rotation.x, b.hairTail[i].rotation.x, `seg${i} rot.x determinístico`);
    assert.equal(a.hairTail[i].rotation.z, b.hairTail[i].rotation.z, `seg${i} rot.z determinístico`);
  }
  const idle = mk(), run = mk();
  animateOperative(idle, { t: 5, speedNorm: 0, phase: 0 });
  animateOperative(run, { t: 5, speedNorm: 1, phase: 1.2 });
  // base de drapeado é IGUAL nos dois regimes — a DELTA vem da mola (passo+onda)
  const swingOf = (p, q) => Math.abs(p.hairTail[2].rotation.x - q.hairTail[2].rotation.x)
    + Math.abs(p.hairTail[2].rotation.z - q.hairTail[2].rotation.z);
  assert.ok(swingOf(run, idle) > .02, `corrida balança mais (Δ ponta ${swingOf(run, idle).toFixed(3)} > .02)`);
  const up = mk(), down = mk();
  animateOperative(up, { t: 1.7, speedNorm: .5, pitch: .8 });
  animateOperative(down, { t: 1.7, speedNorm: .5, pitch: -.8 });
  assert.notEqual(up.hairTail[0].rotation.x, down.hairTail[0].rotation.x, 'pitch do olhar acopla ao cabelo');
});

test('mola da capa: abre na corrida e no ar; determinística', () => {
  const mk = () => createOperative({ vest: '#b3542e', variant: 'OP_MIL_FEMALE_SORO' }).parts;
  const a = mk(), b = mk();
  animateOperative(a, { t: 3.3, speedNorm: .9, phase: 2.2, air: .4 });
  animateOperative(b, { t: 3.3, speedNorm: .9, phase: 2.2, air: .4 });
  for (let i = 0; i < 3; i++) assert.equal(a.cape[i].rotation.x, b.cape[i].rotation.x, `cape seg${i} determinístico`);
  const idle = mk(), run = mk(), air = mk();
  // t=.096 põe sin(4.6t+2.7)≈0 — compara o BILLOW puro (sem a onda) por regime
  const T = (Math.PI - 2.7) / 4.6;
  animateOperative(idle, { t: T, speedNorm: 0 });
  animateOperative(run, { t: T, speedNorm: 1 });
  animateOperative(air, { t: T, speedNorm: .3, air: 3 });
  const tip = (p) => Math.abs(p.cape[2].rotation.x);          // abertura = |rot.x| (negativo = abre p/ trás)
  assert.ok(tip(run) > tip(idle), `corrida abre a capa (${tip(run).toFixed(3)} > ${tip(idle).toFixed(3)})`);
  assert.ok(tip(air) > tip(run), `ar abre ainda mais (${tip(air).toFixed(3)} > ${tip(run).toFixed(3)})`);
});

test('morte/rastejo assentam cabelo e capa (não congelam no último passo)', () => {
  const dead = createOperative({ vest: '#b3542e', variant: 'OP_MIL_FEMALE_SORO' }).parts;
  animateOperative(dead, { t: 4, speedNorm: 1, dead: true, death: { angle: 1, power: .8, age: .5, seed: 7 } });
  assert.equal(dead.hairTail[0].rotation.x, -.14, 'cabelo morto assenta (x −.14)');
  assert.equal(dead.cape[1].rotation.z, 0, 'capa morta assenta (z 0)');
  const crawled = createOperative({ vest: '#b3542e', variant: 'OP_MIL_FEMALE_SORO' }).parts;
  animateOperative(crawled, { t: 4, speedNorm: .4, knocked: true });
  assert.equal(crawled.hairTail[0].rotation.x, -.12, 'cabelo arrasta no rastejo');
  assert.equal(crawled.cape[0].rotation.x, -.04, 'capa comprimida no rastejo');
});

// ---------- F49 · orçamento ----------
test('orçamento de polígonos sobrevive ao cabelo/capa (≤ 6500 tris por ator)', () => {
  for (const v of ['OP_MIL_FEMALE_SORO', 'OP_FEMALE_SNIPER', 'OP_MALE_TALON', 'onith']) {
    const { group } = createOperative({ vest: '#b3542e', variant: v });
    const tris = Math.round(trisOf(group));
    assert.ok(tris <= 6500, `${v}: ${tris} tris dentro do orçamento`);
    assert.ok(tris >= 2500, `${v}: ${tris} tris — detalhe anatômico presente`);
  }
});
