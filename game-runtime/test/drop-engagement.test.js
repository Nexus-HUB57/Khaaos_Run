// Khaaos Run — Fase 9: rebalance da letalidade contra paraquedistas + VFX/SFX de
// habilidade para remotos. A infiltração aérea é assinatura do jogo: ninguém morre
// no céu. Mesma tabela aplicada pela sim offline e pela MatchRoom3D autoritativa.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KhaaosSim3D, DEFAULT_INPUT, WEAPONS3D,
  DROP_ENGAGEMENT, botCanEngage, botTargetModifiers, botDamageScale, rayAabb,
} from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

const STEP = 1 / 30;
const idle = (over = {}) => ({ ...DEFAULT_INPUT, ...over });
const blankInput = (over = {}) => ({ seq: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false, slot: 0, ...over });
const DT = 1 / 20;

// Encontra um par de pontos com linha de visão limpa (determinístico por seed
// do layout): percorre a borda sul do mapa, longe dos distritos e DENTRO do
// anel seguro (raio inicial 170 — busca limitada a hipot < 150 evita dano de zona).
// hiY: valida também o raio íngreme até um alvo elevado (paraquedas aberto).
function clearLosPair(sim, { gap = 8, hiY = 0 } = {}) {
  const colliders = sim.physicsWorld.colliders;
  for (let z = 148; z >= 110; z -= 2) {
    for (let x = -140; x <= 140; x += 6) {
      if (Math.hypot(x + gap / 2, z) > 148) continue;
      const a = { x, y: 0, z }, b = { x: x + gap, y: 0, z };
      let clear = true;
      const probes = [[a.x, 1.5, a.z, b.x, 1.5, b.z]];
      if (hiY > 0) probes.push([b.x, 1.5, b.z, a.x, hiY + 1.5, a.z]); // bot → alvo no ar
      for (const [ox, oy, oz, tx, ty, tz] of probes) {
        const dx = tx - ox, dz = tz - oz, dy = ty - oy;
        const len = Math.hypot(dx, dy, dz);
        for (const box of colliders) {
          if (box.noBlock) continue;
          if (rayAabb(ox, oy, oz, dx / len, dy / len, dz / len, box, len) !== null) { clear = false; break; }
        }
        if (!clear) break;
      }
      if (clear) return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
    }
  }
  throw new Error('par com LOS limpo não encontrado');
}

// ---------- helpers puros ----------
test('fase9 drop: botCanEngage protege queda livre e chute alto', () => {
  assert.equal(botCanEngage({ dropPhase: 'sky', y: 120 }), false, 'queda livre nunca é engajada');
  assert.equal(botCanEngage({ dropPhase: 'chute', y: DROP_ENGAGEMENT.chuteEngageMaxY + 1 }), false, 'chute alto intocável');
  assert.equal(botCanEngage({ dropPhase: 'chute', y: DROP_ENGAGEMENT.chuteEngageMaxY }), true, 'no teto exato já engaja');
  assert.equal(botCanEngage({ dropPhase: 'chute', y: 5 }), true, 'chute baixo engajável');
  assert.equal(botCanEngage({ dropPhase: null, y: 0 }), true, 'ator de pé engajável');
  assert.equal(botCanEngage(null), false);
});

test('fase9 drop: botTargetModifiers aplica erro/dano reduzidos no ar e no pouso', () => {
  const air = botTargetModifiers({ dropPhase: 'chute', y: 10 });
  assert.equal(air.errMult, DROP_ENGAGEMENT.airborneErrMult);
  assert.equal(air.dmgMult, DROP_ENGAGEMENT.airborneDmgScale);
  const grace = botTargetModifiers({ dropPhase: null, landGraceT: 1.2 });
  assert.equal(grace.errMult, DROP_ENGAGEMENT.graceErrMult);
  assert.equal(grace.dmgMult, DROP_ENGAGEMENT.graceDmgScale);
  const normal = botTargetModifiers({ dropPhase: null, landGraceT: 0 });
  assert.deepEqual(normal, { errMult: 1, dmgMult: 1 });
  // modificador composto nunca amplifica dano
  assert.ok(air.dmgMult < 1 && grace.dmgMult < 1);
});

// ---------- sim offline ----------
function landedBotScenario(seed, playerState, opts = {}) {
  const sim = new KhaaosSim3D({ seed, botCount: 1, airdrop: true });
  sim.start('belt');
  sim.consumeEvents();
  const { ax, az, bx, bz } = clearLosPair(sim, opts);
  const p = sim.player, b = sim.bots[0];
  // jogador preso no estado aéreo pedido, bot pousado ao lado com LOS limpa
  p.x = ax; p.z = az; Object.assign(p, playerState);
  b.x = bx; b.z = bz; b.y = 0; b.dropPhase = null; b.onGround = true;
  b.cooldown = 0; b.reloadT = 0; b.ai = { ...b.ai, reactT: 0, state: 'patrol', stunTicks: 0 };
  return { sim, p, b };
}

test('fase9 drop: bot NÃO atira em jogador em queda livre (sky intocável)', () => {
  const { sim, p, b } = landedBotScenario('DROP-SKY-F9', { dropPhase: 'sky', y: 100, vy: -30, onGround: false });
  let bullets = 0;
  for (let i = 0; i < 150; i++) {
    // mantém o jogador suspenso (a física puxaria de volta)
    p.dropPhase = 'sky'; p.y = 100; p.vy = -30;
    b.x = p.x + 8; b.z = p.z; b.cooldown = 0; b.ai.reactT = 0;
    sim.step(idle(), STEP);
    bullets += sim.bullets.length;
    sim.bullets.length = 0;
  }
  assert.equal(bullets, 0, 'nenhum projétil contra paraquedista em queda livre');
  assert.equal(p.life, 100);
});

test('fase9 drop: bot NÃO atira em jogador de paraquedas acima do teto de engajamento', () => {
  const { sim, p, b } = landedBotScenario('DROP-CHUTE-HIGH-F9', { dropPhase: 'chute', y: 60, vy: -9, onGround: false });
  let bullets = 0;
  for (let i = 0; i < 150; i++) {
    p.dropPhase = 'chute'; p.y = 60; p.vy = -9;
    b.x = p.x + 8; b.z = p.z; b.cooldown = 0; b.ai.reactT = 0;
    sim.step(idle(), STEP);
    bullets += sim.bullets.length;
    sim.bullets.length = 0;
  }
  assert.equal(bullets, 0, 'nenhum projétil contra paraquedas aberto acima de ' + DROP_ENGAGEMENT.chuteEngageMaxY + 'm');
  assert.equal(p.life, 100);
});

test('fase9 drop: chute baixo é engajado com dano teto-reduzido (nunca letal de longe)', () => {
  const { sim, p, b } = landedBotScenario('DROP-CHUTE-LOW-F9', { dropPhase: 'chute', y: 10, vy: -9, onGround: false }, { hiY: 10 });
  const w = WEAPONS3D[b.weapon];
  const cap = w.damage * botDamageScale(8) * DROP_ENGAGEMENT.airborneDmgScale * 1.75; // teto com headshot
  let hit = false, maxDrop = 0;
  for (let i = 0; i < 240 && !hit; i++) {
    p.dropPhase = 'chute'; p.y = 10; p.vy = -9;
    b.x = p.x + 8; b.z = p.z; b.cooldown = 0; b.ai.reactT = 0;
    const lifeBefore = p.life;
    sim.step(idle(), STEP);
    if (p.life < lifeBefore) { hit = true; maxDrop = lifeBefore - p.life; }
  }
  assert.ok(hit, 'bot engaja paraquedista nos metros finais (comportamento desejado)');
  assert.ok(maxDrop <= cap + 1e-6, `dano por hit (${maxDrop.toFixed(2)}) dentro do teto aéreo (${cap.toFixed(2)})`);
});

test('fase9 drop: aterrissagem abre janela de graça (landGraceT) que decai até zero', () => {
  const sim = new KhaaosSim3D({ seed: 'DROP-GRACE-F9', botCount: 0, airdrop: true });
  sim.start('belt');
  sim.consumeEvents();
  let guard = 0;
  while (sim.player.dropPhase !== null && guard++ < 30 * 60) sim.step(idle(), STEP);
  assert.equal(sim.player.dropPhase, null, 'jogador pousou naturalmente');
  assert.ok(sim.player.landGraceT > 0, 'janela de impacto de pouso aberta');
  const t0 = sim.player.landGraceT;
  assert.ok(t0 <= DROP_ENGAGEMENT.landingGraceSeconds + 1e-9);
  for (let i = 0; i < Math.ceil(DROP_ENGAGEMENT.landingGraceSeconds / STEP) + 2; i++) sim.step(idle(), STEP);
  assert.equal(sim.player.landGraceT, 0, 'janela expira sozinha');
});

test('fase9 drop: dano recebido dentro da janela de pouso é reduzido', () => {
  const sim = new KhaaosSim3D({ seed: 'DROP-GRACE-DMG-F9', botCount: 1, airdrop: true });
  sim.start('belt');
  sim.consumeEvents();
  const { ax, az, bx, bz } = clearLosPair(sim, { hiY: 0 });
  const p = sim.player, b = sim.bots[0];
  // pousa "agora": estado de pouso manual com janela ativa
  p.x = ax; p.z = az; p.dropPhase = null; p.onGround = true; p.y = 0;
  p.landGraceT = DROP_ENGAGEMENT.landingGraceSeconds;
  b.x = bx; b.z = bz; b.y = 0; b.dropPhase = null; b.onGround = true;
  b.cooldown = 0; b.reloadT = 0; b.ai = { ...b.ai, reactT: 0, state: 'patrol', stunTicks: 0 };
  const w = WEAPONS3D[b.weapon];
  const cap = w.damage * botDamageScale(8) * DROP_ENGAGEMENT.graceDmgScale * 1.75;
  let hit = false, maxDrop = 0;
  for (let i = 0; i < 240 && (p.landGraceT ?? 0) > 0 && !hit; i++) {
    b.x = p.x + 8; b.z = p.z; b.cooldown = 0; b.ai.reactT = 0;
    const lifeBefore = p.life;
    sim.step(idle(), STEP);
    if (p.life < lifeBefore) { hit = true; maxDrop = lifeBefore - p.life; }
  }
  assert.ok(hit, 'bot acerta o alvo durante a janela de pouso');
  assert.ok(maxDrop <= cap + 1e-6, `dano no pouso (${maxDrop.toFixed(2)}) ≤ teto de graça (${cap.toFixed(2)})`);
});

// ---------- habilidade: posição no evento (VFX/SFX p/ remotos) ----------
test('fase9 fx: evento ability offline carrega posição do caster e isSelf', () => {
  const sim = new KhaaosSim3D({ seed: 'FX-OFF-F9', botCount: 0, airdrop: false });
  sim.player.life = 50;
  sim.player.operativeId = 'OP_MALE_MEDIC_AFRICAN';
  sim.start('belt');
  sim.step({ ...DEFAULT_INPUT, ability: true }, STEP);
  const ev = sim.consumeEvents().find((e) => e.type === 'ability');
  assert.ok(ev, 'evento emitido');
  assert.equal(ev.isSelf, true);
  assert.equal(typeof ev.x, 'number');
  assert.equal(typeof ev.y, 'number');
  assert.equal(typeof ev.z, 'number');
});

test('fase9 fx: evento ability online alcança humano próximo com posição e isSelf=false', () => {
  const room = new MatchRoom3D({ id: 'f9-fx', seed: 'FX-ROOM-F9', capacity: 4, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'ALFA', 'OP_FEMALE_SNIPER');
  room.addPlayer('p2', 'BRAVO', 'OP_MALE_MEDIC_AFRICAN');
  room.start('p1', 'belt');
  const h1 = room.humans.get('p1'), h2 = room.humans.get('p2');
  h2.life = 50;
  h2.x = h1.x + 5; h2.z = h1.z; // perto: dentro do raio de 90m do feedback
  room.input('p2', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  const ev = room.drainEvents('p1').find((e) => e.type === 'ability');
  assert.ok(ev, 'remoto recebeu o evento de habilidade');
  assert.equal(ev.isSelf, false);
  assert.equal(ev.by, 'BRAVO');
  assert.equal(typeof ev.x, 'number');
  assert.equal(typeof ev.z, 'number');
  assert.equal(ev.effect, 'heal');
});

test('fase9 fx: paridade offline/online — habilidade bloqueada no ar e caído', () => {
  const sim = new KhaaosSim3D({ seed: 'FX-AIR-F9', botCount: 0, airdrop: true });
  sim.start('belt');
  sim.consumeEvents();
  sim.player.dropPhase = 'sky';
  sim.step({ ...DEFAULT_INPUT, ability: true }, STEP);
  assert.equal(sim.consumeEvents().some((e) => e.type === 'ability'), false, 'nada no ar');
  assert.ok(sim.player.abilityState.cooldownTicks === 0, 'cooldown nem consumido');
});

// ---------- sala autoritativa ----------
test('fase9 room: bot online não dispara contra humano em queda livre', () => {
  const room = new MatchRoom3D({ id: 'f9-sky', seed: 'DROP-ROOM-F9', capacity: 4, botFill: 1, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  const h = room.humans.get('p1');
  const b = room.bots[0];
  h.x = 0; h.z = 145; h.y = 100; h.dropPhase = 'sky'; h.vy = -30; h.onGround = false;
  b.x = 8; b.z = 145; b.y = 0; b.dropPhase = null; b.onGround = true;
  b.cooldown = 0; b.reloadT = 0;
  for (let i = 0; i < 100; i++) {
    h.dropPhase = 'sky'; h.y = 100; h.vy = -30;
    b.x = 8; b.z = 145; b.cooldown = 0;
    room.tick(DT);
  }
  assert.equal(room.bullets.length, 0, 'nenhum projétil na sala contra o paraquedista');
  assert.equal(h.life, 100);
});

test('fase9 room: bot online engaja chute baixo com modificadores da tabela compartilhada', () => {
  const room = new MatchRoom3D({ id: 'f9-chute', seed: 'DROP-ROOM2-F9', capacity: 4, botFill: 1, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  const h = room.humans.get('p1');
  const b = room.bots[0];
  h.x = 0; h.z = 145; h.y = 10; h.dropPhase = 'chute'; h.vy = -9; h.onGround = false;
  b.x = 8; b.z = 145; b.y = 0; b.dropPhase = null; b.onGround = true;
  b.cooldown = 0; b.reloadT = 0;
  let engaged = false;
  for (let i = 0; i < 100; i++) {
    h.dropPhase = 'chute'; h.y = 10; h.vy = -9;
    b.x = 8; b.z = 145; b.cooldown = 0;
    room.tick(DT);
    if (room.bullets.length > 0) { engaged = true; break; }
  }
  assert.ok(engaged, 'bot online engaja nos metros finais da descida');
});
