// Khaaos Run — Task 65: PARIDADE DA ZONA CANÔNICA NO SERVIDOR (room3d).
//
// Gap fechado nesta task: o servidor online (?online=1) usava o schedule
// LEGADO (pulsos de 45 s, raio 168−30×pulso, dano (4+1.4×pulso)) enquanto a
// sim offline já usava o cânon F61 (5 fases × 120 s, safeZone.js). Este teste
// trava a paridade servidor↔sim↔SSOT:
//   • room.zone === scheduleFor(scenario.id) (5 fases, nomes e dps oficiais);
//   • raio interpolado contínuo (smoothstep) dentro da fase;
//   • DPS OFICIAL por fase na danação de ring (sem multiplicador legado);
//   • deriva do centro por fase ao setor canônico (ringFinal);
//   • doutrina MPZEX Opção B preservada (salas cap-2 sem bots: fases 3×).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { scheduleFor, phaseStateAt, arenaRadiusFor } from '../src/game3d/safeZone.js';
import { disembarcarSala } from './helpers/zuProtocolo.js';

const DT = 1 / 20;

const makeRoom = ({ scenarioId = 'CIGKV', capacity = 16, botFill = 2, squad = false } = {}) => {
  // botFill ≥ 2: com 1 humano e 0 bots a sala encerra no 1º tick (último vivo)
  const room = new MatchRoom3D({
    id: `zone-${scenarioId}-${Math.random().toString(36).slice(2, 7)}`,
    seed: 'ZONE-CANON', region: 'sa-east', capacity, botFill, airdrop: false, squad, scenarioId,
  });
  room.addPlayer('p1', 'PILOTO');
  return room;
};

test('zone canon: sala nasce no schedule OFICIAL do mundo (5 fases × 120 s)', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const room = makeRoom({ scenarioId });
    const expected = scheduleFor(scenarioId);
    assert.equal(room.zone.length, 5, `${scenarioId}: 5 fases canônicas`);
    assert.deepEqual(room.zone, expected, `${scenarioId}: schedule 1:1 com safeZone.js`);
    assert.equal(room.zonePhaseScale, 1, 'sala normal: fases canônicas intactas');
    assert.equal(room.ring.dps, expected[0].dps, 'dps inicial = oficial');
    assert.equal(room.ring.phaseName, expected[0].name, 'nome da fase inicial = canônico');
  }
});

test('zone canon: ring encolhe CONTINUAMENTE e cruza a fase 1 em 120 s de combate', () => {
  const room = makeRoom({ scenarioId: 'CIGKV' });
  room.start('p1', 'belt');
  disembarcarSala(room, 'p1');
  room.zoneElapsed = 119.999; // cruza a fronteira da fase 1 (120 s canônicos)
  room.tick(DT);
  assert.equal(room.ring.pulse, 2, 'fase 1 canônica = pulso 2');
  assert.equal(room.ring.phaseName, 'Compressão Alfa', 'nome canônico da fase 1 do CIGKV');
  assert.ok(room.ring.target < 170 && room.ring.target > 120, `alvo da fase 1 projetado da fração oficial (131.6) — achado ${room.ring.target.toFixed(1)}`);
  assert.ok(Math.abs(room.ring.target - arenaRadiusFor('CIGKV', 1)) < .01, 'raio-alvo = projeção da fração canônica');
  // encolhimento contínuo: amostra 30 s dentro da fase 1 — nenhum salto > 0.5 m/tick
  const radii = [];
  for (let i = 0; i < 600; i++) { room.tick(DT); radii.push(room.ring.radius); }
  let maxStep = 0;
  for (let i = 1; i < radii.length; i++) maxStep = Math.max(maxStep, radii[i - 1] - radii[i]);
  assert.ok(maxStep < 0.5, `sem saltos de raio (maior passo ${maxStep.toFixed(3)} m/tick)`);
  assert.ok(room.ring.radius < 170 && room.ring.radius > room.ring.target - 1e-6, 'raio entre a abertura e o alvo da fase');
});

test('zone canon: DPS OFICIAL por fase fere fora do anel (sem multiplicador legado)', () => {
  const room = makeRoom({ scenarioId: 'Ckesalth' }); // dps oficiais 2/4/8/15/30
  room.start('p1', 'belt');
  disembarcarSala(room, 'p1');
  const p = room.humans.get('p1');
  p.x = 195; p.z = 0; // fora do anel inicial (170)
  room.zoneElapsed = 0;
  const life0 = p.life;
  room.tick(DT); // fase 0 dps 2.0
  const dmg0 = life0 - p.life;
  assert.ok(Math.abs(dmg0 - 2 * DT) < 1e-9, `dps 2 oficial da fase 0 (achado ${dmg0.toFixed(4)}, esperado ${(2 * DT).toFixed(4)})`);
  assert.notEqual(dmg0, (4 + room.ring.pulse * 1.4) * DT, 'NÃO usa a fórmula legada (4+1.4×pulso)');
});

test('zone canon: centro do anel deriva em passos de fase ao setor canônico (ringFinal)', () => {
  const room = makeRoom({ scenarioId: 'Barburhen' }); // ringFinal = Parque Abandonado (-100, 95)
  room.start('p1', 'belt');
  disembarcarSala(room, 'p1');
  room.zoneElapsed = 0.001;
  room.tick(DT);
  assert.equal(room.ring.pulse, 1, 'fase 0 = pulso 1');
  assert.ok(room.ring.x === 0, `fase 0: centro no início (achado ${room.ring.x})`);
  room.zoneElapsed = 121; // cruza para fase 1 (¼ do caminho)
  room.tick(DT);
  assert.equal(room.ring.pulse, 2);
  assert.ok(Math.abs(room.ring.x - (-100 * .25)) < 1e-9 && Math.abs(room.ring.z - 95 * .25) < 1e-9,
    'deriva ¼ para o Parque Abandonado no passo de fase');
});

test('zone canon: MPZEX Opção B — salas cap-2 sem bots têm fases 3× mais longas', () => {
  const room = new MatchRoom3D({ id: 'zone-optb', seed: 'ZONE-OPB', region: 'sa-east', capacity: 2, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'A'); room.addPlayer('p2', 'B');
  room.start('p1', 'belt');
  assert.equal(room.zonePhaseScale, 3, 'doutrina MPZEX §4 preservada no cânon');
  // 180 s REAIS de combate ÷ escala 3 = 60 s canônicos → ainda na fase 0 (120 s)
  room.zoneElapsed = 180;
  room.tick(DT);
  assert.equal(room.ring.pulse, 1, 'fase 0 canônica dura 360 s na Opção B (3 × 120)');
  assert.equal(room.ring.phaseName, room.zone[0].name);
  // sala NORMAL (escala 1) aos mesmos 180 s canônicos já está na fase 1
  const normal = makeRoom({ scenarioId: 'CIGKV' });
  normal.start('p1', 'belt');
  normal.zoneElapsed = 180;
  normal.tick(DT);
  assert.ok(normal.ring.pulse >= 2, 'sala normal já está na fase 1 aos 180 s');
});

test('zone canon: snapshot expõe phaseName/dps e o ringState do espectador traz nextPhaseIn canônico', () => {
  const room = makeRoom({ scenarioId: 'Arukheea' });
  room.start('p1', 'belt');
  disembarcarSala(room, 'p1');
  room.zoneElapsed = 0.001;
  room.tick(DT);
  const snap = room.snapshot('p1');
  assert.equal(snap.ring.phaseName, 'Maré Baixa 1', 'fase 0 canônica de Arukheea');
  assert.equal(snap.ring.dps, 2.5, 'dps oficial da fase 0');
  const spec = room.spectatorSnapshot?.() ?? {};
  if (spec.ringState) {
    assert.ok(spec.ringState.nextPhaseIn > 0 && spec.ringState.nextPhaseIn <= 120, 'nextPhaseIn dentro da fase canônica de 120 s');
    assert.equal(spec.ringState.phaseName, 'Maré Baixa 1');
  }
});

test('zone canon: paridade contínua com phaseStateAt (raio do servidor = matemática do safeZone)', () => {
  const room = makeRoom({ scenarioId: 'Priadus' });
  room.start('p1', 'belt');
  const schedule = scheduleFor('Priadus');
  // sem disembarcarSala: combate TRAVADO (grace do trem) — zoneElapsed não
  // avança no tick, então cada amostra é EXATA (o estado da zona é aplicado
  // 1:1 com phaseStateAt no instante e).
  for (const e of [0, 30, 119.9, 120.1, 240, 360.5, 480.9, 599, 700]) {
    room.zoneElapsed = Math.max(0, e - DT); // o tick soma dt (combate liberado) — compensa p/ amostrar exatamente e
    room.tick(DT);
    const expected = phaseStateAt(schedule, e);
    assert.ok(Math.abs(room.ring.radius - expected.radius) < 1e-6, `t=${e}: raio servidor = safeZone (${room.ring.radius.toFixed(6)} vs ${expected.radius.toFixed(6)})`);
    assert.equal(room.ring.phaseName, expected.name);
    assert.equal(room.ring.dps, expected.dps);
  }
});
