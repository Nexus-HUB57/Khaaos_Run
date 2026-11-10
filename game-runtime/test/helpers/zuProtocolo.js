// Task 53 — fixture canônica de teste: desembarque do TREM OFICIAL do ZU.
//
// A entrada canônica dos Rings agora é a viagem a bordo (protocolo: embarque →
// rota → portas → chegada → grace de 15 s). Testes que exercitam mecânicas de
// combate/loot/habilidade usam estes helpers para CUMPRIR o protocolo antes:
// saltam pela porta (janela oficial 8–16 s) e chegam ao estado pós-protocolo
// canônico: jogador no spawn íntegro, bots nos spawns com IA calma, combate livre.
// Idempotente e seguro: com protocolo inativo (airdrop legado/portal) é no-op.
import { DEFAULT_INPUT } from '../../src/game3d/sim3d.js';
import { ZU_TRAIN } from '../../src/shared/zuTrain.js';

const DT_SIM = 1 / 30;

// estado calmo dos bots (posição de spawn + patrulha) — os testes assumem a
// arena recém-nascida; o protocolo não pode deixá-los em queda/engajados.
function acalmaBots(bots, posições, integridade) {
  for (const b of bots) {
    if (!b.alive) continue;
    const p0 = posições.get(b.id);
    if (p0) { b.x = p0.x; b.z = p0.z; }
    b.y = 0; b.vy = 0; b.onGround = true; b.dropPhase = null;
    b.trainOnboard = false;
    const hp = integridade?.get(b.id);
    if (hp) { b.life = hp.life; b.armor = hp.armor; } // íntegro como nasceu
    if (b.ai) { b.ai.state = 'patrol'; b.ai.think = Math.max(b.ai.think ?? 0, 0.6); b.ai.lostT = 0; b.ai.stunTicks = 0; b.ai.stunT = 0; }
    b.moving = false;
  }
}

export function disembarcarSim(sim) {
  if (!sim || sim.trainT === null || sim.trainT === undefined) return false;
  if (!sim.player?.trainOnboard) return false;
  const savedReplay = [...sim.replay]; // fixture não grava input do jogador (record() muta a array)
  const idle = { ...DEFAULT_INPUT };
  const orig = { x: sim.player.x, z: sim.player.z }; // spawn original do ator (pré-embarque)
  const posições = new Map(sim.bots.map((b) => [b.id, { x: b.x, z: b.z }])); // spawns de origem
  const integridade = new Map(sim.bots.map((b) => [b.id, { life: b.life, armor: b.armor }]));
  let jumped = false;
  for (let i = 0; i < 30 * 20 && !jumped; i++) {
    jumped = sim.doorJump();
    if (!jumped) sim.step(idle, DT_SIM);
  }
  if (!jumped) { sim.replay = savedReplay; return false; }
  // jogador de volta ao SEU spawn original (o salto é na borda do Ring — fora
  // da zona segura; os testes assumem o ator íntegro onde nasceu)
  sim.player.x = orig.x; sim.player.z = orig.z; sim.player.y = 0;
  sim.player.vy = 0; sim.player.onGround = true; sim.player.dropPhase = null;
  const life0 = sim.player.life, armor0 = sim.player.armor;
  // CHEGADA do protocolo: elapsed além de ARRIVAL desembarca todos no próximo
  // passo e encerra o grace (combate liberado p/ o teste)
  sim.trainT = Math.max(sim.trainT, ZU_TRAIN.ARRIVAL_MS / 1000 + 8);
  sim.combatLockedUntil = sim.trainT;
  sim.step(idle, DT_SIM);
  acalmaBots(sim.bots, posições, integridade);
  // o helper devolve o ator ÍNTEGO (bots podem ter disparado no 1º tick livre)
  sim.player.life = life0; sim.player.armor = armor0;
  sim.replay = savedReplay;
  sim.consumeEvents();
  return true;
}

export function disembarcarSala(room, id = 'p1') {
  if (!room || !room.trainStartedAtEpoch) return false;
  const actor = room.humans.get(id);
  if (!actor?.trainOnboard) return false;
  const orig = { x: actor.x, z: actor.z }; // spawn original do ator (pré-embarque)
  const posições = new Map(room.bots.map((b) => [b.id, { x: b.x, z: b.z }])); // spawns de origem
  const integridade = new Map(room.bots.map((b) => [b.id, { life: b.life, armor: b.armor }]));
  room.trainStartedAtEpoch = Date.now() - 9000; // janela das portas (8–16 s)
  room.tick(1 / 20);
  const jumped = room.doorJump(id);
  // jogador de volta ao SEU spawn original imediatamente (sem tick fora do anel
  // → sem dano ambiental nem enchurrada de eventos 'hurt' na fila)
  actor.x = orig.x; actor.z = orig.z; actor.y = 0;
  actor.vy = 0; actor.onGround = true; actor.dropPhase = null;
  const life0 = actor.life, armor0 = actor.armor;
  // CHEGADA do protocolo + fim do grace: desembarca todos no próximo tick
  room.trainStartedAtEpoch = Date.now() - 32100;
  room.combatLockedUntil = Date.now() - 1;
  room.tick(1 / 20);
  acalmaBots(room.bots, posições, integridade);
  room._dmgLogAt?.clear(); // fixture não envenena a janela anti-spam de DAMAGE
  // o helper devolve o ator ÍNTEGO (bots podem ter disparado no 1º tick livre)
  actor.life = life0; actor.armor = armor0;
  return jumped;
}
