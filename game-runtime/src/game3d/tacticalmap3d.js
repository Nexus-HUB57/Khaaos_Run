// Khaaos Run — Fase 40 — MAPA TÁTICO EM TELA CHEIA (tecla M).
//
// O minimapa (Fase 35, 30 Hz) é o radar de leitura rápida; o mapa tático é a
// LEITURA COMPLETA do ring — distritos nomeados, anéis do Ring, terminais
// ZEX, loot, contatos revelados e o próprio jogador, no MESMO vocabulário de
// tint sazonal do radar (F39: a estação tinge fundo/grade/moldura — os
// semáforos funcionais nunca mudam).
//
// Contrato headless (mesmo do perf3d/aura3d/tactical): funções PURAS, zero
// document/canvas — a decisão é inspecionável em Node; o DOM só recebe o
// RESULTADO pelo hud3d (draw por canvas 2D).

// Tecla de toggle (main3d binda no keydown; mesmo contrato do 'q'/'r'/'e').
export const TACTICAL_HOTKEY = 'm';

// Janela do mundo desenhada (mesma do minimapa F35: mundo 400 m + margem).
export const TACTICAL_WORLD = 420;

// Escala mundo→canvas: `size` px cobrem TACTICAL_WORLD m (PURO, ≥ 0).
export function tacticalScale(size = 720) {
  return Math.max(0, Number(size) || 0) / TACTICAL_WORLD;
}

// Projeção mundo→canvas (PURA): origem do mundo no CENTRO do canvas, +x →
// direita, +z → baixo (MESMA convenção do #drawMinimap — nenhuma surpresa de
// leitura entre radar e mapa). x/z sujos → centro (nada desenha fora).
export function tacticalProject(x = 0, z = 0, size = 720) {
  const s = tacticalScale(size);
  const px = (Number.isFinite(x) ? x : 0) * s + size / 2;
  const py = (Number.isFinite(z) ? z : 0) * s + size / 2;
  return { px, py };
}

// Marcadores do mapa (PURO e determinístico — mesma leitura do radar):
//   distritos — os 5 setores nomeados do layout {kind:'district', x, z, r, label};
//   ring      — anel corrente {kind:'ring', x, z, radius} + alvo tracejado
//               {kind:'ringTarget', x, z, radius: target};
//   terminais — TODOS (flag `active` preservada — semáforo verde/cinco é
//               funcional; o mapa nunca esconde terminal);
//   loot      — só caixas ativas {kind:'loot'};
//   bots      — SÓ contatos revelados (mesmo gate determinístico do radar:
//               offline revealedTicks > 0, online flag `revealed` — Fase 8);
//   player    — seta {kind:'player', x, z, yaw}.
// Layout/sim ausentes → degrada com graça (radar vazio, sem throw — o mapa
// nunca quebra a partida por dado faltando).
export function tacticalMarkers({
  player = null, ring = null, terminals = [], bots = [], loot = [], districts = [],
} = {}) {
  // guards de coleção: lixo não-iterável degrada para vazio (o mapa NUNCA
  // quebra a partida por dado faltando/podre — contrato de robustez).
  const cols = (v) => Array.isArray(v) ? v : [];
  const out = [];
  for (const d of cols(districts)) {
    if (d && Number.isFinite(d.cx) && Number.isFinite(d.cz)) {
      out.push({ kind: 'district', x: d.cx, z: d.cz, r: d.r ?? 0, label: d.name ?? '' });
    }
  }
  if (ring && Number.isFinite(ring.x) && Number.isFinite(ring.z)) {
    out.push({ kind: 'ringTarget', x: ring.x, z: ring.z, r: ring.target ?? 0 });
    out.push({ kind: 'ring', x: ring.x, z: ring.z, r: ring.radius ?? 0 });
  }
  for (const t of cols(terminals)) {
    if (t && Number.isFinite(t.x) && Number.isFinite(t.z)) {
      out.push({ kind: 'terminal', x: t.x, z: t.z, active: !!t.active, id: t.id ?? null });
    }
  }
  for (const l of cols(loot)) {
    if (l?.active && Number.isFinite(l.x) && Number.isFinite(l.z)) {
      out.push({ kind: 'loot', x: l.x, z: l.z });
    }
  }
  for (const b of cols(bots)) {
    if (b?.alive && (b.revealedTicks > 0 || b.revealed) && Number.isFinite(b.x) && Number.isFinite(b.z)) {
      out.push({ kind: 'recon', x: b.x, z: b.z });
    }
  }
  if (player && Number.isFinite(player.x) && Number.isFinite(player.z)) {
    out.push({ kind: 'player', x: player.x, z: player.z, yaw: player.yaw ?? 0 });
  }
  return out;
}

// Contagem por kind (PURO) — telemetria do mapa p/ o readout de teste/e2e.
export function tacticalMarkerCounts(markers = []) {
  const counts = { district: 0, ring: 0, ringTarget: 0, terminal: 0, loot: 0, recon: 0, player: 0 };
  for (const m of markers ?? []) if (m?.kind in counts) counts[m.kind]++;
  return counts;
}
