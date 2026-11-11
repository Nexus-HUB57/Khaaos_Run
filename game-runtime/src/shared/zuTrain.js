// Khaaos Run — Task 53 — PROTOCOLO OFICIAL DE ENTRADA ZU (trem dos Rings).
//
// O paraquedas NUNCA foi o acesso oficial ao Ring: a entrada canônica é o TREM
// do ZU — todos os operativos embarcam juntos, seguem a rota e só podem sair
// pela porta (salto opcional) ou na chegada. Os ataques ficam travados até
// 15 s APÓS a chegada (grace global — inclui quem saltou no caminho).
//
// Esta é a FONTE ÚNICA DE VERDADE compartilhada entre:
//   • sim offline (src/game3d/sim3d.js)
//   • autoridade online (server/room3d.js)
//   • cliente 3D (trainRide3d.js / main3d.js / online3d.js)
//
// Tudo aqui é FUNÇÃO PURA de (elapsedMs, rota) — determinístico entre pares:
// cliente e servidor chegam à MESMA pose do trem no MESMO elapsed.
//
// Timeline (ms desde o matchStart):
//   0            → EMBARQUE  (apresentação cinemática do trem — TRAIN_INTRO)
//   EMBARQUE_MS  → EM ROTA   (câmera no vagão, portas fechadas, combate travado)
//   DOOR_OPEN_MS → PORTAS    (portas abertas — ESPAÇO salta; salto = entrada oficial)
//   ARRIVAL_MS   → CHEGADA   (desembarque obrigatório de quem ficou)
//   +GRACE_S     → COMBATE LIVRE (pulso do Ring começa a contar AQUI)
import { TRAIN_INTRO_DURATION_MS } from './clock.js';

export const ZU_TRAIN = Object.freeze({
  EMBARQUE_MS: TRAIN_INTRO_DURATION_MS, // 3400 — embarque/apresentação (contrato Fase 11/12 preservado)
  DOOR_OPEN_MS: 8000,                   // portas abertas: janela de salto opcional
  ARRIVAL_MS: 16000,                    // chegada: trem para, desembarque obrigatório
  GRACE_S: 15,                          // protocolo ZU: ataques liberados 15 s APÓS a chegada
  JUMP_HEIGHT: 5.5,                     // altura do salto de porta (m — pouso canônico 'chute')
  JUMP_LATERAL: 2.6,                    // deslocamento lateral da porta (m — lado direito do vagão)
});

// Momento do DESBLOQUEIO de combate (ms desde o matchStart): chegada + 15 s.
export const COMBAT_UNLOCK_MS = ZU_TRAIN.ARRIVAL_MS + ZU_TRAIN.GRACE_S * 1000; // 31000

// Fases canônicas do protocolo (contrato do HUD/cinemática/servidor).
export const ZU_TRAIN_PHASES = Object.freeze(['embarque', 'em_rota', 'portas', 'grace', 'combate']);

// Fase do protocolo no instante elapsedMs desde o matchStart.
export function zuTrainPhase(elapsedMs) {
  const t = Number(elapsedMs);
  if (!Number.isFinite(t) || t < ZU_TRAIN.EMBARQUE_MS) return 'embarque';
  if (t < ZU_TRAIN.DOOR_OPEN_MS) return 'em_rota';
  if (t < ZU_TRAIN.ARRIVAL_MS) return 'portas';
  if (t < COMBAT_UNLOCK_MS) return 'grace';
  return 'combate';
}

// Combate liberado? (elapsedMs desde o matchStart). Durante a rota/portas/grace
// NINGUÉM ataca ninguém — o servidor rejeita o dano jogador-contra-jogador.
export function canAttackAt(elapsedMs) {
  return zuTrainPhase(elapsedMs) === 'combate';
}

// Epoch de desbloqueio a partir do epoch de início da partida (autoridade online).
export function combatUnlockEpoch(startedAtEpoch) {
  const s = Number(startedAtEpoch);
  if (!Number.isFinite(s)) return null;
  return s + COMBAT_UNLOCK_MS;
}

// Combate liberado dado (epoch início da partida, epoch agora) — atalho do servidor.
export function canAttackEpoch(startedAtEpoch, nowEpoch) {
  const unlock = combatUnlockEpoch(startedAtEpoch);
  if (unlock === null || !Number.isFinite(nowEpoch)) return true; // sem contrato → fallback liberado
  return nowEpoch >= unlock;
}

// Janela de salto de porta: elapsed dentro de [DOOR_OPEN_MS, ARRIVAL_MS).
export function doorWindowOpen(elapsedMs) {
  const t = Number(elapsedMs);
  return Number.isFinite(t) && t >= ZU_TRAIN.DOOR_OPEN_MS && t < ZU_TRAIN.ARRIVAL_MS;
}

// Hash numérico do seed — MESMA fórmula do sim3d (paridade sim ↔ servidor):
// rota do trem derivada dela é idêntica nos dois lados.
export function seedHashOf(seed) {
  return [...String(seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
}

// Rota do trem: P0 (borda do Ring, fora da zona) → P1 (spawn/chegada).
// Derivada do seed (ângulo determinístico) + spawn autoritativo do mundo.
export function trainRoute({ x, z }, seedHash) {
  const angle = ((Number(seedHash) || 0) % 360) * (Math.PI / 180);
  const dist = 150;
  return { x0: x + Math.cos(angle) * dist, z0: z + Math.sin(angle) * dist, x1: x, z1: z };
}

// Pose do trem na rota no instante elapsedMs: progressão suave 0→1 entre
// EMBARQUE e ARRIVAL (ease-in-out — o trem acelera após o embarque e freia na chegada).
export function trainPoseAt(elapsedMs, route) {
  const t = Math.min(Math.max(Number(elapsedMs) || 0, 0), ZU_TRAIN.ARRIVAL_MS);
  const raw = ZU_TRAIN.ARRIVAL_MS > 0 ? t / ZU_TRAIN.ARRIVAL_MS : 1;
  const k = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2; // easeInOutQuad
  return { x: route.x0 + (route.x1 - route.x0) * k, z: route.z0 + (route.z1 - route.z0) * k, progress: k };
}

// Pose de SALTO DE PORTA no instante elapsedMs (pureza total — servidor valida
// com a MESMA função que o cliente usa para predizer): posição do trem + offset
// lateral da porta + altura de queda. yaw olha para o centro (0,0).
export function trainDoorJumpPose(elapsedMs, route) {
  const pose = trainPoseAt(elapsedMs, route);
  const dx = route.x1 - route.x0, dz = route.z1 - route.z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;         // direção da rota
  const rx = -uz, rz = ux;                    // lateral direita da rota
  return {
    x: pose.x + rx * ZU_TRAIN.JUMP_LATERAL,
    z: pose.z + rz * ZU_TRAIN.JUMP_LATERAL,
    y: ZU_TRAIN.JUMP_HEIGHT,
    yaw: Math.atan2(-pose.x, -pose.z),
  };
}

// Serialização do anúncio (evento zuIngress + snapshot.authoritative).
export function zuTrainAnnouncement(startedAtEpoch) {
  return {
    startedAt: Number(startedAtEpoch),
    doorOpenAtMs: ZU_TRAIN.DOOR_OPEN_MS,
    arrivalAtMs: ZU_TRAIN.ARRIVAL_MS,
    graceS: ZU_TRAIN.GRACE_S,
    combatLockedUntil: combatUnlockEpoch(startedAtEpoch),
  };
}
