import {
  EP555_RANKS,
  EP555_SPECIALIZATIONS,
  canUnlockSpecialization,
  getRankProgress,
  rankFromXp,
  type Rank,
  type SpecializationId,
} from "./schema";
import { KHAAOS_WORLDS, WORLD_ORDER, type WorldId } from "./worlds";
import type { WarICategory } from "./war-i";

// ============================================================================
// EIXO I — HIERARQUIA DE COMANDO MILITAR & PATENTES (ESTATUTO EP555)
// ============================================================================

export interface Ep555HierarchyTier {
  id: Rank;
  echelon: number; // 1..8
  code: string;
  xpRequired: number;
  designation: string;
  commandScope: string;
  maxSquadSize: number;
  dailySoldagemKrc: number;
  armoryClearanceRarity: "COMUM" | "RARO" | "EPICO" | "LENDARIO" | "MITICO";
  zexRetentionBonusPct: number;
  ue5GameplayTag: string;
  doctrineSummary: string;
}

export const EP555_HIERARCHY_TIERS: readonly Ep555HierarchyTier[] = [
  {
    id: "ZHEERS",
    echelon: 1,
    code: "EP555-E1",
    xpRequired: 0,
    designation: "Unidade de Infantaria de Base",
    commandScope: "Operador Individual de Ring (Alistamento Voluntário)",
    maxSquadSize: 1,
    dailySoldagemKrc: 50,
    armoryClearanceRarity: "COMUM",
    zexRetentionBonusPct: 0,
    ue5GameplayTag: "Khaaos.Rank.Zheers",
    doctrineSummary:
      "Posto inicial ao ingressar no CIGKV com conta Bankhaoos automática e 1.000 KRC de instrução no Zu 1.",
  },
  {
    id: "ONITH",
    echelon: 2,
    code: "EP555-E2",
    xpRequired: 15_000,
    designation: "Operador Tático de Incursão",
    commandScope: "Dupla de Incursão / Patrulha Avançada",
    maxSquadSize: 2,
    dailySoldagemKrc: 85,
    armoryClearanceRarity: "RARO",
    zexRetentionBonusPct: 2,
    ue5GameplayTag: "Khaaos.Rank.Onith",
    doctrineSummary:
      "Habilita suporte aéreo tático (Asa) e armamento raro fora do perímetro experimental do CIGKV.",
  },
  {
    id: "SKEETW",
    echelon: 3,
    code: "EP555-E3",
    xpRequired: 45_000,
    designation: "SubOficial de Operações",
    commandScope: "Célula Tática de Reconhecimento (4 Operadores)",
    maxSquadSize: 4,
    dailySoldagemKrc: 130,
    armoryClearanceRarity: "RARO",
    zexRetentionBonusPct: 4,
    ue5GameplayTag: "Khaaos.Rank.Skeetw",
    doctrineSummary:
      "Domínio de engajamento balístico de longo alcance (Mira) e leitura antecipada de encolhimento de Ring.",
  },
  {
    id: "HURAN",
    echelon: 4,
    code: "EP555-E4",
    xpRequired: 100_000,
    designation: "Líder de Esquadrão",
    commandScope: "Esquadrão de Assalto Completo (8 Operadores)",
    maxSquadSize: 8,
    dailySoldagemKrc: 190,
    armoryClearanceRarity: "EPICO",
    zexRetentionBonusPct: 6,
    ue5GameplayTag: "Khaaos.Rank.Huran",
    doctrineSummary:
      "Autoridade de comando tático em campo, fortificação de perímetros (Névoa) e acesso a equipamentos Épicos.",
  },
  {
    id: "VENEX",
    echelon: 5,
    code: "EP555-E5",
    xpRequired: 250_000,
    designation: "Comandante de Regimento",
    commandScope: "Pelotão / Regimento de Guerra (16 Operadores)",
    maxSquadSize: 16,
    dailySoldagemKrc: 280,
    armoryClearanceRarity: "EPICO",
    zexRetentionBonusPct: 8,
    ue5GameplayTag: "Khaaos.Rank.Venex",
    doctrineSummary:
      "Veterano de múltiplos Rings com certificação para blindados pesados (Couraça) e guerra assimétrica em selva (ComNoes).",
  },
  {
    id: "KHAEL",
    echelon: 6,
    code: "EP555-E6",
    xpRequired: 500_000,
    designation: "Estrategista de Divisão",
    commandScope: "Divisão Regional de Infiltração (32 Operadores)",
    maxSquadSize: 32,
    dailySoldagemKrc: 420,
    armoryClearanceRarity: "LENDARIO",
    zexRetentionBonusPct: 11,
    ue5GameplayTag: "Khaaos.Rank.Khael",
    doctrineSummary:
      "Infiltração HALO/HAHO (Raio), requisição de drops estratégicos e acesso ao catálogo Lendário da Forja.",
  },
  {
    id: "MALAKOR",
    echelon: 7,
    code: "EP555-E7",
    xpRequired: 1_000_000,
    designation: "Alto Comissário de Guerra",
    commandScope: "Frente Continental de Operações (64 Operadores)",
    maxSquadSize: 64,
    dailySoldagemKrc: 650,
    armoryClearanceRarity: "LENDARIO",
    zexRetentionBonusPct: 15,
    ue5GameplayTag: "Khaaos.Rank.Malakor",
    doctrineSummary:
      "Autoridade de contra-demolição (Nulo) e sobrevivência extrema nos ciclos terminais Ckesalth e Arukheea.",
  },
  {
    id: "OVERLORD",
    echelon: 8,
    code: "EP555-E8",
    xpRequired: 5_000_000,
    designation: "General Supremo do Khaaos",
    commandScope: "Comando Supremo de Teatro Multi-Mundo (100 Operadores)",
    maxSquadSize: 100,
    dailySoldagemKrc: 1_000,
    armoryClearanceRarity: "MITICO",
    zexRetentionBonusPct: 20,
    ue5GameplayTag: "Khaaos.Rank.Overlord",
    doctrineSummary:
      "Ápice da hierarquia militar EP555. Libera suporte Égide de nível máximo e arsenal Mítico na Forja do Armeiro.",
  },
] as const;

// ============================================================================
// EIXO II — MATRIZ DAS 12 CERTIFICAÇÕES & ESPECIALIZAÇÕES TÁTICAS (EP555 + GAS)
// ============================================================================

export interface Ep555SpecializationDoctrine {
  id: SpecializationId;
  name: string;
  callsign: string;
  requiredRank: Rank;
  morthRequired: number;
  focus: string;
  primaryWarICompartment: WarICategory;
  ue5GasAbilityTag: string;
  ue5PassiveEffectTag: string;
  combatModifiers: {
    maxHealthBonus: number;
    maxEnergyBonus: number;
    speedMultiplier: number;
    zexExtractionSpeedBonusPct: number;
    hazardResistancePct: number;
    recoilControlBonusPct: number;
  };
  signatureEquipment: string;
}

export const EP555_SPECIALIZATION_DOCTRINES: readonly Ep555SpecializationDoctrine[] = [
  {
    id: "INFANTARIA",
    name: "Infantaria",
    callsign: "Uuivo",
    requiredRank: "ZHEERS",
    morthRequired: 25,
    focus: "Combate corpo a corpo",
    primaryWarICompartment: "ARMAMENTO",
    ue5GasAbilityTag: "Ability.Spec.Infantaria.BreachCharge",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Uuivo",
    combatModifiers: {
      maxHealthBonus: 15,
      maxEnergyBonus: 10,
      speedMultiplier: 1.04,
      zexExtractionSpeedBonusPct: 5,
      hazardResistancePct: 5,
      recoilControlBonusPct: 8,
    },
    signatureEquipment: "Lâmina Tática Uuivo & Fuzil CQB",
  },
  {
    id: "FUZILEIROS",
    name: "Fuzileiros",
    callsign: "Avalanche",
    requiredRank: "ZHEERS",
    morthRequired: 50,
    focus: "Operações táticas",
    primaryWarICompartment: "ARMAMENTO",
    ue5GasAbilityTag: "Ability.Spec.Fuzileiros.SuppressiveBurst",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Avalanche",
    combatModifiers: {
      maxHealthBonus: 10,
      maxEnergyBonus: 15,
      speedMultiplier: 1.02,
      zexExtractionSpeedBonusPct: 5,
      hazardResistancePct: 8,
      recoilControlBonusPct: 18,
    },
    signatureEquipment: "Fuzil Khaaos-47 Estabilizado",
  },
  {
    id: "RASTREADORES",
    name: "Rastreadores",
    callsign: "Ferro",
    requiredRank: "ZHEERS",
    morthRequired: 50,
    focus: "Exploração e adaptação",
    primaryWarICompartment: "BAG",
    ue5GasAbilityTag: "Ability.Spec.Rastreadores.ThermalPulse",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Ferro",
    combatModifiers: {
      maxHealthBonus: 5,
      maxEnergyBonus: 20,
      speedMultiplier: 1.07,
      zexExtractionSpeedBonusPct: 12,
      hazardResistancePct: 15,
      recoilControlBonusPct: 6,
    },
    signatureEquipment: "Sensor Acústico Anti-Dedo-Duro",
  },
  {
    id: "COMUNICACOES_HACKER",
    name: "Comunicações / Hacker",
    callsign: "Abismo",
    requiredRank: "ZHEERS",
    morthRequired: 75,
    focus: "IA e espionagem avançada",
    primaryWarICompartment: "BAG",
    ue5GasAbilityTag: "Ability.Spec.Hacker.ZexOverclock",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Abismo",
    combatModifiers: {
      maxHealthBonus: 0,
      maxEnergyBonus: 30,
      speedMultiplier: 1.03,
      zexExtractionSpeedBonusPct: 28,
      hazardResistancePct: 10,
      recoilControlBonusPct: 5,
    },
    signatureEquipment: "Decodificador de Terminal ZEX & Drone Recon",
  },
  {
    id: "PILOTO_AERONAVES",
    name: "Piloto de Aeronaves",
    callsign: "Asa",
    requiredRank: "ONITH",
    morthRequired: 100,
    focus: "Ataques aéreos",
    primaryWarICompartment: "BAG",
    ue5GasAbilityTag: "Ability.Spec.Piloto.AirstrikeBeacon",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Asa",
    combatModifiers: {
      maxHealthBonus: 10,
      maxEnergyBonus: 25,
      speedMultiplier: 1.06,
      zexExtractionSpeedBonusPct: 18,
      hazardResistancePct: 12,
      recoilControlBonusPct: 10,
    },
    signatureEquipment: "Transponder de Extração Helitransportada",
  },
  {
    id: "SNIPER",
    name: "Sniper de Elite",
    callsign: "Mira",
    requiredRank: "SKEETW",
    morthRequired: 150,
    focus: "Precisão de longo alcance",
    primaryWarICompartment: "ARMAMENTO",
    ue5GasAbilityTag: "Ability.Spec.Sniper.BallisticFocus",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Mira",
    combatModifiers: {
      maxHealthBonus: 5,
      maxEnergyBonus: 20,
      speedMultiplier: 1.04,
      zexExtractionSpeedBonusPct: 10,
      hazardResistancePct: 10,
      recoilControlBonusPct: 30,
    },
    signatureEquipment: "Sniper Malakor .50 & Óptica Térmica",
  },
  {
    id: "ENGENHARIA_TATICA",
    name: "Engenharia Tática",
    callsign: "Névoa",
    requiredRank: "HURAN",
    morthRequired: 200,
    focus: "Ações estratégicas",
    primaryWarICompartment: "DEFESA",
    ue5GasAbilityTag: "Ability.Spec.Engenharia.DeployBarricade",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Nevoa",
    combatModifiers: {
      maxHealthBonus: 20,
      maxEnergyBonus: 25,
      speedMultiplier: 1.02,
      zexExtractionSpeedBonusPct: 20,
      hazardResistancePct: 22,
      recoilControlBonusPct: 12,
    },
    signatureEquipment: "Gerador de Cobertura Balística & Selante Ácido",
  },
  {
    id: "COMANDOS_SELVA",
    name: "Comandos Selva",
    callsign: "ComNoes",
    requiredRank: "VENEX",
    morthRequired: 250,
    focus: "Perímetros e emboscadas",
    primaryWarICompartment: "ARMAMENTO",
    ue5GasAbilityTag: "Ability.Spec.Selva.SporeCamouflage",
    ue5PassiveEffectTag: "Effect.Passive.Spec.ComNoes",
    combatModifiers: {
      maxHealthBonus: 25,
      maxEnergyBonus: 25,
      speedMultiplier: 1.08,
      zexExtractionSpeedBonusPct: 15,
      hazardResistancePct: 30,
      recoilControlBonusPct: 16,
    },
    signatureEquipment: "Respirador Priadus Anti-Esporos & Carabina Silenciada",
  },
  {
    id: "MOTORISTA_PESADOS",
    name: "Motorista de Pesados",
    callsign: "Couraça",
    requiredRank: "VENEX",
    morthRequired: 300,
    focus: "Blindados e logística",
    primaryWarICompartment: "DEFESA",
    ue5GasAbilityTag: "Ability.Spec.Pesados.KineticPlating",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Couraca",
    combatModifiers: {
      maxHealthBonus: 40,
      maxEnergyBonus: 15,
      speedMultiplier: 0.98,
      zexExtractionSpeedBonusPct: 12,
      hazardResistancePct: 28,
      recoilControlBonusPct: 20,
    },
    signatureEquipment: "Exoesqueleto Couraça & Escudo Khael",
  },
  {
    id: "PARAQUEDISTAS",
    name: "Paraquedistas",
    callsign: "Raio",
    requiredRank: "KHAEL",
    morthRequired: 500,
    focus: "Ação secreta e infiltração",
    primaryWarICompartment: "BAG",
    ue5GasAbilityTag: "Ability.Spec.Paraquedistas.RapidDrop",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Raio",
    combatModifiers: {
      maxHealthBonus: 20,
      maxEnergyBonus: 35,
      speedMultiplier: 1.1,
      zexExtractionSpeedBonusPct: 22,
      hazardResistancePct: 20,
      recoilControlBonusPct: 18,
    },
    signatureEquipment: "Arpéu Tático Raio & Módulo de Salto Zu",
  },
  {
    id: "ANTI_BOMBAS",
    name: "Anti-Bombas",
    callsign: "Nulo",
    requiredRank: "MALAKOR",
    morthRequired: 750,
    focus: "Explosivos e demolição",
    primaryWarICompartment: "DEFESA",
    ue5GasAbilityTag: "Ability.Spec.AntiBombas.BlastSuppression",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Nulo",
    combatModifiers: {
      maxHealthBonus: 50,
      maxEnergyBonus: 25,
      speedMultiplier: 1.0,
      zexExtractionSpeedBonusPct: 18,
      hazardResistancePct: 38,
      recoilControlBonusPct: 22,
    },
    signatureEquipment: "Traje Balístico Termobarico Nulo",
  },
  {
    id: "MEDICO_COMBATE",
    name: "Médico de Combate",
    callsign: "Égide",
    requiredRank: "OVERLORD",
    morthRequired: 1_000,
    focus: "Salvamento e suporte",
    primaryWarICompartment: "BAG",
    ue5GasAbilityTag: "Ability.Spec.Medico.NanoReviveAura",
    ue5PassiveEffectTag: "Effect.Passive.Spec.Egide",
    combatModifiers: {
      maxHealthBonus: 45,
      maxEnergyBonus: 50,
      speedMultiplier: 1.06,
      zexExtractionSpeedBonusPct: 30,
      hazardResistancePct: 40,
      recoilControlBonusPct: 15,
    },
    signatureEquipment: "Unidade Biomédica Égide & Autoinjetor Overlord",
  },
] as const;

// ============================================================================
// EIXO III — ONTOLOGIA DOS MUNDOS, CICLOS, PROTOCOLOS ZU (1-3) & DEDO-DURO
// ============================================================================

export type ZuVariantId = "ZU1" | "ZU2" | "ZU3";

export interface ZuProtocolVariant {
  variantId: ZuVariantId;
  label: string;
  cinematicEvent: string;
  requiredAction: "APERTAR_CINTO" | "SALTAR_AGORA" | "ATIVAR_MASCARA_O2";
  actionLabel: string;
  successOutcome: string;
  failurePenaltyPct: number; // 30% vitality damage on failure
}

export interface WorldSectorFraction {
  name: string;
  fractionLabel: string; // e.g. "1/8", "3/8", "4/8"
  fractionEighths: number; // sum = 8
  tacticalFunction: string;
}

export interface WorldHierarchyNode {
  worldId: WorldId;
  stageCode: "CIGKV" | "W1/C1" | "W2/C2" | "W3/C3" | "W4/C4";
  canonicalTitle: string;
  decentralizerDimensionRemoved: string;
  psychologicalFilter: string;
  ringConflictName: string;
  targetDurationLabel: string;
  maxPlayers: number;
  zexCount: number;
  xpAccurMultiplier: number;
  krcRewardMultiplier: number;
  prerequisiteWorldId: WorldId | null;
  requiredMatchesInPrerequisite: number;
  requiredExtractionsInPrerequisite: number;
  minimumRecommendedRank: Rank;
  dedoDuroAgent: {
    creature: string;
    triggerIdleSeconds: number;
    punishmentEffect: string;
  };
  sectors: readonly WorldSectorFraction[];
  zuProtocols: readonly [ZuProtocolVariant, ZuProtocolVariant, ZuProtocolVariant];
  persistenceRule: string;
}

export const WORLD_HIERARCHY_DAG: readonly WorldHierarchyNode[] = [
  {
    worldId: "CIGKV",
    stageCode: "CIGKV",
    canonicalTitle: "Khaaos Ville — Campo de Instrução de Guerra",
    decentralizerDimensionRemoved: "Estabilidade Civil → Transição para Economia de Sobrevivência (Meta EXCO 1.000.000)",
    psychologicalFilter: "Adaptação ao Risco, Gestão de Vitalidade e Disciplina de Extração",
    ringConflictName: "Pulso Khaaos (Ring Contínuo de 3h)",
    targetDurationLabel: "3 horas (Fluxo Contínuo até EXCO 1.000.000)",
    maxPlayers: 50,
    zexCount: 15,
    xpAccurMultiplier: 1.0,
    krcRewardMultiplier: 1.0,
    prerequisiteWorldId: null,
    requiredMatchesInPrerequisite: 0,
    requiredExtractionsInPrerequisite: 0,
    minimumRecommendedRank: "ZHEERS",
    dedoDuroAgent: {
      creature: "Ratos de Trincheira",
      triggerIdleSeconds: 45,
      punishmentEffect: "Revela posição acústica no radar local e aplica -2% Vitalidade/tick",
    },
    sectors: [
      {
        name: "Pátio de Armamento (Armory Hub)",
        fractionLabel: "⅛",
        fractionEighths: 1,
        tacticalFunction: "Zona neutra de loadout experimental sem restrição de patente",
      },
      {
        name: "Setor de Testes (Proving Grounds)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Combate urbano denso, prédios destrutíveis e galerias subterrâneas",
      },
      {
        name: "Parque Abandonado",
        fractionLabel: "⁴⁄₈",
        fractionEighths: 4,
        tacticalFunction: "Vegetação fechada, riachos, emboscadas e 15 terminais ZEX dispersos",
      },
    ],
    zuProtocols: [
      {
        variantId: "ZU1",
        label: "Zu 1 · Comboio na Estrada Rural",
        cinematicEvent: "Caminhão de transporte atropela manada de bois na pista de terra",
        requiredAction: "APERTAR_CINTO",
        actionLabel: "Apertar Cinto de 4 Pontos (+1000 KRC Bankhaoos)",
        successOutcome: "0% dano + conta Bankhaoos creditada com 1.000 KRC iniciais",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU2",
        label: "Zu 2 · Deslizamento de Encosta",
        cinematicEvent: "Viatura capota contra formação rochosa no acesso ao Setor de Testes",
        requiredAction: "SALTAR_AGORA",
        actionLabel: "Saltar da Caçamba Antes do Impacto",
        successOutcome: "0% dano + rolamento tático com 5s de visão turva leve",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU3",
        label: "Zu 3 · Queda da Ponte Ferroviária",
        cinematicEvent: "Transporte despenca da ponte sobre o riacho turvo do Parque",
        requiredAction: "ATIVAR_MASCARA_O2",
        actionLabel: "Ativar Respirador de Emergência O₂",
        successOutcome: "0% dano por afogamento + emersão furtiva na margem",
        failurePenaltyPct: 30,
      },
    ],
    persistenceRule:
      "Transferência seletiva de 20% via ZEX para o W1/C1; Top 50 convocados para o Desafio de Gigantes (Token de Veterano + Código KR-N1 + Insígnia Mérito KR); Top 1000 migram conquistas parciais.",
  },
  {
    worldId: "Barburhen",
    stageCode: "W1/C1",
    canonicalTitle: "Barburhen — Mundo da Destruição",
    decentralizerDimensionRemoved: "Tecnologia e Abrigo Urbano (Cenário degrada dia após dia com chuva ácida)",
    psychologicalFilter: "Melancolia Pós-Guerra e Brutalidade Urbana (Corpos permanecem no mapa)",
    ringConflictName: "Água da Morte (250m → 40m em 10 min rumo ao Parque)",
    targetDurationLabel: "7 dias (12h/dia · Partidas de 90 min / Anel 10 min)",
    maxPlayers: 100,
    zexCount: 30,
    xpAccurMultiplier: 1.35,
    krcRewardMultiplier: 1.5,
    prerequisiteWorldId: "CIGKV",
    requiredMatchesInPrerequisite: 2,
    requiredExtractionsInPrerequisite: 1,
    minimumRecommendedRank: "ZHEERS",
    dedoDuroAgent: {
      creature: "Colônia de Ratos Carniceiros",
      triggerIdleSeconds: 40,
      punishmentEffect: "Enxameia esconderijos urbanos, eleva Medo (+4) e denuncia presença ao setor",
    },
    sectors: [
      {
        name: "Área Urbana e Comercial",
        fractionLabel: "²⁄₈",
        fractionEighths: 2,
        tacticalFunction: "Escombros verticais, linhas de sniper e carros abandonados",
      },
      {
        name: "Setor Industrial (Desembarque)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Galpões corroídos pela chuva ácida e pátio ferroviário de chegada",
      },
      {
        name: "Parque Abandonado (Centro & Extração Ferroviária)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Convergência final do anel Água da Morte e estação de extração ZEX",
      },
    ],
    zuProtocols: [
      {
        variantId: "ZU1",
        label: "Zu 1 · Descarrilamento Industrial",
        cinematicEvent: "Trem blindado de desembarque descarrila nos trilhos retorcidos",
        requiredAction: "APERTAR_CINTO",
        actionLabel: "Travar Cinto de Contenção no Vagão",
        successOutcome: "0% dano + saída rápida para os galpões industriais",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU2",
        label: "Zu 2 · Colisão Frontal deLocomotivas",
        cinematicEvent: "Composição colide frontalmente contra vagão de carga bloqueado",
        requiredAction: "SALTAR_AGORA",
        actionLabel: "Saltar pela Porta Lateral em Movimento",
        successOutcome: "0% dano + 6s de atordoamento acústico leve",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU3",
        label: "Zu 3 · Curto-Circuito e Incêndio Elétrico",
        cinematicEvent: "Cabos de alta tensão rompem sobre o vagão liberando fumaça tóxica",
        requiredAction: "ATIVAR_MASCARA_O2",
        actionLabel: "Equipar Máscara de Filtragem Ácida/O₂",
        successOutcome: "0% dano + proteção inicial contra fumaça no desembarque",
        failurePenaltyPct: 30,
      },
    ],
    persistenceRule:
      "Chuva ácida aplica -1% Vitalidade a cada 10s sem tag HasAcidProtection; fora do anel Água da Morte aplica -5%/s acumulativo. 5 extrações ZEX desbloqueiam W2/C2 Priadus.",
  },
  {
    worldId: "Priadus",
    stageCode: "W2/C2",
    canonicalTitle: "Priadus — Floresta da Escuridão",
    decentralizerDimensionRemoved: "Sanidade Visual e Orientação Espacial (Neblina Alucinógena + Flora Carnívora)",
    psychologicalFilter: "Paranoia sob Invisibilidade, Pântanos e Predadores Anfíbios",
    ringConflictName: "Emboscada Verde (Fecha no Templo Antigo sob esporos tóxicos)",
    targetDurationLabel: "7 dias (Partidas de 120 min / Anel 10 min)",
    maxPlayers: 75,
    zexCount: 20,
    xpAccurMultiplier: 1.75,
    krcRewardMultiplier: 2.2,
    prerequisiteWorldId: "Barburhen",
    requiredMatchesInPrerequisite: 5,
    requiredExtractionsInPrerequisite: 5,
    minimumRecommendedRank: "ONITH",
    dedoDuroAgent: {
      creature: "Enxame de Mosquitos Bioluminescentes",
      triggerIdleSeconds: 35,
      punishmentEffect: "Zumbido audível a 40m + brilho revelador na neblina + drenagem de Energia",
    },
    sectors: [
      {
        name: "Área Pantanosa",
        fractionLabel: "²⁄₈",
        fractionEighths: 2,
        tacticalFunction: "Águas turvas, jacarés, mobilidade reduzida e travessia anfíbia",
      },
      {
        name: "Bosque Denso (Desembarque)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Copa fechada, baixa visibilidade e flora carnívora reativa",
      },
      {
        name: "Área de Caça + Templo Antigo (Extração Matadouro)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Ruínas centrais onde fecha a Emboscada Verde e terminais ZEX",
      },
    ],
    zuProtocols: [
      {
        variantId: "ZU1",
        label: "Zu 1 · Fim de Trilho no Pântano",
        cinematicEvent: "Vagão perde os trilhos submersos na entrada da Floresta da Escuridão",
        requiredAction: "APERTAR_CINTO",
        actionLabel: "Fixar Cinto de Impacto Anfíbio",
        successOutcome: "0% dano + desembarque seco na plataforma elevada",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU2",
        label: "Zu 2 · Emboscada de Homens-Bomba",
        cinematicEvent: "Sabotadores detonam cargas explosivas na lateral do comboio",
        requiredAction: "SALTAR_AGORA",
        actionLabel: "Saltar para a Vegetação do Bosque",
        successOutcome: "0% dano + camuflagem imediata na folhagem",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU3",
        label: "Zu 3 · Bolsão de Neblina Tóxica",
        cinematicEvent: "Nuvem densa de esporos alucinógenos invade os vagões de transporte",
        requiredAction: "ATIVAR_MASCARA_O2",
        actionLabel: "Selar Máscara de Filtragem Biológica",
        successOutcome: "0% dano + imunidade aos primeiros 7s de alucinação sonora",
        failurePenaltyPct: 30,
      },
    ],
    persistenceRule:
      "Exige 5 extrações válidas em Barburhen. 10 extrações em Priadus habilitam travessia para o deserto de Ckesalth (W3/C3).",
  },
  {
    worldId: "Ckesalth",
    stageCode: "W3/C3",
    canonicalTitle: "Ckesalth — Deserto das Almas Esquecidas",
    decentralizerDimensionRemoved: "Vaidade e Ostentação (Resort em ruínas, petróleo em chamas e areia movediça)",
    psychologicalFilter: "Exaustão Térmica, Asfixia por Fumaça Tóxica e Isolamento Árido",
    ringConflictName: "Assassino Silencioso (Fecha na Vila Sombria sob fumaça de petróleo)",
    targetDurationLabel: "7 dias (Partidas de 90 min / Anel a partir de 5 min)",
    maxPlayers: 60,
    zexCount: 25,
    xpAccurMultiplier: 2.25,
    krcRewardMultiplier: 3.2,
    prerequisiteWorldId: "Priadus",
    requiredMatchesInPrerequisite: 5,
    requiredExtractionsInPrerequisite: 10,
    minimumRecommendedRank: "SKEETW",
    dedoDuroAgent: {
      creature: "Nuvem de Gafanhotos do Deserto",
      triggerIdleSeconds: 30,
      punishmentEffect: "Coluna espiral visível a longa distância + desgaste de durabilidade do equipamento",
    },
    sectors: [
      {
        name: "Resort Abandonado",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Estruturas de luxo soterradas por dunas e piscinas secas de combate",
      },
      {
        name: "Vilarejo dos Beduínos (Vila Sombria)",
        fractionLabel: "²⁄₈",
        fractionEighths: 2,
        tacticalFunction: "Labirinto de adobe e ponto focal de fechamento do Assassino Silencioso",
      },
      {
        name: "Refinaria de Petróleo (Centro & Expedição)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Torres metálicas verticais, lagoas em chamas e extração da expedição",
      },
    ],
    zuProtocols: [
      {
        variantId: "ZU1",
        label: "Zu 1 · Parede de Tempestade de Areia",
        cinematicEvent: "Haboob violento atinge o comboio cruzando o cânion do deserto",
        requiredAction: "APERTAR_CINTO",
        actionLabel: "Travar Cinto Contra Turbulência Severa",
        successOutcome: "0% dano + estabilidade mantida na cabine blindada",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU2",
        label: "Zu 2 · Explosão no Túnel de Rocha",
        cinematicEvent: "Colapso estrutural detona o teto do túnel de acesso ao Resort",
        requiredAction: "SALTAR_AGORA",
        actionLabel: "Ejetar para o Talude de Areia",
        successOutcome: "0% dano + rolamento amortecido na duna externa",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU3",
        label: "Zu 3 · Caminhão-Tanque em Chamas",
        cinematicEvent: "Comboio de combustível explode liberando fumaça negra sulfurosa",
        requiredAction: "ATIVAR_MASCARA_O2",
        actionLabel: "Ativar Circuito Fechado de Oxigênio",
        successOutcome: "0% dano pulmonar + visão térmica preservada na fumaça",
        failurePenaltyPct: 30,
      },
    ],
    persistenceRule:
      "Exige 10 extrações em Priadus. 15 extrações em Ckesalth abrem o ciclo final W4/C4 Arukheea.",
  },
  {
    worldId: "Arukheea",
    stageCode: "W4/C4",
    canonicalTitle: "Arukheea — Ilha dos Gritos Calados",
    decentralizerDimensionRemoved: "Refúgio Final (Claustrofobia sob o Sol da Noite e Tsunami Hidráulico)",
    psychologicalFilter: "Isolamento Absoluto — Apenas o ocupante do Helicóptero da Torre vence",
    ringConflictName: "Tsunami (Fecha na Prisão do Sol da Noite → Heliporto da Torre)",
    targetDurationLabel: "7 dias (Partidas de 100 min · Extração Final US$ 1.000.000)",
    maxPlayers: 80,
    zexCount: 22,
    xpAccurMultiplier: 3.0,
    krcRewardMultiplier: 5.0,
    prerequisiteWorldId: "Ckesalth",
    requiredMatchesInPrerequisite: 5,
    requiredExtractionsInPrerequisite: 15,
    minimumRecommendedRank: "HURAN",
    dedoDuroAgent: {
      creature: "Bando de Gaivotas Carniceiras",
      triggerIdleSeconds: 25,
      punishmentEffect: "Gritos estridentes geolocalizados + mergulhos rasantes que quebram mira",
    },
    sectors: [
      {
        name: "Bosque dos Perdidos",
        fractionLabel: "⁴⁄₈",
        fractionEighths: 4,
        tacticalFunction: "Falésias costeiras batidas por ondas gigantes e vegetação retorcida",
      },
      {
        name: "Prisão do Sol da Noite (Heliporto da Torre)",
        fractionLabel: "⅜",
        fractionEighths: 3,
        tacticalFunction: "Complexo penitenciário sob iluminação perpétua e ponto único de extração final",
      },
      {
        name: "Fábrica / Cemitério das Baleias",
        fractionLabel: "⅛",
        fractionEighths: 1,
        tacticalFunction: "Docas industriais inundadas pelo avanço inicial do Tsunami",
      },
    ],
    zuProtocols: [
      {
        variantId: "ZU1",
        label: "Zu 1 · Colapso do Viaduto Costeiro",
        cinematicEvent: "Trilho marítimo desmorona sob o impacto das primeiras ondas de ressaca",
        requiredAction: "APERTAR_CINTO",
        actionLabel: "Travar Cinto de Contenção Hidráulica",
        successOutcome: "0% dano + ancoragem firme no convés superior",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU2",
        label: "Zu 2 · Colisão com Blindado Costeiro",
        cinematicEvent: "Transporte choca-se contra tanque abandonado na muralha do porto",
        requiredAction: "SALTAR_AGORA",
        actionLabel: "Saltar no Mar Antes da Explosão",
        successOutcome: "0% dano + nado tático rápido até o cais das Baleias",
        failurePenaltyPct: 30,
      },
      {
        variantId: "ZU3",
        label: "Zu 3 · Bombardeio de Gás por Drones",
        cinematicEvent: "Esquadrilha autônoma da Prisão lança granadas de gás neurotóxico",
        requiredAction: "ATIVAR_MASCARA_O2",
        actionLabel: "Ativar Respirador Tático Pressurizado",
        successOutcome: "0% dano + travessia ilesa pela cortina química",
        failurePenaltyPct: 30,
      },
    ],
    persistenceRule:
      "Estágio terminal da Guerra do Khaaos. A extração no Heliporto da Torre da Prisão do Sol da Noite consagra o vencedor do Legado.",
  },
] as const;

// ============================================================================
// EIXO IV — HIERARQUIA DE AUTORIDADE & CLASSE ESPECIAL (SUBMUNDO KR)
// ============================================================================

export interface AuthorityNode {
  id: string;
  tier: "LEVEL_0_SERVER_AUTHORITY" | "LEVEL_1_SPECIAL_CLASS_ORCHESTRATION";
  roleTitle: string;
  canonicalName: string;
  precedenceScore: number; // 1000 for Server/Policy Engine, 500/400/300 for Marechal, 200 for King, 100 for Uryan
  domain: string;
  allowedInputs: readonly string[];
  typedOutputs: readonly string[];
  hardBoundary: string;
  executableMutations: boolean;
}

export const SUBMUNDO_KR_AUTHORITY_HIERARCHY: readonly AuthorityNode[] = [
  {
    id: "server-policy-engine",
    tier: "LEVEL_0_SERVER_AUTHORITY",
    roleTitle: "Autoridade Suprema do Sistema",
    canonicalName: "Servidor Autoritativo + Policy Engine + EAC 3-Strike",
    precedenceScore: 1000,
    domain: "Autenticação OIDC, RBAC, Idempotência, Ledger KRC, Estado de Partida e Anti-Cheat",
    allowedInputs: [
      "Sessão autenticada do jogador/operador",
      "Cabeçalho Idempotency-Key (UUID)",
      "Telemetria validada pelo servidor UE5/RoomManager",
    ],
    typedOutputs: [
      "COMMITTED_TRANSACTION",
      "MATCH_STATE_SNAPSHOT",
      "POLICY_DECISION",
      "EAC_STRIKE_ENFORCEMENT",
    ],
    hardBoundary:
      "Nunca confia em permissões calculadas no cliente nem concede autoridade real por nome de agente ficcional.",
    executableMutations: true,
  },
  {
    id: "marshal-hunterheads",
    tier: "LEVEL_1_SPECIAL_CLASS_ORCHESTRATION",
    roleTitle: "Marechal — Comando Estratégico & Operações",
    canonicalName: "Henricks Hunterheads III",
    precedenceScore: 500, // Segurança (500) -> Integridade (400) -> Operações (300)
    domain: "Segurança (500), Integridade Competitiva (400) e Operações dos Mundos (300)",
    allowedInputs: [
      "Telemetria agregada de ocupação e fila P95",
      "Estado de mundo/fase e saúde dos serviços",
      "Alertas operacionais não financeiros",
    ],
    typedOutputs: ["WORLD_STATUS", "OPERATIONAL_ALERT", "WORLD_CHANGE_PROPOSAL"],
    hardBoundary:
      "Pode emitir safety-veto (500) ou integrity-veto (400) no Conselho da Classe Especial, mas nunca suplanta o Policy Engine (executable: false).",
    executableMutations: false,
  },
  {
    id: "king-krapulla",
    tier: "LEVEL_1_SPECIAL_CLASS_ORCHESTRATION",
    roleTitle: "Centralizador do Mercado Negro",
    canonicalName: "King Krapulla",
    precedenceScore: 200,
    domain: "Inteligência Econômica & Equilíbrio da Forja (200)",
    allowedInputs: [
      "Métricas agregadas de oferta/procura de itens",
      "Catálogo publicado da Forja do Armeiro",
      "Índices de volatilidade de mercado",
    ],
    typedOutputs: ["MARKET_BRIEF", "PRICE_ADJUSTMENT_PROPOSAL", "ANOMALY_ALERT"],
    hardBoundary:
      "Mantém independência analítica sobre o mercado, mas não pode movimentar KRC, gravar no ledger nem conceder itens (executable: false).",
    executableMutations: false,
  },
  {
    id: "uryan-horks",
    tier: "LEVEL_1_SPECIAL_CLASS_ORCHESTRATION",
    roleTitle: "Embaixadora do Submundo KR",
    canonicalName: "Uryan Horks",
    precedenceScore: 100,
    domain: "Diplomacia, Facções e Eventos Narrativos (100)",
    allowedInputs: [
      "Relações de facções publicadas",
      "Histórico de eventos e tratados",
      "Contexto narrativo permitido",
    ],
    typedOutputs: ["DIPLOMATIC_BRIEF", "MESSAGE_DRAFT", "EVENT_PROPOSAL"],
    hardBoundary:
      "Pode propor tratados, comunicados e eventos narrativos, mas não altera alianças persistidas, contas ou acesso (executable: false).",
    executableMutations: false,
  },
] as const;

// ============================================================================
// EIXO V — ÁRVORE DE ARQUITETURA RUNTIME UE5.8 ↔ CAMADA WEB NODE.JS
// ============================================================================

export interface RuntimeHierarchyLayer {
  id: string;
  layer: "UE5_ENGINE_ROOT" | "UE5_SUBSYSTEMS" | "UE5_MATCH_AUTHORITY" | "UE5_PLAYER_GAS" | "WEB_NODE_BRIDGE";
  ue5Class: string;
  headerPath: string;
  tsCounterpart: string;
  tsPath: string;
  authoritySide: "SERVER_AUTHORITATIVE" | "SHARED_DETERMINISTIC" | "CLIENT_PREDICTED";
  responsibility: string;
  children: readonly string[];
}

export const UE5_GAME_HIERARCHY_TREE: readonly RuntimeHierarchyLayer[] = [
  {
    id: "game-instance-root",
    layer: "UE5_ENGINE_ROOT",
    ue5Class: "UGameInstance + FKhaaosRunModule",
    headerPath: "Unreal/KhaaosRun/Source/KhaaosRun/KhaaosRun.h",
    tsCounterpart: "Express + RoomManager + DistributedState",
    tsPath: "server/index.ts",
    authoritySide: "SERVER_AUTHORITATIVE",
    responsibility:
      "Raiz do ciclo de vida do processo Dedicated Server 5.8 e inicialização dos subsistemas globais.",
    children: [
      "UKhaaosHierarchySubsystem",
      "UKhaaosEOSManager",
      "UEconomyBridgeSubsystem",
      "UKhaaosEACIntegration",
      "UKhaaosVFXManager",
      "USpatialGridSubsystem",
    ],
  },
  {
    id: "hierarchy-subsystem",
    layer: "UE5_SUBSYSTEMS",
    ue5Class: "UKhaaosHierarchySubsystem",
    headerPath: "Unreal/KhaaosRun/Source/KhaaosRun/Game/Hierarchy/KhaaosHierarchySubsystem.h",
    tsCounterpart: "GameHierarchy Engine (EP555 + DAG + Zu)",
    tsPath: "shared/game-hierarchy.ts",
    authoritySide: "SHARED_DETERMINISTIC",
    responsibility:
      "Valida patentes EP555 (Zheers→Overlord), 12 especializações + Morth, progressão DAG (CIGKV→W4), decisões Zu 1-3 e transferência ZEX 20%.",
    children: ["AKhaaosPlayerState", "AKhaaosGameMode", "UKhaaosTransferSystem"],
  },
  {
    id: "game-mode-authority",
    layer: "UE5_MATCH_AUTHORITY",
    ue5Class: "AKhaaosGameMode → AKhaaosGameState",
    headerPath: "Unreal/KhaaosRun/Source/KhaaosRun/Game/KhaaosGameMode.h",
    tsCounterpart: "RoomManager + RankingService + WorldProgression",
    tsPath: "server/game/RoomManager.ts",
    authoritySide: "SERVER_AUTHORITATIVE",
    responsibility:
      "Orquestra fases da partida (Lobby → Countdown → InProgress → PulsoKhaaos → WorldTransition → Finished), SafeZone, Ring e eliminações.",
    children: [
      "AKhaaosSafeZone",
      "ABarburhenRingController",
      "ABarburhenAcidRainVolume",
      "AKhaaosZEXTerminal",
      "AKhaaosArmorerForge",
    ],
  },
  {
    id: "player-state-gas",
    layer: "UE5_PLAYER_GAS",
    ue5Class: "AKhaaosPlayerState + AKhaaosCharacter",
    headerPath: "Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerState.h",
    tsCounterpart: "playerStats + EP555_RANKS + War'I Loadout",
    tsPath: "shared/schema.ts",
    authoritySide: "SERVER_AUTHORITATIVE",
    responsibility:
      "Mantém AbilitySystemComponent (GAS), UKhaaosAttributeSet (Health/Shield/Energy/Speed), UKhaaosVitalityComponent (% dano/fome/sede/medo) e UKhaaosBankhaoosComponent.",
    children: [
      "UAbilitySystemComponent",
      "UKhaaosAttributeSet",
      "UKhaaosVitalityComponent",
      "UKhaaosBankhaoosComponent",
      "UKhaaosTransferSystem",
    ],
  },
  {
    id: "economy-anticheat-bridge",
    layer: "WEB_NODE_BRIDGE",
    ue5Class: "UEconomyBridgeSubsystem + UKhaaosEACIntegration",
    headerPath: "Unreal/KhaaosRun/Source/KhaaosRun/Game/AntiCheat/KhaaosEACIntegration.h",
    tsCounterpart: "economyService + marshalConsole + eos_anticheat_bridge",
    tsPath: "server/game/economyService.ts",
    authoritySide: "SERVER_AUTHORITATIVE",
    responsibility:
      "Conecta transações atômicas KRC (Idempotency-Key + SHA256 ledger) e telemetria C-ABI Easy Anti-Cheat (3-Strikes Auto-Kick) entre UE5 e Node.js.",
    children: ["KhaaosAtomicLedger", "KhaaosComplianceFramework", "FEACRuntimeBridge"],
  },
] as const;

// ============================================================================
// SIMULADOR E AVALIADOR DETERMINÍSTICO EP555 & HIERARQUIA END-TO-END
// ============================================================================

export interface Ep555MatchSimulationInput {
  worldId: WorldId;
  placement: number;
  totalPlayers?: number;
  pvpKills: number;
  zexExtractions: number;
  zuVariant: ZuVariantId;
  zuActionChosen: "APERTAR_CINTO" | "SALTAR_AGORA" | "ATIVAR_MASCARA_O2";
  dataCoresCaptured?: number;
  pulsoKhaaosSurvived?: number;
  giantsChallengeTop50?: boolean;
  currentXp?: number;
  currentMorth?: number;
  activeSpecializationId?: SpecializationId | null;
}

export interface Ep555MatchRewardBreakdown {
  worldId: WorldId;
  stageCode: string;
  worldAccurMultiplier: number;
  worldKrcMultiplier: number;
  zuEvaluation: {
    variantId: ZuVariantId;
    expectedAction: "APERTAR_CINTO" | "SALTAR_AGORA" | "ATIVAR_MASCARA_O2";
    chosenAction: "APERTAR_CINTO" | "SALTAR_AGORA" | "ATIVAR_MASCARA_O2";
    correctDecision: boolean;
    initialVitalityDamagePct: number;
    zuBonusXp: number;
    zuInitialBankhaoosKrc: number;
  };
  xpBreakdown: {
    placementBaseXp: number;
    pvpKillsXp: number;
    zexExtractionXp: number;
    zuTacticalXp: number;
    dataCoresXp: number;
    pulsoKhaaosXp: number;
    giantsChallengeXp: number;
    rawSubtotalXp: number;
    multipliedTotalXp: number;
  };
  krcBreakdown: {
    rawSessionKrc: number;
    zexTransferable20PctKrc: number;
    veteranTokenAwarded: boolean;
    meritoKrInsigniaAwarded: boolean;
  };
  progressionDelta: {
    xpBefore: number;
    xpAfter: number;
    morthBefore: number;
    morthAfter: number;
    rankBefore: Rank;
    rankAfter: Rank;
    promoted: boolean;
    rankProgressAfter: ReturnType<typeof getRankProgress>;
    newlyUnlockedSpecializations: SpecializationId[];
    allUnlockedSpecializations: SpecializationId[];
  };
}

export function computeEp555MatchReward(
  input: Ep555MatchSimulationInput,
): Ep555MatchRewardBreakdown {
  const worldNode =
    WORLD_HIERARCHY_DAG.find((w) => w.worldId === input.worldId) ?? WORLD_HIERARCHY_DAG[0];
  const totalPlayers = Math.max(2, Math.min(100, Math.floor(input.totalPlayers ?? worldNode.maxPlayers)));
  const placement = Math.max(1, Math.min(totalPlayers, Math.floor(input.placement || 1)));
  const pvpKills = Math.max(0, Math.min(99, Math.floor(input.pvpKills || 0)));
  const zexExtractions = Math.max(0, Math.min(worldNode.zexCount, Math.floor(input.zexExtractions || 0)));
  const dataCores = Math.max(0, Math.min(20, Math.floor(input.dataCoresCaptured ?? 0)));
  const pulsos = Math.max(0, Math.min(18, Math.floor(input.pulsoKhaaosSurvived ?? 0)));
  const giantsChallenge = Boolean(input.giantsChallengeTop50);

  // Zu Protocol evaluation
  const zuSpec =
    worldNode.zuProtocols.find((z) => z.variantId === input.zuVariant) ?? worldNode.zuProtocols[0];
  const correctZu = zuSpec.requiredAction === input.zuActionChosen;
  const initialVitalityDamagePct = correctZu ? 0 : zuSpec.failurePenaltyPct;
  const zuBonusXp = correctZu ? 350 : 0;
  const zuInitialBankhaoosKrc =
    worldNode.worldId === "CIGKV" && input.zuVariant === "ZU1" && correctZu ? 1000 : 0;

  // Base placement XP (mirrors RankingService base + EP555 ring scaling)
  let placementBaseXp = 150;
  if (placement === 1) placementBaseXp = 1_200;
  else if (placement <= 3) placementBaseXp = 800;
  else if (placement <= Math.ceil(totalPlayers * 0.3)) placementBaseXp = 500;
  else if (placement <= Math.ceil(totalPlayers * 0.5)) placementBaseXp = 300;

  const pvpKillsXp = pvpKills * 120;
  const zexExtractionXp = zexExtractions * 450;
  const dataCoresXp = dataCores * 300;
  const pulsoKhaaosXp = pulsos * 250;
  const giantsChallengeXp = giantsChallenge ? 2_500 : 0;

  const rawSubtotalXp =
    placementBaseXp +
    pvpKillsXp +
    zexExtractionXp +
    zuBonusXp +
    dataCoresXp +
    pulsoKhaaosXp +
    giantsChallengeXp;

  const multipliedTotalXp = Math.round(rawSubtotalXp * worldNode.xpAccurMultiplier);

  // KRC & ZEX 20% transfer calculation
  const rawSessionKrc = Math.round(
    (placement === 1 ? 400 : placement <= 5 ? 220 : 90) * worldNode.krcRewardMultiplier +
      pvpKills * 35 * worldNode.krcRewardMultiplier +
      zexExtractions * 150 * worldNode.krcRewardMultiplier +
      (giantsChallenge ? 1000 : 0),
  );

  const currentXp = Math.max(0, Math.floor(input.currentXp ?? 0));
  const currentMorth = Math.max(0, Math.floor(input.currentMorth ?? 0));
  const rankBefore = rankFromXp(currentXp);
  const rankTierBefore =
    EP555_HIERARCHY_TIERS.find((t) => t.id === rankBefore) ?? EP555_HIERARCHY_TIERS[0];

  // Base ZEX transfer is 20% (from KhaaosTransferSystem) + rank retention bonus
  const effectiveTransferPct = 20 + rankTierBefore.zexRetentionBonusPct;
  const zexTransferable20PctKrc =
    zexExtractions > 0 ? Math.round((rawSessionKrc * effectiveTransferPct) / 100) : 0;

  const xpAfter = currentXp + multipliedTotalXp;
  const morthAfter = currentMorth + pvpKills;
  const rankAfter = rankFromXp(xpAfter);
  const rankProgressAfter = getRankProgress(xpAfter);

  const unlockedBefore = new Set(
    EP555_SPECIALIZATIONS.filter((s) => canUnlockSpecialization(s, currentXp, currentMorth)).map(
      (s) => s.id,
    ),
  );
  const allUnlockedAfter = EP555_SPECIALIZATIONS.filter((s) =>
    canUnlockSpecialization(s, xpAfter, morthAfter),
  ).map((s) => s.id);
  const newlyUnlockedSpecializations = allUnlockedAfter.filter((id) => !unlockedBefore.has(id));

  return {
    worldId: worldNode.worldId,
    stageCode: worldNode.stageCode,
    worldAccurMultiplier: worldNode.xpAccurMultiplier,
    worldKrcMultiplier: worldNode.krcRewardMultiplier,
    zuEvaluation: {
      variantId: zuSpec.variantId,
      expectedAction: zuSpec.requiredAction,
      chosenAction: input.zuActionChosen,
      correctDecision: correctZu,
      initialVitalityDamagePct,
      zuBonusXp,
      zuInitialBankhaoosKrc,
    },
    xpBreakdown: {
      placementBaseXp,
      pvpKillsXp,
      zexExtractionXp,
      zuTacticalXp: zuBonusXp,
      dataCoresXp,
      pulsoKhaaosXp,
      giantsChallengeXp,
      rawSubtotalXp,
      multipliedTotalXp,
    },
    krcBreakdown: {
      rawSessionKrc,
      zexTransferable20PctKrc,
      veteranTokenAwarded: giantsChallenge || (worldNode.worldId === "CIGKV" && placement <= 50 && zexExtractions > 0),
      meritoKrInsigniaAwarded: giantsChallenge,
    },
    progressionDelta: {
      xpBefore: currentXp,
      xpAfter,
      morthBefore: currentMorth,
      morthAfter,
      rankBefore,
      rankAfter,
      promoted:
        rankBefore !== rankAfter &&
        EP555_RANKS.findIndex((r) => r.id === rankAfter) >
          EP555_RANKS.findIndex((r) => r.id === rankBefore),
      rankProgressAfter,
      newlyUnlockedSpecializations,
      allUnlockedSpecializations: allUnlockedAfter,
    },
  };
}

export interface OperativeHierarchyEvaluation {
  xp: number;
  morth: number;
  currentTier: Ep555HierarchyTier;
  nextTier: Ep555HierarchyTier | null;
  rankProgress: ReturnType<typeof getRankProgress>;
  activeSpecialization: Ep555SpecializationDoctrine | null;
  unlockedSpecializations: Ep555SpecializationDoctrine[];
  lockedSpecializations: {
    doctrine: Ep555SpecializationDoctrine;
    missingXp: number;
    missingMorth: number;
  }[];
  worldEligibility: {
    worldId: WorldId;
    stageCode: string;
    canonicalTitle: string;
    unlocked: boolean;
    recommendedRankMet: boolean;
    minimumRecommendedRank: Rank;
  }[];
}

export function evaluateOperativeHierarchyProfile(params: {
  xp: number;
  morth: number;
  specializationId?: string | null;
  unlockedWorlds?: Partial<Record<WorldId, boolean>>;
}): OperativeHierarchyEvaluation {
  const xp = Math.max(0, Math.floor(params.xp || 0));
  const morth = Math.max(0, Math.floor(params.morth || 0));
  const rankProgress = getRankProgress(xp);
  const currentTierIndex = EP555_HIERARCHY_TIERS.findIndex((t) => t.id === rankProgress.rank);
  const currentTier = EP555_HIERARCHY_TIERS[currentTierIndex] ?? EP555_HIERARCHY_TIERS[0];
  const nextTier = EP555_HIERARCHY_TIERS[currentTierIndex + 1] ?? null;

  const activeSpecialization =
    EP555_SPECIALIZATION_DOCTRINES.find((s) => s.id === params.specializationId) ?? null;

  const unlockedSpecializations: Ep555SpecializationDoctrine[] = [];
  const lockedSpecializations: {
    doctrine: Ep555SpecializationDoctrine;
    missingXp: number;
    missingMorth: number;
  }[] = [];

  for (const doctrine of EP555_SPECIALIZATION_DOCTRINES) {
    const schemaSpec = EP555_SPECIALIZATIONS.find((s) => s.id === doctrine.id)!;
    if (canUnlockSpecialization(schemaSpec, xp, morth)) {
      unlockedSpecializations.push(doctrine);
    } else {
      const reqTier = EP555_HIERARCHY_TIERS.find((t) => t.id === doctrine.requiredRank)!;
      lockedSpecializations.push({
        doctrine,
        missingXp: Math.max(0, reqTier.xpRequired - xp),
        missingMorth: Math.max(0, doctrine.morthRequired - morth),
      });
    }
  }

  const worldEligibility = WORLD_HIERARCHY_DAG.map((node) => {
    const reqRankIndex = EP555_HIERARCHY_TIERS.findIndex((t) => t.id === node.minimumRecommendedRank);
    const recommendedRankMet = currentTierIndex >= reqRankIndex;
    const unlocked =
      params.unlockedWorlds?.[node.worldId] ??
      (node.worldId === "CIGKV" || node.worldId === "Barburhen");
    return {
      worldId: node.worldId,
      stageCode: node.stageCode,
      canonicalTitle: node.canonicalTitle,
      unlocked,
      recommendedRankMet,
      minimumRecommendedRank: node.minimumRecommendedRank,
    };
  });

  return {
    xp,
    morth,
    currentTier,
    nextTier,
    rankProgress,
    activeSpecialization,
    unlockedSpecializations,
    lockedSpecializations,
    worldEligibility,
  };
}

export function getFullGameHierarchyOverview() {
  return {
    statuteVersion: "EP555-v2.8-UE5.8",
    canonicalMoto: "Um Jogo · Uma Chance · Um Legado (US$ 1.000.000)",
    excoMilestoneTarget: 1_000_000,
    giantsChallengeTopCut: 50,
    selectivePersistenceTopCut: 1_000,
    zexBaseTransferRatePct: 20,
    commandTiers: EP555_HIERARCHY_TIERS,
    specializationDoctrines: EP555_SPECIALIZATION_DOCTRINES,
    worldOntologyDag: WORLD_HIERARCHY_DAG,
    submundoKrAuthority: SUBMUNDO_KR_AUTHORITY_HIERARCHY,
    ue5RuntimeTree: UE5_GAME_HIERARCHY_TREE,
    worldsCatalog: WORLD_ORDER.map((id) => KHAAOS_WORLDS[id]),
  };
}
