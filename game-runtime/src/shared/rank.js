// Khaaos Run — Patente do operativo (liderança no perfil).
//
// A hierarquia canônica do POJ (PATENTE_HIERARQUIA) também é a progressão de
// carreira do jogador: KRC acumulado (economy) define a patente do perfil, que
// alimenta o painel POJ, o /poj/register (patente inicial) e o 1º critério de
// desempate do 11º artigo. Módulo PURO e compartilhado — cliente e servidor
// leem exatamente a mesma tabela.
export const RANK_THRESHOLDS = Object.freeze([
  { patente: 'Recruta',      xp: 0 },
  { patente: 'Soldado',      xp: 500 },
  { patente: 'Cabo',         xp: 1500 },
  { patente: 'Sargento',     xp: 3500 },
  { patente: 'Sargento-Mor', xp: 7000 },
  { patente: 'Tenente',      xp: 12000 },
  { patente: 'Capitão',      xp: 20000 },
  { patente: 'Major',        xp: 32000 },
  { patente: 'Coronel',      xp: 50000 },
  { patente: 'General',      xp: 75000 },
]);

// Patente pelo valor acumulado (KRC/XP). Sempre devolve uma patente válida —
// valores inválidos/negativos pesam como Recruta.
export function rankForXp(value) {
  const v = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  let current = RANK_THRESHOLDS[0];
  for (const tier of RANK_THRESHOLDS) if (v >= tier.xp) current = tier;
  return current;
}

// Progresso completo do perfil: patente atual, peso na hierarquia POJ, próxima
// patente e fração 0–1 do progresso dentro da faixa atual (1 no topo da carreira).
export function rankProgress(value) {
  const v = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const current = rankForXp(v);
  const index = RANK_THRESHOLDS.indexOf(current);
  const next = RANK_THRESHOLDS[index + 1] ?? null;
  const spanStart = current.xp;
  const spanEnd = next ? next.xp : current.xp || 1;
  const progress = next ? Math.min(1, (v - spanStart) / (spanEnd - spanStart)) : 1;
  return {
    patente: current.patente,
    peso: index, // 0..9 — casa com pesoPatente() do POJ
    xp: v,
    nextPatente: next?.patente ?? null,
    xpForNext: next ? Math.max(0, next.xp - v) : 0,
    progress,
  };
}
