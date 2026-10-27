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
    label: 'Barburhen — Protótipo do Setor Industrial',
    shortLabel: 'BARBURHEN / W1',
    mapLabel: 'Complexo Industrial de Barburhen',
    sectorNames: ['Setor Urbano', 'Estação Fria', 'Parque Ferrífero', 'Usina Industrial', 'Terminal ZEX'],
    playerSpawn: { x: 90, z: 150 },
    ringDamageMultiplier: 1.5,
    krcMultiplier: 1.5,
    groundTint: '#d9e1e6',
    fogColor: '#aab9c4',
    sky: { top: '#536b7b', mid: '#92a5ad', horizon: '#d8c6b2' },
  }),
  PRIADUS: Object.freeze({
    id: 'Priadus',
    label: 'Priadus — Preview do Arquipélago Abissal',
    shortLabel: 'PRIADUS / W2',
    mapLabel: 'Arquipélago Abissal de Priadus',
    sectorNames: ['Bacia Pantanosa', 'Dossel Escuro', 'Templo Antigo', 'Laboratório Coral', 'Terminal ZEX'],
    playerSpawn: { x: -90, z: 150 },
    ringDamageMultiplier: 1.75,
    krcMultiplier: 2,
    survival: Object.freeze({ type: 'TSUNAMI_WAVE', intervalSeconds: 180, durationSeconds: 40, damagePerSecond: 6, submergeBelowY: 90 }),
    groundTint: '#b9d7d3',
    fogColor: '#29545e',
    sky: { top: '#071e30', mid: '#1f6470', horizon: '#9cc7b4' },
  }),
  CKESALTH: Object.freeze({
    id: 'Ckesalth',
    label: 'Ckesalth — Preview do Deserto Vertical',
    shortLabel: 'CKESALTH / W3',
    mapLabel: 'Refinaria das Almas Esquecidas',
    sectorNames: ['Acampamento Base', 'Encosta Média', 'Pico de Fumaça', 'Arena do Cume', 'Terminal ZEX'],
    playerSpawn: { x: 150, z: -90 },
    ringDamageMultiplier: 2,
    krcMultiplier: 2.5,
    survival: Object.freeze({ type: 'VOLCANIC_LAVA', intervalSeconds: 140, durationSeconds: 35, damagePerSecond: 9, lavaBelowY: 180 }),
    groundTint: '#d8b27a',
    fogColor: '#70452b',
    sky: { top: '#2b1720', mid: '#a44c2d', horizon: '#efbd69' },
  }),
  ARUKHEEA: Object.freeze({
    id: 'Arukheea',
    label: 'Arukheea — Preview da Singularidade Dimensional',
    shortLabel: 'ARUKHEEA / W4',
    mapLabel: 'Fragmentos Flutuantes no Vazio',
    sectorNames: ['NEXUS OF KHAAOS', 'NORTH ASTRAL SPIRE', 'EAST VOID SANCTUM', 'WEST QUANTUM ARRAY', 'TERMINAL ZEX'],
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
    groundTint: '#a9b8c4',
    fogColor: '#263849',
    sky: { top: '#10152d', mid: '#304d68', horizon: '#b7d2d8' },
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
