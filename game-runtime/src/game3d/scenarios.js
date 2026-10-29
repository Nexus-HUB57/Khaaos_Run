export const SCENARIOS = Object.freeze({
  CIGKV: Object.freeze({
    id: 'CIGKV',
    label: 'CIGKV — Campo de Instrução',
    shortLabel: 'CIGKV',
    mapLabel: 'Khaoos Ville',
    sectorNames: ['Pátio de Armamento', 'Proving Grounds', 'Parque Abandonado', 'Setor Industrial', 'Terminal ZEX'],
    playerSpawn: { x: 0, z: 150 },
    ringDamageMultiplier: 1,
    krcMultiplier: 1,
    groundTint: '#ffffff',
    fogColor: '#57382f',
    sky: { top: '#160f2e', mid: '#4a2a4e', horizon: '#c65a2e' },
  }),
  BARBURHEN: Object.freeze({
    id: 'Barburhen',
    label: 'Barburhen — O Mundo da Destruição',
    shortLabel: 'BARBURHEN / W1',
    mapLabel: 'Ruínas Urbanas de Barburhen',
    sectorNames: ['Área Urbana em Ruínas', 'Setor Industrial', 'Parque Abandonado', 'Zona de Extração', 'Terminal ZEX'],
    playerSpawn: { x: 90, z: 150 },
    ringDamageMultiplier: 1.5,
    krcMultiplier: 1.5,
    groundTint: '#d9d4ca',
    fogColor: '#a89e92',
    sky: { top: '#4e5a64', mid: '#8e958f', horizon: '#d8b894' },
  }),
  PRIADUS: Object.freeze({
    id: 'Priadus',
    label: 'Priadus — A Floresta da Escuridão',
    shortLabel: 'PRIADUS / W2',
    mapLabel: 'Selva Hostil de Priadus',
    sectorNames: ['Área Pantanosa', 'O Bosque', 'Área de Caça', 'Templo Antigo', 'Terminal ZEX'],
    playerSpawn: { x: -90, z: 150 },
    ringDamageMultiplier: 1.75,
    krcMultiplier: 2,
    survival: Object.freeze({ type: 'TSUNAMI_WAVE', intervalSeconds: 180, durationSeconds: 40, damagePerSecond: 6, submergeBelowY: 90 }),
    groundTint: '#86a58e',
    fogColor: '#2a2f45',
    sky: { top: '#0a0f1c', mid: '#252c44', horizon: '#7d9078' },
  }),
  CKESALTH: Object.freeze({
    id: 'Ckesalth',
    label: 'Ckesalth — O Deserto das Almas Esquecidas',
    shortLabel: 'CKESALTH / W3',
    mapLabel: 'Refinaria de Ckesalth',
    sectorNames: ['Resort Abandonado', 'Vilarejo Beduíno', 'Refinaria de Petróleo', 'Cemitério de Areia', 'Terminal ZEX'],
    playerSpawn: { x: 150, z: -90 },
    ringDamageMultiplier: 2,
    krcMultiplier: 2.5,
    survival: Object.freeze({ type: 'VOLCANIC_LAVA', intervalSeconds: 140, durationSeconds: 35, damagePerSecond: 9, lavaBelowY: 180 }),
    groundTint: '#cdbb9d',
    fogColor: '#5e452c',
    sky: { top: '#241418', mid: '#8a4a2a', horizon: '#e8bd6e' },
  }),
  ARUKHEEA: Object.freeze({
    id: 'Arukheea',
    label: 'Arukheea — A Ilha dos Gritos Calados',
    shortLabel: 'ARUKHEEA / W4',
    mapLabel: 'Ilha GriCa',
    sectorNames: ['Bosque dos Perdidos', 'Prisão do Sol da Noite', 'Cemitério das Baleias', 'Marina Fantasma', 'Terminal ZEX'],
    playerSpawn: { x: -150, z: -90 },
    ringDamageMultiplier: 2.25,
    krcMultiplier: 3,
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
