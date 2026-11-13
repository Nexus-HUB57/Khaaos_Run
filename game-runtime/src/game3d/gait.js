// Khaaos Run — Fase 42: BIOMECÂNICA DA PASSADA (stride-locked locomotion).
//
// Problema eliminado por este módulo: a fase da passada era função do RELÓGIO
// (sin(t·W)) — quando a velocidade mudava, os pés continuavam varrendo no
// ritmo antigo e PATINAVAM no chão ("foot skating"/moonwalk). Em avatares
// remotos era pior: speedNorm binário (.9/.15) + relógio compartilhado.
//
// Solução (padrão de estúdios AAA em locomoção procedural — stride/phase
// matching): a fase avança pelos METROS percorridos, com comprimento de
// passada calibrado pela velocidade suavizada (EWMA). Invariante central:
//
//     Δfase = 2π · distância / strideLength(velocidade)
//
//   → por construção, cadência × comprimento do passo = velocidade do corpo:
//   os pés aterrisam exatamente onde o corpo chega. Zero patinação em regime,
//   transição suave entre regimes (EWMA), teleporte nunca vira fase fantasma.
//
// Aterrissagens (heel strikes) são detectadas por cruzamento de fase — são o
// relógio físico do personagem: áudio de passos, poeira e VFX de impacto
// sincronizam NELE, não no relógio de parede.
//
// Tudo determinístico (sem Math.random), node-puro (sem THREE/document).

// velocidade base do sim (sim3d.js — `speed: 5.2` m/s; sprint ×1.42 ≈ 7.4)
export const SPEED_REF_MPS = 5.2;
// acima disto (m/s) é teleporte/respawn — NÃO integra passada.
// Teto físico do jogo: deriva de queda 5.2 × 2.6 (DROP_SPEED_MULT) = 13.5.
export const TELEPORT_MPS = 14;

// comprimento da passada (m por ciclo completo = 2 passos). Calibrado para
// REPRODUZIR a cadência legada W = 8.6 + 2.2·speedNorm quando v = 5.2·sn:
//   strideLen = v · T(ciclo) = 5.2·sn · 2π / (8.6 + 2.2·sn)
// → transição visual perfeita do regime antigo para o novo (mesma cadência
// no cruise), monotônica, satura em sprint (anatomia: passada alonga mais
// que a cadência). Limites: 0.55 m (rastejar) a 4.2 m (sprint de elite).
export function strideLengthM(speedNorm) {
  const sn = Math.max(.05, Math.min(1.25, speedNorm || 0));
  const m = (SPEED_REF_MPS * sn) * (2 * Math.PI / (8.6 + 2.2 * sn));
  return Math.min(4.2, Math.max(.55, m));
}

// EWMA — suavização exponencial; alpha = fração do novo amostra por passo.
// Primeira amostra (prev não finito) é absorvida integralmente.
export function ewma(prev, x, alpha = .15) {
  if (!Number.isFinite(prev)) return x;
  return prev + (x - prev) * Math.min(1, Math.max(0, alpha));
}

// velocidade instantânea (m/s) → speedNorm do rig (0..1.25, sprint incl.)
export function speedNormFromMps(mps) {
  return Math.max(0, Math.min(1.25, (mps || 0) / SPEED_REF_MPS));
}

// estado inicial da passada de um ator (px/pz nulos → primeira amostra só
// ancora a referência, sem gerar deslocamento fantasma)
export const newGait = () => ({ phase: 0, speed: 0, px: null, pz: null, events: [] });

/**
 * Avança a passada pelo DESLOCAMENTO REAL do avatar (frame a frame).
 * state: { phase, speed, px, pz, events } — mutado e retornado.
 * opts:  { x, z, dt, teleportMps? }
 * Efeito: phase ∝ distância integrada (invariante anti-patinação);
 * speed = EWMA da velocidade real normalizada (0..1.25);
 * events = heel strikes ['L'|'R', ...] cruzados NESTE frame.
 * Teleporte (> teleportMps): reinicia a referência SEM integrar fase.
 */
export function advanceGait(state, { x = 0, z = 0, dt = 1 / 60, teleportMps = TELEPORT_MPS } = {}) {
  const events = [];
  if (!Number.isFinite(state.px)) {          // primeira amostra: ancora
    state.px = x; state.pz = z;
    state.events = events;
    return state;
  }
  const dtn = Math.max(1e-3, dt);
  const dist = Math.hypot(x - state.px, z - state.pz);
  const v = dist / dtn;
  state.px = x; state.pz = z;
  if (v > teleportMps) {                     // teleporte/respawn: fase intacta
    state.events = events;
    return state;
  }
  const prev = state.phase;
  const snInst = speedNormFromMps(v);
  // EWMA alimenta a AMPLITUDE do rig (pose suave, sem estrobo)…
  // Task 66 — alpha INDEPENDENTE DE FPS (1−e^(−k·dt), k≈12/s preserva o
  // alpha .18 no render a 60 fps): em máquinas lentas a amplitude chegava
  // ao regime em ~1 s+ (pernas mais lentas que o chão → patinação sentida
  // na arrancada); agora converge em TEMPO fixo (~0,25 s) a qualquer fps.
  state.speed = ewma(state.speed, snInst, 1 - Math.exp(-12 * dtn));
  // …mas a GEOMETRIA do passo usa a velocidade INSTANTÂNEA: strideLen(v) é
  // a definição de zero patinação — os pés varrem o chão exatamente à
  // velocidade do corpo, frame a frame (aceleração incluída), e a cadência
  // nunca ultrapassa o regime de destino.
  state.phase = prev + (2 * Math.PI * dist) / strideLengthM(snInst);
  events.push(...gaitEvents(prev, state.phase));
  state.events = events;
  return state;
}

/**
 * Aterrissagens (heel strikes) cruzando de prevPhase até phase, em ORDEM
 * CRONOLÓGICA. Esquerda toca em fase ≡ π/2 (perna à frente máxima → contato),
 * direita em ≡ 3π/2. Wrap-aware e multi-ciclo (lag alto conta os passos
 * perdidos e ainda os devolve na sequência real L→R→L→R).
 */
export function gaitEvents(prevPhase, phase) {
  const TAU = 2 * Math.PI;
  const out = [];
  if (!(phase > prevPhase)) return out;
  // primeiro cruzamento de cada marca APÓS prevPhase — intervalo semi-aberto
  // (prev, phase]: strike exatamente no início pertence ao passo anterior;
  // strike exatamente no fim pertence a este intervalo.
  const nextOf = (mark) => {
    let n = prevPhase + (((mark - prevPhase) % TAU) + TAU) % TAU;
    if (n <= prevPhase) n += TAU;
    return n;
  };
  let nextL = nextOf(Math.PI / 2);
  let nextR = nextOf((3 * Math.PI) / 2);
  // intercalação por fase: avança sempre a marca mais próxima (prova de
  // ordem: a marca escolhida é ≤ a outra e o loop só entra com uma ≤ phase)
  while (nextL <= phase || nextR <= phase) {
    if (nextL <= nextR) { out.push('L'); nextL += TAU; }
    else { out.push('R'); nextR += TAU; }
  }
  return out;
}

/**
 * Delay de interpolação ADAPTATIVO (ms): base 110 + 2.2·jitter(EWMA) +
 * folga de RTT acima de 120 ms. Piso 95 ms (responsividade), teto 240 ms
 * (jogabilidade). Jitter alto → buffer mais fundo ANTES do stutter.
 */
export function adaptiveDelayMs({ jitterMs = 0, rttMs = 60 } = {}) {
  const jitterPad = 2.2 * Math.max(0, jitterMs);
  const rttPad = Math.max(0, (rttMs || 0) - 120) * .3;
  return Math.round(Math.min(240, Math.max(95, 110 + jitterPad + rttPad)));
}

// interpolação angular pelo arco MAIS CURTO (yaws nunca dão "volante" 360°)
export function angleLerp(a, b, t) {
  const TAU = 2 * Math.PI;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * Math.min(1, Math.max(0, t));
}
