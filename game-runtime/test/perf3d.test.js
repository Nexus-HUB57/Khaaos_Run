// Fase 34 — testes do laço de performance adaptativa (perf3d, módulo PURO).
// Cobre: EMA de constante de tempo, DRS (convergência, histerese, piso/teto,
// anti-oscilação num simulador de carga de 600 frames), auto-tier assimétrico
// (downgrade só no PISO do DRS; upgrade exige folga LONGA no TETO), RateLimiter
// e o plano de pós-FX por tier (achado G2: SSR exclusivo do high).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrametimeMonitor, drsDecision, tierDecision, budgetFor, RateLimiter, postFxPlanFor,
  DRS_MIN, DRS_MAX, BUDGET_MS,
} from '../src/game3d/perf3d.js';

const MS = (dt) => dt * 1000;

// ---------- FrametimeMonitor ----------
test('[perf] EMA converge para o frametime real (constante de tempo, não de frames)', () => {
  const m = new FrametimeMonitor();
  const dt = 20 / 1000; // 20 ms constantes
  let ema;
  for (let i = 0; i < 400; i++) ema = m.push(dt, 15);
  assert.ok(Math.abs(ema - 20) < 0.5, `EMA=${ema} deve convergir p/ 20ms`);
  assert.equal(Math.round(m.fps()), 50);
});

test('[perf] EMA descarta hitches de aba (dt > 0.5 s) sem contaminar a média', () => {
  const m = new FrametimeMonitor();
  for (let i = 0; i < 60; i++) m.push(16 / 1000, 15);
  const before = m.ema;
  m.push(2.5, 15);               // aba em background — deve ser ignorado
  assert.equal(m.ema, before);
  m.push(17 / 1000, 15);
  assert.ok(m.ema > 0 && m.ema < 50);
});

test('[perf] warmup: 30 amostras válidas antes de decidir', () => {
  const m = new FrametimeMonitor({ warmupFrames: 30 });
  for (let i = 0; i < 29; i++) m.push(16 / 1000, 15);
  assert.equal(m.warmed, false);
  m.push(16 / 1000, 15);
  assert.equal(m.warmed, true);
  m.reset();
  assert.equal(m.warmed, false);
  assert.equal(m.ema, null);
});

// ---------- DRS — decisões unitárias ----------
const fresh = () => ({ overloadHold: 0, recoverHold: 0, lastChangeAgo: Infinity });

test('[perf] DRS: não reage antes da sustentação (0.6 s de overload)', () => {
  const st = fresh();
  let out = { scale: 1, state: st };
  for (let i = 0; i < 35; i++) out = drsDecision({ emaMs: 24, budgetMs: 15, scale: out.scale, state: out.state, dt: 1 / 60 });
  assert.equal(out.scale, 1, '0.58 s de overload ainda não basta');
  for (let i = 0; i < 3; i++) out = drsDecision({ emaMs: 24, budgetMs: 15, scale: out.scale, state: out.state, dt: 1 / 60 });
  assert.equal(out.scale, Math.max(DRS_MIN, 1 - 0.12), '0.63 s cruza o hold e desce');
});

test('[perf] DRS: piso 0.55 e teto 1.0 nunca são ultrapassados', () => {
  let out = { scale: 0.6, state: fresh() };
  for (let i = 0; i < 600; i++) out = drsDecision({ emaMs: 40, budgetMs: 15, scale: out.scale, state: out.state, dt: 1 / 30 });
  assert.ok(out.scale >= DRS_MIN - 1e-9);
  let up = { scale: 0.98, state: fresh() };
  for (let i = 0; i < 600; i++) up = drsDecision({ emaMs: 8, budgetMs: 15, scale: up.scale, state: up.state, dt: 1 / 30 });
  assert.ok(up.scale <= DRS_MAX + 1e-9);
  assert.equal(up.scale, DRS_MAX);
});

// ---------- DRS — simulador de carga (600 frames) ----------
// Carga sintética: frametime = f(scale) + ruído, modelando GPU (custo cresce
// com a resolução). PhD: o laço fechado deve CONVERGIR perto do orçamento com
// NÚMERO LIMITADO de mudanças (sem oscillation), e recuperar escala 1.0 quando
// a carga some.
function simulate({ emaBaseMs = 17.5, noiseMs = 1.2, frames = 600, dt = 1 / 60 } = {}) {
  let scale = 1;
  let state = fresh();
  let ema = null;
  const mon = new FrametimeMonitor();
  let changes = 0;
  for (let i = 0; i < frames; i++) {
    // custo cresce com a escala (piso 0.55 → ~0.83× do custo de 1.0) + ruído
    const frameMs = emaBaseMs * (0.62 + 0.38 * scale) + Math.sin(i * 0.7) * noiseMs;
    ema = mon.push(frameMs / 1000, 15);
    if (mon.warmed) {
      const d = drsDecision({ emaMs: ema, budgetMs: 15, scale, state, dt });
      state = d.state;
      if (d.changed) changes++;
      scale = d.scale;
    }
  }
  return { scale, changes, ema };
}

test('[perf] DRS simulador: carga sustentada converge SEM oscilar (≤8 mudanças em 600 frames)', () => {
  const { scale, changes, ema } = simulate({ emaBaseMs: 17.5 });
  assert.ok(changes <= 8, `mudanças=${changes} — histerese deve evitar ping-pong`);
  assert.ok(scale < 0.95, `escala deve cair (final=${scale})`);
  assert.ok(ema < 15 * 1.25, `EMA final ${ema?.toFixed(1)}ms deve aproximar do orçamento`);
});

test('[perf] DRS simulador: carga leve mantém escala máxima (zero mudanças)', () => {
  const { scale, changes } = simulate({ emaBaseMs: 10, frames: 400 });
  assert.equal(changes, 0, 'nada a fazer em machine confortável');
  assert.equal(scale, 1);
});

test('[perf] DRS simulador: stall único de ~96 ms não cruza o limiar (escala intocada)', () => {
  // 60 frames ok, 4 frames a 24 ms (GC curto / compilação de shader), normal.
  // Com τ=0.5 s a EMA pica em ~14.1 ms — abaixo do limiar de overload
  // (budget 15 × 1.12 = 16.8) — e o hold de 0.6 s nunca começa a contar.
  // Stalls MAIORES que isso (≥200 ms) crossing o limiar e PODEM descer um
  // passo único de 12% — coberto pelo teste de converge (reação esperada).
  let scale = 1, state = fresh(), changes = 0, ema_ = null;
  const mon = new FrametimeMonitor();
  let peak = 0;
  for (let i = 0; i < 600; i++) {
    const base = (i >= 60 && i < 64) ? 24 : 12;
    ema_ = mon.push(base / 1000, 15);
    peak = Math.max(peak, ema_ ?? 0);
    if (mon.warmed) {
      const d = drsDecision({ emaMs: ema_, budgetMs: 15, scale, state, dt: 1 / 60 });
      state = d.state; if (d.changed) changes++; scale = d.scale;
    }
  }
  assert.ok(peak < 16.8, `pico da EMA ${peak.toFixed(1)}ms deve ficar sob o limiar`);
  assert.equal(changes, 0, `stall curto não deve mudar escala (changes=${changes})`);
  assert.equal(scale, 1);
});

test('[perf] DRS simulador: recuperação sobe de volta ao teto quando a carga cessa', () => {
  let scale = 1, state = fresh(), ema_ = null;
  const mon = new FrametimeMonitor();
  // fase 1: overload pesado até cravar o piso
  for (let i = 0; i < 400; i++) {
    ema_ = mon.push(30 / 1000, 15);
    if (mon.warmed) {
      const d = drsDecision({ emaMs: ema_, budgetMs: 15, scale, state, dt: 1 / 60 });
      state = d.state; scale = d.scale;
    }
  }
  assert.equal(scale, DRS_MIN, 'overload cravado deve chegar ao piso');
  // fase 2: carga some — 2000 frames cobrem a decaída da EMA + 9 passos de
  // subida (cada um exige 2.5 s de folga sustentada + dwell de 2.5 s)
  for (let i = 0; i < 2000; i++) {
    ema_ = mon.push(8 / 1000, 15);
    const d = drsDecision({ emaMs: ema_, budgetMs: 15, scale, state, dt: 1 / 60 });
    state = d.state; scale = d.scale;
  }
  assert.equal(scale, DRS_MAX, 'folga sustentada deve reconstruir nitidez até 100%');
});

// ---------- auto-tier ----------
test('[perf] tier: NÃO desce com DRS fora do piso (a alternativa estrutural é o último recurso)', () => {
  const st = fresh();
  let out = { tier: 'high', state: st };
  for (let i = 0; i < 2000; i++) out = tierDecision({ emaMs: 60, budgetMs: 15, tier: 'high', drsScale: 0.8, state: out.state, dt: 1 / 60 });
  assert.equal(out.tier, 'high', 'DRS ainda tem margem — tier não muda');
});

test('[perf] tier: desce high→medium com overload sustentado NO PISO do DRS', () => {
  const st = fresh();
  let out = { tier: 'high', state: st };
  let ema_ = null;
  for (let i = 0; i < 1200; i++) {
    ema_ = 35; // budget 15 → 2.3× (acima do TIER_OVERLOAD_RATIO 1.35)
    out = tierDecision({ emaMs: ema_, budgetMs: 15, tier: out.tier, drsScale: DRS_MIN, state: out.state, dt: 1 / 60 });
    if (out.changed) break;
  }
  assert.equal(out.tier, 'medium');
  assert.equal(out.reason, 'overload');
});

test('[perf] tier: upgrade exige folga LONGA no teto (anti ping-pong em carga senoidal)', () => {
  // carga senoidal cruzando o orçamento: nenhum lado sustenta — tier deve ficar parado
  let out = { tier: 'medium', state: fresh() };
  let changes = 0;
  for (let i = 0; i < 3600; i++) { // 60 s
    const ms = 15 * (1 + Math.sin(i / 40) * 0.9); // oscila 1.5..27ms
    out = tierDecision({ emaMs: ms, budgetMs: 15, tier: out.tier, drsScale: out.state.recoverHold > 0 ? 1 : DRS_MIN, state: out.state, dt: 1 / 60 });
    if (out.changed) changes++;
  }
  assert.equal(changes, 0, `carga senoidal não deve trocar tier (changes=${changes})`);
});

test('[perf] tier: upgrade medium→high após 20 s de folga no teto', () => {
  let out = { tier: 'medium', state: fresh() };
  for (let i = 0; i < 1500; i++) out = tierDecision({ emaMs: 7, budgetMs: 15, tier: out.tier, drsScale: 1, state: out.state, dt: 1 / 60 });
  assert.equal(out.tier, 'high');
});

// ---------- orçamento + RateLimiter ----------
test('[perf] budgetFor: high/medium 15 ms, low 22 ms; tier desconhecido cai no high', () => {
  assert.equal(budgetFor('high'), BUDGET_MS.high);
  assert.equal(budgetFor('medium'), BUDGET_MS.medium);
  assert.equal(budgetFor('low'), BUDGET_MS.low);
  assert.equal(budgetFor('xpto'), BUDGET_MS.high);
});

test('[perf] RateLimiter: intervalo mínimo respeitado (~30 passes/s a 33 ms)', () => {
  const rl = new RateLimiter(33);
  let passed = 0;
  for (let t = 0; t <= 1000; t += 1) if (rl.ready(t)) passed++;
  assert.ok(passed >= 29 && passed <= 32, `passed=${passed} (esperado ~31)`);
});

// ---------- plano de pós-FX (achado G2) ----------
test('[perf] postFxPlanFor: SSR exclusivo do high; low não tem composer', () => {
  assert.deepEqual(postFxPlanFor('low'), null);
  const med = postFxPlanFor('medium');
  assert.equal(med.ssr, false, 'medium NÃO paga SSR (G2)');
  assert.ok(med.bloomStrength > 0 && med.bloomStrength < 0.24);
  const hi = postFxPlanFor('high');
  assert.equal(hi.ssr, true);
  assert.ok(hi.bloomStrength > med.bloomStrength);
});
