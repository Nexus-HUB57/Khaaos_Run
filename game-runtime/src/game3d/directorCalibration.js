// Khaaos Run — Fase 39 — CÉREBRO DO DIRETOR (módulo PURO, sem three/DOM).
// ========================================================================
// A Fase 19 criou o diretor automático da transmissão; a Fase 24 abriu o
// transporte (DIRECTOR_METRICS client→server→/admin); a Fase 26 ensinou o
// diretor a se calibrar pelas métricas REAIS (margem/pesos) — mas só com o
// histórico LOCAL de cada espectador. A Fase 39 fecha o loop POPULACIONAL:
// o SERVIDOR agrega os relatórios de TODAS as conexões vivas, recalibra a
// afinação global e devolve o resultado em frames DIRECTOR_TUNING — toda a
// plateia converge para a mesma margem/pesos calibrados pelas estatísticas
// reais do node inteiro.
//
// Este módulo concentra tudo que é PURO e determinístico (importável pelo
// cliente E pelo servidor sem arrastar three):
//   • pesos de perigo + limiares + bandas (contrato Fase 19/26, intocado);
//   • calibrateDirector — as 6 regras de calibração (amostra mínima, twitchy,
//     duro demais, plateia escrava, fadiga, reversão à média);
//   • sanitizePopulationTuning — sanitização DEFENSIVA do frame
//     DIRECTOR_TUNING recebido pelo cliente: bandas clampadas + hierarquia
//     de pesos NUNCA invertida (payload do servidor também passa por
//     verificação — defesa em profundidade, e o contrato fica testável
//     headless em ambas as pontas).
//
// spectator3d.js re-exporta TUDO (contrato público das Fases 19–26
// preservado — nenhum import externo quebra).

// Fase 19 — pesos de perigo (score 0..∞, maior = mais urgente). A hierarquia
// knocked > hazardDamage > anchorZone > outsideRing > recentDamage > lowHealth
// é o contrato central: nenhuma calibração pode invertê-la.
export const DANGER_WEIGHTS = Object.freeze({
  knocked: 40,       // nocauteado — morrendo AGORA (finalização disponível)
  hazardDamage: 35,  // vida caiu com hazard ativo — o mundo está mordendo
  anchorZone: 30,    // dentro do raio de um pilar da anomalia Khaaos
  outsideRing: 20,   // fora do cerco — dano de ring garantido
  recentDamage: 15,  // vida caiu (combate) desde o batch anterior
  lowHealth: 10,     // vida ≤ LOW_HEALTH_THRESHOLD — à beira da eliminação
});
export const LOW_HEALTH_THRESHOLD = 30;

// Fase 19 — margem p/ RE-CORTE dentro do MESMO hazard: só troca de alvo quando
// alguém está MUITO mais ameaçado que o seguido (≥ 1 tier de peso + folga) —
// drama de diretor sem jitter por ruído (dano de ring 20 < margem; domo 30,
// nocaute 40 e dano sob hazard 35 ≥ margem).
export const AUTO_RETARGET_MARGIN = 25;

// ─── Fase 26 — calibração do diretor por métricas reais ────────────────────
//
// Regras (aplicadas nessa ordem, todas com clamp):
//
//   1. AMOSTRA MÍNIMA — menos de `minCutsSample` cortes = ruído, não mexe.
//   2. TWITCHY — escalada domina (≥ escalationHigh dos cortes): a margem sobe
//      `margin.step` (o diretor está trocando de alvo demais, drama vira jitter).
//   3. DURO DEMAIS — escalada rara (≤ escalationLow) COM navegação manual
//      ativa: a margem desce (a plateia está caçando drama que o diretor
//      não mostra).
//   4. PLATEIA ESCRAVA — intervenção manual > manualPressureHigh × cortes:
//      margem desce de novo (o diretor precisa reagir mais rápido para
//      SEGURAR o controle, não para cortar mais).
//   5. FADIGA — AUTO desligado ≥ fatigueOffDominance × ligado: o diretor
//      irrita — margem sobe E os pesos menores (recentDamage/lowHealth)
//      descem um degrau (cortes menos frequentes, só drama forte).
//   6. REVERSÃO À MÉDIA — recepção boa (sem extremos, manual baixo, AUTO
//      respeitado): a margem caminha um passo de volta p/ o padrão da Fase 19.
//
// Pesos movem por bandas (min/max/step por sinal) — nunca desmontam a
// hierarquia da Fase 19: nocaute > dano sob hazard > âncora > ring > dano
// recente > vida baixa. Tudo inteiro, clampado e determinístico.

/** Bandas de movimentação (clamp + passo) por sinal — a hierarquia da Fase 19
 *  nunca inverte: min/max preservam knocked > hazardDamage > anchorZone >
 *  outsideRing > recentDamage > lowHealth em QUALQUE ponto das bandas. */
export const DIRECTOR_TUNING_LIMITS = Object.freeze({
  margin: Object.freeze({ min: 10, max: 45, step: 5 }),
  weights: Object.freeze({
    knocked: Object.freeze({ min: 30, max: 55, step: 3 }),
    hazardDamage: Object.freeze({ min: 25, max: 45, step: 3 }),
    anchorZone: Object.freeze({ min: 20, max: 40, step: 2 }),
    outsideRing: Object.freeze({ min: 12, max: 30, step: 2 }),
    recentDamage: Object.freeze({ min: 8, max: 24, step: 2 }),
    lowHealth: Object.freeze({ min: 5, max: 16, step: 1 }),
  }),
});

export const CALIBRATION_THRESHOLDS = Object.freeze({
  minCutsSample: 8,     // abaixo disso as métricas são ruído — nada muda
  escalationHigh: .45,  // ≥45% dos cortes são escalada → twitchy (margem ↑)
  escalationLow: .15,   // ≤15% com navegação manual ativa → duro (margem ↓)
  manualPressureHigh: 1.2, // manual > 1.2× cortes → plateia escrava (margem ↓)
  fatigueOffDominance: 2,  // AUTO off ≥ 2× on → fadiga (margem ↑ + pesos menores ↓)
  manualPressureLow: .6,   // manual < .6× cortes → recepção boa (reversão)
});

const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));

/**
 * Calibra margem/pesos do diretor a partir das métricas REAIS da transmissão
 * (frames DIRECTOR_METRICS da Fase 24). PURO e determinístico: mesmo input →
 * mesmo output; nunca muta os argumentos.
 *
 * @param {{ cuts?: { total?: number, byReason?: object }, manual?: { followSelects?: number, cycles?: number }, toggles?: { on?: number, off?: number } }} metrics
 * @param {{ margin?: number, weights?: object }} current afinação vigente (default Fase 19)
 * @param {object} [thresholds] sobrescrita p/ testes (CALIBRATION_THRESHOLDS)
 * @returns {{ margin: number, weights: object, actions: string[] }} afinação calibrada
 */
export function calibrateDirector(metrics = {}, current = {}, thresholds = CALIBRATION_THRESHOLDS) {
  const L = DIRECTOR_TUNING_LIMITS;
  const baseWeights = { ...DANGER_WEIGHTS, ...(current?.weights ?? {}) };
  const out = { margin: clampInt(current?.margin ?? AUTO_RETARGET_MARGIN, L.margin.min, L.margin.max), weights: {}, actions: [] };
  for (const k of Object.keys(L.weights)) out.weights[k] = clampInt(baseWeights[k], L.weights[k].min, L.weights[k].max);

  const total = Math.max(0, Math.floor(metrics?.cuts?.total ?? 0));
  if (total < thresholds.minCutsSample) return out; // amostra insuficiente — nada muda

  const byReason = metrics?.cuts?.byReason ?? {};
  const escalations = Math.max(0, Math.floor(byReason['hazard-escalation'] ?? 0));
  const escalationRate = escalations / total;
  const manualSelects = Math.max(0, Math.floor(metrics?.manual?.followSelects ?? 0));
  const manualCycles = Math.max(0, Math.floor(metrics?.manual?.cycles ?? 0));
  const manualTotal = manualSelects + manualCycles;
  const manualPressure = manualTotal / total;
  const togglesOn = Math.max(0, Math.floor(metrics?.toggles?.on ?? 0));
  const togglesOff = Math.max(0, Math.floor(metrics?.toggles?.off ?? 0));

  const bump = (key, dir) => {
    const band = L.weights[key];
    const next = clampInt(out.weights[key] + dir * band.step, band.min, band.max);
    if (next !== out.weights[key]) out.weights[key] = next;
  };
  const moveMargin = (dir, action) => {
    const next = clampInt(out.margin + dir * L.margin.step, L.margin.min, L.margin.max);
    if (next !== out.margin) { out.margin = next; out.actions.push(action); }
  };

  // 2. TWITCHY — diretor troca de alvo demais dentro do mesmo hazard
  if (escalationRate >= thresholds.escalationHigh) moveMargin(+1, 'margin-up:twitchy');
  // 3. DURO DEMAIS — plateia caça drama que o diretor não mostra
  else if (escalationRate <= thresholds.escalationLow && manualTotal > 0) moveMargin(-1, 'margin-down:starved');
  // 4. PLATEIA ESCRAVA — intervenções manuais dominam os cortes
  if (manualPressure > thresholds.manualPressureHigh) moveMargin(-1, 'margin-down:manual-pressure');
  // 5. FADIGA — AUTO desligado dominou: menos cortes, só drama forte
  if (togglesOff >= thresholds.fatigueOffDominance && togglesOff >= togglesOn * thresholds.fatigueOffDominance) {
    moveMargin(+1, 'margin-up:fatigue');
    bump('recentDamage', -1); out.actions.push('weight-down:recentDamage');
    bump('lowHealth', -1); out.actions.push('weight-down:lowHealth');
  }
  // 6. REVERSÃO À MÉDIA — recepção boa: volta um passo p/ o padrão da Fase 19
  if (
    escalationRate > thresholds.escalationLow && escalationRate < thresholds.escalationHigh
    && manualPressure < thresholds.manualPressureLow && togglesOn >= togglesOff
  ) {
    const target = AUTO_RETARGET_MARGIN;
    if (out.margin !== target) {
      const dir = target > out.margin ? 1 : -1;
      const next = clampInt(out.margin + dir * L.margin.step, L.margin.min, L.margin.max);
      // passo SÓ na direção do padrão e sem ultrapassá-lo
      const snapped = dir > 0 ? Math.min(next, target) : Math.max(next, target);
      if (snapped !== out.margin) { out.margin = snapped; out.actions.push('margin-revert:healthy'); }
    }
  }
  return out;
}

// ─── Fase 39 — sanitizePopulationTuning (frame DIRECTOR_TUNING) ────────────

const WEIGHT_ORDER = Object.freeze(Object.keys(DIRECTOR_TUNING_LIMITS.weights));

/**
 * Sanitiza o frame DIRECTOR_TUNING (servidor → cliente) DEFENSIVAMENTE:
 * margem e pesos de TODOS os sinais canônicos são obrigatórios (contrato do
 * frame de população), clampados nas bandas da Fase 26 e reordenados para que
 * a hierarquia da Fase 19 NUNCA inverta — mesmo com payload hostil/corrompido
 * (defesa em profundidade: o servidor é confiável, o transporte não).
 *
 * PURO e determinístico; nunca lança. Retorna null p/ frames inválidos
 * (o cliente IGNORA — a afinação local permanece).
 *
 * @param {{ margin?: unknown, weights?: Record<string, unknown> }} raw frame recebido
 * @returns {{ margin: number, weights: object } | null} afinação sanitizada
 */
export function sanitizePopulationTuning(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Number.isFinite(raw.margin)) return null;                 // contrato: margem obrigatória
  if (!raw.weights || typeof raw.weights !== 'object') return null;
  const L = DIRECTOR_TUNING_LIMITS;
  const margin = clampInt(raw.margin, L.margin.min, L.margin.max);
  const weights = {};
  let prev = Infinity; // hierarquia: cada peso estritamente ABAIXO do anterior
  for (const k of WEIGHT_ORDER) {
    const v = raw.weights[k];
    if (!Number.isFinite(v)) return null; // contrato: os 6 sinais sempre presentes
    const band = L.weights[k];
    const clamped = Math.min(band.max, Math.max(band.min, Math.round(v)));
    const w = Math.max(band.min, Math.min(clamped, prev - 1)); // nunca inverte a ordem
    weights[k] = w;
    prev = w;
  }
  return { margin, weights };
}

/**
 * Score de perigo de um jogador do pipeline (0..∞, maior = mais urgente).
 * Puro e determinístico: o mesmo payload gera sempre o MESMO score.
 * ctx: { hazard: { hazard, anchors?, anchorRadius? } | null,
 *        ringState: { ringCenter: [x,y,z], currentRadius } | null,
 *        prevHealth: { [id]: vida do batch anterior },
 *        weights: pesos calibrados (default: DANGER_WEIGHTS) }
 */
export function dangerScore(p = {}, ctx = {}) {
  const { hazard = null, ringState = null, prevHealth = {} } = ctx;
  // Fase 26 — pesos calibrados pelo histórico real (default: padrão da Fase 19)
  const W = (ctx.weights && typeof ctx.weights === 'object' ? ctx.weights : DANGER_WEIGHTS);
  let score = 0;
  if (p.isDowned) score += W.knocked;
  // dano recente: vida caiu desde o último batch (histórico do remote)
  const before = prevHealth[String(p.id)];
  const dropped = Number.isFinite(before) && (p.health ?? 0) < before - .5;
  if (dropped) score += hazard ? W.hazardDamage : W.recentDamage;
  // anomalia Khaaos: PERIGO GEOMÉTRICO — dentro do domo de um pilar é dano certo
  if (hazard?.hazard === 'gravity' && Array.isArray(hazard.anchors) && hazard.anchors.length > 0) {
    const r = Number.isFinite(hazard.anchorRadius) ? hazard.anchorRadius : 28;
    if (hazard.anchors.some((a) => Math.hypot((p.posX ?? 0) - (a.x ?? 0), (p.posY ?? 0) - (a.z ?? 0)) <= r)) {
      score += W.anchorZone;
    }
  }
  // ring: fora do cerco é dano garantido (dados autoritativos do batch)
  if (ringState && Array.isArray(ringState.ringCenter)) {
    const cx = ringState.ringCenter[0] ?? 0, cz = ringState.ringCenter[2] ?? 0;
    const radius = Number.isFinite(ringState.currentRadius) ? ringState.currentRadius : Infinity;
    if (Math.hypot((p.posX ?? 0) - cx, (p.posY ?? 0) - cz) > radius) score += W.outsideRing;
  }
  if ((p.health ?? 0) <= LOW_HEALTH_THRESHOLD) score += W.lowHealth;
  return score;
}

/** Ordem de urgência (vivos apenas): score desc → abates desc → vida ASC
 *  (mais ferido = mais urgente) → id (determinismo byte a byte). */
export function prioritizeByHazard(players = [], ctx = {}) {
  return (players ?? [])
    .filter((p) => p && !p.isEliminated)
    .map((p) => ({ p, score: dangerScore(p, ctx) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.p.kills ?? 0) !== (a.p.kills ?? 0)) return (b.p.kills ?? 0) - (a.p.kills ?? 0);
      if ((a.p.health ?? 0) !== (b.p.health ?? 0)) return (a.p.health ?? 0) - (b.p.health ?? 0);
      return String(a.p.id).localeCompare(String(b.p.id));
    })
    .map((e) => e.p);
}

/** Alvo mais ameaçado (ou null — sem vivos). */
export function pickHazardTarget(players = [], ctx = {}) {
  return prioritizeByHazard(players, ctx)[0] ?? null;
}

/** Snapshot de vida p/ detectar dano entre batches (id → health). */
export function snapshotHealth(players = []) {
  const out = {};
  for (const p of players ?? []) if (p && p.id != null) out[String(p.id)] = p.health ?? 0;
  return out;
}
