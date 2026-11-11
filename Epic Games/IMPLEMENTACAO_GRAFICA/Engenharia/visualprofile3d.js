// Direção visual independente do tier e da simulação. Sem ativos da Garena.
import { postFxPlanFor } from './perf3d.js';
import { qualityTier } from './quality3d.js';

export function resolveVisualProfile({ query = '', isTouch = false } = {}) {
  const value = String(query ?? '').trim().toLowerCase();
  if (value === 'competitive' || value === 'cinematic') return value;
  return isTouch ? 'competitive' : 'cinematic';
}

export function renderPixelRatio(tier, nativeRatio = 1, profile = 'cinematic') {
  const ratio = Number.isFinite(nativeRatio) && nativeRatio > 0 ? nativeRatio : 1;
  const cap = profile === 'competitive' ? 1.25 : Infinity;
  return Math.min(ratio, qualityTier(tier).pixelRatio, cap);
}

export function visualPostPlan(tier, profile = 'cinematic') {
  const base = postFxPlanFor(tier);
  if (!base) return null; // low preserva render direto e HUD em resolução DOM.
  if (profile === 'competitive') {
    return { ...base, ssr: false, bloomStrength: 0, grain: 0,
      vignette: 0, saturation: 1.02, contrast: 1.02, tint: 0, highlightRollOff: 0.12 };
  }
  return { ...base, vignette: 0.23, saturation: 1.045, contrast: 1.035,
    tint: 1, highlightRollOff: 0.28 };
}
