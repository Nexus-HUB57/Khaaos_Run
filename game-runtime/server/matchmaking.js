export const REGIONS=['sa-east','us-east','eu-west'];
export function normalizeRegion(region){return REGIONS.includes(region)?region:'sa-east';}
export function normalizeMode(mode){return mode==='3d'?'3d':'2d';}
// chooseRoom respeita o modo (2d legado / 3d): salas só agrupam clientes do mesmo modo.
export function chooseRoom(rooms,region,capacity,mode='2d'){const wanted=normalizeMode(mode);const candidates=[...rooms.values()].filter(r=>(r.mode??'2d')===wanted&&r.region===region&&r.players.size<capacity&&!r.started);return candidates.sort((a,b)=>a.players.size-b.players.size)[0]||null;}
export function chooseRegion(preferred,latencies={}){const wanted=normalizeRegion(preferred);if(Number.isFinite(latencies[wanted])&&latencies[wanted]<=180)return wanted;return Object.entries(latencies).filter(([region,ping])=>REGIONS.includes(region)&&Number.isFinite(ping)).sort((a,b)=>a[1]-b[1])[0]?.[0]||wanted;}
