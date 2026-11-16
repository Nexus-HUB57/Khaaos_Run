import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_ASSET, heroAssetManifest, resetHeroAssetCache } from '../src/game3d/hero3d.js';

test('hero asset mantém pivôs canônicos e orçamento de produção', () => {
  assert.equal(HERO_ASSET.pivots.hips, 0.84);
  assert.equal(HERO_ASSET.pivots.neck, 1.68);
  assert.equal(HERO_ASSET.budget.sourceDccMaxTriangles, 120000);
  assert.equal(HERO_ASSET.budget.heroMeshMaxTriangles, 6500);
  assert.equal(HERO_ASSET.budget.equippedEntityMaxTriangles, 8000);
  assert.equal(HERO_ASSET.budget.proxyMaxTriangles, 900);
  assert.equal(HERO_ASSET.budget.silhouetteMaxTriangles, 200);
  assert.equal(HERO_ASSET.budget.maxDrawCalls, 12);
  assert.match(HERO_ASSET.url, /operative_hero_base\.fbx$/);
});

test('hero exige realismo humano, movimento natural e roupa de facção', () => {
  assert.equal(HERO_ASSET.realism.humanLikeness, 'maximum');
  assert.equal(HERO_ASSET.realism.antiCaricature, true);
  assert.deepEqual(HERO_ASSET.realism.identityInputs, ['ethnic_reference', 'sex', 'age_range', 'body_type']);
  assert.equal(HERO_ASSET.motion.footPlanting, true);
  assert.equal(HERO_ASSET.motion.centerOfMass, true);
  assert.ok(HERO_ASSET.motion.requiredLayers.includes('breathing'));
  assert.deepEqual(HERO_ASSET.factionWear.profiles, ['military', 'militia', 'gang', 'civilian-survivor']);
  assert.ok(HERO_ASSET.factionWear.constructionDetail.includes('fabric-weave'));
});

const THREE = await import('three');
const { validateHeroOperative, validateEquippedEntityBudget } = await import('../src/game3d/hero3d.js');

function makeHero({ triangles = 2, drawCalls = 1, height = 1.8 } = {}) {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.18, height, 0, -0.18, height, 0,
  ], 3));
  const indices = new Uint32Array(triangles * 3);
  for (let i = 0; i < triangles; i += 1) {
    indices[i * 3] = 0; indices[i * 3 + 1] = 1; indices[i * 3 + 2] = 2;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(3 * 4), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ], 4));
  geometry.computeBoundingBox();

  const hips = new THREE.Bone();
  hips.name = 'mixamorig:Hips';
  hips.position.y = 0.84;
  const spine = new THREE.Bone();
  spine.name = 'mixamorig:Spine';
  spine.position.y = 0.42;
  const neck = new THREE.Bone();
  neck.name = 'mixamorig:Neck';
  neck.position.y = 0.42;
  hips.add(spine);
  spine.add(neck);

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'HeroBody';
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, spine, neck]));
  root.updateMatrixWorld(true);

  const extraGeometry = new THREE.BufferGeometry();
  extraGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3));
  extraGeometry.setIndex([0, 1, 2]);
  for (let i = 1; i < drawCalls; i += 1) root.add(new THREE.Mesh(extraGeometry, new THREE.MeshStandardMaterial()));
  root.updateMatrixWorld(true);
  return { root, geometry, neck };
}

function hasCode(result, code) { return result.errors.some((error) => error.code === code); }

test('Hero FBX aceita rig válido dentro do contrato canônico', () => {
  const { root } = makeHero();
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, true, JSON.stringify(result.errors));
  assert.equal(result.metrics.triangleCount, 2);
  assert.equal(result.metrics.drawCallCount, 1);
  assert.ok(Math.abs(result.metrics.heightMeters - 1.8) < 1e-6);
  assert.equal(result.metrics.hipsPivotY, 0.84);
  assert.equal(result.metrics.neckPivotY, 1.68);
});

test('Hero FBX bloqueia geometrias acima de 6.500 triângulos', () => {
  const result = validateHeroOperative(makeHero({ triangles: 6501 }).root);
  assert.equal(result.accepted, false);
  assert.equal(result.metrics.triangleCount, 6501);
  assert.ok(hasCode(result, 'TRIANGLE_BUDGET_EXCEEDED'));
});

test('Hero FBX bloqueia mais de 12 draw calls', () => {
  const result = validateHeroOperative(makeHero({ drawCalls: 13 }).root);
  assert.equal(result.accepted, false);
  assert.equal(result.metrics.drawCallCount, 13);
  assert.ok(hasCode(result, 'DRAW_CALL_BUDGET_EXCEEDED'));
});

test('orçamento equipado valida o total visível da entidade e aceita o teto exato', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 8000; i += 1) positions.push(0, 0, 0, 1, 0, 0, 0, 1, 0);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  const atLimit = validateEquippedEntityBudget(root);
  assert.equal(atLimit.accepted, true, JSON.stringify(atLimit.errors));
  assert.equal(atLimit.metrics.triangleCount, 8000);

  const over = new THREE.BufferGeometry();
  const overPositions = [];
  for (let i = 0; i < 8001; i += 1) overPositions.push(0, 0, 0, 1, 0, 0, 0, 1, 0);
  over.setAttribute('position', new THREE.Float32BufferAttribute(overPositions, 3));
  root.clear();
  root.add(new THREE.Mesh(over, new THREE.MeshBasicMaterial()));
  const rejected = validateEquippedEntityBudget(root);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.metrics.triangleCount, 8001);
  assert.ok(rejected.errors.some((error) => error.code === 'EQUIPPED_ENTITY_TRIANGLE_BUDGET_EXCEEDED'));
});

test('Hero FBX conta geometria oculta para impedir bypass do teto', () => {
  const { root } = makeHero();
  const hiddenBody = makeHero({ triangles: 6500 }).root.children.find((node) => node.isSkinnedMesh);
  hiddenBody.visible = false;
  root.add(hiddenBody);
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'TRIANGLE_BUDGET_EXCEEDED'));
});

test('Hero FBX exige SkinnedMesh com skin weights e skeleton', () => {
  const { root } = makeHero();
  const body = root.children.find((node) => node.isSkinnedMesh);
  root.remove(body);
  root.add(new THREE.Mesh(body.geometry, body.material));
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'NO_SKINNED_MESH'));
  assert.ok(hasCode(result, 'MISSING_HIPS_PIVOT'));
});

test('Hero FBX rejeita pesos de skin não normalizados', () => {
  const { root, geometry } = makeHero();
  geometry.attributes.skinWeight.array[0] = 0.5;
  geometry.attributes.skinWeight.needsUpdate = true;
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'INVALID_SKIN_WEIGHTS'));
});

test('Hero FBX rejeita skin index que aponta para bone inexistente', () => {
  const { root, geometry } = makeHero();
  geometry.attributes.skinIndex.array[0] = 99;
  geometry.attributes.skinIndex.needsUpdate = true;
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'INVALID_SKIN_WEIGHTS'));
});

test('Hero FBX rejeita mais de quatro influências de skin', () => {
  const { root, geometry } = makeHero();
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(3 * 5), 5));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0,
  ], 5));
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'INVALID_SKIN_BINDING'));
});

test('Hero FBX lê corretamente atributos interleaved', () => {
  const { root, geometry } = makeHero();
  const interleaved = new THREE.InterleavedBuffer(new Float32Array([
    0, 0, 0, 1,
    0.18, 1.8, 0, 1,
    -0.18, 1.8, 0, 1,
  ]), 4);
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  geometry.computeBoundingBox();
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, true, JSON.stringify(result.errors));
});

test('Hero FBX conta material groups somente quando cobrem todo o draw range', () => {
  const { root, geometry } = makeHero({ triangles: 2 });
  const body = root.children.find((node) => node.isSkinnedMesh);
  geometry.clearGroups();
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  body.material = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  const accepted = validateHeroOperative(root);
  assert.equal(accepted.accepted, true, JSON.stringify(accepted.errors));
  assert.equal(accepted.metrics.triangleCount, 2);
  assert.equal(accepted.metrics.drawCallCount, 2);

  geometry.clearGroups();
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(4, 2, 1);
  const rejected = validateHeroOperative(root);
  assert.equal(rejected.accepted, false);
  assert.ok(hasCode(rejected, 'INVALID_MATERIAL_GROUPS'));
});

test('Hero FBX rejeita pivô canônico fora da tolerância', () => {
  const { root, neck } = makeHero();
  neck.position.y += 0.2;
  root.updateMatrixWorld(true);
  const result = validateHeroOperative(root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'NECK_PIVOT_OUT_OF_TOLERANCE'));
});

test('Hero FBX rejeita altura corporal fora de 1,8 m ± 0,1 m', () => {
  const result = validateHeroOperative(makeHero({ height: 2.1 }).root);
  assert.equal(result.accepted, false);
  assert.ok(hasCode(result, 'HEIGHT_OUT_OF_TOLERANCE'));
});

test('manifest é cópia serializável e não permite mutar o contrato', () => {
  const manifest = heroAssetManifest();
  assert.deepEqual(manifest.pivots, { hips: 0.84, neck: 1.68 });
  manifest.pivots.hips = 99;
  assert.equal(HERO_ASSET.pivots.hips, 0.84);
  resetHeroAssetCache();
});
