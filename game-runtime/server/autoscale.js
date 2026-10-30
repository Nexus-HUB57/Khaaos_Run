// Khaaos Run — carga por região e recomendação de autoscaling.
//
// Cálculo puro sobre o estado de salas do runtime: utilização por região
// (jogadores assentados / assentos provisionados) e recomendação para o
// autoscaler externo (k8s HPA, VM autoscaler ou painel manual):
//   - scale_out: saturação ≥ scaleOutPct OU jogadores esperando na fila;
//   - scale_in:  utilização < scaleInPct, sem fila e com salas abertas;
//   - ok:        banda saudável — nenhuma ação.
// Salas de região desconhecida caem em `sa-east` (mesma normalização do
// matchmaking), mantendo a soma de jogadores consistente.
import { REGIONS, normalizeRegion } from './matchmaking.js';

export const SCALE_DEFAULTS = Object.freeze({ scaleOutPct: 85, scaleInPct: 30 });

// rooms: Map de salas com { region, players: Map, capacity }.
// queue: profundidade global de matchmaking (distribuída na região mais cheia).
export function regionLoads(rooms, { queue = 0 } = {}) {
  const byRegion = new Map(REGIONS.map((region) => [region, { region, rooms: 0, players: 0, playerSlots: 0, queue: 0 }]));
  for (const room of rooms.values()) {
    const entry = byRegion.get(normalizeRegion(room.region));
    if (!entry) continue;
    entry.rooms += 1;
    entry.players += room.players?.size ?? 0;
    entry.playerSlots += room.capacity ?? 16;
  }
  const loads = [...byRegion.values()];
  if (queue > 0) {
    const busiest = loads.slice().sort((a, b) => (b.players / (b.playerSlots || 1)) - (a.players / (a.playerSlots || 1)))[0];
    if (busiest) busiest.queue = queue;
  }
  for (const load of loads) load.utilization = load.playerSlots ? load.players / load.playerSlots : 0;
  return loads;
}

// load: saída de regionLoads() (uma região) com rooms/players/playerSlots/queue.
export function recommend(load, { scaleOutPct = SCALE_DEFAULTS.scaleOutPct, scaleInPct = SCALE_DEFAULTS.scaleInPct } = {}) {
  const pct = (load.utilization || 0) * 100;
  if (pct >= scaleOutPct || (load.queue || 0) > 0) return 'scale_out';
  if (pct < scaleInPct && load.rooms > 0) return 'scale_in';
  return 'ok';
}
