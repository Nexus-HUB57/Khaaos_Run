// Khaaos Run — Fase 7: carregador de assets GLTF reais (props do mundo).
// Busca /assets/models/<nome>.gltf (respeitando a base do deploy), memoiza a
// promessa e devolve null em qualquer falha — o chamador mantém o fallback
// procedural (zero regressão visual se o asset faltar).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map();
const failed = new Set();
let loader = null;

function baseUrl() {
  try {
    // Vite injeta BASE_URL em build/dev; fallback: raiz relativa
    return (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  } catch {
    return '/';
  }
}

export function gltfAvailable(name) { return !failed.has(name) || cache.has(name); }

// Promise<THREE.Group | null> — nunca rejeita (pipeline à prova de asset ausente).
export function loadGltfModel(name) {
  if (cache.has(name)) return cache.get(name);
  if (failed.has(name)) return Promise.resolve(null);
  loader ??= new GLTFLoader();
  const url = `${baseUrl()}assets/models/${name}.gltf`;
  const p = new Promise((resolve) => {
    try {
      loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene || gltf.scenes?.[0];
          if (!scene) { failed.add(name); resolve(null); return; }
          scene.traverse((o) => {
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
          });
          resolve(scene);
        },
        undefined,
        () => { failed.add(name); resolve(null); },
      );
    } catch {
      failed.add(name);
      resolve(null);
    }
  });
  cache.set(name, p);
  return p;
}

// Clona um modelo carregado (Group) para instanciar em cena.
export function cloneModel(group) {
  return group ? group.clone(true) : null;
}

export function resetGltfCache() {
  cache.clear();
  failed.clear();
  loader = null;
}
