// Task 62 — resolução do MODO DE CÂMERA (puro, determinístico, node-safe).
// O jogador escolhe jogar em 1ª pessoa (fps) ou com o avatar à frente (tps).
// Prioridade: ?view= da URL > preferência salva (localStorage) > default TPS
// ("avatar à frente do console" — o jogador VÊ o operativo e a arma nas mãos).
export const VIEW_STORAGE_KEY = 'kr_view_mode';

export function sanitizeViewMode(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'fps' || s === 'tps' ? s : null;
}

export function resolveViewMode({ param = null, stored = null, fallback = 'tps' } = {}) {
  return sanitizeViewMode(param) ?? sanitizeViewMode(stored) ?? fallback;
}
