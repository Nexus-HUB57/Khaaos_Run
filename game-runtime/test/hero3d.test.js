import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_ASSET, heroAssetManifest, resetHeroAssetCache } from '../src/game3d/hero3d.js';

test('hero asset mantém pivôs canônicos e orçamento de produção', () => {
  assert.equal(HERO_ASSET.pivots.hips, 0.84);
  assert.equal(HERO_ASSET.pivots.neck, 1.68);
  assert.equal(HERO_ASSET.budget.heroFullTris, 120000);
  assert.equal(HERO_ASSET.budget.proxyTris, 900);
  assert.equal(HERO_ASSET.budget.maxHeroDrawCalls, 12);
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

test('manifest é cópia serializável e não permite mutar o contrato', () => {
  const manifest = heroAssetManifest();
  assert.deepEqual(manifest.pivots, { hips: 0.84, neck: 1.68 });
  manifest.pivots.hips = 99;
  assert.equal(HERO_ASSET.pivots.hips, 0.84);
  resetHeroAssetCache();
});
