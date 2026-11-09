// Khaaos Run — Fase 42 — MUNDOS FIEIS AO README (contrato canônico).
//
// A diretiva desta fase: cada mundo (CIGKV + W1–W4) deve materializar 1:1 o
// que a seção "Ontologia dos Mundos" / "Mundos Oficiais (W1–W4)" do README
// promete — rótulos, setores, DINÂMICA ambiental e o SETOR onde o anel fecha.
// Este arquivo pinam o contrato para o futuro (regressão de fidelidade).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT, getWorldLayout } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { SCENARIOS, resolveScenario } from '../src/game3d/scenarios.js';
import { disembarcarSim, disembarcarSala } from './helpers/zuProtocolo.js'; // Task 53 — fixture do protocolo do trem

const TICK = 0.02;

test('README 1:1 — rótulos e mapLabels dos cinco mundos', () => {
  // CIGKV — "Khaaos Ville — Campo de Instrução de Guerra" (typo 'Khaoos' morto)
  assert.equal(SCENARIOS.CIGKV.mapLabel, 'Khaaos Ville');
  // W4 — "Arukheea (Ilha dos Gritos Calados)" ('Ilha GriCa' era abreviação)
  assert.equal(SCENARIOS.ARUKHEEA.mapLabel, 'Ilha dos Gritos Calados');
  assert.equal(SCENARIOS.BARBURHEN.label, 'Barburhen — O Mundo da Destruição');
  assert.equal(SCENARIOS.PRIADUS.label, 'Priadus — A Floresta da Escuridão');
  assert.equal(SCENARIOS.CKESALTH.label, 'Ckesalth — O Deserto das Almas Esquecidas');
  assert.equal(SCENARIOS.ARUKHEEA.label, 'Arukheea — A Ilha dos Gritos Calados');
});

test('README 1:1 — setores canônicos por mundo', () => {
  // CIGKV: Pátio de Armamento / Setor de Testes (Proving Grounds) / Parque Abandonado
  assert.deepEqual(SCENARIOS.CIGKV.sectorNames, ['Pátio de Armamento', 'Proving Grounds', 'Parque Abandonado', 'Urbano Denso', 'Terminal ZEX']);
  // W1: Área Urbana e Comercial / Setor Industrial / Parque Abandonado / ZEX (estação)
  assert.deepEqual(SCENARIOS.BARBURHEN.sectorNames, ['Área Urbana e Comercial', 'Setor Industrial', 'Parque Abandonado', 'Zona de Extração', 'Terminal ZEX']);
  // W2: Área Pantanosa / Bosque / Área de Caça + Templo Antigo
  assert.deepEqual(SCENARIOS.PRIADUS.sectorNames, ['Área Pantanosa', 'Bosque', 'Área de Caça', 'Templo Antigo', 'Terminal ZEX']);
  // W3: Resort / Vilarejo dos Beduínos / Refinaria / areia movediça (Plus− do README)
  assert.deepEqual(SCENARIOS.CKESALTH.sectorNames, ['Resort Abandonado', 'Vilarejo dos Beduínos', 'Refinaria de Petróleo', 'Areia Movediça', 'Terminal ZEX']);
  // W4: Bosque dos Perdidos / Prisão do Sol da Noite / Fábrica–Cemitério das Baleias
  assert.deepEqual(SCENARIOS.ARUKHEEA.sectorNames, ['Bosque dos Perdidos', 'Prisão do Sol da Noite', 'Fábrica / Cemitério das Baleias', 'Marina Fantasma', 'Terminal ZEX']);
});

test('README 1:1 — DINÂMICA ambiental de cada Ring', () => {
  // W1 "Água da Morte": chuva ácida (id-gated no sim) + multiplicadores do mundo
  assert.equal(SCENARIOS.BARBURHEN.survival, undefined);
  assert.equal(SCENARIOS.BARBURHEN.krcMultiplier, 1.0);
  // W2 "Emboscada Verde": neblina com esporos tóxicos pune atraso (teto 90 m)
  assert.equal(SCENARIOS.PRIADUS.survival.type, 'SPORE_FOG');
  assert.equal(SCENARIOS.PRIADUS.survival.sporeTopY, 90);
  // W3 "Assassino Silencioso": fumaça tóxica (teto 180 m)
  assert.equal(SCENARIOS.CKESALTH.survival.type, 'TOXIC_SMOKE');
  assert.equal(SCENARIOS.CKESALTH.survival.smokeTopY, 180);
  // W4 "Tsunami": nível do mar sobe até 90 m
  assert.equal(SCENARIOS.ARUKHEEA.survival.type, 'TSUNAMI_WAVE');
  assert.equal(SCENARIOS.ARUKHEEA.survival.submergeBelowY, 90);
  // CIGKV "Pulso Khaaos": anomalia de gravidade (a cada pulso, alteração climática)
  assert.equal(SCENARIOS.CIGKV.survival.type, 'KHAOS_GRAVITY');
  assert.equal(SCENARIOS.CIGKV.survival.gravityScale, 0.35);
  assert.deepEqual(SCENARIOS.CIGKV.survival.anchors.map((a) => a.id), ['NEXUS', 'NORTH', 'EAST', 'WEST']);
});

test('README 1:1 — o anel FECHA sobre o setor canônico de cada mundo', () => {
  // "Água da Morte — anel fecha em direção ao Parque" (W1)
  assert.deepEqual({ ...SCENARIOS.BARBURHEN.ringFinal }, { x: -100, z: 95, name: 'Parque Abandonado' });
  // "Emboscada Verde — anel fecha no templo" (W2)
  assert.deepEqual({ ...SCENARIOS.PRIADUS.ringFinal }, { x: 100, z: 95, name: 'Templo Antigo' });
  // "Assassino Silencioso — anel fecha na Vila Sombria" (W3)
  assert.deepEqual({ ...SCENARIOS.CKESALTH.ringFinal }, { x: 95, z: -95, name: 'Vila Sombria' });
  // "Tsunami — anel fecha na Prisão" (W4)
  assert.deepEqual({ ...SCENARIOS.ARUKHEEA.ringFinal }, { x: 95, z: -95, name: 'Prisão do Sol da Noite' });
  // CIGKV: protocolo de longa duração — praça central (sem desvio)
  assert.equal(SCENARIOS.CIGKV.ringFinal, undefined);
  // as posições batem com os distritos reais do layout
  for (const s of [SCENARIOS.BARBURHEN, SCENARIOS.PRIADUS, SCENARIOS.CKESALTH, SCENARIOS.ARUKHEEA]) {
    const layout = getWorldLayout(`RING-FINAL-${s.id}`, s.id);
    const hit = layout.districts.some((d) => d.cx === s.ringFinal.x && d.cz === s.ringFinal.z);
    assert.ok(hit, `${s.id}: ringFinal em distrito real (${s.ringFinal.name})`);
  }
});

test('F42 — o centro do anel deriva em passos determinísticos até o setor canônico', () => {
  const sim = new KhaaosSim3D({ seed: 'RING-DRIFT', botCount: 0, airdrop: false, scenarioId: 'Arukheea' });
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  assert.equal(sim.ring.x, 0); assert.equal(sim.ring.z, 0);
  // 4 pulsos: 25% → 50% → 75% → 100% (PULSE_INTERVAL 45 s)
  for (let i = 1; i <= 4; i++) {
    sim.pulseTimer = 45;
    sim.step(DEFAULT_INPUT, TICK);
    assert.ok(Math.abs(sim.ring.x - 95 * (i / 4)) < 1e-9, `pulso ${i}: x=${sim.ring.x}`);
    assert.ok(Math.abs(sim.ring.z - -95 * (i / 4)) < 1e-9, `pulso ${i}: z=${sim.ring.z}`);
  }
  const pulseEvents = sim.events.filter((e) => e.type === 'pulse');
  assert.equal(pulseEvents.at(-1).finalName, 'Prisão do Sol da Noite');
  // CIGKV sem ringFinal: centro fixo (protocolo de praça central)
  const cigkv = new KhaaosSim3D({ seed: 'RING-DRIFT-CIGKV', botCount: 0, airdrop: false, scenarioId: 'CIGKV' });
  cigkv.start('belt');
  disembarcarSim(cigkv); // Task 53 — protocolo do trem cumprido antes do teste
  for (let i = 0; i < 4; i++) { cigkv.pulseTimer = 45; cigkv.step(DEFAULT_INPUT, TICK); }
  assert.equal(cigkv.ring.x, 0); assert.equal(cigkv.ring.z, 0);
  assert.equal(cigkv.events.filter((e) => e.type === 'pulse').every((e) => e.finalName == null), true);
});

test('F42 — Emboscada Verde (W2): esporos ferem no baixo sem tocar blindagem', () => {
  const sim = new KhaaosSim3D({ seed: 'F42-SPORE', botCount: 1, airdrop: false, scenarioId: 'Priadus' });
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  sim.bots[0].x = 60; sim.bots[0].z = 60; // longe de tudo
  const armorBefore = sim.bots[0].armor;
  const lifeBefore = sim.bots[0].life;
  sim.sporeTimer = 149.99;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(sim.sporeActive, true);
  assert.ok(sim.events.some((e) => e.type === 'sporeFogStart'));
  assert.ok(sim.bots[0].life < lifeBefore, 'bot no baixo perde vida');
  assert.equal(sim.bots[0].armor, armorBefore, 'kevlar não filtra esporos');
  // refúgio no alto sobrevive (centro da arena: sem dano de ring nesta sonda)
  const refuge = new KhaaosSim3D({ seed: 'F42-SPORE-HIGH', botCount: 0, airdrop: false, scenarioId: 'Priadus' });
  refuge.start('belt');
  disembarcarSim(refuge); // Task 53 — protocolo do trem cumprido antes do teste
  refuge.player.x = 0; refuge.player.z = 0;
  refuge.player.y = 100;
  refuge.sporeTimer = 149.99;
  refuge.step(DEFAULT_INPUT, TICK);
  refuge.step(DEFAULT_INPUT, 1);
  assert.ok(refuge.player.life > 95, 'acima do teto de esporos não há dano');
});

test('F42 — Assassino Silencioso (W3): fumaça inunda o baixo e termina sozinha', () => {
  const sim = new KhaaosSim3D({ seed: 'F42-SMOKE', botCount: 0, airdrop: false, scenarioId: 'Ckesalth' });
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  sim.smokeTimer = 139.99;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(sim.smokeActive, true);
  assert.ok(sim.events.some((e) => e.type === 'toxicSmokeStart'));
  assert.ok(sim.player.life < 100);
  // ciclo completo: remaining esgota → toxicSmokeEnd (jogador no refúgio alto)
  sim.player.y = 220; // acima do teto de fumaça (180) — sonda sobrevive
  sim.smokeRemaining = 0.03;
  sim.step(DEFAULT_INPUT, TICK);
  sim.step(DEFAULT_INPUT, TICK);
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(sim.smokeActive, false);
  assert.ok(sim.events.some((e) => e.type === 'toxicSmokeEnd'));
});

test('F42 — Pulso Khaaos (CIGKV): dreno pula blindagem e confirma DBNO após 7 s', () => {
  const sim = new KhaaosSim3D({ seed: 'F42-PULSO', botCount: 1, airdrop: false, scenarioId: 'CIGKV' });
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  const p = sim.player;
  p.x = 60; p.z = 60; // fora das 4 âncoras (raio 28)
  p.armor = 0; p.temporaryArmor = 0; p.life = 0.05;
  sim.quantumTimer = 119.99;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(sim.quantumActive, true);
  assert.equal(p.alive, true, 'pulso letal inicia o prazo de recuperação');
  assert.equal(p.knocked, true);
  assert.ok(p.knockT > 0 && p.knockT <= 7);
  for (let i = 0; i < Math.ceil(7 / TICK) + 2 && p.alive; i++) sim.step(DEFAULT_INPUT, TICK);
  assert.equal(p.alive, false, 'só o timeout de sete segundos confirma a morte');
  assert.ok(sim.loot.some((l) => l.kind === 'deathBox' && l.victimName === p.name), 'espólio cai onde caiu');
  assert.ok(sim.events.some((e) => e.type === 'eliminated'), 'eliminated dispara (cliente entra em espectador)');
});

test('F42 — paridade autoritativa: sala do CIGKV replica o Pulso e a sala do Priadus replica os esporos', () => {
  const room = new MatchRoom3D({ id: 'f42-paridade', seed: 'F42-ROOM', region: 'sa-east', capacity: 2, botFill: 1, airdrop: false, scenarioId: 'CIGKV' });
  assert.ok(room.addPlayer('v0', 'OPERADOR-0'));
  assert.ok(room.start('v0', 'belt'));
  disembarcarSala(room, 'v0'); // Task 53 — protocolo do trem cumprido antes do teste
  room.humans.get('v0').x = 60; room.humans.get('v0').z = 60;
  room.quantumTimer = 119.99;
  room.tick(TICK);
  const evts = room.drainEvents('v0');
  assert.ok(evts.some((e) => e.type === 'gravityAnomalyStart'));
  assert.equal(room.snapshot('v0').survival.type, 'KHAOS_GRAVITY');

  const spore = new MatchRoom3D({ id: 'f42-spore', seed: 'F42-SPORE-ROOM', region: 'sa-east', capacity: 2, botFill: 1, airdrop: false, scenarioId: 'Priadus' });
  assert.ok(spore.addPlayer('v0', 'OPERADOR-0'));
  assert.ok(spore.start('v0', 'belt'));
  disembarcarSala(spore, 'v0'); // Task 53 — protocolo do trem cumprido antes do teste
  spore.humans.get('v0').y = 0;
  spore.sporeTimer = 149.99;
  spore.tick(TICK);
  const sporeEvents = spore.drainEvents('v0');
  assert.ok(sporeEvents.some((e) => e.type === 'sporeFogStart'));
  const log = spore.spectatorView().events;
  assert.ok(log.some((e) => e.type === 'WORLD_HAZARD' && e.data.hazard === 'spore' && e.data.phase === 'start'), 'WORLD_HAZARD spore na transmissão');
});

test('F42 — a erupção de lava saiu do vocabulário (cenário canônico W3 é a fumaça)', () => {
  // nenhum cenário carrega VOLCANIC_LAVA
  for (const s of Object.values(SCENARIOS)) {
    assert.notEqual(s.survival?.type, 'VOLCANIC_LAVA', `${s.id}: lava não é cânon`);
  }
  // e o vocabulário do espectador traduz os novos hazards
  assert.equal(resolveScenario('ckesalth').survival.type, 'TOXIC_SMOKE');
});
