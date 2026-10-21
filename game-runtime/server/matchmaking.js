export const REGIONS=['sa-east','us-east','eu-west'];
export function normalizeRegion(region){return REGIONS.includes(region)?region:'sa-east';}
export function chooseRoom(rooms,region,capacity){const candidates=[...rooms.values()].filter(r=>r.region===region&&r.players.size<capacity&&!r.started);return candidates.sort((a,b)=>a.players.size-b.players.size)[0]||null;}
export function chooseRegion(preferred,latencies={}){const wanted=normalizeRegion(preferred);if(Number.isFinite(latencies[wanted])&&latencies[wanted]<=180)return wanted;return Object.entries(latencies).filter(([region,ping])=>REGIONS.includes(region)&&Number.isFinite(ping)).sort((a,b)=>a[1]-b[1])[0]?.[0]||wanted;}
