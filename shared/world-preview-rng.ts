/**
 * RNG determinístico do WorldMapPreview (console ↔ repo, Sprint 1.1/T1.1).
 *
 * Contrato README 2026-11-02: "WorldMapPreview (RNG FNV-1a+LCG determinístico)"
 * — o MESMO seed de mundo produz o MESMO mapa byte a byte, em browser e em
 * node (testes oficiais). Sem Math.random, sem dependência de DOM.
 */

/** FNV-1a 32-bit (string → seed numérico). */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul para multiplicação 32-bit correta.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** LCG (Numerical Recipes: a=1664525, c=1013904223, m=2^32) — determinístico. */
export function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000; // [0,1)
  };
}

/** Seed canônico de um mundo para o preview do mapa. */
export function worldPreviewSeed(worldId: string): number {
  return fnv1a(`khaaos:worldmap:${worldId}`);
}
