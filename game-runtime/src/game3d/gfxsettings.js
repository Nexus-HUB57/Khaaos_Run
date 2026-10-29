// Khaaos Run — Fase 34: configurações gráficas do jogador (KR_GFX_*) — PURO.
// Mesma disciplina do audiomix (KR_AUDIO_*): localStorage com fallback de
// memória (headless/testes/modo privado), validação de cada campo e merge
// parcial (blob versionado KR_GFX_SETTINGS_V1).
//
// Fecha os achados U1–U3 da revisão PhD-level de UX:
//   U1 — não havia NENHUMA setting gráfica in-game (só ?q= na URL);
//   U2 — sensibilidade do mouse hardcoded (.0021/.0011);
//   U3 — camera shake de explosões sem opção de movimento reduzido.
//
// Campos:
//   tier   — 'auto' | 'low' | 'medium' | 'high'  (auto = DRS + degraus de tier)
//   postfx — pós-FX ligado/desligado (composer vs render direto)
//   drs    — resolução dinâmica ligada/desligada
//   fps    — telemetria (FPS + escala DRS) visível no HUD
//   shake  — 0..1 multiplicador do tremor de câmera (0 = movimento reduzido)
//   sens   — 0.3..2.5 multiplicador de sensibilidade do mouse (1 = padrão)

import { budgetFor } from './perf3d.js';

export const GFX_STORAGE_KEY = 'KR_GFX_SETTINGS_V1';

export const GFX_DEFAULTS = Object.freeze({
  tier: 'auto',
  postfx: true,
  drs: true,
  fps: false,
  shake: 1,
  sens: 1,
});

const TIERS = ['auto', 'low', 'medium', 'high'];

/** Storage de memória (mesmo contrato de localStorage) p/ testes/headless. */
export function memoryGfxStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const fallbackGfxStorage = () => (typeof localStorage !== 'undefined' ? localStorage : memoryGfxStorage());

/** Valida um blob parcial: campos inválidos são DESCARTADOS (não quebram o
 * jogo); números são clampados ao domínio. Nunca lança. */
export function sanitizeGfxSettings(raw = {}) {
  const out = { ...GFX_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  if (TIERS.includes(raw.tier)) out.tier = raw.tier;
  if (typeof raw.postfx === 'boolean') out.postfx = raw.postfx;
  if (typeof raw.drs === 'boolean') out.drs = raw.drs;
  if (typeof raw.fps === 'boolean') out.fps = raw.fps;
  if (Number.isFinite(raw.shake)) out.shake = Math.min(1, Math.max(0, raw.shake));
  if (Number.isFinite(raw.sens)) out.sens = Math.min(2.5, Math.max(0.3, raw.sens));
  return out;
}

/** Lê as settings persistidas; blob ausente/corrompido → defaults. */
export function loadGfxSettings(storage = null) {
  const s = storage ?? fallbackGfxStorage();
  try {
    const raw = s.getItem(GFX_STORAGE_KEY);
    if (!raw) return { ...GFX_DEFAULTS };
    return sanitizeGfxSettings(JSON.parse(raw));
  } catch {
    return { ...GFX_DEFAULTS };
  }
}

/** Persiste um merge parcial; devolve o blob efetivo pós-sanitização. */
export function saveGfxSettings(partial = {}, storage = null) {
  const s = storage ?? fallbackGfxStorage();
  const merged = sanitizeGfxSettings({ ...loadGfxSettings(s), ...partial });
  try { s.setItem(GFX_STORAGE_KEY, JSON.stringify(merged)); } catch { /* quota/privado — segue com memória */ }
  return merged;
}

/** Tier EFETIVO do session (antes do auto-tier adaptativo): override manual
 * do jogador vence o auto-detect da URL/touch/RAM do quality3d. */
export function effectiveBaseTier(autoTier, gfx) {
  return gfx?.tier && gfx.tier !== 'auto' ? gfx.tier : autoTier;
}

/** Orçamento de frametime do tier base (delegado — conveniência p/ HUD). */
export function gfxBudget(tier) { return budgetFor(tier); }
