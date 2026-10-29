// Khaaos Run — Fase 26 — CALIBRAÇÃO DO DIRETOR POR MÉTRICAS REAIS (margem/pesos).
// ================================================================================
// A Fase 24 deu ao /admin visibilidade do que o diretor FEZ (cortes por motivo/
// hazard, reservas manuais, liga/desliga). A Fase 26 fecha o loop: o próprio
// diretor usa essas métricas REAIS para recalibrar a margem de re-corte e os
// pesos de perigo — calibrateDirector() puro + heartbeat do SpectatorRemote.
//
// Cobertura:
//   1. puro — amostra mínima, twitchy, faminto, plateia escrava, fadiga,
//      reversão à média, clamps das bandas, determinismo e pureza;
//   2. hierarquia — os pesos NUNCA invertem knocked > hazardDamage > … em
//      nenhum ponto alcançável das bandas;
//   3. cliente — SpectatorRemote recalibra no heartbeat com métricas reais e
//      expõe a afinação em getMetrics().tuning (frame DIRECTOR_METRICS).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const {
  calibrateDirector,
  calibrateTuningDefaultsForTest: _unusedAlias,
  DIRECTOR_TUNING_LIMITS,
  CALIBRATION_THRESHOLDS,
  DANGER_WEIGHTS,
  AUTO_RETARGET_MARGIN,
  dangerScore,
} = await import('../src/game3d/spectator3d.js');

const T = CALIBRATION_THRESHOLDS;

// ---------- fixtures ----------
// cortes com X% de escalada (o resto em hazard-start)
const cuts = (total, escalations, extra = {}) => ({
  cuts: { total, byReason: { 'hazard-start': total - escalations, 'hazard-escalation': escalations }, ...extra },
  manual: { followSelects: 0, cycles: 0 },
  toggles: { on: 1, off: 0 },
});

describe('calibrateDirector — puro', () => {
  test('amostra insuficiente (< minCutsSample) → nada muda', () => {
    const cur = { margin: 25, weights: { ...DANGER_WEIGHTS } };
    for (const total of [0, 1, T.minCutsSample - 1]) {
      const m = cuts(total, total); // 100% escalada — twitchy se houvesse amostra
      const out = calibrateDirector(m, cur);
      assert.equal(out.margin, 25, `total=${total} sem amostra não mexe`);
      assert.deepEqual(out.weights, DANGER_WEIGHTS);
      assert.deepEqual(out.actions, []);
    }
  });

  test('twitchy — escalada ≥45% dos cortes → margem SOBE um passo', () => {
    const out = calibrateDirector(cuts(20, 10), { margin: 25, weights: { ...DANGER_WEIGHTS } });
    assert.equal(out.margin, 30, '25 + step 5');
    assert.deepEqual(out.actions, ['margin-up:twitchy']);
  });

  test('faminto — escalada rara COM navegação manual → margem DESCE', () => {
    const m = cuts(20, 2); // 10% escalada
    m.manual = { followSelects: 3, cycles: 1 };
    const out = calibrateDirector(m, { margin: 25, weights: { ...DANGER_WEIGHTS } });
    assert.equal(out.margin, 20, '25 - step 5');
    assert.ok(out.actions.includes('margin-down:starved'));
  });

  test('plateia escrava — manual > 1.2× cortes → margem desce de novo', () => {
    const m = cuts(10, 4); // 40% escalada (não twitchy… na fronteira: >=.45? 4/10=.4 → cai no else)
    m.manual = { followSelects: 10, cycles: 4 }; // pressão 1.4
    const out = calibrateDirector(m, { margin: 25, weights: { ...DANGER_WEIGHTS } });
    // twitchy não (0.4 < 0.45); sem manualTotal o starved não dispararia, mas
    // manualTotal>0 com 0.4 > .15 → starved NÃO (rate > low). Só plateia escrava.
    assert.equal(out.margin, 20);
    assert.deepEqual(out.actions, ['margin-down:manual-pressure']);
  });

  test('fadiga — AUTO off ≥ 2× on → margem sobe + pesos menores descem', () => {
    const m = cuts(16, 4); // 25% escalada — neutro
    m.toggles = { on: 1, off: 4 };
    m.manual = { followSelects: 2, cycles: 0 }; // pressão .125 — não domina
    const out = calibrateDirector(m, { margin: 25, weights: { ...DANGER_WEIGHTS } });
    assert.equal(out.margin, 30);
    assert.equal(out.weights.recentDamage, DANGER_WEIGHTS.recentDamage - 2);
    assert.equal(out.weights.lowHealth, DANGER_WEIGHTS.lowHealth - 1);
    assert.ok(out.actions.includes('margin-up:fatigue'));
    assert.ok(out.actions.includes('weight-down:recentDamage'));
    assert.ok(out.actions.includes('weight-down:lowHealth'));
  });

  test('recepção boa — reversão à média (um passo por calibração)', () => {
    const m = cuts(20, 5); // 25% — meio termo; manual 0; on≥off
    const out = calibrateDirector(m, { margin: 35, weights: { ...DANGER_WEIGHTS } });
    assert.equal(out.margin, 30, '35 → 30 (um passo em direção a 25, sem ultrapassar)');
    assert.deepEqual(out.actions, ['margin-revert:healthy']);
  });

  test('reversão nunca ultrapassa o padrão da Fase 19', () => {
    const m = cuts(20, 5);
    const out = calibrateDirector(m, { margin: 27, weights: { ...DANGER_WEIGHTS } });
    assert.equal(out.margin, 25, '27 - 5 clampeado ao alvo 25 (não 22)');
  });

  test('clamps: margem presa em [10, 45] após muitas iterações twitchy', () => {
    let cur = { margin: 25, weights: { ...DANGER_WEIGHTS } };
    for (let i = 0; i < 12; i++) cur = calibrateDirector(cuts(30, 20), cur);
    assert.equal(cur.margin, DIRECTOR_TUNING_LIMITS.margin.max, 'teto 45');
    // e do outro lado: faminto contínuo → piso 10
    let low = { margin: 25, weights: { ...DANGER_WEIGHTS } };
    for (let i = 0; i < 12; i++) {
      const m = cuts(20, 1);
      m.manual = { followSelects: 1, cycles: 0 };
      low = calibrateDirector(m, low);
    }
    assert.equal(low.margin, DIRECTOR_TUNING_LIMITS.margin.min, 'piso 10');
  });

  test('bandas de pesos: recentDamage/lowHealth presos nos mínimos após fadiga contínua', () => {
    let cur = { margin: 25, weights: { ...DANGER_WEIGHTS } };
    for (let i = 0; i < 10; i++) {
      const m = cuts(16, 4);
      m.toggles = { on: 0, off: 3 };
      cur = calibrateDirector(m, cur);
    }
    assert.equal(cur.weights.recentDamage, DIRECTOR_TUNING_LIMITS.weights.recentDamage.min);
    assert.equal(cur.weights.lowHealth, DIRECTOR_TUNING_LIMITS.weights.lowHealth.min);
    // hierarquia intacta mesmo nos extremos
    assert.ok(cur.weights.knocked > cur.weights.hazardDamage);
    assert.ok(cur.weights.hazardDamage > cur.weights.anchorZone);
    assert.ok(cur.weights.anchorZone > cur.weights.outsideRing);
    assert.ok(cur.weights.outsideRing > cur.weights.recentDamage);
    assert.ok(cur.weights.recentDamage > cur.weights.lowHealth);
  });

  test('hierarquia em TODOS os vértices das bandas (nocaute > … > vida baixa)', () => {
    const L = DIRECTOR_TUNING_LIMITS.weights;
    const vertices = [
      { knocked: L.knocked.min, hazardDamage: L.hazardDamage.min, anchorZone: L.anchorZone.min, outsideRing: L.outsideRing.min, recentDamage: L.recentDamage.min, lowHealth: L.lowHealth.min },
      { knocked: L.knocked.max, hazardDamage: L.hazardDamage.max, anchorZone: L.anchorZone.max, outsideRing: L.outsideRing.max, recentDamage: L.recentDamage.max, lowHealth: L.lowHealth.max },
    ];
    for (const v of vertices) {
      assert.ok(v.knocked > v.hazardDamage);
      assert.ok(v.hazardDamage > v.anchorZone);
      assert.ok(v.anchorZone > v.outsideRing);
      assert.ok(v.outsideRing > v.recentDamage);
      assert.ok(v.recentDamage > v.lowHealth);
    }
  });

  test('determinismo + pureza: mesmo input → mesmo output, sem mutar argumentos', () => {
    const metrics = cuts(20, 10);
    metrics.toggles = { on: 1, off: 3 };
    const cur = { margin: 25, weights: { ...DANGER_WEIGHTS } };
    const metricsSnapshot = JSON.stringify(metrics);
    const curSnapshot = JSON.stringify(cur);
    const a = calibrateDirector(metrics, cur);
    const b = calibrateDirector(metrics, cur);
    assert.deepEqual(a, b, 'mesmo input → mesmo output');
    assert.equal(JSON.stringify(cur), curSnapshot, 'current nunca mutado');
    assert.equal(JSON.stringify(metrics), metricsSnapshot, 'metrics nunca mutado');
  });

  test('pesos calibrados alimentam o dangerScore (ctx.weights)', () => {
    const p = { id: 'x', health: 100 };
    const ctxBase = { prevHealth: { x: 100 }, ringState: null };
    // hazardDamage na banda mínima (25) via calibração — clamp mantém intáctil
    const tuned = calibrateDirector(cuts(20, 10), { margin: 25, weights: { hazardDamage: 25 } });
    assert.equal(tuned.weights.hazardDamage, 25, 'banda aceita 25 (default 35)');
    const withWeights = dangerScore({ ...p, health: 80 }, { ...ctxBase, hazard: { hazard: 'tsunami' }, weights: tuned.weights });
    const withDefault = dangerScore({ ...p, health: 80 }, { ...ctxBase, hazard: { hazard: 'tsunami' } });
    assert.equal(withDefault, DANGER_WEIGHTS.hazardDamage, 'default: só dano sob hazard');
    assert.equal(withWeights, tuned.weights.hazardDamage, 'peso calibrado é respeitado');
    assert.notEqual(withWeights, withDefault, 'calibração muda a decisão');
  });
});

// ---------- 2. cliente: heartbeat recalibra com métricas reais ----------

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
const directorMsgs = (ws) => ws.sent.filter((m) => m.type === 'DIRECTOR_METRICS');
const player = (over = {}) => ({
  id: 'p1', displayName: 'KHAEL VANCE', species: 'kv',
  posX: 0, posY: 0, yaw: 0, health: 100, shield: 0,
  isDowned: false, isEliminated: false, kills: 0, ...over,
});
const batch = (players, events = [], ts = Date.now()) => ({
  type: 'SPECTATOR_BATCH', data: { players, ringState: { currentPhase: 0, currentRadius: 520, ringCenter: [0, 0, 0], isShrinking: false, nextPhaseIn: 30 } }, events, timestamp: ts,
});
const tsunamiStart = (ts = 1000) => ({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', submergeBelowY: 90, durationSeconds: 40 }, timestamp: ts });

describe('SpectatorRemote — afinação calibrada no heartbeat', () => {
  test('getMetrics() expõe tuning; margem default = Fase 19', async () => {
    const { SpectatorRemote } = await import('../src/game3d/spectator3d.js');
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 'spec_cal', delayMs: 10_000 });
    const m = r.getMetrics();
    assert.deepEqual(m.tuning, { margin: AUTO_RETARGET_MARGIN, weights: { ...DANGER_WEIGHTS } }, 'default Fase 19');
    ws.close();
  });

  test('heartbeat recalibra: transmissão twitchy → margem sobe no ar', async () => {
    const { SpectatorRemote } = await import('../src/game3d/spectator3d.js');
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 15 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 'spec_twitch', delayMs: 10_000 });
    // Gera 12 cortes por escalada (amostra ≥ 8, 100% escalada → twitchy).
    // Escalada exige: alvo vivo + alguém MUITO mais ameaçado (≥1 tier + margem).
    ws.message(batch([player({ id: 'seguido', health: 100 })], [tsunamiStart()]));
    for (let i = 0; i < 12; i++) {
      // derruba o seguido (score 40) e apresenta nocauteado + fora do ring pior (40+20)
      ws.message(batch([
        player({ id: 'seguido', health: 100 }),
        player({ id: 'pior', isDowned: true, posX: 900, health: 20 }),
      ]));
      // volta o estado (seguido vivo/ok, pior ok) p/ o próximo ciclo de escalada
      ws.message(batch([player({ id: 'seguido', health: 100 })]));
    }
    const cutsBefore = r.getMetrics().cuts;
    assert.ok(cutsBefore.total >= T.minCutsSample, `amostra real acumulada (${cutsBefore.total})`);
    assert.ok((cutsBefore.byReason['hazard-escalation'] ?? 0) >= T.minCutsSample, 'escaladas reais acumuladas');
    assert.equal(r.tuning.margin, AUTO_RETARGET_MARGIN, 'antes do 1º heartbeat: padrão');
    // aguarda o heartbeat recalibrar (15 ms) — twitchy persistente sobe
    // VÁRIOS passos (um por tick) — comportamento correto do laço contínuo
    await new Promise((res) => setTimeout(res, 60));
    assert.ok(
      r.tuning.margin > AUTO_RETARGET_MARGIN,
      `margem calibrada no ar (${r.tuning.margin} > ${AUTO_RETARGET_MARGIN})`,
    );
    assert.ok(r.tuning.margin <= DIRECTOR_TUNING_LIMITS.margin.max, 'clamp da banda respeitado');
    const frame = directorMsgs(ws).at(-1).metrics;
    assert.equal(frame.tuning.margin, r.tuning.margin, 'frame DIRECTOR_METRICS carrega a afinação');
    r.dispose();
  });
});
