// Khaaos Run — Fase 8: fase do céu (crepúsculo → noite) dirigida pelos pulsos do Ring.
// Módulo PURA/determinístico (sem THREE) para ser testável headless; world3d consome
// os fatores e aplica nos uniforms do céu, fog e luzes. Cada pulso do anel aprofunda
// a noite — o ring "desliga o sol" da CIGKV — e o cliente interpola suavemente.

export const MAX_NIGHT_PULSE = 5; // pulso 5+ = noite profunda (o ring fecha em 42m no 5º pulso)

// Fatores alvo por nightness t ∈ [0,1]: o que escurece/acidifica em cena.
export function nightnessFor(pulse) {
  const p = Math.max(0, Number(pulse) || 0);
  return Math.min(1, p / MAX_NIGHT_PULSE);
}

// Paleta noturna (crepúsculo Mystic Chaos → noite de tempestade roxa).
// Cores base vêm do cenário; aqui só o FATOR de mistura e as cores do lado noturno.
export const NIGHT = Object.freeze({
  skyTop: '#060913',      // azul-quase-preto no zênite
  skyMid: '#151d3a',      // faixa média índigo
  skyHorizon: '#3a2b52',  // horizonte roxo-tempestade
  fog: '#191428',         // fog escura dessaturada
  sunColor: '#8ea6ff',    // "lua" fria (mesma direção do sol)
  sunIntensity: 0.5,
  hemiIntensity: 0.52,
  fillIntensity: 0.14,
  backIntensity: 0.18,
  starBoost: 1.6,         // estrelas do shader ganham peso
  sunDiscDim: 0.12,       // disco solar quase apagado (virou lua)
});

// Mistura utilitária de hex (sem THREE): '#rrggbb' × t → '#rrggbb'
export function mixHex(a, b, t) {
  const pa = parseInt(String(a).slice(1), 16), pb = parseInt(String(b).slice(1), 16);
  const ch = (sa, sb) => Math.round(sa + (sb - sa) * t);
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255);
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255);
  const bl = ch(pa & 255, pb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

export function lerp(a, b, t) { return a + (b - a) * t; }

// Fatores finais para o renderizador dado o nightness atual t ∈ [0,1] e a paleta do cenário.
export function nightSceneState(base, t) {
  const k = Math.max(0, Math.min(1, t));
  return {
    t: k,
    skyTop: mixHex(base.sky.top, NIGHT.skyTop, k),
    skyMid: mixHex(base.sky.mid, NIGHT.skyMid, k),
    skyHorizon: mixHex(base.sky.horizon, NIGHT.skyHorizon, k),
    fog: mixHex(base.fogColor, NIGHT.fog, k),
    sunColor: mixHex(base.sunColor ?? '#ffc98f', NIGHT.sunColor, k),
    sunIntensity: lerp(base.sunIntensity ?? 2.35, NIGHT.sunIntensity, k),
    hemiIntensity: lerp(base.hemiIntensity ?? 1.18, NIGHT.hemiIntensity, k),
    fillIntensity: lerp(base.fillIntensity ?? 0.72, NIGHT.fillIntensity, k),
    backIntensity: lerp(base.backIntensity ?? 0.55, NIGHT.backIntensity, k),
    starBoost: lerp(0.5, NIGHT.starBoost, k),
    sunDiscDim: lerp(1, NIGHT.sunDiscDim, k),
  };
}
