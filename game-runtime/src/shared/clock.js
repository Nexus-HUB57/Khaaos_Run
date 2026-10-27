// Khaaos Run — matemática de relógio compartilhada (servidor ↔ cliente).
//
// O servidor é a ÚNICA autoridade de tempo: anúncios cronometrados (trem do ZU,
// oficiais, pulsos) carregam `startedAt` em epoch do servidor e os clientes
// convertem para o próprio relógio via offset estimado no ping/pong.
//
//   offset ≈ serverNow − clientSentAt − rtt/2
//
// (o pong do servidor chega `rtt/2` depois de o servidor datar `serverNow`;
// o cliente enviou `clientSentAt` no mesmo pacote — ver net3d.js)

// Duração canônica da cinemática do trem do ZU (servidor e cliente leem daqui —
// trainIntro.js TIMELINE.DURATION é derivado desta constante).
export const TRAIN_INTRO_DURATION_MS = 3400;

// Janela extra em que o trem ainda pode ser tocado por quem recebe o anúncio
// com atraso de rede (snapshot enfileirado, aba em background).
export const TRAIN_INTRO_GRACE_MS = 1500;

// Offset (ms) a somar ao relógio local para obter "agora" no relógio do
// servidor. Retorna null com entradas inválidas — o cliente decide o fallback.
export function estimateClockOffset({ serverNow, clientSentAt, rtt = 0 } = {}) {
  if (!Number.isFinite(serverNow) || !Number.isFinite(clientSentAt)) return null;
  return serverNow - clientSentAt - Math.max(0, Number(rtt) || 0) / 2;
}

// Tempo decorrido (ms) desde um marco `startedAt` do servidor, dado o offset
// local. Sem offset → null (chamador aplica fallback determinístico).
export function serverElapsedMs(serverAt, offset) {
  if (!Number.isFinite(serverAt)) return null;
  if (!Number.isFinite(offset)) return null;
  return Date.now() + offset - serverAt;
}
