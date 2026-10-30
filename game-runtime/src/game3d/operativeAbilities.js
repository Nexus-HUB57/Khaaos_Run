// Khaaos Run — habilidades ativas locais dos 16 operativos canônicos.
// Todos os efeitos são resolvidos pela simulação determinística; o modo online não os ativa.
export const OPERATIVE_ABILITIES = Object.freeze({
  // Fase 11 — Oficiais de Classe Especial JOGÁVEIS: habilidades canônicas da
  // insígnia, mapeadas nos efeitos autoritativos existentes (dash/baluarte/recon)
  // — nenhum efeito novo, mesmo caminho de validação dos 16 operativos.
  OCE_01: Object.freeze({
    operativeId: 'OCE_01', name: 'Carga do Marechal', effect: 'dash',
    cooldownSeconds: 55, durationSeconds: 2,
    parameters: Object.freeze({ speedMultiplier: 1.7, maxDistance: 9 }),
    description: 'Arranque de insígnia da Classe Especial: avança até 9 metros em 2 segundos, parando em colisões.',
  }),
  OCE_02: Object.freeze({
    operativeId: 'OCE_02', name: 'Baluarte da Classe Especial', effect: 'damageReduction',
    cooldownSeconds: 55, durationSeconds: 6,
    parameters: Object.freeze({ damageReduction: 0.25 }),
    description: 'Disciplina de blindagem: reduz em 25% o dano direto recebido por 6 segundos.',
  }),
  OCE_03: Object.freeze({
    operativeId: 'OCE_03', name: 'Varredura da Insígnia', effect: 'recon',
    cooldownSeconds: 60, durationSeconds: 3,
    parameters: Object.freeze({ radius: 34, revealSeconds: 3 }),
    description: 'Varredura de comando: marca no minimapa inimigos vivos num raio de 34 metros por 3 segundos.',
  }),
  OP_MALE_VANGUARD: Object.freeze({
    operativeId: 'OP_MALE_VANGUARD', name: 'Ruptura de Viela', effect: 'dash',
    cooldownSeconds: 55, durationSeconds: 2,
    parameters: Object.freeze({ speedMultiplier: 1.65, maxDistance: 8 }),
    description: 'Arranque de incursão em CQB, limitado a 8 metros ou 2 segundos; para em colisões.',
  }),
  OP_MALE_BREACHER: Object.freeze({
    operativeId: 'OP_MALE_BREACHER', name: 'Cunha de Forja', effect: 'damageReduction',
    cooldownSeconds: 55, durationSeconds: 6,
    parameters: Object.freeze({ damageReduction: 0.2 }),
    description: 'Reduz em 20% o dano direto recebido por 6 segundos, sem conceder invulnerabilidade.',
  }),
  OP_MALE_RECON_ASIAN: Object.freeze({
    operativeId: 'OP_MALE_RECON_ASIAN', name: 'Eco de Priadus', effect: 'recon',
    cooldownSeconds: 60, durationSeconds: 3,
    parameters: Object.freeze({ radius: 28, revealSeconds: 3 }),
    description: 'Marca por 3 segundos, apenas no minimapa, inimigos vivos num raio de 28 metros.',
  }),
  OP_MALE_MEDIC_AFRICAN: Object.freeze({
    operativeId: 'OP_MALE_MEDIC_AFRICAN', name: 'Coágulo de Campo', effect: 'heal',
    cooldownSeconds: 55, durationSeconds: 0,
    parameters: Object.freeze({ heal: 24 }),
    description: 'Recupera até 24 pontos de vida instantaneamente; não excede o máximo.',
  }),
  OP_MALE_HUNTER_INDIGENOUS: Object.freeze({
    operativeId: 'OP_MALE_HUNTER_INDIGENOUS', name: 'Sopro de Priadus', effect: 'ringRead',
    cooldownSeconds: 60, durationSeconds: 0,
    parameters: Object.freeze({}),
    description: 'Consulta o tempo determinístico até o próximo pulso do Ring, sem alterar a zona.',
  }),
  OP_MALE_MARKSMAN_MENA: Object.freeze({
    operativeId: 'OP_MALE_MARKSMAN_MENA', name: 'Miragem de Ckesalth', effect: 'precision',
    cooldownSeconds: 55, durationSeconds: 6,
    parameters: Object.freeze({ accuracyMultiplier: 1.2 }),
    description: 'Reduz a dispersão dos disparos por 6 segundos (precisão efetiva +20%).',
  }),
  OP_MALE_BERSERKER_PACIFIC: Object.freeze({
    operativeId: 'OP_MALE_BERSERKER_PACIFIC', name: 'Investida Quebramar', effect: 'speed',
    cooldownSeconds: 55, durationSeconds: 3,
    parameters: Object.freeze({ speedMultiplier: 1.45 }),
    description: 'Aumenta a velocidade de movimento em 45% por 3 segundos.',
  }),
  OP_MALE_TECH_INDIAN: Object.freeze({
    operativeId: 'OP_MALE_TECH_INDIAN', name: 'Eco de Confinamento', effect: 'ringForecast',
    cooldownSeconds: 60, durationSeconds: 0,
    parameters: Object.freeze({}),
    description: 'Consulta o cronômetro e o raio-alvo do próximo pulso do Ring; não o modifica.',
  }),
  OP_FEMALE_VALKYRIE: Object.freeze({
    operativeId: 'OP_FEMALE_VALKYRIE', name: 'Linha de Fuga Valkyrie', effect: 'speed',
    cooldownSeconds: 55, durationSeconds: 4,
    parameters: Object.freeze({ speedMultiplier: 1.35 }),
    description: 'Aumenta a velocidade de movimento em 35% por 4 segundos.',
  }),
  OP_FEMALE_SNIPER: Object.freeze({
    operativeId: 'OP_FEMALE_SNIPER', name: 'Linha de Miragem', effect: 'precision',
    cooldownSeconds: 55, durationSeconds: 6,
    parameters: Object.freeze({ accuracyMultiplier: 1.3 }),
    description: 'Reduz a dispersão dos disparos por 6 segundos (precisão efetiva +30%).',
  }),
  OP_FEMALE_STEALTH_ASIAN: Object.freeze({
    operativeId: 'OP_FEMALE_STEALTH_ASIAN', name: 'Véu Crepuscular', effect: 'concealment',
    cooldownSeconds: 58, durationSeconds: 4,
    parameters: Object.freeze({}),
    description: 'Interrompe a detecção visual dos bots por 4 segundos; não concede invulnerabilidade.',
  }),
  OP_FEMALE_HEAVY_AFRICAN: Object.freeze({
    operativeId: 'OP_FEMALE_HEAVY_AFRICAN', name: 'Coluna de Comboio', effect: 'temporaryArmor',
    cooldownSeconds: 60, durationSeconds: 6,
    parameters: Object.freeze({ armor: 15 }),
    description: 'Gera até 15 pontos de blindagem temporária por 6 segundos; o restante expira.',
  }),
  OP_FEMALE_SURVIVOR_INDIGENOUS: Object.freeze({
    operativeId: 'OP_FEMALE_SURVIVOR_INDIGENOUS', name: 'Véu de Esporos', effect: 'ringResistance',
    cooldownSeconds: 55, durationSeconds: 5,
    parameters: Object.freeze({ ringDamageReduction: 0.4 }),
    description: 'Reduz em 40% o dano do Ring recebido por 5 segundos; não afeta dano de armas.',
  }),
  OP_FEMALE_PILOT_EURO: Object.freeze({
    operativeId: 'OP_FEMALE_PILOT_EURO', name: 'Rota de Extração', effect: 'terminalScan',
    cooldownSeconds: 60, durationSeconds: 4,
    parameters: Object.freeze({}),
    description: 'Marca no minimapa o terminal ZEX ativo mais próximo por 4 segundos.',
  }),
  OP_FEMALE_DISRUPTOR_MENA: Object.freeze({
    operativeId: 'OP_FEMALE_DISRUPTOR_MENA', name: 'Pulso de Desarme', effect: 'stun',
    cooldownSeconds: 55, durationSeconds: 2,
    parameters: Object.freeze({ radius: 9, stunSeconds: 1.5 }),
    description: 'Interrompe sem dano os bots vivos a até 9 metros por 1,5 segundo.',
  }),
  OP_FEMALE_TACTICIAN_SOUTHASIAN: Object.freeze({
    operativeId: 'OP_FEMALE_TACTICIAN_SOUTHASIAN', name: 'Égide das Marés', effect: 'damageReduction',
    cooldownSeconds: 60, durationSeconds: 4,
    parameters: Object.freeze({ damageReduction: 0.25 }),
    description: 'Reduz em 25% o dano direto recebido por 4 segundos, sem conceder invulnerabilidade.',
  }),
  // Fase 26 — TALON (Hacker & Urban Runner · Agilidade e Informação).
  // "Invasão de Campo": pulso de varredura digital que REVELA rivais ATRÁS de
  // cobertura (paredes, construções e Paredes de Gel — sem checagem de LOS, é
  // essa a assinatura da skill) com silhueta laranja para Talon e aliados, e
  // acelera salto/escala (vault) em 15% enquanto ativo. Progressão Lv1→Lv6
  // é META-DE-DADOS (UI/progressão): a sim resolve os parâmetros-base canônicos.
  OP_MALE_TALON: Object.freeze({
    operativeId: 'OP_MALE_TALON', name: 'Invasão de Campo', effect: 'fieldScan',
    cooldownSeconds: 65, durationSeconds: 6,
    parameters: Object.freeze({ radius: 20, revealSeconds: 4, vaultSpeedMultiplier: 1.15 }),
    description: 'Pulso de varredura em raio de 20 m por 6 s: rivais atrás de cobertura ganham silhueta laranja por 4 s; salto/escala 15% mais rápidos enquanto ativo.',
    levelProgression: Object.freeze([
      Object.freeze({ level: 1, radius: 15, durationSeconds: 4, cooldownSeconds: 80 }),
      Object.freeze({ level: 2, radius: 17, durationSeconds: 4.6, cooldownSeconds: 74 }),
      Object.freeze({ level: 3, radius: 19, durationSeconds: 5.2, cooldownSeconds: 68 }),
      Object.freeze({ level: 4, radius: 21, durationSeconds: 5.8, cooldownSeconds: 63 }),
      Object.freeze({ level: 5, radius: 23, durationSeconds: 6.4, cooldownSeconds: 59 }),
      Object.freeze({ level: 6, radius: 25, durationSeconds: 7, cooldownSeconds: 55 }),
    ]),
  }),
});

export function getOperativeAbility(operativeId) {
  return OPERATIVE_ABILITIES[operativeId] ?? OPERATIVE_ABILITIES.OP_MALE_VANGUARD;
}
