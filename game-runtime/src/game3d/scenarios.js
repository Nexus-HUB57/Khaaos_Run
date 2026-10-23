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
});

export function resolveScenario(value = 'CIGKV') {
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'barburhen' || normalized === 'w1' || normalized === 'w1/c1'
    ? SCENARIOS.BARBURHEN
    : SCENARIOS.CIGKV;
}
