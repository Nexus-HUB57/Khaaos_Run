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

// ------------------------------------------------- mira / crosshair ----
// Fase 38 — a MIRA entra no festival sazonal por aura: elemento de COMBATE,
// o tratamento é mais contido que o do badge/ícone — os braços (as 4 linhas)
// carregam a IDENTIDADE da skin (--aura), o ponto central e o GLOW levam a
// cor TINGIDA pela estação (--aura-season) e um anel cônico girando em volta
// segue o RITMO da temporada (--aura-dur, opacidade baixa p/ não poluir a
// pontaria). Fonte única de decisão = hudAuraFor (mesma do badge/vinheta/
// ícone) — a mira nunca inventa cor fora do catálogo.
// Retorna null quando NÃO há aura ativa ou hex inválido — hud3d limpa as
// variáveis e a mira volta ao neutro (--acid), custo 0.
export function crosshairVars(aura = null, mythicHex = null) {
  return weaponIconVars(aura, mythicHex);
}

// ---------------------------------------------- killfeed / feed de combate ----
// Fase 39 — o KILLFEED entra no festival sazonal por aura: as entradas do
// PRÓPRIO jogador (isPlayerKill) celebram a eliminação na identidade da
// skin (--kf-aura na borda) com o ícone (☠/✕/◌) no GLOW da estação
// (--kf-season) e o ritmo de entrada escalado pela temporada (--kf-dur).
// Kills entre bots permanecem neutras — a aura é a skin EQUIPADA, ela
// celebra o que o jogador fez, não o que ele assiste. Mesma fonte única
// de decisão (hudAuraFor + catálogo) — o feed nunca inventa cor.
// Retorna null quando NÃO há aura ativa ou hex inválido — hud3d não decora
// a entrada (killfeed neutro, custo 0).
export function killfeedVars(aura = null, mythicHex = null) {
  return weaponIconVars(aura, mythicHex);
}

// --------------------------------------------- números de dano flutuantes ----
// Fase 39 — os NÚMEROS DE DANO (assinatura Free Fire) entram no festival:
// corpo do número na IDENTIDADE da skin (--dmg-aura), halo/glow na cor
// TINGIDA pela estação (--dmg-season). A gramática de leitura rápida fica
// INTACTA: headshot mantém o VERMELHO (ganha só o halo da estação) e os
// tiers com identidade própria (hazard por mundo, NOCAUTE dourado) nunca
// são tingidos — a estação decora, o semáforo de combate informa.
// Retorna null quando NÃO há aura ativa ou hex inválido — números neutros,
// custo 0.
export function damageVars(aura = null, mythicHex = null) {
  return weaponIconVars(aura, mythicHex);
}

// ---------------------------------------------- minimapa — tint sazonal ----
// Fase 39 — o MINIMAPA recebe o tint da ESTAÇÃO DO ANO (calendário, não
// aura: o radar obedece à temporada global do festival — a mesma estação
// que tinge a vinheta/mira/ícone). A identidade tática fica INTACTA: os
// semáforos funcionais (terminal verde/âmbar, loot ciano, recon âmbar,
// jogador dourado, anéis do Ring) NUNCA mudam de matiz — a estação tinge
// apenas as camadas decorativas: fundo (véu translúcido), grade e a MOLDURA
// do painel (borda + halo via --mm-edge no CSS). "A estação tinge, nunca
// substitui" — mesmo princípio da vinheta F36.
//   overlay — véu rgba sobre fundo+grade (alpha ≤ .12, leitura preservada);
//   grid    — cor da grade da estação (antes roxo fixo);
//   edge    — cor da borda/halo da moldura (.minimap-frame.seasonal).
export const MINIMAP_SEASON_TINTS = Object.freeze([
  // verão — sol a pino: véu quente, borda laranja-sol
  Object.freeze({ id: 'verao', overlay: 'rgba(255,140,60,.10)', grid: 'rgba(170,120,95,.20)', edge: '#ff9a4d' }),
  // outono — folhagem seca: véu âmbar, borda cobre
  Object.freeze({ id: 'outono', overlay: 'rgba(196,124,44,.11)', grid: 'rgba(168,118,74,.20)', edge: '#c88a3e' }),
  // inverno — frio de Barburhen: véu azulado, borda gelo
  Object.freeze({ id: 'inverno', overlay: 'rgba(120,170,255,.11)', grid: 'rgba(112,142,192,.20)', edge: '#6fa8dc' }),
  // primavera — renascimento: véu esverdeado, borda broto
  Object.freeze({ id: 'primavera', overlay: 'rgba(140,230,120,.10)', grid: 'rgba(122,168,120,.20)', edge: '#7ddc6a' }),
]);

// Tint do minimapa pelo índice da estação (PURO, determinístico). Entrada
// suja (NaN/negativo/overflow) cai no clamp módulo — o radar nunca fica sem
// estação; o retorno é SEMPRE uma entrada congelada da tabela canônica.
export function minimapTintFor(seasonIdx = 0) {
  const i = ((Number(seasonIdx) | 0) % 4 + 4) % 4;   // NaN → 0 (verão), sujo → módulo
  return MINIMAP_SEASON_TINTS[i];
}
