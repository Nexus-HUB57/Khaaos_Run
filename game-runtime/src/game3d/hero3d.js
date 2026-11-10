// Khaaos Run — Hero asset pipeline
// Asset opcional: nunca substitui o procedural até passar validação visual e de animação.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export const HERO_ASSET = Object.freeze({
  id: 'operative_hero_base',
  url: '/assets/models/operative_hero_base.fbx',
  scale: 1,
  pivots: Object.freeze({ hips: 0.84, neck: 1.68 }),
  realism: Object.freeze({
    humanLikeness: 'maximum',
    facialTopology: 'continuous-retopologized',
    expressionSet: Object.freeze(['neutral', 'effort', 'pain', 'focus', 'breathing']),
    identityInputs: Object.freeze(['ethnic_reference', 'sex', 'age_range', 'body_type']),
    antiCaricature: true,
  }),
  motion: Object.freeze({
    animationStyle: 'natural-weighted',
    requiredLayers: Object.freeze(['locomotion', 'aiming', 'breathing', 'weapon-handling', 'impact-reaction']),
    additiveBreathing: true,
    footPlanting: true,
    centerOfMass: true,
  }),
  factionWear: Object.freeze({
    required: true,
    profiles: Object.freeze(['military', 'militia', 'gang', 'civilian-survivor']),
    constructionDetail: Object.freeze(['fabric-weave', 'seams', 'closures', 'wear', 'dust', 'wetness', 'decals']),
  }),
  lod: Object.freeze({ full: 30, proxy: 95, cull: 280 }),
  budget: Object.freeze({ heroFullTris: 120000, proxyTris: 900, maxHeroDrawCalls: 12 }),
});

let promise = null;
let loader = null;

function baseUrl() {
  try { return (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'; }
  catch { return '/'; }
}

function normalizeHero(root) {
  root.name = 'operative_hero_base';
  root.scale.setScalar(HERO_ASSET.scale);
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material) {
      node.material.side = THREE.FrontSide;
      node.material.needsUpdate = true;
    }
  });
  root.userData.heroAsset = HERO_ASSET.id;
  root.userData.pivots = { ...HERO_ASSET.pivots };
  return root;
}

/**
 * Carrega o FBX quando disponível. Falhas retornam null de forma deliberada:
 * o chamador deve manter createOperative() como fallback sem quebrar o boot.
 */
export function loadHeroOperative() {
  if (promise) return promise;
  loader ??= new FBXLoader();
  promise = new Promise((resolve) => {
    try {
      loader.load(`${baseUrl()}assets/models/operative_hero_base.fbx`,
        (object) => resolve(normalizeHero(object)),
        undefined,
        () => resolve(null));
    } catch { resolve(null); }
  });
  return promise;
}

export function resetHeroAssetCache() {
  promise = null;
  loader = null;
}

export function heroAssetManifest() {
  return JSON.parse(JSON.stringify(HERO_ASSET));
}
