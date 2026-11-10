// Khaaos Run — Biblioteca de avatares GLB (rigs reais Tripo) — Fase 56
// SSOT dos avatares GLB entregues pelo usuário (upload/ → public/assets/avatars).
// Doutrina do pipeline de herói (hero3d.js): asset OPCIONAL — nunca substitui o
// procedural até carregar e validar; qualquer falha resolve null e o chamador
// mantém createOperative() como fallback sem quebrar o boot.
// Headless-safe: GLTFLoader é importado DINAMICAMENTE dentro do loader (o módulo
// inteiro pode ser importado por node --test sem window/fetch).
import * as THREE from 'three';

export const AVATAR_TARGET_HEIGHT = 1.8; // metros — pivô canônico do jogo (neck 1.68)

export const AVATAR_TIERS = Object.freeze(['static', 'rigged', 'animated']);

// 10 GLBs Tripo (glTF 2.0): 4 estáticos, 5 rigged (esqueleto), 1 animated (clips).
export const AVATAR_GLB_LIBRARY = Object.freeze([
  Object.freeze({ id: 'animated-avatar-m-01', file: 'animated-avatar-m-01.glb', sex: 'M', tier: 'animated' }),
  Object.freeze({ id: 'rigged-avatar-m-01', file: 'rigged-avatar-m-01.glb', sex: 'M', tier: 'rigged' }),
  Object.freeze({ id: 'rigged-avatar-m-02', file: 'rigged-avatar-m-02.glb', sex: 'M', tier: 'rigged' }),
  Object.freeze({ id: 'rigged-avatar-m-04', file: 'rigged-avatar-m-04.glb', sex: 'M', tier: 'rigged' }),
  Object.freeze({ id: 'rigged-avatar-f-01', file: 'rigged-avatar-f-01.glb', sex: 'F', tier: 'rigged' }),
  Object.freeze({ id: 'rigged-avatar-f-03', file: 'rigged-avatar-f-03.glb', sex: 'F', tier: 'rigged' }),
  Object.freeze({ id: 'avatar-m-01', file: 'avatar-m-01.glb', sex: 'M', tier: 'static' }),
  Object.freeze({ id: 'avatar-m-02', file: 'avatar-m-02.glb', sex: 'M', tier: 'static' }),
  Object.freeze({ id: 'avatar-m-04', file: 'avatar-m-04.glb', sex: 'M', tier: 'static' }),
  Object.freeze({ id: 'avatar-f-03', file: 'avatar-f-03.glb', sex: 'F', tier: 'static' }),
]);

export function avatarById(id) {
  return AVATAR_GLB_LIBRARY.find((a) => a.id === id) ?? null;
}

function baseUrl() {
  try { return (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'; }
  catch { return '/'; }
}

export function avatarGlbUrl(id) {
  const entry = avatarById(id);
  if (!entry) return null;
  return `${baseUrl()}assets/avatars/${entry.file}`;
}

/**
 * Escala o avatar para a altura canônica do jogo (1.8 m) usando a bounding box
 * real do modelo — rig Tripo chega em unidades arbitrárias.
 * Retorna a MESMA raiz (encadeável). Sem mesh → retorna sem tocar em scale.
 */
export function normalizeAvatarScale(root, targetHeight = AVATAR_TARGET_HEIGHT) {
  if (!root?.isObject3D) return root;
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!Number.isFinite(size.y) || size.y <= 1e-6) return root;
  root.scale.setScalar(root.scale.x * (targetHeight / size.y));
  return root;
}

/** Apoia o avatar no chão: bounding box min.y → 0 (pés no solo do mundo). */
export function fitAvatarToGround(root) {
  if (!root?.isObject3D) return root;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return root;
  root.position.y -= box.min.y;
  return root;
}

/**
 * Normalização visual do GLB: sombras corretas, FrontSide, marca de origem.
 * Retorna { root, clips } — clips = AnimationClips embutidos (animated tier).
 */
function normalizeAvatar(root, id) {
  root.name = `avatar_glb_${id}`;
  const clips = [];
  root.traverse((node) => {
    if (node.isMesh || node.isSkinnedMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        node.material.side = THREE.FrontSide;
        node.material.needsUpdate = true;
      }
    }
  });
  // clips podem vir na raiz (gltf.animations) — o loader passa por aqui
  root.userData.avatarAsset = id;
  return { root, clips };
}

const cache = new Map();

/**
 * Carrega o GLB do avatar. Falha QUALQUER (id inválido, rede, parse) → null
 * deliberado: o jogo segue no corpo procedural (mesmo contrato do hero3d).
 * Em tier animated os clips vêm de gltf.animations; nos demais, [].
 */
export async function loadAvatarGlb(id) {
  const entry = avatarById(id);
  if (!entry) return null;
  if (cache.has(id)) return cache.get(id); // guarda a PROMISE — load único mesmo concorrente
  const url = avatarGlbUrl(id);
  const promise = new Promise((resolve) => {
    (async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
          const out = normalizeAvatar(gltf.scene, id);
          out.clips = Object.freeze([...(gltf.animations ?? [])]);
          resolve(out);
        }, undefined, () => resolve(null));
      } catch { resolve(null); }
    })();
  });
  cache.set(id, promise);
  return promise;
}

export function resetAvatarCache() {
  cache.clear();
}
