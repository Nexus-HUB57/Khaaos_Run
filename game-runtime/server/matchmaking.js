export const REGIONS=['sa-east','us-east','eu-west'];
export function normalizeRegion(region){return REGIONS.includes(region)?region:'sa-east';}
export function normalizeMode(mode){return mode==='3d'?'3d':'2d';}
// chooseRoom respeita o modo (2d legado / 3d): salas só agrupam clientes do mesmo modo.
export function chooseRoom(rooms,region,capacity,mode='2d'){const wanted=normalizeMode(mode);const candidates=[...rooms.values()].filter(r=>(r.mode??'2d')===wanted&&r.region===region&&r.players.size<capacity&&!r.started);return candidates.sort((a,b)=>a.players.size-b.players.size)[0]||null;}
export function chooseRegion(preferred,latencies={}){const wanted=normalizeRegion(preferred);if(Number.isFinite(latencies[wanted])&&latencies[wanted]<=180)return wanted;return Object.entries(latencies).filter(([region,ping])=>REGIONS.includes(region)&&Number.isFinite(ping)).sort((a,b)=>a[1]-b[1])[0]?.[0]||wanted;}

// ---------- Fase 7 — salas privadas com código de convite ----------
// Alfabeto sem caracteres ambíguos (0/O, 1/I, 5/S, 8/B) para leitura em voz alta.
const INVITE_ALPHABET = '23456789ACDEFGHJKLMNPQRTUVWXYZ';
export function makeInviteCode(rng = Math.random, len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) code += INVITE_ALPHABET[Math.floor(rng() * INVITE_ALPHABET.length)];
  return code;
}
export function normalizeInviteCode(code) {
  return String(code ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
}
// Encontra sala privada 3D pelo código, que ainda não começou e tem vaga.
export function findRoomByCode(rooms, code) {
  const wanted = normalizeInviteCode(code);
  if (!wanted) return null;
  return [...rooms.values()].find((r) => r.is3d && r.isPrivate && r.inviteCode === wanted && !r.started && r.players.size < r.capacity) ?? null;
}
