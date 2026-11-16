// Khaaos Run — Task 69 — FOLEY DE PASSOS fase-travado (a voz acústica completa).
// O gait.js já diz QUANDO o calcanhar toca (gaitEvents: L em π/2, R em 3π/2) —
// este módulo decide COMO soa: o SCUFF (raspagem band-pass, já existia no
// audio3d) ganha o THUMP (corpo grave do impacto — a diferença entre "hiss" e
// "passada"), PAN ESTÉREO pelos strikes reais (L esquerda, R direita; bots por
// posição relativa ao ouvinte), CARÁTER DE SPRINT (mais grave/presente/longo)
// e POUSO (impacto pesado — o mesmo evento que a camada visual absorve).
// Node-puro: toda a matemática musical é testável sem AudioContext; o
// audio3d.renderiza defensivamente (mocks F19 sem Oscillator/StereoPanner
// continuam no-op seguros — mesma filosofia do attach da Task 67).
import { footstepProfile } from './worldAudioProfiles.js';

export const FOOTSTEP = Object.freeze({
  panSide: .12,          // jogador: leve deslocamento L/R (strike real, não aleatório)
  panMax: .75,           // bots: teto do pan (nunca cola na borda dura)
  attK: .012,            // falloff de distância — MESMA constante do step atual
  sideLowTilt: Object.freeze({ L: .92, R: 1.05 }),  // timbre por pé (comportamento atual preservado)
  sprintPitch: .88,      // sprint: impacto mais grave (corpo baixo, passada pesada)
  sprintGain: 1.18,      // e mais presente
  sprintDecay: 1.25,     // e mais longo (drive da passada)
  landGain: 1.5,         // pouso: impacto pesado (absorção visual tem par áudio)
  landLowK: .72,         // thump do pouso bem mais grave
  landDecay: 1.55,
  thumpGain: .85,        // corpo grave relativo ao scuff
  thumpDrop: .55,        // oscilador desce para .55× a Hz base (impacto "afunda")
});

/** Voz completa de um passo — PURA e determinística. Entradas:
 * intensity (.2 walk levinho → 1 sprint forte), side ('L'|'R' do strike REAL),
 * surface (superfície canônica do mundo), sprint, land, distance (m ao ouvinte),
 * pan explícito (bots; null → pan do lado do strike para o jogador).
 * Retorna { peak, thumpPeak, bandHz, bandEndHz, lowHz, lowEndHz, decay,
 * noiseAmt, pan, att } — os parâmetros que o audio3d renderiza. */
export function stepVoice({ intensity = .5, side = 'R', surface, sprint = false, land = false, distance = 0, pan = null } = {}) {
  const cfg = footstepProfile(surface);
  const S = Math.max(0, Math.min(1.25, Number.isFinite(intensity) ? intensity : .5));
  const att = 1 / (1 + Math.max(0, distance) * Math.max(0, distance) * FOOTSTEP.attK);
  // caráter: pouso > sprint > neutro (land domina — quem pousou não está sprintando)
  const pitchK = land ? 1 : (sprint ? FOOTSTEP.sprintPitch : 1);
  const gainK = land ? FOOTSTEP.landGain : (sprint ? FOOTSTEP.sprintGain : 1);
  const decayK = land ? FOOTSTEP.landDecay : (sprint ? FOOTSTEP.sprintDecay : 1);
  const tilt = FOOTSTEP.sideLowTilt[side] ?? 1;
  const peak = cfg.gain * (.45 + .75 * Math.min(1, S)) * att * gainK;
  const bandHz = cfg.band * tilt * pitchK;
  const lowHz = cfg.low * pitchK * (land ? FOOTSTEP.landLowK : 1);
  return {
    peak,
    thumpPeak: peak * FOOTSTEP.thumpGain,
    bandHz,
    bandEndHz: Math.max(60, cfg.low * pitchK),
    lowHz,
    lowEndHz: Math.max(38, lowHz * FOOTSTEP.thumpDrop),
    decay: cfg.decay * decayK,
    noiseAmt: cfg.noise,
    pan: Number.isFinite(pan) ? Math.max(-FOOTSTEP.panMax, Math.min(FOOTSTEP.panMax, pan))
      : (side === 'L' ? -FOOTSTEP.panSide : FOOTSTEP.panSide),
    att,
  };
}

/** PAN espacial de um bot relativo ao OUVINTE (jogador): projeção do vetor
 * bot−ouvinte no eixo DIREITO da escuta (yaw do jogador: −Z frente em 0 →
 * direita = (cos yaw, −sin yaw)). Normalizado, clampado em ±.75. */
export function botPan({ bx = 0, bz = 0, lx = 0, lz = 0, yaw = 0 } = {}) {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = bx - lx, dz = bz - lz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const p = (dx * rx + dz * rz) / d;
  return Math.max(-FOOTSTEP.panMax, Math.min(FOOTSTEP.panMax, Number.isFinite(p) ? p : 0));
}
