// Khaaos Run — Fase 61: ZONA SEGURA NO CÂNON DE CADA MUNDO (fim do anel genérico).
// ==============================================================================
// Problema: a sim fechava o anel com um schedule ÚNICO para os 5 mundos
// (pulsos de 45 s, raio 168−30×pulso, dano (4+1.4×pulso)×mult) — a "zona
// segura" não obedecia à especificação oficial de cada cenário
// (shared/worlds.ts safeZonePhases) e a parede era sempre a mesma grade
// amarela, que não é o visual canônico de nenhum mundo.
//
// Cânon (SSOT = shared/worlds.ts, 5 fases × 120 s = 600 s por Ring):
//   CIGKV     "Calibração Inicial → Colapso ZU"           1000→700→450→220→60  dps 1/2/5/10/20
//   Barburhen "Anel Industrial → Colapso da Refinaria"    1500→1000→600→300→50 dps 1/2/5/10/20
//   Priadus   "Neblina Crescente → Coração do Templo"     1750→1200→750→380→60 dps 1.5/3/6/12/25
//   Ckesalth  "Duna Exterior → Vila Sombria Suffocada"    2000→1350→800→400→65 dps 2/4/8/15/30
//   Arukheea  "Maré Baixa → Prisão do Sol da Noite"       2250→1500→900→450→70 dps 2.5/5/10/18/40
//
// O mapa do runtime é uma arena condensada (WORLD.size 400, anel inicial 170),
// então os raios oficiais são projetados PRESERVANDO A FRAÇÃO DO RAIO CANÔNICO
// de cada fase sobre a janela jogável [floor 42, start 170]:
//   arena_i = 42 + (raioOficial_i / raioOficial_0) × (170 − 42)
// O DPS é o número OFICIAL por fase (sem multiplicador legado) — o contraste
// entre mundos (W4 colapsa a 40 dps vs CIGKV 20) vem do cânon.
//
// Encolhimento CONTÍNUO dentro da fase (como no servidor MatchFlow):
// radiusFrom → radiusTo por smoothstep da fase — a zona segura DIMINUI sem
// saltos, e o centro deriva em passos de fase para o setor canônico do mundo.
//
// Headless-safe: puro e determinístico (zero THREE, zero Math.random).
export const PHASE_COUNT = 5;
export const PHASE_SECONDS = 120;
export const TOTAL_SECONDS = PHASE_COUNT * PHASE_SECONDS; // 600 — contrato F42
export const ARENA_RING_START = 170;  // raio inicial do anel na arena runtime
export const ARENA_RING_FLOOR = 42;   // colapso final (mesmo piso do runtime F42)

// Cânon por mundo — verbatim de shared/worlds.ts safeZonePhases (nome, raio em
// metros, dano por segundo). Qualquer mudança no contrato vira falha no
// teste de paridade tests/official/safezone-parity.test.ts.
export const CANON_PHASES = Object.freeze({
  CIGKV: Object.freeze([
    Object.freeze({ name: 'Calibração Inicial', radiusMeters: 1000, dps: 1.0 }),
    Object.freeze({ name: 'Compressão Alfa', radiusMeters: 700, dps: 2.0 }),
    Object.freeze({ name: 'Compressão Beta', radiusMeters: 450, dps: 5.0 }),
    Object.freeze({ name: 'Fechamento Crítico', radiusMeters: 220, dps: 10.0 }),
    Object.freeze({ name: 'Colapso ZU', radiusMeters: 60, dps: 20.0 }),
  ]),
  Barburhen: Object.freeze([
    Object.freeze({ name: 'Anel Industrial 1', radiusMeters: 1500, dps: 1.0 }),
    Object.freeze({ name: 'Anel Industrial 2', radiusMeters: 1000, dps: 2.0 }),
    Object.freeze({ name: 'Anel Ácido 3', radiusMeters: 600, dps: 5.0 }),
    Object.freeze({ name: 'Anel Térmico 4', radiusMeters: 300, dps: 10.0 }),
    Object.freeze({ name: 'Colapso da Refinaria', radiusMeters: 50, dps: 20.0 }),
  ]),
  Priadus: Object.freeze([
    Object.freeze({ name: 'Neblina Crescente 1', radiusMeters: 1750, dps: 1.5 }),
    Object.freeze({ name: 'Neblina Crescente 2', radiusMeters: 1200, dps: 3.0 }),
    Object.freeze({ name: 'Esporos Densos 3', radiusMeters: 750, dps: 6.0 }),
    Object.freeze({ name: 'Floresta Sufocante 4', radiusMeters: 380, dps: 12.0 }),
    Object.freeze({ name: 'Coração do Templo', radiusMeters: 60, dps: 25.0 }),
  ]),
  Ckesalth: Object.freeze([
    Object.freeze({ name: 'Duna Exterior 1', radiusMeters: 2000, dps: 2.0 }),
    Object.freeze({ name: 'Duna Exterior 2', radiusMeters: 1350, dps: 4.0 }),
    Object.freeze({ name: 'Areia Movediça 3', radiusMeters: 800, dps: 8.0 }),
    Object.freeze({ name: 'Refinaria em Chamas 4', radiusMeters: 400, dps: 15.0 }),
    Object.freeze({ name: 'Vila Sombria Suffocada', radiusMeters: 65, dps: 30.0 }),
  ]),
  Arukheea: Object.freeze([
    Object.freeze({ name: "Maré Baixa 1", radiusMeters: 2250, dps: 2.5 }),
    Object.freeze({ name: "Maré Baixa 2", radiusMeters: 1500, dps: 5.0 }),
    Object.freeze({ name: "Tromba d'água 3", radiusMeters: 900, dps: 10.0 }),
    Object.freeze({ name: 'Tsunami Iminente 4', radiusMeters: 450, dps: 18.0 }),
    Object.freeze({ name: 'Prisão do Sol da Noite', radiusMeters: 70, dps: 40.0 }),
  ]),
});

/** Fração canônica do raio (raio da fase / raio da fase 0) — 1 → ~0.03-0.06. */
export function canonFraction(worldId, phaseIndex) {
  const phases = CANON_PHASES[worldId] ?? CANON_PHASES.CIGKV;
  const r0 = phases[0]?.radiusMeters ?? 1;
  const r = phases[phaseIndex]?.radiusMeters ?? r0;
  return r0 > 0 ? r / r0 : 1;
}

/** Raio de ARENA projetado da fração canônica sobre [floor, start]. */
export function arenaRadiusFor(worldId, phaseIndex) {
  const f = canonFraction(worldId, phaseIndex);
  return ARENA_RING_FLOOR + f * (ARENA_RING_START - ARENA_RING_FLOOR);
}

/**
 * Schedule de zona segura do mundo: 5 fases × 120 s com raio de arena, dps
 * oficial e nome canônico. `radiusFrom` = raio de abertura da fase (igual ao
 * alvo da fase anterior) — o anel desliza contínuo dentro da fase.
 */
export function scheduleFor(scenarioId) {
  const worldId = normalizeWorldId(scenarioId);
  const canon = CANON_PHASES[worldId] ?? CANON_PHASES.CIGKV;
  return canon.map((c, i) => Object.freeze({
    index: i,
    name: c.name,
    seconds: PHASE_SECONDS,
    radius: arenaRadiusFor(worldId, i),
    radiusFrom: i === 0 ? ARENA_RING_START : arenaRadiusFor(worldId, i - 1),
    dps: c.dps,
    startAt: i * PHASE_SECONDS,
    endAt: (i + 1) * PHASE_SECONDS,
  }));
}

export function normalizeWorldId(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'barburhen' || v === 'w1') return 'Barburhen';
  if (v === 'priadus' || v === 'w2') return 'Priadus';
  if (v === 'ckesalth' || v === 'w3') return 'Ckesalth';
  if (v === 'arukheea' || v === 'w4') return 'Arukheea';
  return 'CIGKV';
}

const smooth = (k) => k * k * (3 - 2 * k);

/**
 * Estado do anel no instante `elapsed` (segundos de COMBATE):
 * { index, name, dps, radius (interpolado contínuo), phaseProgress }.
 * Depois da última fase o anel fica no raio de colapso com o dps final.
 */
export function phaseStateAt(schedule, elapsed) {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const e = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const last = schedule[schedule.length - 1];
  if (e >= last.endAt) {
    return { index: last.index, name: last.name, dps: last.dps, radius: last.radius, radiusFrom: last.radiusFrom, radiusTo: last.radius, phaseProgress: 1, active: false };
  }
  const idx = Math.min(schedule.length - 1, Math.floor(e / PHASE_SECONDS));
  const ph = schedule[idx];
  const local = e - ph.startAt;
  const progress = Math.max(0, Math.min(1, local / PHASE_SECONDS));
  const radius = ph.radiusFrom + (ph.radius - ph.radiusFrom) * smooth(progress);
  return { index: ph.index, name: ph.name, dps: ph.dps, radius, radiusFrom: ph.radiusFrom, radiusTo: ph.radius, phaseProgress: progress, active: true };
}

/**
 * Deriva do centro do anel para o setor canônico do mundo em PASSOS DE FASE
 * (0, ¼, ½, ¾, 1 do caminho até ringFinal) — o anel FECHA SOBRE o setor
 * canônico (README, dinâmica de cada mundo).
 */
export function centerDrift(scenario, phaseIndex) {
  const fin = scenario?.ringFinal;
  if (!fin) return null;
  const k = Math.max(0, Math.min(1, phaseIndex / (PHASE_COUNT - 1)));
  return { x: fin.x * k, z: fin.z * k };
}
