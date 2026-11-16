// Khaaos Run — Task 53 — PROTOCOLO OFICIAL DE ENTRADA ZU (trem dos Rings).
// Khaaos Run — Task 68 — PROTOCOLO ZU v2: VAGÕES + SALTO CONTROLADO + ESCUDO DE POUSO.
//
// O paraquedas NUNCA foi o acesso oficial ao Ring: a entrada canônica é o TREM
// do ZU — todos os operativos embarcam juntos, seguem a rota e só podem sair
// pela porta (salto opcional) ou na chegada. Os ataques ficam travados até
// 15 s APÓS a chegada (grace global — inclui quem saltou no caminho).
//
// v2 (Task 68 — protocolo dos VAGÕES): os 100 operativos viajam em 10 vagões
// de 10 lugares; os vagões chegam à estação do mundo ESCALONADOS a cada 5 s.
// Quem pula ANTES do próprio vagão parar executa um SALTO CONTROLADO — o
// protocolo PREVINE os prováveis acidentes (batida, descarrilamento, incêndio,
// colisão) com corredor seguro lateral, pouso amortecido e intertravamento de
// portas. Quem pousa FORA da Safe Zone recebe o ESCUDO DE POUSO: pelos 15 s em
// que está protegido de ataques também está protegido da penalidade de estar
// fora da zona — 15 s para adentrá-la.
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
//   0            → EMBARQUE    (apresentação cinemática do trem — TRAIN_INTRO)
//   EMBARQUE_MS  → EM ROTA     (câmera no vagão, portas fechadas, combate travado)
//   DOOR_OPEN_MS → PORTAS      (portas abertas — ESPAÇO salta; salto antecipado
//                               = SALTO CONTROLADO com prevenção de acidentes)
//   ARRIVAL_MS   → DESEMBARQUE (vagão 1 para; vagões seguintes a cada 5 s —
//                               desembarque obrigatório daquele vagão)
//   LAST_WAGON_STOP_MS → GRACE (último vagão parado; ataques travados +15 s)
//   COMBAT_UNLOCK_MS   → COMBATE LIVRE (pulso do Ring começa a contar AQUI)
import { TRAIN_INTRO_DURATION_MS } from './clock.js';

export const ZU_TRAIN = Object.freeze({
  EMBARQUE_MS: TRAIN_INTRO_DURATION_MS, // 3400 — embarque/apresentação (contrato Fase 11/12 preservado)
  DOOR_OPEN_MS: 8000,                   // portas abertas: janela de salto antecipado (controlado)
  ARRIVAL_MS: 16000,                    // chegada do VAGÃO 1 (base da escalonagem)
  WAGONS: 10,                           // Task 68 — 10 vagões
  WAGON_CAPACITY: 10,                   // Task 68 — 10 operativos por vagão (10×10 = 100)
  WAGON_GAP_MS: 5000,                   // Task 68 — vagões chegam a cada 5 s
  GRACE_S: 15,                          // protocolo ZU: ataques liberados 15 s APÓS a chegada (escudo de pouso)
  JUMP_HEIGHT: 5.5,                     // altura do salto de porta (m — pouso canônico 'chute')
  JUMP_LATERAL: 2.6,                    // deslocamento lateral da porta (m — lado direito do vagão)
  SAFE_CORRIDOR_M: 1.2,                 // Task 68 — corredor anti-acidente além da lateral da porta
  CORRIDOR_TIER_M: 0.45,                // Task 68 — folga extra por vagão (fluxos não colidem)
  PLATFORM_SEAT_SPACING: 1.8,           // Task 68 — fileira da plataforma por lugar (ao longo da rota)
  PLATFORM_WAGON_SPACING: 2.4,          // Task 68 — faixa da plataforma por vagão (lateral da rota)
});

// Task 68 — parada do ÚLTIMO vagão: base + 9 intervalos de 5 s = 61 s.
// Os vagões chegam ESCALONADOS (a cada 5 s) e continuam desembarcando
// passageiros após o desbloqueio global — quem está A BORDO é protegido de
// ataques (não pode agir; penalizar quem não pode agir é armadilha) e quem
// POUSA recebe o ESCUDO DE POUSO de 15 s (ataques + fora da Safe Zone).
export const LAST_WAGON_STOP_MS = ZU_TRAIN.ARRIVAL_MS + (ZU_TRAIN.WAGONS - 1) * ZU_TRAIN.WAGON_GAP_MS; // 61000

// Momento do DESBLOQUEIO de combate (ms desde o matchStart): chegada + 15 s
// (cânon Task 53 preservado — a proteção INDIVIDUAL dos vagões tardios é o
// escudo de pouso de 15 s, não a trava global).
export const COMBAT_UNLOCK_MS = ZU_TRAIN.ARRIVAL_MS + ZU_TRAIN.GRACE_S * 1000; // 31000

// Task 68 — recibo canônico de PREVENÇÃO DE ACIDENTES do salto controlado:
// o protocolo garante, por construção, que nenhum destes ocorra.
export const ZU_ACCIDENTS = Object.freeze(['batida', 'descarrilamento', 'incendio', 'colisao']);

// Fases canônicas do protocolo (contrato do HUD/cinemática/servidor).
// Task 68 — a chegada ESCALONADA dos vagões (a cada 5 s) é protocolo de
// EVENTOS (wagonArrived) que atravessa o grace e o combate; as fases
// canônicas da Task 53 permanecem intactas.
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

// Combate liberado? (elapsedMs desde o matchStart). Durante a rota/portas/
// desembarque/grace NINGUÉM ataca ninguém — o servidor rejeita o dano
// jogador-contra-jogador até o ÚLTIMO vagão chegar + grace de 15 s.
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

// Janela GERAL das portas: elapsed dentro de [DOOR_OPEN_MS, LAST_WAGON_STOP_MS).
// Task 68 — as portas permanecem abertas enquanto HOUVER vagão em rota.
export function doorWindowOpen(elapsedMs) {
  const t = Number(elapsedMs);
  return Number.isFinite(t) && t >= ZU_TRAIN.DOOR_OPEN_MS && t < LAST_WAGON_STOP_MS;
}

// ---------- Task 68 — VAGÕES (10×10) ----------

// Vagão do operativo de índice i (determinístico: 10 vagões × 10 lugares).
// Jogador é o índice 0; bots seguem na ordem de spawn. Acima de 100, cicla.
export function wagonOfIndex(actorIndex) {
  const i = Math.max(0, Math.floor(Number(actorIndex) || 0));
  return Math.floor(i / ZU_TRAIN.WAGON_CAPACITY) % ZU_TRAIN.WAGONS;
}

// Lugar (assento) do operativo de índice i dentro do próprio vagão (0..9).
export function wagonSeatOfIndex(actorIndex) {
  const i = Math.max(0, Math.floor(Number(actorIndex) || 0));
  return i % ZU_TRAIN.WAGON_CAPACITY;
}

// Momento (ms) em que o vagão w PARA na estação do mundo (chegada escalonada).
export function wagonStopMs(wagon) {
  const w = Math.max(0, Math.min(ZU_TRAIN.WAGONS - 1, Math.floor(Number(wagon) || 0)));
  return ZU_TRAIN.ARRIVAL_MS + w * ZU_TRAIN.WAGON_GAP_MS;
}

// O vagão w já parou na estação neste elapsed (ms)?
export function wagonStopped(elapsedMs, wagon) {
  const t = Number(elapsedMs);
  return Number.isFinite(t) && t >= wagonStopMs(wagon);
}

// Janela de salto DO VAGÃO w: portas abertas E o próprio vagão ainda em rota.
// Depois da parada do vagão o desembarque é OBRIGATÓRIO (sem salto manual).
export function wagonJumpWindowOpen(elapsedMs, wagon) {
  return doorWindowOpen(elapsedMs) && !wagonStopped(elapsedMs, wagon);
}

// Hash numérico do seed — MESMA fórmula do sim3d (paridade sim ↔ servidor):
// rota do trem derivada dela é idêntica nos dois lados.
export function seedHashOf(seed) {
  return [...String(seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
}

// Rota do trem: P0 (borda do Ring, fora da zona) → P1 (estação/spawn do mundo).
// Derivada do seed (ângulo determinístico) + spawn autoritativo do mundo.
export function trainRoute({ x, z }, seedHash) {
  const angle = ((Number(seedHash) || 0) % 360) * (Math.PI / 180);
  const dist = 150;
  return { x0: x + Math.cos(angle) * dist, z0: z + Math.sin(angle) * dist, x1: x, z1: z };
}

// Preenche um buffer de pose para consumidores de alta frequência (renderer).
// A matemática é a mesma de trainPoseAt; o buffer evita GC por frame no cliente.
export function trainPoseAtInto(elapsedMs, route, out = {}) {
  const t = Math.min(Math.max(Number(elapsedMs) || 0, 0), ZU_TRAIN.ARRIVAL_MS);
  const raw = ZU_TRAIN.ARRIVAL_MS > 0 ? t / ZU_TRAIN.ARRIVAL_MS : 1;
  const k = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2; // easeInOutQuad
  out.x = route.x0 + (route.x1 - route.x0) * k;
  out.z = route.z0 + (route.z1 - route.z0) * k;
  out.progress = k;
  return out;
}

// Pose do trem na rota no instante elapsedMs: progressão suave 0→1 entre
// EMBARQUE e ARRIVAL (ease-in-out — o trem acelera após o embarque e freia na chegada).
export function trainPoseAt(elapsedMs, route) {
  return trainPoseAtInto(elapsedMs, route, {});
}

// ---------- Task 68 — SALTO CONTROLADO (prevenção de acidentes) ----------

// Pose de SALTO CONTROLADO no instante elapsedMs para o vagão `wagon`.
// Diferença canônica para o salto de porta clássico: o corredor seguro
// AFASTA o operativo da bitola (SAFE_CORRIDOR_M + folga por vagão) — fluxos
// de vagões distintos NUNCA colidem entre si nem cruzam a via:
//   • batida/colisão  — pose fora da via e jamais à frente do comboio
//   • descarrilamento — a pose do trem é função pura do tempo (nenhum agente
//     altera trilhos/física do comboio)
//   • incêndio        — salto não aplica estado de fogo ao saltador nem ao vagão
//   • queda           — dropPhase 'chute' (pouso amortecido canônico, sem dano)
export function safeJumpPose(elapsedMs, route, wagon) {
  const pose = trainPoseAt(elapsedMs, route);
  const dx = route.x1 - route.x0, dz = route.z1 - route.z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;         // direção da rota
  const rx = -uz, rz = ux;                    // lateral direita da rota
  const w = Math.max(0, Math.min(ZU_TRAIN.WAGONS - 1, Math.floor(Number(wagon) || 0)));
  const lateral = ZU_TRAIN.JUMP_LATERAL + ZU_TRAIN.SAFE_CORRIDOR_M + w * ZU_TRAIN.CORRIDOR_TIER_M;
  return {
    x: pose.x + rx * lateral,
    z: pose.z + rz * lateral,
    y: ZU_TRAIN.JUMP_HEIGHT,
    yaw: Math.atan2(-pose.x, -pose.z),
    wagon: w,
    early: true,
    prevented: ZU_ACCIDENTS,
  };
}

// Pose de SALTO DE PORTA clássico (Task 53 — preservado; usado pelo cliente para
// predizer e pelo servidor para validar): posição do trem + offset lateral da
// porta + altura de queda. yaw olha para o centro (0,0).
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

// ---------- Task 68 — PLATAFORMA DA ESTAÇÃO (desembarque obrigatório) ----------

// Pose de DESEMBARQUE do lugar `seat` do vagão `wagon`: grade determinística na
// plataforma da estação (fileiras ao longo da rota por lugar, faixas laterais
// por vagão) — 100 operativos pousam SEM sobreposição (anti-colisão canônica).
export function platformSlotPose(route, wagon, seat) {
  const dx = route.x1 - route.x0, dz = route.z1 - route.z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;         // direção da rota
  const rx = -uz, rz = ux;                    // lateral direita da rota
  const w = Math.max(0, Math.min(ZU_TRAIN.WAGONS - 1, Math.floor(Number(wagon) || 0)));
  const s = Math.max(0, Math.min(ZU_TRAIN.WAGON_CAPACITY - 1, Math.floor(Number(seat) || 0)));
  const along = (s - (ZU_TRAIN.WAGON_CAPACITY - 1) / 2) * ZU_TRAIN.PLATFORM_SEAT_SPACING;
  const lat = (w - (ZU_TRAIN.WAGONS - 1) / 2) * ZU_TRAIN.PLATFORM_WAGON_SPACING;
  const x = route.x1 + ux * along + rx * lat;
  const z = route.z1 + uz * along + rz * lat;
  return { x, z, y: 0, yaw: Math.atan2(-x, -z), wagon: w, seat: s };
}

// Serialização do anúncio (evento zuIngress + snapshot.authoritative).
export function zuTrainAnnouncement(startedAtEpoch) {
  return {
    startedAt: Number(startedAtEpoch),
    doorOpenAtMs: ZU_TRAIN.DOOR_OPEN_MS,
    arrivalAtMs: ZU_TRAIN.ARRIVAL_MS,
    graceS: ZU_TRAIN.GRACE_S,
    combatLockedUntil: combatUnlockEpoch(startedAtEpoch),
    // Task 68 — contrato dos vagões (chegada escalonada de 5 s)
    wagons: ZU_TRAIN.WAGONS,
    wagonCapacity: ZU_TRAIN.WAGON_CAPACITY,
    wagonGapMs: ZU_TRAIN.WAGON_GAP_MS,
    lastWagonStopMs: LAST_WAGON_STOP_MS,
  };
}
