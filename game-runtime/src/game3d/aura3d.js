// Khaaos Run — Fase 36 — AURA SAZONAL DO HUD (efeito de temporada por skin).
//
// A Fase 34 deu ao badge mítico o festival por aura (anel cônico + shimmer).
// A F36 expande a sazonalidade para o HUD INTEIRO com custo ~0: a aura da
// skin corrente tinge uma vinheta de borda em tela cheia e modula o RITMO
// do festival por ESTAÇÃO DO ANO (hemisfério sul — estúdio BR).
//
// Contrato headless (mesmo do perf3d/gfxsettings): funções PURAS, zero
// document/canvas, decisão inspecionável em Node. O DOM só recebe o
// RESULTADO (atributos data-* + variáveis CSS) pelo hud3d — nada aqui toca
// em window/localStorage.
import * as THREE from 'three';

// ------------------------------------------------------------- estações ----
// Estações METEOROLÓGICAS (hemisfério sul): verão 12-02, outono 03-05,
// inverno 06-08, primavera 09-11. Cada estação modula o festival:
//   hueShift — deslocamento de matiz da aura (graus; a IDENTIDADE da skin
//              permanece — a estação tinge, nunca substitui);
//   durMul   — multiplicador da duração das animações (inverno mais calmo,
//              primavera frenética — ritmo de temporada);
//   shimmer  — ângulo da varredura de brilho (sol da estação).
export const HUD_SEASONS = Object.freeze([
  Object.freeze({ id: 'verao', hueShift: 0, durMul: 1, shimmer: 105 }),
  Object.freeze({ id: 'outono', hueShift: 8, durMul: 1.18, shimmer: 121 }),
  Object.freeze({ id: 'inverno', hueShift: -12, durMul: 1.4, shimmer: 75 }),
  Object.freeze({ id: 'primavera', hueShift: 16, durMul: .84, shimmer: 137 }),
]);

// Índice da estação a partir do mês (0-11) — PURA, determinística.
// month = date.getMonth() (0 = janeiro). Dezembro (11) e Jan/Feb = verão.
export function seasonIndexForMonth(month = 0) {
  const m = ((Number(month) | 0) % 12 + 12) % 12;   // NaN/overflow → segurança
  if (m === 11 || m <= 1) return 0;                 // verão
  if (m <= 4) return 1;                             // outono
  if (m <= 7) return 2;                             // inverno
  return 3;                                         // primavera
}

export function seasonIndexFor(date = null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return seasonIndexForMonth(AURA_FALLBACK_DATE.getMonth()); // guard determinístico
  }
  return seasonIndexForMonth(date.getMonth());
}

// Desloca a matiz de um hex sem tocar saturação/luminosidade — PURA via
// THREE.Color (getHSL/setHSL). A aura ORIGINAL nunca sai do catálogo: o
// deslocamento é uma CAMADA de estação (leitura de "fim de temporada").
export function shiftAuraHex(hex = '#ff2d78', hueShift = 0) {
  // THREE.Color aceita lixo e devolve branco (não NaN) — valida o formato
  // ANTES: só hex canônico #rrggbb atravessa (contrato do catálogo).
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return '#ff2d78';
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + hueShift / 360 + 1) % 1, hsl.s, hsl.l);
  return `#${c.getHexString()}`;
}

// ------------------------------------------------------------- decisão ----
// Resolução PURA do estado sazonal do HUD p/ o update corrente.
//   weaponId/weaponSkin — estado do jogador (arma + skin coletada);
//   stage              — estágio mítico (1-4; só cosmético aqui);
//   now                — Date injetável p/ teste (default: agora real).
// Retorna null quando NÃO há skin mítica equipada (HUD neutro — custo 0).
// Quando ativa: aura original (identidade), auraSeason (tingida), estação,
// duração das animações e ângulo do shimmer — o CSS consome via variáveis.
export function hudAuraFor({ weaponId = null, weaponSkin = null, mythicStage = 0, now = null } = {}) {
  if (weaponSkin !== 'MITICA') return null;
  // produção (sem `now`): estação REAL do dia; testes injetam a data —
  // Date podre/indisponível cai no guard determinístico de seasonIndexFor.
  const seasonIdx = seasonIndexFor(now instanceof Date ? now : new Date());
  const season = HUD_SEASONS[seasonIdx];
  return Object.freeze({
    active: true,
    stage: Math.max(1, Math.min(4, mythicStage | 0 || 1)),
    seasonIdx,
    season: season.id,
    hueShift: season.hueShift,
    durMul: season.durMul,
    shimmerAngle: season.shimmer,
    // aura/preenchidas pelo chamador via mythicSkinFor (fonte única do catálogo)
  });
}

// Timestamp determinístico p/ o guard de Date podre (seasonIndexFor) —
// 15/07 (inverno no hemisfério sul). NÃO usa relógio real nos testes: a data
// é sempre INJETADA em hudAuraFor; este fallback só existe p/ robustez.
export const AURA_FALLBACK_DATE = new Date(2026, 6, 15, 12, 0, 0);

// ------------------------------------------------------- ícone da arma ----
// Fase 37 — o ÍCONE da arma no inventário (painel de arma do HUD) entra no
// festival sazonal: recebe as MESMAS variáveis da temporada que o badge e a
// vinheta (fonte única de decisão = hudAuraFor), mapeadas aqui de forma PURA
// para o contrato CSS do ícone:
//   --aura        → cor da skin mítica (identidade — nunca substituída);
//   --aura-season → cor TINGIDA pela estação (glow/varredura do ícone);
//   --aura-dur    → ritmo das animações (inverno calmo, primavera frenético).
// Retorna null quando NÃO há aura ativa ou o hex do catálogo é inválido —
// hud3d então limpa as variáveis (ícone neutro, custo 0).
export function weaponIconVars(aura = null, mythicHex = null) {
  if (!aura || !aura.active) return null;
  if (typeof mythicHex !== 'string' || !/^#[0-9a-f]{6}$/i.test(mythicHex)) return null;
  return Object.freeze({
    aura: mythicHex,
    season: shiftAuraHex(mythicHex, aura.hueShift),
    dur: String(aura.durMul),
    shimmerAngle: aura.shimmerAngle,
  });
}
