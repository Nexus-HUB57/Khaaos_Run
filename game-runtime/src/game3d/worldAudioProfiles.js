// Khaaos Run — perfis acústicos canônicos dos mundos.
// Mantém a identidade sonora determinística e sem dependência de arquivos externos.

export const WORLD_AUDIO_PROFILES = Object.freeze({
  CIGKV: Object.freeze({
    world: 'CIGKV', surface: 'concrete', wind: 0.26, rain: 0, bed: 180,
    filter: 900, resonance: 0.18, label: 'pátio militar aberto',
  }),
  Barburhen: Object.freeze({
    world: 'Barburhen', surface: 'metal', wind: 0.42, rain: 0.72, bed: 110,
    filter: 620, resonance: 0.28, label: 'ruínas industriais sob chuva ácida',
  }),
  Priadus: Object.freeze({
    world: 'Priadus', surface: 'mud', wind: 0.22, rain: 0.18, bed: 95,
    filter: 480, resonance: 0.34, label: 'selva úmida com esporos',
  }),
  Ckesalth: Object.freeze({
    world: 'Ckesalth', surface: 'sand', wind: 0.58, rain: 0, bed: 130,
    filter: 760, resonance: 0.12, label: 'bacia desértica com fumaça',
  }),
  Arukheea: Object.freeze({
    world: 'Arukheea', surface: 'stone', wind: 0.5, rain: 0.34, bed: 80,
    filter: 540, resonance: 0.4, label: 'ilha costeira e maré distante',
  }),
});

export const FOOTSTEP_PROFILES = Object.freeze({
  concrete: Object.freeze({ band: 920, low: 115, decay: 0.075, gain: 0.26, noise: 0.09 }),
  metal: Object.freeze({ band: 1650, low: 210, decay: 0.2, gain: 0.3, noise: 0.08 }),
  mud: Object.freeze({ band: 420, low: 86, decay: 0.12, gain: 0.34, noise: 0.13 }),
  sand: Object.freeze({ band: 280, low: 72, decay: 0.16, gain: 0.22, noise: 0.18 }),
  stone: Object.freeze({ band: 1180, low: 145, decay: 0.095, gain: 0.28, noise: 0.07 }),
  wood: Object.freeze({ band: 720, low: 105, decay: 0.11, gain: 0.3, noise: 0.1 }),
});

export function worldAudioProfile(worldId = 'CIGKV') {
  return WORLD_AUDIO_PROFILES[worldId] ?? WORLD_AUDIO_PROFILES.CIGKV;
}

export function footstepProfile(surface = 'concrete') {
  return FOOTSTEP_PROFILES[surface] ?? FOOTSTEP_PROFILES.concrete;
}
