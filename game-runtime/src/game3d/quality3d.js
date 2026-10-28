// Khaaos Run — Fase 7: níveis de qualidade (LOD mobile).
// Resolve o tier de renderização UMA vez por sessão: query ?q=low|medium|high
// tem precedência; sem query, dispositivos touch ou pouca RAM caem para "low".
// Consumidores: main3d (pixelRatio/sombras/postfx) e world3d (grama, árvores,
// nuvens, props, sombras de contato, GLTF).

export const QUALITY_TIERS = {
  low: {
    pixelRatio: 1.2,
    shadowMapSize: 1024,
    grassFactor: 0.35,
    treeFactor: 0.55,
    bushFactor: 0.5,
    rockFactor: 0.5,
    cloudCount: 7,
    propsFactor: 0.85,
    trafficFactor: 0.45,  // Fase 8 — menos caros no mobile
    dressingFactor: 0.7,  // Fase 22 — cenários vivos com kit reduzido no mobile
    interiorFactor: 0.5,  // Fase 23 — metade dos prédios com interior no mobile
    interiorDensity: 0.7, // Fase 23 — mobília reduzida por prédio
    bloom: false,
    contactShadows: true,   // barato (1 InstancedMesh) e sustenta a leitura visual
    gltfProps: true,
  },
  medium: {
    pixelRatio: 1.5,
    shadowMapSize: 1536,
    grassFactor: 0.7,
    treeFactor: 0.8,
    bushFactor: 0.75,
    rockFactor: 0.75,
    cloudCount: 11,
    propsFactor: 1,
    trafficFactor: 0.8,
    dressingFactor: 0.9,
    interiorFactor: 0.8,  // Fase 23
    interiorDensity: 0.9,
    bloom: true,
    contactShadows: true,
    gltfProps: true,
  },
  high: {
    pixelRatio: 1.75,
    shadowMapSize: 2048,
    grassFactor: 1,
    treeFactor: 1,
    bushFactor: 1,
    rockFactor: 1,
    cloudCount: 14,
    propsFactor: 1,
    trafficFactor: 1,
    dressingFactor: 1,
    interiorFactor: 1,    // Fase 23 — todos os prédios elegíveis com interior
    interiorDensity: 1,
    bloom: true,
    contactShadows: true,
    gltfProps: true,
  },
};

// Determina o tier a partir de query/touch/memória. Puro — testável headless.
export function resolveQuality({ query = '', isTouch = false, deviceMemory = null } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (QUALITY_TIERS[q]) return q;
  if (isTouch) return 'low';
  if (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4) return 'low';
  return 'high';
}

export function qualityTier(name) {
  return QUALITY_TIERS[name] ?? QUALITY_TIERS.high;
}
