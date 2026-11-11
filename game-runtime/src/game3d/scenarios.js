// Fase 42 — MUNDOS FIEIS AO README: rótulos, setores, dinâmicas e fecho de anel
// 1:1 com a seção "Ontologia dos Mundos" / "Mundos Oficiais (W1–W4)" do README.
// Dinâmica por mundo (README):
//   CIGKV     — Protocolo CIGKV + PULSO KHAAOS (anomalia de gravidade: o runtime
//               comprime o Ring de 3 h em MATCH_TIME 600 s — pulso ~2 min);
//   W1 Barburhen — "Água da Morte": anel + chuva ácida (acidRain no sim, id-gated);
//   W2 Priadus   — "Emboscada Verde": neblina com esporos tóxicos (SPORE_FOG);
//   W3 Ckesalth  — "Assassino Silencioso": fumaça tóxica (TOXIC_SMOKE);
//   W4 Arukheea  — "Tsunami": anel fecha na Prisão (TSUNAMI_WAVE).
// ringFinal = setor canônico onde o anel FECHA (README, linha "Dinâmica" de cada
// mundo) — a posição é a do distrito correspondente em layout3d.districts.
export const SCENARIOS = Object.freeze({
  CIGKV: Object.freeze({
    id: 'CIGKV',
    label: 'CIGKV — Campo de Instrução',
    shortLabel: 'CIGKV',
    mapLabel: 'Khaaos Ville', // F42 — README: "Khaaos Ville" (antes: typo 'Khaoos Ville')
    // Ingresso canônico do campo: o esquadrão chega no trem do ZU, no solo.
    // O airdrop permanece somente como fixture legado explícito.
    zuIngress: Object.freeze({ protocol: 'zu_train_v1', eventProtocol: 'ZU_TRAIN_V1', mode: 'train', durationMs: 3400 }),
    sectorNames: ['Pátio de Armamento', 'Proving Grounds', 'Parque Abandonado', 'Urbano Denso', 'Terminal ZEX'],
    playerSpawn: { x: 0, z: 150 },
    ringDamageMultiplier: 1,
    krcMultiplier: 0.5,
    xpMultiplier: 1.0,
    // F42 — PULSO KHAAOS (README, Protocolo CIGKV): "a cada 10 minutos, alteração
    // climática ou drop de loot lendário". A anomalia KHAOS (pilões de contenção
    // que drenam escudo/vida fora deles) é o Pulso do campo de instrução — números
    // pinados da F29/F30 (12 dps, âncora 28 m, gravidade 0.35, 4 pilões).
    survival: Object.freeze({
      type: 'KHAOS_GRAVITY', intervalSeconds: 120, durationSeconds: 30,
      damagePerSecond: 12, gravityScale: 0.35, anchorRadius: 28,
      anchors: Object.freeze([
        Object.freeze({ id: 'NEXUS', name: 'Nexus of Khaaos', x: 0, z: 0 }),
        Object.freeze({ id: 'NORTH', name: 'North Astral Spire', x: 0, z: -95 }),
        Object.freeze({ id: 'EAST', name: 'East Void Sanctum', x: 95, z: 0 }),
        Object.freeze({ id: 'WEST', name: 'West Quantum Array', x: -95, z: 0 }),
      ]),
    }),
    groundTint: '#ffffff',
    fogColor: '#57382f',
    sky: { top: '#160f2e', mid: '#4a2a4e', horizon: '#c65a2e' },
  }),
  BARBURHEN: Object.freeze({
    id: 'Barburhen',
    label: 'Barburhen — O Mundo da Destruição',
    shortLabel: 'BARBURHEN / W1',
    mapLabel: 'Ruínas Urbanas de Barburhen',
    sectorNames: ['Área Urbana e Comercial', 'Setor Industrial', 'Parque Abandonado', 'Zona de Extração', 'Terminal ZEX'],
    playerSpawn: { x: 90, z: 150 },
    ringDamageMultiplier: 1.5,
    krcMultiplier: 1.0,
    xpMultiplier: 1.25,
    // F42 — README W1: "anel de conflito fecha em 10 min em direção ao Parque".
    ringFinal: Object.freeze({ x: -100, z: 95, name: 'Parque Abandonado' }),
    groundTint: '#d9d4ca',
    fogColor: '#a89e92',
    sky: { top: '#4e5a64', mid: '#8e958f', horizon: '#d8b894' },
  }),
  PRIADUS: Object.freeze({
    id: 'Priadus',
    label: 'Priadus — A Floresta da Escuridão',
    shortLabel: 'PRIADUS / W2',
    mapLabel: 'Selva Hostil de Priadus',
    sectorNames: ['Área Pantanosa', 'Bosque', 'Área de Caça', 'Templo Antigo', 'Terminal ZEX'],
    playerSpawn: { x: -90, z: 150 },
    ringDamageMultiplier: 1.75,
    krcMultiplier: 1.5,
    xpMultiplier: 1.5,
    // F42 — README W2 ("Emboscada Verde"): "anel fecha no templo; neblina com
    // esporos tóxicos pune atraso". A neblina-teto sobe até sporeTopY (o tsunami
    // canônico migrou para W4/Arukheea).
    survival: Object.freeze({ type: 'SPORE_FOG', intervalSeconds: 150, durationSeconds: 45, damagePerSecond: 7, sporeTopY: 90 }),
    ringFinal: Object.freeze({ x: 100, z: 95, name: 'Templo Antigo' }),
    groundTint: '#86a58e',
    fogColor: '#2a2f45',
    sky: { top: '#0a0f1c', mid: '#252c44', horizon: '#7d9078' },
  }),
  CKESALTH: Object.freeze({
    id: 'Ckesalth',
    label: 'Ckesalth — O Deserto das Almas Esquecidas',
    shortLabel: 'CKESALTH / W3',
    mapLabel: 'Refinaria de Ckesalth',
    sectorNames: ['Resort Abandonado', 'Vilarejo dos Beduínos', 'Refinaria de Petróleo', 'Areia Movediça', 'Terminal ZEX'],
    playerSpawn: { x: 150, z: -90 },
    ringDamageMultiplier: 2,
    krcMultiplier: 2.25,
    xpMultiplier: 2.0,
    // F42 — README W3 ("Assassino Silencioso"): "a partir de 5 min o anel fecha
    // na Vila Sombria sob fumaça tóxica". A fumaça-teto sobe até smokeTopY (a
    // erupção de lava saiu — as lagoas de óleo em chamas seguem como cenário).
    survival: Object.freeze({ type: 'TOXIC_SMOKE', intervalSeconds: 140, durationSeconds: 35, damagePerSecond: 9, smokeTopY: 180 }),
    ringFinal: Object.freeze({ x: 95, z: -95, name: 'Vila Sombria' }),
    groundTint: '#cdbb9d',
    fogColor: '#5e452c',
    sky: { top: '#241418', mid: '#8a4a2a', horizon: '#e8bd6e' },
  }),
  ARUKHEEA: Object.freeze({
    id: 'Arukheea',
    label: 'Arukheea — A Ilha dos Gritos Calados',
    shortLabel: 'ARUKHEEA / W4',
    mapLabel: 'Ilha dos Gritos Calados', // F42 — README: "Ilha dos Gritos Calados" (antes: 'Ilha GriCa')
    sectorNames: ['Bosque dos Perdidos', 'Prisão do Sol da Noite', 'Fábrica / Cemitério das Baleias', 'Marina Fantasma', 'Terminal ZEX'],
    playerSpawn: { x: -150, z: -90 },
    ringDamageMultiplier: 2.25,
    krcMultiplier: 3.5,
    xpMultiplier: 3.0,
    // F42 — README W4 ("Tsunami"): "anel fecha na Prisão; quem não sobe no
    // helicóptero torna-se 'grito calado'". A anomalia KHAOS migrou para o
    // Pulso do CIGKV (Protocolo CIGKV).
    survival: Object.freeze({ type: 'TSUNAMI_WAVE', intervalSeconds: 180, durationSeconds: 40, damagePerSecond: 6, submergeBelowY: 90 }),
    ringFinal: Object.freeze({ x: 95, z: -95, name: 'Prisão do Sol da Noite' }),
    groundTint: '#b5c2bb',
    fogColor: '#243648',
    sky: { top: '#0e1526', mid: '#2a4258', horizon: '#a8c3c9' },
  }),
});

export function resolveScenario(value = 'CIGKV') {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'barburhen' || normalized === 'w1' || normalized === 'w1/c1') return SCENARIOS.BARBURHEN;
  if (normalized === 'priadus' || normalized === 'w2' || normalized === 'w2/c2') return SCENARIOS.PRIADUS;
  if (normalized === 'ckesalth' || normalized === 'w3' || normalized === 'w3/c3') return SCENARIOS.CKESALTH;
  if (normalized === 'arukheea' || normalized === 'w4' || normalized === 'w4/c4') return SCENARIOS.ARUKHEEA;
  return SCENARIOS.CIGKV;
}
