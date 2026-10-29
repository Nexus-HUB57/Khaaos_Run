// ============================================================================
// Fase 31 — JANELAS CONSCIENTES: LOS pelo vão + bots atirando pelo vidro +
// HUD (barra de HP da janela ao mirar). Fecha o gap descoberto empiricamente:
// a F24 cortou a parede e a F26 deixou o vidro transparente p/ visão, MAS o
// olho da LOS a 1,5 m batia na parede SOB o vão (sill 1,55) e o focinho a
// 1,42 m nunca cruzava a banda — bots NUNCA engajavam por janelas (sonda:
// windowHit 0, hurt 0, bot driftava p/ hunt).
//
// Contratos pinados:
//  1. LOS eye 1,6 > sill 1,55 — ator de PÉ enxerga pelo vão (agachado segue
//     escondido; o peitoril continua cobertura);
//  2. bot caminha até a posição de TIRO no vão (2,4 m, latch de aproximação no
//     eixo do painel) e fica PLANTADO atirando pelo buraco;
//  3. vidro ÍNTEGRO racha/estilhaça com as balas (windowHit → windowDown);
//     destruído, a bala SEGUE e fere o alvo exposto (só a cabeça fica acima
//     do peitoril — zona alta);
//  4. paridade 1:1 com a trilha autoritativa (MatchRoom3D);
//  5. windowPaneOnSegment (pura): raio no olho cruza o vão; raio baixo NÃO;
//     a abertura PERSISTE com o vidro destruído (fresta útil);
//  6. HUD: o mesmo helper alimenta o painel JANELA ao mirar (hp/max).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT, windowPaneOnSegment } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { WINDOW } from '../src/game3d/sim3d.js';

const input = (o = {}) => ({ ...DEFAULT_INPUT, ...o });
const DT = 1 / 30;

// cenário canônico da sonda: janela térrea (banda 1,55–2,75), alvo 2,5 m para
// dentro no eixo do painel, bot 8 m para fora no eixo — alinhados no centro.
function windowScenario(seed, weapon = 'm4') {
  const sim = new KhaaosSim3D({ seed, botCount: 1, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const win = sim.windows.find((w) => Math.abs(w.y0 - 1.55) < 0.01) ?? sim.windows[0];
  sim.player.x = win.x - win.nx * 2.5; sim.player.z = win.z - win.nz * 2.5; sim.player.y = 0;
  sim.player.life = 100; sim.player.armor = 0;
  const b = sim.bots[0];
  b.x = win.x + win.nx * 8; b.z = win.z + win.nz * 8; b.y = 0;
  b.ai.state = 'engage'; b.ai.think = 99; b.cooldown = 0; b.reloadT = 0;
  b.weapon = weapon; b.ammoMag = 999;
  return { sim, win, bot: b };
}

// ---------------------------------------------------------------------------
// 1. PURE — windowPaneOnSegment (helper do vão consciente)
// ---------------------------------------------------------------------------

test('windowPaneOnSegment: raio no OLHO (1,6) cruza o vão; raio BAIXO (1,0) não cruza', () => {
  const { sim, win } = windowScenario('F31-PURE');
  // olho a 1,6 (acima do sill 1,55): cruza o painel
  const hit = windowPaneOnSegment(win.x + win.nx * 8, 1.6, win.z + win.nz * 8, win.x - win.nx * 2.5, 1.6, win.z - win.nz * 2.5, sim.windows);
  assert.ok(hit, 'raio do olho encontra o painel');
  assert.equal(hit.pane.id, win.id);
  assert.ok(hit.t > 0 && hit.t < 10, `t dentro do segmento (${hit.t?.toFixed(2)})`);
  // raio a 1,0 (abaixo do sill): a parede sob o vão NÃO é o painel — null
  const low = windowPaneOnSegment(win.x + win.nx * 8, 1.0, win.z + win.nz * 8, win.x - win.nx * 2.5, 1.0, win.z - win.nz * 2.5, sim.windows);
  assert.equal(low, null, 'raio abaixo do peitoril não é "pelo vão"');
});

test('windowPaneOnSegment: a ABERTURA persiste com o vidro destruído (fresta útil)', () => {
  const { sim, win } = windowScenario('F31-BROKEN');
  win.destroyed = true; win.hp = 0;
  const hit = windowPaneOnSegment(win.x + win.nx * 5, 1.6, win.z + win.nz * 5, win.x - win.nx * 2, 1.6, win.z - win.nz * 2, sim.windows);
  assert.ok(hit, 'vão destruído continua sendo abertura (balas passam)');
  assert.equal(hit.pane.id, win.id);
  // contrato do HUD: painel expõe hp/max (íntegro some do painel — filtro do chamador)
  assert.equal(typeof hit.pane.hp, 'number');
});

// ---------------------------------------------------------------------------
// 2. SIM OFFLINE — bot estilhaça e fere pelo vão (loop Free Fire completo)
// ---------------------------------------------------------------------------

test('sim: bot VER o alvo por janela (LOS eye 1,6) e engaja pelo vão', () => {
  const { sim, win, bot } = windowScenario('F31-SEE');
  let saw = false;
  for (let i = 0; i < 60 && !saw; i++) {
    sim.step(input(), DT);
    sim.consumeEvents();
    saw = bot.ai.state === 'engage' && Math.hypot(bot.x - win.x, bot.z - win.z) < 8;
  }
  assert.equal(saw, true, 'bot em engage convergindo para o vão (antes: LOS bloqueada → hunt)');
});

test('sim: bot PLANTA no vão, ESTILHAÇA o vidro (windowHit → windowDown) e FERE o alvo', () => {
  // g19 (22 dmg < 30 hp): 1ª bala RACHA (windowHit), 2ª ESTILHAÇA (windowDown) —
  // ordem canônica do painel de vidro; m4/ak estilhaçam no 1º tiro (down 1º).
  const { sim, win, bot } = windowScenario('F31-SHOOT', 'g19');
  let hitBeforeDown = false, down = null, hurt = 0, minDist = Infinity;
  for (let i = 0; i < 480 && !(down && hurt > 0); i++) {
    sim.step(input(), DT);
    for (const e of sim.consumeEvents()) {
      // caminho de BALAS: vidro íntegro emite impact kind 'glass' (windowHit é melee)
      if (e.type === 'impact' && e.kind === 'glass' && !down) hitBeforeDown = true;
      if (e.type === 'windowDown' && e.id === win.id) down = e;
      if (e.type === 'hurt') hurt++;
    }
    minDist = Math.min(minDist, Math.hypot(bot.x - win.x, bot.z - win.z));
  }
  assert.ok(minDist <= 3.5, `bot assumiu a posição de tiro no vão (dist mín ${minDist.toFixed(1)})`);
  assert.ok(hitBeforeDown, 'vidro íntegro RACHOU antes (bala consumida no painel — impact glass)');
  assert.ok(down, 'windowDown disparado (estilhaçou atirando pelo vão)');
  assert.ok(hurt > 0, 'bala atravessou a fresta e FERIU o alvo exposto');
  assert.ok(win.destroyed, true);
});

// ---------------------------------------------------------------------------
// 3. ROOM3D — paridade autoritativa
// ---------------------------------------------------------------------------

test('room3d: MESMA leitura — bot estilhaça o vidro e fere pelo vão (autoritativo)', () => {
  const room = new MatchRoom3D({ id: 'f31-win', seed: 'F31-ROOM', capacity: 4, botFill: 2, airdrop: false, scenarioId: 'CIGKV' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const win = room.windows.find((w) => Math.abs(w.y0 - 1.55) < 0.01) ?? room.windows[0];
  assert.ok(win, 'cenário com janela térrea');
  const [shooter, victim] = room.bots;
  victim.x = win.x - win.nx * 2.5; victim.z = win.z - win.nz * 2.5; victim.y = 0;
  victim.life = 100; victim.armor = 0;
  shooter.x = win.x + win.nx * 8; shooter.z = win.z + win.nz * 8; shooter.y = 0;
  shooter.ai.state = 'engage'; shooter.ai.think = 99; shooter.cooldown = 0; shooter.reloadT = 0;
  shooter.weapon = 'm4'; shooter.ammoMag = 999;
  let down = null, victimHurt = 0, minDist = Infinity;
  for (let i = 0; i < 600 && !(down && victimHurt > 0); i++) {
    room.tick(DT);
    for (const e of room.drainEvents('viewer0')) {
      if (e.type === 'windowDown' && e.id === win.id) down = e;
      if (e.type === 'hurt' && e.kind !== 'quantum') victimHurt++;
    }
    minDist = Math.min(minDist, Math.hypot(shooter.x - win.x, shooter.z - win.z));
  }
  assert.ok(minDist <= 3.5, `bot do servidor assumiu o vão (dist mín ${minDist.toFixed(1)})`);
  assert.ok(down, 'windowDown no autoritativo (paridade)');
  assert.ok(victimHurt > 0 || victim.life < 100, 'vítima ferida pelo vão no servidor');
});

// ---------------------------------------------------------------------------
// 4. REGRESSÃO — o peitoril continua COBERTURA (não vira porta)
// ---------------------------------------------------------------------------

test('regressão: o peitoril NÃO virou passagem — jogador NÃO atravessa a janela', () => {
  const { sim, win } = windowScenario('F31-COVER');
  // jogador FORA encostado no vidro, tenta atravessar caminhando para dentro
  sim.player.x = win.x + win.nx * 1.2; sim.player.z = win.z + win.nz * 1.2; sim.player.y = 0;
  const yaw = Math.atan2(-(win.x - sim.player.x), -(win.z - sim.player.z));
  const x0 = sim.player.x, z0 = sim.player.z;
  for (let i = 0; i < 90; i++) sim.step(input({ dy: -1, yaw, sprint: true }), DT);
  const moved = Math.hypot(sim.player.x - x0, sim.player.z - z0);
  const side0 = (x0 - win.x) * win.nx + (z0 - win.z) * win.nz;
  const side1 = (sim.player.x - win.x) * win.nx + (sim.player.z - win.z) * win.nz;
  assert.ok(Math.sign(side0) === Math.sign(side1) || moved < 2.5, `janela segue intransponível (andou ${moved.toFixed(2)} m, lado ${side0.toFixed(2)}→${side1.toFixed(2)})`);
});
