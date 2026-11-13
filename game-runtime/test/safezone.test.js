// Fase 61 — ZONA SEGURA NO CÂNON DO MUNDO: contrato do safeZone.js + integração
// com a sim (encolhimento contínuo, dps oficial por fase, eventos com nome).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  CANON_PHASES,
  PHASE_COUNT,
  PHASE_SECONDS,
  TOTAL_SECONDS,
  ARENA_RING_START,
  ARENA_RING_FLOOR,
  canonFraction,
  arenaRadiusFor,
  scheduleFor,
  phaseStateAt,
  centerDrift,
  normalizeWorldId,
} = await import('../src/game3d/safeZone.js');

test('F61 · 5 mundos com 5 fases × 120 s = 600 s', () => {
  assert.equal(Object.keys(CANON_PHASES).length, 5);
  assert.equal(PHASE_COUNT * PHASE_SECONDS, TOTAL_SECONDS);
  for (const phases of Object.values(CANON_PHASES)) {
    assert.equal(phases.length, 5);
    for (const p of phases) {
      assert.ok(p.radiusMeters > 0);
      assert.ok(p.dps > 0);
      assert.ok(p.name.length > 0);
    }
  }
});

test('F61 · frações canônicas: CIGKV 0.06 colapso · W4 0.031 colapso', () => {
  assert.ok(Math.abs(canonFraction('CIGKV', 4) - 60 / 1000) < 1e-9);
  assert.ok(Math.abs(canonFraction('Arukheea', 4) - 70 / 2250) < 1e-9);
  assert.ok(Math.abs(canonFraction('Ckesalth', 2) - 800 / 2000) < 1e-9);
});

test('F61 · arenaRadiusFor projeta fração sobre [42, 170] e começa em 170', () => {
  for (const id of Object.keys(CANON_PHASES)) {
    assert.ok(Math.abs(arenaRadiusFor(id, 0) - ARENA_RING_START) < 1e-9, `${id} fase 0 = start`);
    const last = arenaRadiusFor(id, 4);
    assert.ok(last > ARENA_RING_FLOOR && last < ARENA_RING_FLOOR + 10, `${id} colapso ${last.toFixed(1)}`);
  }
  // fase 2 do CIGKV: fração .45 → 42 + .45×128 = 99.6
  assert.ok(Math.abs(arenaRadiusFor('CIGKV', 2) - (42 + .45 * 128)) < 1e-9);
});

test('F61 · scheduleFor: janelas contíguas 0/120/240/360/480 e contínuas', () => {
  for (const id of Object.keys(CANON_PHASES)) {
    const sched = scheduleFor(id);
    assert.equal(sched.length, 5);
    assert.equal(sched[0].radiusFrom, ARENA_RING_START);
    for (let i = 1; i < 5; i++) {
      assert.ok(Math.abs(sched[i].radiusFrom - sched[i - 1].radius) < 1e-9);
      assert.equal(sched[i].startAt, i * PHASE_SECONDS);
      assert.equal(sched[i].endAt, (i + 1) * PHASE_SECONDS);
    }
  }
});

test('F61 · phaseStateAt: fase 0 segura no anel inicial; fases 1-4 encolhem', () => {
  const sched = scheduleFor('CIGKV');
  assert.equal(phaseStateAt(sched, 0).index, 0);
  assert.ok(Math.abs(phaseStateAt(sched, 0).radius - 170) < 1e-9);
  // cânon: fase 0 = raio inicial (1000 m canônico = 170 arena) — sem encolhimento
  assert.ok(Math.abs(phaseStateAt(sched, 60).radius - 170) < 1e-9, 'fase 0 segura');
  const mid = phaseStateAt(sched, 180); // metade da fase 1 (Compressão Alfa)
  assert.equal(mid.index, 1);
  assert.ok(mid.radius < 170 && mid.radius > sched[1].radius, 'interpolado entre 170 e o alvo da fase');
  const p3 = phaseStateAt(sched, 400);
  assert.equal(p3.index, 3);
  assert.equal(p3.name, 'Fechamento Crítico');
  const end = phaseStateAt(sched, 999);
  assert.equal(end.index, 4);
  assert.equal(end.active, false);
  assert.ok(Math.abs(end.radius - sched[4].radius) < 1e-9);
});

test('F61 · normalizeWorldId aceita IDs canônicos e operacionais', () => {
  assert.equal(normalizeWorldId('w2'), 'Priadus');
  assert.equal(normalizeWorldId('Ckesalth'), 'Ckesalth');
  assert.equal(normalizeWorldId('arukheea'), 'Arukheea');
  assert.equal(normalizeWorldId('???'), 'CIGKV');
});

test('F61 · centerDrift deriva em passos até o setor canônico', () => {
  const sc = { ringFinal: { x: -100, z: 95, name: 'Parque Abandonado' } };
  const steps = [0, 1, 2, 3, 4].map((i) => centerDrift(sc, i));
  assert.ok(Math.abs(steps[0].x) < 1e-9, 'fase 0 no centro');
  assert.ok(Math.abs(steps[2].x + 50) < 1e-9, 'metade do caminho');
  assert.ok(Math.abs(steps[4].x + 100) < 1e-9);
  assert.ok(Math.abs(steps[4].z - 95) < 1e-9);
  assert.equal(centerDrift({}, 2), null);
});

// -------------------------------------------------- integração com a sim ----
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { disembarcarSim } from './helpers/zuProtocolo.js'; // Task 53 — protocolo oficial do trem

function simPronto(seed, scenarioId, { bots = 0 } = {}) {
  // bots 0 + spectate false: ninguém elimina o jogador em idle — a sim corre
  // os 600 s para o teste exercitar o schedule completo da zona segura
  const sim = new KhaaosSim3D({ seed, scenarioId, botCount: bots, airdrop: false, spectate: false });
  sim.start('belt');
  disembarcarSim(sim); // protocolo ZU cumprido — combate liberado
  return sim;
}

function runSeconds(sim, seconds, { standOutside = false } = {}) {
  const dt = 1 / 30;
  sim.consumeEvents(); // limpa eventos pré-existentes (protocolo do trem)
  if (standOutside) { sim.player.x = sim.ring.x + sim.ring.radius + 20; sim.player.z = sim.ring.z; }
  const r0 = sim.ring.radius;
  const radii = [];
  for (let i = 0; i < seconds * 30; i++) {
    sim.step({ ...DEFAULT_INPUT }, dt);
    radii.push(sim.ring.radius);
  }
  const events = sim.consumeEvents().filter((e) => e.type === 'pulse');
  return { events, radii, r0, hpLost: 100 - sim.player.life };
}

test('F61 SIM · fase 0 segura no anel inicial e fases seguintes encolhem CONTINUAMENTE', () => {
  const sim = simPronto('f61-ring', 'CIGKV');
  assert.equal(sim.zone.length, 5);
  const { radii } = runSeconds(sim, 150); // fase 0 completa + metade da fase 1
  assert.ok(Math.abs(radii[0] - 170) < 1e-6, `começa em 170 (${radii[0]})`);
  // fase 0 (primeiros 120 s): anel seguro NO RAIO INICIAL (cânon)
  for (let i = 0; i < 120 * 30; i += 30) assert.ok(Math.abs(radii[i] - 170) < 1e-6, `fase 0 segura em ${i / 30}s`);
  // fase 1 (Compressão Alfa): encolhimento contínuo
  assert.ok(radii[radii.length - 1] < 170 - 1, `diminuiu (${radii[radii.length - 1].toFixed(2)})`);
  for (let i = 1; i < radii.length; i++) assert.ok(radii[i] <= radii[i - 1] + 1e-9, `monotônico em ${i}`);
});

test('F61 SIM · 5 fases de 120 s com dps OFICIAL por mundo', () => {
  const sim = simPronto('f61-phases', 'Arukheea');
  assert.equal(sim.zone[0].name, 'Maré Baixa 1');
  assert.equal(sim.zone[4].name, 'Prisão do Sol da Noite');
  assert.ok(Math.abs(sim.zone[4].dps - 40) < 1e-9, 'colapso W4 = 40 dps');
  assert.ok(Math.abs(sim.zone[0].dps - 2.5) < 1e-9);
  sim.step({ ...DEFAULT_INPUT }, 1 / 30);
  assert.ok(Math.abs(sim.ring.dps - 2.5) < 1e-6, `dps corrente ${sim.ring.dps}`);
  assert.equal(sim.ring.phaseName, 'Maré Baixa 1');
});

test('F61 SIM · eventos pulse carregam fase oficial, dps e destino canônico', () => {
  const sim = simPronto('f61-events', 'Priadus');
  const { events } = runSeconds(sim, 3);
  assert.ok(events.length >= 1, 'primeira fase emite ao destravar combate');
  const e0 = events[0];
  assert.equal(e0.phaseName, 'Neblina Crescente 1');
  assert.equal(e0.finalName, 'Templo Antigo');
  assert.equal(e0.pulse, 1);
});

test('F61 SIM · dano de anel = dps OFICIAL da fase (fora do raio)', () => {
  const sim = simPronto('f61-dmg', 'CIGKV');
  const { hpLost } = runSeconds(sim, 10, { standOutside: true });
  // fase 0 CIGKV = 1 dps × 10 s = 10 hp
  assert.ok(Math.abs(hpLost - 10) < 1.2, `dano 10 s a 1 dps → ${hpLost.toFixed(2)} hp`);
});

test('F61 SIM · centro deriva ao setor canônico nas fases finais', () => {
  const sim = simPronto('f61-drift', 'Barburhen');
  const dt = 1 / 30;
  // avança direto para a fase final (480 s)
  sim.zoneElapsed = 479;
  for (let i = 0; i < 3 * 30; i++) sim.step({ ...DEFAULT_INPUT }, dt);
  // fase 4 → k = 1 → centro = ringFinal
  assert.ok(Math.abs(sim.ring.x - sim.scenario.ringFinal.x) < 1e-6, `x=${sim.ring.x}`);
  assert.ok(Math.abs(sim.ring.z - sim.scenario.ringFinal.z) < 1e-6, `z=${sim.ring.z}`);
  assert.equal(sim.ring.pulse, 5);
});
