// Khaaos Run — Hero asset pipeline
// Asset opcional: só substitui o procedural depois de passar o gate estrutural.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export const HERO_ASSET = Object.freeze({
  id: 'operative_hero_base',
  url: '/assets/models/operative_hero_base.fbx',
  scale: 1,
  heightMeters: 1.8,
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
  // 6.5k é um subteto do mesh Hero isolado; 8k cobre a entidade em gameplay
  // já equipada (corpo + gear + uma arma e seus anexos/skin/overlay mítico).
  budget: Object.freeze({
    sourceDccMaxTriangles: 120000,
    heroMeshMaxTriangles: 6500,
    equippedEntityMaxTriangles: 8000,
    proxyMaxTriangles: 900,
    silhouetteMaxTriangles: 200,
    maxDrawCalls: 12,
  }),
  validation: Object.freeze({
    heightToleranceMeters: 0.1,
    pivotToleranceMeters: 0.1,
    maxSkinInfluences: 4,
    skinWeightSumTolerance: 0.02,
    nonZeroWeightEpsilon: 1e-5,
  }),
});

let promise = null;
let loader = null;
let lastValidation = null;

function baseUrl() {
  try { return (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'; }
  catch { return '/'; }
}

function addError(errors, seen, code, message) {
  if (seen.has(code)) return;
  seen.add(code);
  errors.push({ code, message });
}

function effectiveDrawRange(geometry) {
  const attributeCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
  const start = geometry.drawRange?.start ?? 0;
  const requested = geometry.drawRange?.count ?? Infinity;
  const count = Number.isFinite(requested) ? requested : Math.max(0, attributeCount - start);
  return { start, count, end: start + count, attributeCount };
}

function materialSlots(material) {
  return Array.isArray(material) ? material : [material];
}

function attributeComponent(attribute, vertex, component) {
  const getter = ['getX', 'getY', 'getZ', 'getW'][component];
  return typeof attribute?.[getter] === 'function' ? attribute[getter](vertex) : NaN;
}

function lastNamePart(name = '') {
  return String(name).split(/[/:|\\]/).filter(Boolean).at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function pivotBone(bones, names) {
  return bones.find((bone) => names.has(lastNamePart(bone?.name)));
}

function disposeObject(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    for (const material of materialSlots(node.material)) material?.dispose?.();
  });
}

/**
 * Inspeciona o FBX já parseado pelo FBXLoader. A contagem inclui toda geometria
 * serializada no root, inclusive meshes ocultos, para que visibility não burle
 * o budget. O loader só aceita o asset se todas as verificações bloqueantes
 * passarem; aprovação artística/UE continua sendo um gate separado.
 */
export function validateHeroOperative(root) {
  const errors = [];
  const seen = new Set();
  const metrics = {
    triangleCount: 0,
    drawCallCount: 0,
    meshCount: 0,
    skinnedMeshCount: 0,
    boneCount: 0,
    heightMeters: null,
    hipsPivotY: null,
    neckPivotY: null,
  };
  const skeletons = [];

  if (!root?.isObject3D) {
    addError(errors, seen, 'ROOT_NOT_OBJECT3D', 'FBX não produziu uma raiz THREE.Object3D válida.');
    return { accepted: false, errors, metrics };
  }

  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh) return;
    metrics.meshCount += 1;
    const geometry = node.geometry;
    const label = node.name || `mesh-${metrics.meshCount}`;
    const position = geometry?.attributes?.position;
    if (!geometry?.isBufferGeometry || !position || position.itemSize !== 3 || position.count < 3) {
      addError(errors, seen, 'INVALID_GEOMETRY', `${label}: BufferGeometry/position inválido ou vazio.`);
      return;
    }
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      for (let component = 0; component < 3; component += 1) {
        if (!Number.isFinite(attributeComponent(position, vertex, component))) {
          addError(errors, seen, 'NON_FINITE_POSITION', `${label}: posição contém NaN/Infinity.`);
          vertex = position.count;
          break;
        }
      }
    }

    const materials = materialSlots(node.material);
    if (!materials.length || materials.some((material) => !material?.isMaterial)) {
      addError(errors, seen, 'INVALID_MATERIAL', `${label}: mesh sem material THREE válido.`);
    }

    const range = effectiveDrawRange(geometry);
    if (!Number.isInteger(range.start) || !Number.isInteger(range.count) || range.start < 0 || range.count < 0 || range.end > range.attributeCount) {
      addError(errors, seen, 'INVALID_DRAW_RANGE', `${label}: drawRange fora do intervalo da geometria.`);
      return;
    }
    if (range.start % 3 !== 0 || range.count % 3 !== 0) {
      addError(errors, seen, 'NON_TRIANGULAR_RANGE', `${label}: drawRange não está alinhado a triângulos.`);
    }
    if (geometry.index) {
      const end = Math.min(range.end, geometry.index.count);
      for (let i = range.start; i < end; i += 1) {
        const index = geometry.index.getX(i);
        if (!Number.isInteger(index) || index < 0 || index >= position.count) {
          addError(errors, seen, 'INDEX_OUT_OF_RANGE', `${label}: índice aponta para fora de position.`);
          break;
        }
      }
    }

    if (Array.isArray(node.material)) {
      const groups = [...(geometry.groups ?? [])].filter((group) => group.count > 0).sort((a, b) => a.start - b.start);
      if (!groups.length) {
        addError(errors, seen, 'MULTIMATERIAL_WITHOUT_GROUPS', `${label}: material array sem geometry.groups.`);
      }
      let cursor = range.start;
      for (const group of groups) {
        if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start !== cursor || group.count % 3 !== 0 || group.start + group.count > range.end || !node.material[group.materialIndex]) {
          addError(errors, seen, 'INVALID_MATERIAL_GROUPS', `${label}: groups devem cobrir drawRange sem lacunas/sobreposição e referenciar materiais válidos.`);
          break;
        }
        cursor = group.start + group.count;
        metrics.triangleCount += group.count / 3;
        metrics.drawCallCount += 1;
      }
      if (groups.length && cursor !== range.end) {
        addError(errors, seen, 'INCOMPLETE_MATERIAL_GROUPS', `${label}: geometry.groups não cobre o drawRange inteiro.`);
      }
    } else if (range.count > 0) {
      metrics.triangleCount += range.count / 3;
      metrics.drawCallCount += 1;
    }

    if (node.isSkinnedMesh) {
      metrics.skinnedMeshCount += 1;
      const skeleton = node.skeleton;
      const bones = skeleton?.bones ?? [];
      metrics.boneCount = Math.max(metrics.boneCount, bones.length);
      skeletons.push(bones);
      const skinIndex = geometry.attributes.skinIndex;
      const skinWeight = geometry.attributes.skinWeight;
      if (!skeleton || bones.length < 2 || !skinIndex || !skinWeight || skinIndex.count !== position.count || skinWeight.count !== position.count || skinIndex.itemSize < 1 || skinIndex.itemSize > HERO_ASSET.validation.maxSkinInfluences || skinWeight.itemSize !== skinIndex.itemSize) {
        addError(errors, seen, 'INVALID_SKIN_BINDING', `${label}: rig/skinIndex/skinWeight ausente, incompatível ou acima de 4 influências.`);
      } else {
        let invalidWeights = false;
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          let sum = 0;
          let influences = 0;
          for (let slot = 0; slot < skinWeight.itemSize; slot += 1) {
            const weight = attributeComponent(skinWeight, vertex, slot);
            const joint = attributeComponent(skinIndex, vertex, slot);
            if (!Number.isFinite(weight) || weight < -1e-6) { invalidWeights = true; break; }
            sum += weight;
            if (weight > HERO_ASSET.validation.nonZeroWeightEpsilon) {
              influences += 1;
              if (!Number.isInteger(joint) || joint < 0 || joint >= bones.length) { invalidWeights = true; break; }
            }
          }
          if (invalidWeights || influences < 1 || influences > HERO_ASSET.validation.maxSkinInfluences || Math.abs(sum - 1) > HERO_ASSET.validation.skinWeightSumTolerance) {
            invalidWeights = true;
            break;
          }
        }
        if (invalidWeights) addError(errors, seen, 'INVALID_SKIN_WEIGHTS', `${label}: pesos devem ser finitos, normalizados (Σ≈1), apontar a bones válidos e usar no máximo 4 influências.`);
      }
    }
  });

  if (metrics.meshCount === 0) addError(errors, seen, 'NO_RENDERABLE_MESH', 'FBX não contém meshes renderizáveis.');
  if (metrics.skinnedMeshCount === 0) addError(errors, seen, 'NO_SKINNED_MESH', 'Hero FBX precisa conter pelo menos um SkinnedMesh.');

  let hips = null;
  let neck = null;
  for (const bones of skeletons) {
    hips ??= pivotBone(bones, new Set(['hip', 'hips', 'pelvis']));
    neck ??= pivotBone(bones, new Set(['neck', 'neck01', 'neck1', 'head']));
  }
  if (!hips) addError(errors, seen, 'MISSING_HIPS_PIVOT', 'Rig precisa expor um bone Hips/Hip/Pelvis.');
  if (!neck) addError(errors, seen, 'MISSING_NECK_PIVOT', 'Rig precisa expor um bone Neck/Head.');
  if (hips) {
    const p = hips.getWorldPosition(new THREE.Vector3()).y;
    metrics.hipsPivotY = p;
    if (!Number.isFinite(p) || Math.abs(p - HERO_ASSET.pivots.hips) > HERO_ASSET.validation.pivotToleranceMeters) {
      addError(errors, seen, 'HIPS_PIVOT_OUT_OF_TOLERANCE', `Hips y=${p} m; esperado ${HERO_ASSET.pivots.hips} ± ${HERO_ASSET.validation.pivotToleranceMeters} m.`);
    }
  }
  if (neck) {
    const p = neck.getWorldPosition(new THREE.Vector3()).y;
    metrics.neckPivotY = p;
    if (!Number.isFinite(p) || Math.abs(p - HERO_ASSET.pivots.neck) > HERO_ASSET.validation.pivotToleranceMeters) {
      addError(errors, seen, 'NECK_PIVOT_OUT_OF_TOLERANCE', `Neck/Head y=${p} m; esperado ${HERO_ASSET.pivots.neck} ± ${HERO_ASSET.validation.pivotToleranceMeters} m.`);
    }
  }

  // Mede a pose neutra pelos atributos de posição. Box3.setFromObject invoca
  // computeBoundingBox em SkinnedMesh e pode lançar se o FBX tiver skin index
  // inválido — justamente um caso que o gate precisa rejeitar, não propagar.
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry?.attributes?.position;
    if (!position) return;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(node.matrixWorld);
      if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) bounds.expandByPoint(point);
    }
  });
  const size = new THREE.Vector3();
  bounds.getSize(size);
  metrics.heightMeters = Number.isFinite(size.y) ? size.y : null;
  if (!Number.isFinite(size.y) || Math.abs(size.y - HERO_ASSET.heightMeters) > HERO_ASSET.validation.heightToleranceMeters) {
    addError(errors, seen, 'HEIGHT_OUT_OF_TOLERANCE', `Altura ${size.y} m; esperado ${HERO_ASSET.heightMeters} ± ${HERO_ASSET.validation.heightToleranceMeters} m.`);
  }
  if (metrics.triangleCount <= 0) addError(errors, seen, 'NO_TRIANGLES', 'Hero FBX não contém triângulos utilizáveis.');
  if (metrics.triangleCount > HERO_ASSET.budget.heroMeshMaxTriangles) {
    addError(errors, seen, 'TRIANGLE_BUDGET_EXCEEDED', `${metrics.triangleCount} triângulos excedem o subteto do mesh Hero de ${HERO_ASSET.budget.heroMeshMaxTriangles}.`);
  }
  if (metrics.drawCallCount > HERO_ASSET.budget.maxDrawCalls) {
    addError(errors, seen, 'DRAW_CALL_BUDGET_EXCEEDED', `${metrics.drawCallCount} draw calls excedem o limite de ${HERO_ASSET.budget.maxDrawCalls}.`);
  }
  return { accepted: errors.length === 0, errors, metrics };
}

function visibleInHierarchy(node) {
  for (let current = node; current; current = current.parent) if (!current.visible) return false;
  return true;
}

/**
 * Valida o orçamento da entidade renderizada inteira. O root deve ser apenas
 * o ator (não a cena): a contagem inclui corpo, gear, arma, anexos e overlays
 * visíveis, considerando drawRange e groups de material.
 */
export function validateEquippedEntityBudget(root) {
  const errors = [];
  const metrics = { triangleCount: 0, drawCallCount: 0, meshCount: 0 };
  if (!root?.isObject3D) {
    errors.push({ code: 'ROOT_NOT_OBJECT3D', message: 'Entidade equipada precisa ser uma raiz THREE.Object3D.' });
    return { accepted: false, errors, metrics, limit: HERO_ASSET.budget.equippedEntityMaxTriangles };
  }

  root.traverse((node) => {
    if (!node.isMesh || !visibleInHierarchy(node)) return;
    const geometry = node.geometry;
    const position = geometry?.attributes?.position;
    if (!geometry?.isBufferGeometry || !position) return;
    const range = effectiveDrawRange(geometry);
    const materials = materialSlots(node.material);
    let meshTriangles = 0;
    if (Array.isArray(node.material) && geometry.groups?.length) {
      for (const group of geometry.groups) {
        const material = materials[group.materialIndex];
        if (group.count <= 0 || !material || material.visible === false) continue;
        const start = Math.max(range.start, group.start);
        const end = Math.min(range.end, group.start + group.count);
        const count = Math.max(0, end - start);
        if (count > 0) {
          meshTriangles += Math.floor(count / 3);
          metrics.drawCallCount += 1;
        }
      }
    } else if (range.count > 0 && materials.some((material) => material?.visible !== false)) {
      meshTriangles += Math.floor(range.count / 3);
      metrics.drawCallCount += 1;
    }
    metrics.triangleCount += meshTriangles;
    if (meshTriangles > 0) metrics.meshCount += 1;
  });

  const limit = HERO_ASSET.budget.equippedEntityMaxTriangles;
  if (metrics.triangleCount <= 0) errors.push({ code: 'NO_RENDERABLE_TRIANGLES', message: 'Entidade equipada não contém triângulos renderizáveis.' });
  if (metrics.triangleCount > limit) errors.push({ code: 'EQUIPPED_ENTITY_TRIANGLE_BUDGET_EXCEEDED', message: `${metrics.triangleCount} triângulos excedem o limite da entidade equipada de ${limit}.` });
  return { accepted: errors.length === 0, errors, metrics, limit };
}

function normalizeHero(root, validation) {
  root.name = 'operative_hero_base';
  root.scale.setScalar(HERO_ASSET.scale);
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    for (const material of materialSlots(node.material)) {
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
    }
  });
  root.userData.heroAsset = HERO_ASSET.id;
  root.userData.pivots = { ...HERO_ASSET.pivots };
  root.userData.heroValidation = { ...validation.metrics };
  return root;
}

/**
 * Carrega o FBX apenas após validação rigorosa. Falhas retornam null de forma
 * deliberada: o chamador mantém createOperative() como fallback sem quebrar o boot.
 */
export function loadHeroOperative() {
  if (promise) return promise;
  loader ??= new FBXLoader();
  promise = new Promise((resolve) => {
    try {
      loader.load(`${baseUrl()}assets/models/operative_hero_base.fbx`, (object) => {
        try {
          lastValidation = validateHeroOperative(object);
          if (!lastValidation.accepted) {
            disposeObject(object);
            resolve(null);
            return;
          }
          resolve(normalizeHero(object, lastValidation));
        } catch (error) {
          lastValidation = { accepted: false, errors: [{ code: 'VALIDATION_EXCEPTION', message: String(error?.message ?? error) }], metrics: null };
          try { disposeObject(object); } catch { /* preserva o fallback mesmo se a limpeza falhar */ }
          resolve(null);
        }
      }, undefined, () => {
        lastValidation = { accepted: false, errors: [{ code: 'FBX_LOAD_FAILED', message: 'FBX Hero ausente ou não pôde ser carregado.' }], metrics: null };
        resolve(null);
      });
    } catch (error) {
      lastValidation = { accepted: false, errors: [{ code: 'FBX_LOAD_FAILED', message: String(error?.message ?? error) }], metrics: null };
      resolve(null);
    }
  });
  return promise;
}

export function getLastHeroAssetValidation() {
  return lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null;
}

export function resetHeroAssetCache() {
  promise = null;
  loader = null;
  lastValidation = null;
}

export function heroAssetManifest() {
  return JSON.parse(JSON.stringify(HERO_ASSET));
}
