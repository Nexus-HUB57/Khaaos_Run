// Khaaos Run — Fase 19: mixagem de volume (KR_AUDIO_*) — módulo PURO.
// 4 canais: master (GERAL) + barramentos sfx/world/ui. Persistência em
// localStorage com fallback de memória (headless/testes/modo privado).
// Nenhum toque em WebAudio/DOM aqui: audio3d aplica os ganhos, main3d religa
// os sliders — este módulo é o contrato de dados testável de ponta a ponta.

export const AUDIO_CHANNELS = Object.freeze(['master', 'sfx', 'world', 'ui']);

// rótulos canônicos do painel (main3d renderiza; testes fixam a gramática)
export const AUDIO_CHANNEL_LABELS = Object.freeze({
  master: 'GERAL', sfx: 'EFEITOS', world: 'MUNDO', ui: 'INTERFACE',
});

// chaves de persistência (uma por canal — parcial nunca corrompe o conjunto)
export const AUDIO_MIX_KEYS = Object.freeze({
  master: 'KR_AUDIO_MASTER',
  sfx: 'KR_AUDIO_SFX',
  world: 'KR_AUDIO_WORLD',
  ui: 'KR_AUDIO_UI',
});

// master .5 preserva o volume histórico do jogo (era o gain fixo do master);
// barramentos nascem em 1.0 — mixagem neutra até o usuário mexer.
export const DEFAULT_AUDIO_MIX = Object.freeze({ master: .5, sfx: 1, world: 1, ui: 1 });

/** Storage de memória (mesmo contrato de localStorage) p/ testes/headless. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const fallbackStorage = () => (typeof localStorage !== 'undefined' ? localStorage : memoryStorage());

/**
 * Volume válido em 0..1 (arredondado a 3 casas — zero surpresa de float).
 * null/undefined/''/NaN → fallback (default do canal).
 */
export function clampVolume(v, fallback = 1) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

/** Mixagem completa e válida: só canais canônicos, clamp por canal. */
export function normalizeAudioMix(partial = {}, base = DEFAULT_AUDIO_MIX) {
  const out = {};
  for (const ch of AUDIO_CHANNELS) {
    out[ch] = clampVolume(partial?.[ch], base?.[ch] ?? DEFAULT_AUDIO_MIX[ch]);
  }
  return out;
}

/** Lê a mixagem persistida (KR_AUDIO_*); ausente/inválido → default. */
export function loadAudioMix(storage = null) {
  const s = storage ?? fallbackStorage();
  const partial = {};
  for (const ch of AUDIO_CHANNELS) {
    try { partial[ch] = s.getItem(AUDIO_MIX_KEYS[ch]); } catch { partial[ch] = null; }
  }
  return normalizeAudioMix(partial, DEFAULT_AUDIO_MIX);
}

/** Persiste a mixagem (normalizada antes); fallback silencioso p/ modo privado. */
export function saveAudioMix(mix = {}, storage = null) {
  const s = storage ?? fallbackStorage();
  const norm = normalizeAudioMix(mix, DEFAULT_AUDIO_MIX);
  for (const ch of AUDIO_CHANNELS) {
    try { s.setItem(AUDIO_MIX_KEYS[ch], String(norm[ch])); } catch { /* modo privado */ }
  }
  return norm;
}
