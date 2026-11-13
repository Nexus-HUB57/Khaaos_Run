/**
 * Fase 61 — Paridade da ZONA SEGURA entre `shared/worlds.ts` (SSOT do contrato)
 * e o runtime (`game-runtime/src/game3d/safeZone.js`).
 *
 * O usuário canônico: "a safe área deve ir diminuindo de acordo com a
 * especificação de cada cenário". Este teste garante que a especificação
 * oficial (5 fases × 120 s com raios/dps por mundo) é EXATAMENTE a que o
 * runtime executa — qualquer drift vira falha vermelha.
 *
 * Anatomia:
 *   1. Nomes/dps/raios canônicos do safeZone.js == safeZonePhases do worlds.ts
 *   2. 5 fases × 120 s = 600 s (contrato F42) em todos os mundos
 *   3. Fração canônica do raio monotônica decrescente (a zona DIMINUI)
 *   4. Projecção de arena preserva a fração oficial (42 + f×(170−42))
 *   5. DPS oficiais crescem monotônicamente por mundo (colapso mais letal)
 *   6. O dps do mundo seguinte no pipeline é maior no colapso (W1..W4 escalonam)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { KHAAOS_WORLDS, type WorldId } from "../../shared/worlds.ts";
import {
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
} from "../../game-runtime/src/game3d/safeZone.js";

const WORLD_IDS: WorldId[] = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"];

test("F61 · safeZone.js é 1:1 com shared/worlds.ts safeZonePhases", () => {
  for (const id of WORLD_IDS) {
    const canon = KHAAOS_WORLDS[id].safeZonePhases;
    const runtime = CANON_PHASES[id];
    assert.equal(runtime.length, canon.length, `${id}: 5 fases`);
    for (let i = 0; i < canon.length; i++) {
      assert.equal(runtime[i].name, canon[i].phaseName, `${id} fase ${i}: nome canônico`);
      assert.equal(runtime[i].radiusMeters, canon[i].radiusMeters, `${id} fase ${i}: raio oficial`);
      assert.equal(runtime[i].dps, canon[i].damagePerSecond, `${id} fase ${i}: dps oficial`);
      assert.equal(canon[i].durationSeconds, PHASE_SECONDS, `${id} fase ${i}: 120 s`);
    }
  }
});

test("F61 · 5 fases × 120 s = 600 s em todos os mundos (contrato F42)", () => {
  assert.equal(PHASE_COUNT * PHASE_SECONDS, TOTAL_SECONDS);
  for (const id of WORLD_IDS) {
    const sum = KHAAOS_WORLDS[id].safeZonePhases.reduce((acc, p) => acc + p.durationSeconds, 0);
    assert.equal(sum, TOTAL_SECONDS, `${id}: soma das fases = 600 s`);
  }
});

test("F61 · a zona segura DIMINUI: fração canônica monotônica decrescente", () => {
  for (const id of WORLD_IDS) {
    let prev = 1;
    for (let i = 0; i < PHASE_COUNT; i++) {
      const f = canonFraction(id, i);
      assert.ok(f <= prev + 1e-9, `${id} fase ${i}: ${f} ≤ ${prev}`);
      prev = f;
    }
    const finalF = canonFraction(id, PHASE_COUNT - 1);
    assert.ok(finalF < 0.1, `${id}: colapso < 10% do raio inicial (${finalF.toFixed(3)})`);
  }
});

test("F61 · projecção de arena preserva a fração oficial sobre [42, 170]", () => {
  assert.equal(arenaRadiusFor("CIGKV", 0), ARENA_RING_START);
  for (const id of WORLD_IDS) {
    for (let i = 0; i < PHASE_COUNT; i++) {
      const expected = ARENA_RING_FLOOR + canonFraction(id, i) * (ARENA_RING_START - ARENA_RING_FLOOR);
      assert.ok(Math.abs(arenaRadiusFor(id, i) - expected) < 1e-9, `${id} fase ${i}`);
      assert.ok(arenaRadiusFor(id, i) >= ARENA_RING_FLOOR - 1e-9, `${id} fase ${i}: ≥ piso`);
    }
    const last = arenaRadiusFor(id, PHASE_COUNT - 1);
    assert.ok(last >= ARENA_RING_FLOOR && last < ARENA_RING_FLOOR + 10, `${id}: colapso jogável (${last.toFixed(1)} m)`);
  }
});

test("F61 · dps oficiais crescem e o colapso escala entre mundos do pipeline", () => {
  for (const id of WORLD_IDS) {
    const dps = KHAAOS_WORLDS[id].safeZonePhases.map((p) => p.damagePerSecond);
    for (let i = 1; i < dps.length; i++) assert.ok(dps[i] > dps[i - 1], `${id}: dps sobe (${dps[i]} > ${dps[i - 1]})`);
  }
  // W4 Arukheea colapsa ao dobro do CIGKV — contraste canônico entre mundos
  const cigkvFinal = KHAAOS_WORLDS.CIGKV.safeZonePhases[4].damagePerSecond;
  const arukFinal = KHAAOS_WORLDS.Arukheea.safeZonePhases[4].damagePerSecond;
  assert.ok(arukFinal > cigkvFinal, "Arukheea (W4) colapsa mais letal que o CIGKV");
});

test("F61 · scheduleFor devolve o schedule completo com janelas contíguas", () => {
  for (const id of WORLD_IDS) {
    const sched = scheduleFor(id);
    assert.equal(sched.length, PHASE_COUNT);
    assert.equal(sched[0].radiusFrom, ARENA_RING_START);
    for (let i = 1; i < sched.length; i++) {
      assert.ok(Math.abs(sched[i].radiusFrom - sched[i - 1].radius) < 1e-9, `${id} fase ${i}: contínua`);
      assert.equal(sched[i].startAt, i * PHASE_SECONDS);
    }
  }
});

test("F61 · phaseStateAt: encolhimento contínuo (smoothstep) e colapso estável", () => {
  const sched = scheduleFor("Arukheea"); // tromba d'água 3 → 900 m canônico
  const half = phaseStateAt(sched, PHASE_SECONDS * 2 + PHASE_SECONDS / 2);
  assert.equal(half?.index, 2);
  assert.equal(half?.name, "Tromba d'água 3");
  assert.ok(half!.radius < half!.radiusFrom! && half!.radius > half!.radiusTo!, "raio interpolado entre bordas da fase");
  const after = phaseStateAt(sched, TOTAL_SECONDS + 500);
  assert.equal(after?.index, 4);
  assert.ok(Math.abs(after!.radius - sched[4].radius) < 1e-9, "pós-colapso fixo no raio final");
  assert.equal(after?.active, false);
});

test("F61 · centerDrift: o anel FECHA SOBRE o setor canônico do mundo", () => {
  const priadus = { ringFinal: { x: 100, z: 95, name: "Templo Antigo" } };
  const d0 = centerDrift(priadus, 0);
  const d4 = centerDrift(priadus, 4);
  assert.equal(d0?.x, 0);
  assert.equal(d4?.x, 100);
  assert.equal(d4?.z, 95);
  const semFinal = centerDrift({ ringFinal: undefined } as never, 2);
  assert.equal(semFinal, null);
});
