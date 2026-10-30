// Khaaos Run — Fase 35: performance adaptativa (DRS + auto-tier) — módulo PURO.
//
// Revisão PhD-level da otimização gráfica achou que o tier de qualidade
// (quality3d) é resolvido UMA vez por sessão: em combate pesado (24 atores +
// SSR + partículas + grama) o frametime colapsa e NADA reage até a próxima
// partida. Este módulo fecha o laço de controle em duas escalas:
//
//   1. DRS (Dynamic Resolution Scaling) — ajusta a ESCALA de resolução
//      (0.55..1.0 × pixelRatio do tier) a cada janela de dwell: descida
//      agressiva (overload dói AGORA), subida conservadora (recupera nitidez
//      só quando o orçamento folga SUSTENTADAMENTE — anti-oscilação).
//   2. Auto-tier — se mesmo no piso do DRS o frametime estoura o orçamento
//      de forma SUSTENTADA, desce o tier (high→medium→low), que reduz custo
//      ESTRUTURAL (sombras, SSR, densidade de grama/props no próximo mundo);
//      subida de tier exige folga longa — dwell assimétrico anti ping-pong.
//
// Tudo headless-testável (decisões puras sobre estados explícitos) — mesma
// disciplina dos módulos audiomix/gfxsettings. O main3d só APLICA as
// decisões (renderer.setPixelRatio / post.setSize / sombras / pós-FX).

/** Orçamento de frametime por tier (ms). high/medium miram 60 fps com folha
 * de 10% (15.0 ms); low aceita ~45 fps — touch prioriza bateria/térmica. */
export const BUDGET_MS = { low: 22, medium: 15, high: 15 };

/** Piso/teto da escala de resolução. 0.55 preserva legibilidade da UI de mira
 * (abaixo disso a crosshair serrilhaha em 1080p); teto 1.0 = nativo do tier. */
export const DRS_MIN = 0.55;
export const DRS_MAX = 1.0;

/** Overload: EMA acima de budget × 1.12 dispara descida — 12% de folha acima
 * do alvo evita reagir a ruído de ±1 frame. */
export const DRS_OVERLOAD_RATIO = 1.12;
/** Recuperação: EMA abaixo de budget × 0.82 SUSTENTADA sobe a escala. */
export const DRS_RECOVER_RATIO = 0.82;
/** Passos assimétricos: desce 12% de uma vez (resposta rápida), sobe 5%
 * (espalha a recuperação por várias janelas — nunca passa do ponto estável). */
export const DRS_STEP_DOWN = 0.12;
export const DRS_STEP_UP = 0.05;
/** Dwell entre mudanças: descida ≥0.9 s (máx ~1 mudança/s), subida ≥2.5 s. */
export const DRS_DWELL_DOWN_S = 0.9;
export const DRS_DWELL_UP_S = 2.5;
/** Sustentação exigida p/ cada direção (s). */
export const DRS_OVERLOAD_HOLD_S = 0.6;
export const DRS_RECOVER_HOLD_S = 2.5;

/** Auto-tier: com DRS no piso, EMA > budget × 1.35 por 6 s desce o tier;
 * subida exige EMA < budget × 0.65 por 20 s na escala máxima — um mundo
 * vazio não deve empurrar o tier pra cima no meio do combate seguinte. */
export const TIER_OVERLOAD_RATIO = 1.35;
export const TIER_RECOVER_RATIO = 0.65;
export const TIER_OVERLOAD_HOLD_S = 6;
export const TIER_RECOVER_HOLD_S = 20;
/** Dwell mínimo ENTRE mudanças de tier (s) — troca de tier reconfigura
 * sombras/pós-FX (custo pontual); evitar encadear trocas. */
export const TIER_DWELL_S = 10;

const TIERS_ORDER = ['low', 'medium', 'high'];

/** Monitor de frametime com EMA de constante de TEMPO (não de frames):
 * alpha = 1 − exp(−dt/τ), τ=0.5 s — igualmente estável a 30 e 144 Hz.
 * Aquecimento (30 primeiras amostras válidas) descarta hitches de carga de
 * mundo; dt > 0.5 s (aba em background) é descartado, não diluído. */
export class FrametimeMonitor {
  constructor({ tau = 0.5, warmupFrames = 30 } = {}) {
    this.tau = tau;
    this.warmupFrames = warmupFrames;
    this.reset();
  }
  reset() {
    this.ema = null;            // ms
    this.samples = 0;           // amostras válidas desde o reset
    this.spikes = 0;            // frames > budget×1.5 desde o reset (telemetria)
    this._overloadHold = 0;
    this._recoverHold = 0;
  }
  /** Alimenta com um dt (s) válido (0 < dt ≤ 0.5). Retorna a EMA (ms) ou null. */
  push(dt, budgetMs = 15) {
    const ms = dt * 1000;
    if (!Number.isFinite(ms) || ms <= 0 || ms > 500) return this.ema;
    this.samples += 1;
    const alpha = 1 - Math.exp(-dt / this.tau);
    this.ema = this.ema == null ? ms : this.ema + alpha * (ms - this.ema);
    if (ms > budgetMs * 1.5) this.spikes += 1;
    return this.ema;
  }
  get warmed() { return this.samples >= this.warmupFrames; }
  fps() { return this.ema == null ? null : 1000 / this.ema; }
}

/** Decisão DRS pura. `state` carrega os acumuladores de sustentação entre
 * frames ({ overloadHold, recoverHold, lastChangeAgo }); a função NUNCA
 * muta inputs — devolve { scale, changed, reason, state }. */
export function drsDecision({ emaMs, budgetMs = 15, scale = 1, state = {}, dt = 0 } = {}) {
  const overloadHold = (state.overloadHold ?? 0) + dt;
  const recoverHold = (state.recoverHold ?? 0) + dt;
  const lastChangeAgo = (state.lastChangeAgo ?? Infinity) + dt;
  const next = { overloadHold, recoverHold, lastChangeAgo };
  if (!Number.isFinite(emaMs) || emaMs == null) {
    return { scale, changed: false, reason: 'warmup', state: next };
  }
  const overloaded = emaMs > budgetMs * DRS_OVERLOAD_RATIO;
  const recovering = emaMs < budgetMs * DRS_RECOVER_RATIO;
  if (overloaded) { next.overloadHold = overloadHold; next.recoverHold = 0; }
  else if (recovering) { next.recoverHold = recoverHold; next.overloadHold = 0; }
  else { next.overloadHold = 0; next.recoverHold = 0; }
  // descida: sustentou overload E dwell de descida respeitado
  if (overloaded && overloadHold >= DRS_OVERLOAD_HOLD_S && lastChangeAgo >= DRS_DWELL_DOWN_S && scale > DRS_MIN) {
    const ns = Math.max(DRS_MIN, scale - DRS_STEP_DOWN);
    return { scale: ns, changed: ns !== scale, reason: 'overload', state: { overloadHold: 0, recoverHold: 0, lastChangeAgo: 0 } };
  }
  // subida: folga SUSTENTADA E dwell de subida respeitado
  if (recovering && recoverHold >= DRS_RECOVER_HOLD_S && lastChangeAgo >= DRS_DWELL_UP_S && scale < DRS_MAX) {
    const ns = Math.min(DRS_MAX, scale + DRS_STEP_UP);
    return { scale: ns, changed: ns !== scale, reason: 'recover', state: { overloadHold: 0, recoverHold: 0, lastChangeAgo: 0 } };
  }
  return { scale, changed: false, reason: overloaded ? 'overload-hold' : recovering ? 'recover-hold' : 'stable', state: next };
}

/** Decisão de tier pura. Só age quando o DRS já está no PISO (a alternativa
 * estrutural é o tier) — downgrade; ou folga longa na escala máxima — upgrade.
 * Devolve { tier, changed, reason, state } (estado: hold/dwell acumulados). */
export function tierDecision({ emaMs, budgetMs = 15, tier = 'high', drsScale = 1, state = {}, dt = 0 } = {}) {
  const idx = TIERS_ORDER.indexOf(tier);
  const overloadHold = (state.overloadHold ?? 0) + dt;
  const recoverHold = (state.recoverHold ?? 0) + dt;
  const lastChangeAgo = (state.lastChangeAgo ?? Infinity) + dt;
  const next = { overloadHold, recoverHold, lastChangeAgo };
  if (!Number.isFinite(emaMs) || emaMs == null) return { tier, changed: false, reason: 'warmup', state: next };
  const atFloor = drsScale <= DRS_MIN + 1e-6;
  const atCeil = drsScale >= DRS_MAX - 1e-6;
  const overloaded = emaMs > budgetMs * TIER_OVERLOAD_RATIO;
  const recovering = emaMs < budgetMs * TIER_RECOVER_RATIO;
  if (overloaded && atFloor) { next.overloadHold = overloadHold; } else { next.overloadHold = 0; }
  if (recovering && atCeil) { next.recoverHold = recoverHold; } else { next.recoverHold = 0; }
  // downgrade: overload sustentado NO PISO do DRS
  if (idx > 0 && next.overloadHold >= TIER_OVERLOAD_HOLD_S && lastChangeAgo >= TIER_DWELL_S) {
    return { tier: TIERS_ORDER[idx - 1], changed: true, reason: 'overload', state: { overloadHold: 0, recoverHold: 0, lastChangeAgo: 0 } };
  }
  // upgrade: folga sustentada NO TETO do DRS (jogador voltou pra máquina boa)
  if (idx < TIERS_ORDER.length - 1 && next.recoverHold >= TIER_RECOVER_HOLD_S && lastChangeAgo >= TIER_DWELL_S) {
    return { tier: TIERS_ORDER[idx + 1], changed: true, reason: 'recover', state: { overloadHold: 0, recoverHold: 0, lastChangeAgo: 0 } };
  }
  return { tier, changed: false, reason: next.overloadHold > 0 ? 'overload-hold' : next.recoverHold > 0 ? 'recover-hold' : 'stable', state: next };
}

/** Orçamento de frametime do tier. */
export function budgetFor(tier = 'high') { return BUDGET_MS[tier] ?? BUDGET_MS.high; }

/** Limitador de taxa genérico (minimapa 30 Hz, telemetria HUD 2 Hz, apply do
 * DRS ≥150 ms). ready(now) só passa uma vez por intervalo. */
export class RateLimiter {
  constructor(intervalMs) { this.interval = intervalMs; this.last = -Infinity; }
  ready(now = performance.now()) {
    if (now - this.last >= this.interval) { this.last = now; return true; }
    return false;
  }
}

/** Plano de pós-FX por tier — única fonte de verdade usada pelo createPostFX.
 * Corrige o achado G2 da revisão: o main3d passava quality:'high' HARDCODED,
 * fazendo o tier MEDIUM pagar SSR completo (custo de GPU alto demais p/ o
 * ganho visual em telas de touch). SSR permanece exclusivo do high. */
export function postFxPlanFor(tier = 'high') {
  if (tier === 'high') return { ssr: true, bloomStrength: 0.24, grain: 0.022 };
  if (tier === 'medium') return { ssr: false, bloomStrength: 0.18, grain: 0.016 };
  return null; // low: render direto, sem composer
}
