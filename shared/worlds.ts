/**
 * Canonical End-to-End Multi-World Definitions for KHAAOS RUN
 * Syncs UE5 C++ MapData, Node.js Server Orchestration, and Web Frontend UI
 */

export type WorldId = "CIGKV" | "Barburhen" | "Priadus" | "Ckesalth" | "Arukheea";

/** IDs usados pelo matchmaking/telemetria legados. */
export type OperationalWorldId = "CIGKV" | "W1" | "W2" | "W3" | "W4";
export const WORLD_OPERATIONAL_IDS: Readonly<Record<WorldId, OperationalWorldId>> = {
  CIGKV: "CIGKV",
  Barburhen: "W1",
  Priadus: "W2",
  Ckesalth: "W3",
  Arukheea: "W4",
};
export const WORLD_CANONICAL_IDS: Readonly<Record<OperationalWorldId, WorldId>> = {
  CIGKV: "CIGKV",
  W1: "Barburhen",
  W2: "Priadus",
  W3: "Ckesalth",
  W4: "Arukheea",
};
export function toOperationalWorldId(worldId: WorldId): OperationalWorldId {
  return WORLD_OPERATIONAL_IDS[worldId];
}
export function toCanonicalWorldId(worldId: OperationalWorldId): WorldId {
  return WORLD_CANONICAL_IDS[worldId];
}

export interface WorldSafeZonePhase {
  phaseIndex: number;
  phaseName: string;
  durationSeconds: number;
  radiusMeters: number;
  damagePerSecond: number;
  center: { x: number; y: number; z: number };
}

export interface WorldPoi {
  name: string;
  tier: 1 | 2 | 3;
  theme: string;
  coordinates: { x: number; y: number; z: number };
  radiusMeters: number;
  lootSpawnCount: number;
  rarityWeights: {
    common: number;
    uncommon: number;
    rare: number;
    epic: number;
    legendary: number;
  };
  strategicNote: string;
}

export interface WorldHazardSpec {
  id: string;
  name: string;
  type: "ACID_RAIN" | "TSUNAMI_WAVE" | "VOLCANIC_LAVA" | "KHAOS_GRAVITY" | "SAFE_TRAINING";
  intervalSeconds: number;
  durationSeconds: number;
  damagePerSecond: number;
  description: string;
  counterplay: string;
}

export interface WorldZexNode {
  id: string;
  name: string;
  coordinates: { x: number; y: number; z: number };
  activationPhase: number;
  extractionTimeSeconds: number;
  capacityPlayers: number;
}

export interface WorldUnlockRule {
  requiredWorld: WorldId | null;
  requiredCompletions: number;
  description: string;
}

export interface WorldDefinition {
  id: WorldId;
  order: number;
  name: string;
  subtitle: string;
  biome: string;
  dimensionsKm: string;
  sizeMeters: number;
  recommendedPlayers: string;
  targetDurationMinutes: number;
  krcMultiplier: number;
  xpMultiplier: number;
  accentColor: string;
  unlockRule: WorldUnlockRule;
  safeZonePhases: WorldSafeZonePhase[];
  pois: WorldPoi[];
  hazard: WorldHazardSpec;
  zexNodes: WorldZexNode[];
  zuSpec: {
    spawnDelayAfterLastZexSeconds: number;
    durationSeconds: number;
    radiusMeters: number;
    locationLabel: string;
  };
  inactivityRule: {
    thresholdSeconds: number;
    penaltyDamagePerSecond: number;
    warningSeconds: number;
  };
  ue5Class: {
    mapDataHeader: string;
    levelHeader: string;
    persistenceEnum: string;
  };
}

export const KHAAOS_WORLDS: Record<WorldId, WorldDefinition> = {
  CIGKV: {
    id: "CIGKV",
    order: 0,
    name: "CIGKV",
    subtitle: "Centro Integrado de Guerra Khaaos Virtual",
    biome: "Simulação Tática Modular & Domos de Treinamento",
    dimensionsKm: "2.0 x 2.0 km",
    sizeMeters: 2000,
    recommendedPlayers: "16 - 30 Operadores (Solo / Squad)",
    targetDurationMinutes: 15,
    krcMultiplier: 0.5,
    xpMultiplier: 1.0,
    accentColor: "#00f0ff",
    unlockRule: {
      requiredWorld: null,
      requiredCompletions: 0,
      description: "Desbloqueado por padrão para calibração neural e certificação tática."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Calibração Inicial", durationSeconds: 240, radiusMeters: 1000, damagePerSecond: 1.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 1, phaseName: "Compressão Alfa", durationSeconds: 240, radiusMeters: 700, damagePerSecond: 2.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 2, phaseName: "Compressão Beta", durationSeconds: 180, radiusMeters: 450, damagePerSecond: 5.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 3, phaseName: "Fechamento Crítico", durationSeconds: 150, radiusMeters: 220, damagePerSecond: 10.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 4, phaseName: "Colapso ZU", durationSeconds: 90, radiusMeters: 60, damagePerSecond: 20.0, center: { x: 0, y: 0, z: 100 } },
    ],
    pois: [
      {
        name: "Central Core",
        tier: 3,
        theme: "Torre de Comando Holográfica",
        coordinates: { x: 0, y: 0, z: 200 },
        radiusMeters: 180,
        lootSpawnCount: 15,
        rarityWeights: { common: 10, uncommon: 20, rare: 35, epic: 25, legendary: 10 },
        strategicNote: "Verticalidade extrema com cobertura modular e terminal de telemetria central."
      },
      {
        name: "Tactical Yard North",
        tier: 2,
        theme: "Pátio de Combate Urbano Simulado",
        coordinates: { x: 0, y: 550, z: 110 },
        radiusMeters: 140,
        lootSpawnCount: 10,
        rarityWeights: { common: 25, uncommon: 35, rare: 25, epic: 12, legendary: 3 },
        strategicNote: "Corredores estreitos ideais para teste de submetralhadoras e escudos táticos."
      },
      {
        name: "Ballistics Range East",
        tier: 2,
        theme: "Galeria de Tiro de Longo Alcance",
        coordinates: { x: 550, y: 0, z: 120 },
        radiusMeters: 150,
        lootSpawnCount: 10,
        rarityWeights: { common: 20, uncommon: 35, rare: 30, epic: 12, legendary: 3 },
        strategicNote: "Linhas de visão abertas de 350m com plataformas elevadas para rifles de precisão."
      },
      {
        name: "Bio-Shelter South",
        tier: 1,
        theme: "Laboratório de Suporte Vital",
        coordinates: { x: 0, y: -550, z: 100 },
        radiusMeters: 120,
        lootSpawnCount: 8,
        rarityWeights: { common: 45, uncommon: 35, rare: 15, epic: 5, legendary: 0 },
        strategicNote: "Alta densidade de suprimentos médicos e baterias de escudo para início seguro."
      }
    ],
    hazard: {
      id: "HAZ_CIGKV_SIM",
      name: "Pulso Eletromagnético de Calibração",
      type: "SAFE_TRAINING",
      intervalSeconds: 180,
      durationSeconds: 20,
      damagePerSecond: 1.5,
      description: "Varredura controlada que sinaliza campistas e aplica leve drenagem em escudos fora das estruturas.",
      counterplay: "Manter deslocamento ativo ou entrar nos domos blindados dos POIs."
    },
    zexNodes: [
      { id: "ZEX-CIGKV-01", name: "Heliporto Norte", coordinates: { x: 0, y: 650, z: 120 }, activationPhase: 2, extractionTimeSeconds: 20, capacityPlayers: 3 },
      { id: "ZEX-CIGKV-02", name: "Plataforma Leste", coordinates: { x: 650, y: 0, z: 120 }, activationPhase: 2, extractionTimeSeconds: 20, capacityPlayers: 3 },
      { id: "ZEX-CIGKV-03", name: "Terminal Sul", coordinates: { x: 0, y: -650, z: 110 }, activationPhase: 3, extractionTimeSeconds: 20, capacityPlayers: 3 },
    ],
    zuSpec: {
      spawnDelayAfterLastZexSeconds: 30,
      durationSeconds: 60,
      radiusMeters: 30,
      locationLabel: "Ápice do Central Core (0, 0, 200)"
    },
    inactivityRule: {
      thresholdSeconds: 90,
      penaltyDamagePerSecond: 2.0,
      warningSeconds: 60
    },
    ue5Class: {
      mapDataHeader: "Game/World/CIGKV/KhaaosCIGKVMapData.h",
      levelHeader: "Game/Level/KhaaosCIGKVLevel.h",
      persistenceEnum: "EKhaaosWorld::CIGKV"
    }
  },

  Barburhen: {
    id: "Barburhen",
    order: 1,
    name: "Barburhen",
    subtitle: "Deserto Industrial Pós-Colapso & Refinarias Tóxicas",
    biome: "Deserto Árido de Silicato com Complexos Petroquímicos Abandonados",
    dimensionsKm: "3.0 x 3.0 km",
    sizeMeters: 3000,
    recommendedPlayers: "60 Operadores (20 Trios)",
    targetDurationMinutes: 20,
    krcMultiplier: 1.0,
    xpMultiplier: 1.25,
    accentColor: "#f59e0b",
    unlockRule: {
      requiredWorld: "CIGKV",
      requiredCompletions: 1,
      description: "Requer 1 extração ou conclusão validada no CIGKV."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Anel Industrial 1", durationSeconds: 300, radiusMeters: 1500, damagePerSecond: 1.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 1, phaseName: "Anel Industrial 2", durationSeconds: 300, radiusMeters: 1000, damagePerSecond: 2.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 2, phaseName: "Anel Ácido 3", durationSeconds: 240, radiusMeters: 600, damagePerSecond: 5.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 3, phaseName: "Anel Térmico 4", durationSeconds: 180, radiusMeters: 300, damagePerSecond: 10.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 4, phaseName: "Colapso da Refinaria", durationSeconds: 180, radiusMeters: 50, damagePerSecond: 20.0, center: { x: 0, y: 0, z: 100 } },
    ],
    pois: [
      {
        name: "Refinery Core",
        tier: 3,
        theme: "Refinaria Central de KRC Bruto",
        coordinates: { x: 0, y: 0, z: 200 },
        radiusMeters: 250,
        lootSpawnCount: 15,
        rarityWeights: { common: 10, uncommon: 20, rare: 30, epic: 25, legendary: 15 },
        strategicNote: "Passarelas metálicas suspensas com cobertura contra chuva ácida e cofres de alto valor."
      },
      {
        name: "North Citadel",
        tier: 3,
        theme: "Fortaleza Blindada das Dunas",
        coordinates: { x: 0, y: 800, z: 300 },
        radiusMeters: 200,
        lootSpawnCount: 12,
        rarityWeights: { common: 10, uncommon: 25, rare: 30, epic: 25, legendary: 10 },
        strategicNote: "Posição mais elevada do setor norte com visão dominante sobre rotas de extração."
      },
      {
        name: "East Ruins",
        tier: 2,
        theme: "Ruínas de Escavação Antiga",
        coordinates: { x: 700, y: 200, z: 120 },
        radiusMeters: 180,
        lootSpawnCount: 10,
        rarityWeights: { common: 20, uncommon: 35, rare: 25, epic: 15, legendary: 5 },
        strategicNote: "Túneis subterrâneos parciais que oferecem abrigo natural durante tempestades."
      },
      {
        name: "West Bunker",
        tier: 2,
        theme: "Complexo Subterrâneo Militar",
        coordinates: { x: -750, y: 100, z: 80 },
        radiusMeters: 160,
        lootSpawnCount: 9,
        rarityWeights: { common: 20, uncommon: 35, rare: 25, epic: 15, legendary: 5 },
        strategicNote: "Portas herméticas e combate CQB intenso com alto índice de armamento pesado."
      },
      {
        name: "South Oasis",
        tier: 2,
        theme: "Estação Hidropônica Desértica",
        coordinates: { x: 0, y: -850, z: 90 },
        radiusMeters: 170,
        lootSpawnCount: 10,
        rarityWeights: { common: 25, uncommon: 35, rare: 25, epic: 10, legendary: 5 },
        strategicNote: "Abundância de consumíveis regenerativos e rotas rápidas por tirolesa."
      }
    ],
    hazard: {
      id: "HAZ_BARBURHEN_ACID",
      name: "Tempestade de Chuva Ácida Corrosiva",
      type: "ACID_RAIN",
      intervalSeconds: 150,
      durationSeconds: 45,
      damagePerSecond: 4.5,
      description: "Precipitação sulfúrica que corrói armaduras e causa dano contínuo a operadores expostos a céu aberto.",
      counterplay: "Utilizar tetos industriais, bunkers subterrâneos ou ativar Escudo Químico Portátil."
    },
    zexNodes: [
      { id: "ZEX-BAR-01", name: "Plataforma Ferroviária Norte", coordinates: { x: 200, y: 750, z: 220 }, activationPhase: 2, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-BAR-02", name: "Duto Leste de Extração", coordinates: { x: 650, y: -150, z: 130 }, activationPhase: 2, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-BAR-03", name: "Silo Oeste Blindado", coordinates: { x: -650, y: -100, z: 110 }, activationPhase: 3, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-BAR-04", name: "Torre Hidro Sul", coordinates: { x: -150, y: -700, z: 105 }, activationPhase: 3, extractionTimeSeconds: 30, capacityPlayers: 3 },
    ],
    zuSpec: {
      spawnDelayAfterLastZexSeconds: 30,
      durationSeconds: 60,
      radiusMeters: 30,
      locationLabel: "Topo da Refinery Core (0, 0, 200)"
    },
    inactivityRule: {
      thresholdSeconds: 90,
      penaltyDamagePerSecond: 2.0,
      warningSeconds: 60
    },
    ue5Class: {
      mapDataHeader: "Game/World/Barburhen/KhaaosBarburhenMapData.h",
      levelHeader: "Game/World/Barburhen/KhaaosBarburhenLevel.h",
      persistenceEnum: "EKhaaosWorld::Barburhen"
    }
  },

  Priadus: {
    id: "Priadus",
    order: 2,
    name: "Priadus",
    subtitle: "Arquipélago Abissal & Plataformas Oceânicas",
    biome: "Ilhas Tropicais Submersíveis, Recifes Bioluminescentes e Plataformas Offshore",
    dimensionsKm: "3.5 x 3.5 km",
    sizeMeters: 3500,
    recommendedPlayers: "60 Operadores (20 Trios)",
    targetDurationMinutes: 22,
    krcMultiplier: 1.5,
    xpMultiplier: 1.5,
    accentColor: "#06b6d4",
    unlockRule: {
      requiredWorld: "Barburhen",
      requiredCompletions: 5,
      description: "Requer 5 extrações bem-sucedidas em Barburhen."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Maré Alta 1", durationSeconds: 300, radiusMeters: 1750, damagePerSecond: 1.5, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 1, phaseName: "Maré Alta 2", durationSeconds: 300, radiusMeters: 1200, damagePerSecond: 3.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 2, phaseName: "Vórtice Marinho 3", durationSeconds: 240, radiusMeters: 750, damagePerSecond: 6.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 3, phaseName: "Pressão Abissal 4", durationSeconds: 180, radiusMeters: 380, damagePerSecond: 12.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 4, phaseName: "Olho do Tufão", durationSeconds: 180, radiusMeters: 60, damagePerSecond: 25.0, center: { x: 0, y: 0, z: 100 } },
    ],
    pois: [
      {
        name: "Central Atoll",
        tier: 3,
        theme: "Estação Hidro-Naval Central",
        coordinates: { x: 0, y: 0, z: 150 },
        radiusMeters: 280,
        lootSpawnCount: 16,
        rarityWeights: { common: 8, uncommon: 20, rare: 32, epic: 25, legendary: 15 },
        strategicNote: "Anel de pontes retráteis com sub-nível subaquático rico em KRC cristalizado."
      },
      {
        name: "North Lighthouse",
        tier: 3,
        theme: "Farol Orbital Costeiro",
        coordinates: { x: 0, y: 1050, z: 280 },
        radiusMeters: 210,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 22, rare: 33, epic: 25, legendary: 10 },
        strategicNote: "Imune a inundações de tsunami devido à altitude; disputado por snipers."
      },
      {
        name: "East Coral Lab",
        tier: 2,
        theme: "Domo Submarino de Pesquisa Genética",
        coordinates: { x: 950, y: 150, z: 60 },
        radiusMeters: 190,
        lootSpawnCount: 11,
        rarityWeights: { common: 18, uncommon: 32, rare: 28, epic: 16, legendary: 6 },
        strategicNote: "Comportas de contenção que bloqueiam ondas gigantes se acionadas a tempo."
      },
      {
        name: "West Shipwreck",
        tier: 2,
        theme: "Destroços do Cargueiro Titã",
        coordinates: { x: -950, y: -100, z: 95 },
        radiusMeters: 200,
        lootSpawnCount: 11,
        rarityWeights: { common: 20, uncommon: 30, rare: 28, epic: 16, legendary: 6 },
        strategicNote: "Casco partido em três níveis com tirolesas conectando os mastros."
      }
    ],
    hazard: {
      id: "HAZ_PRIADUS_TSUNAMI",
      name: "Onda de Tsunami & Elevação de Maré",
      type: "TSUNAMI_WAVE",
      intervalSeconds: 180,
      durationSeconds: 40,
      damagePerSecond: 6.0,
      description: "Parede hidrodinâmica que submerge terrenos abaixo de 90m de altitude, causando arrasto e afogamento.",
      counterplay: "Subir para plataformas superiores, faróis ou usar propulsores anfíbios."
    },
    zexNodes: [
      { id: "ZEX-PRI-01", name: "Doca Suspensa Norte", coordinates: { x: 150, y: 900, z: 210 }, activationPhase: 2, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-PRI-02", name: "Heliponto Offshore Leste", coordinates: { x: 850, y: -200, z: 160 }, activationPhase: 2, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-PRI-03", name: "Convés Superior Oeste", coordinates: { x: -800, y: 200, z: 155 }, activationPhase: 3, extractionTimeSeconds: 30, capacityPlayers: 3 },
      { id: "ZEX-PRI-04", name: "Plataforma Abissal Sul", coordinates: { x: 0, y: -900, z: 165 }, activationPhase: 3, extractionTimeSeconds: 30, capacityPlayers: 3 },
    ],
    zuSpec: {
      spawnDelayAfterLastZexSeconds: 30,
      durationSeconds: 60,
      radiusMeters: 30,
      locationLabel: "Torre Central do Atoll (0, 0, 150)"
    },
    inactivityRule: {
      thresholdSeconds: 90,
      penaltyDamagePerSecond: 2.5,
      warningSeconds: 60
    },
    ue5Class: {
      mapDataHeader: "Game/World/Priadus/KhaaosPriadusMapData.h",
      levelHeader: "Game/World/Priadus/KhaaosPriadusLevel.h",
      persistenceEnum: "EKhaaosWorld::Priadus"
    }
  },

  Ckesalth: {
    id: "Ckesalth",
    order: 3,
    name: "Ckesalth",
    subtitle: "Caldeira Vulcânica & Fundições Geotérmicas",
    biome: "Cordilheira Vulcânica Ativa, Rios de Magma e Usinas deObsidiana",
    dimensionsKm: "4.0 x 4.0 km",
    sizeMeters: 4000,
    recommendedPlayers: "60 Operadores (20 Trios)",
    targetDurationMinutes: 25,
    krcMultiplier: 2.25,
    xpMultiplier: 2.0,
    accentColor: "#ef4444",
    unlockRule: {
      requiredWorld: "Priadus",
      requiredCompletions: 10,
      description: "Requer 10 extrações bem-sucedidas em Priadus."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Cinturão Magmático 1", durationSeconds: 330, radiusMeters: 2000, damagePerSecond: 2.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 1, phaseName: "Cinturão Magmático 2", durationSeconds: 300, radiusMeters: 1350, damagePerSecond: 4.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 2, phaseName: "Fissura Piroclástica 3", durationSeconds: 240, radiusMeters: 800, damagePerSecond: 8.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 3, phaseName: "Câmara de Ignis 4", durationSeconds: 180, radiusMeters: 400, damagePerSecond: 15.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 4, phaseName: "Erupção Total", durationSeconds: 180, radiusMeters: 65, damagePerSecond: 30.0, center: { x: 0, y: 0, z: 200 } },
    ],
    pois: [
      {
        name: "Volcano Core",
        tier: 3,
        theme: "Reator Geotérmico Suspenso na Cratera",
        coordinates: { x: 0, y: 0, z: 380 },
        radiusMeters: 300,
        lootSpawnCount: 18,
        rarityWeights: { common: 5, uncommon: 15, rare: 35, epic: 28, legendary: 17 },
        strategicNote: "Pontes de titânio sobre magma vivo; maior concentração de loot lendário de Ckesalth."
      },
      {
        name: "North Forge",
        tier: 3,
        theme: "Fundição Automatizada de Armamentos",
        coordinates: { x: 0, y: 1200, z: 310 },
        radiusMeters: 230,
        lootSpawnCount: 14,
        rarityWeights: { common: 8, uncommon: 20, rare: 34, epic: 26, legendary: 12 },
        strategicNote: "Prensas térmicas ativas e terminais de upgrade imediato de armas."
      },
      {
        name: "East Obsidian Temple",
        tier: 2,
        theme: "Santuário Monolítico de Basalto",
        coordinates: { x: 1150, y: 100, z: 240 },
        radiusMeters: 200,
        lootSpawnCount: 12,
        rarityWeights: { common: 15, uncommon: 30, rare: 30, epic: 18, legendary: 7 },
        strategicNote: "Labirinto de colunas de basalto que bloqueiam bombas piroclásticas."
      },
      {
        name: "West Lava Tube",
        tier: 2,
        theme: "Rede de Túneis Térmicos Subterrâneos",
        coordinates: { x: -1150, y: -150, z: 140 },
        radiusMeters: 210,
        lootSpawnCount: 12,
        rarityWeights: { common: 15, uncommon: 30, rare: 30, epic: 18, legendary: 7 },
        strategicNote: "Rota rápida entre quadrantes, mas vulnerável a inundações de lava durante erupções."
      }
    ],
    hazard: {
      id: "HAZ_CKESALTH_ERUPTION",
      name: "Erupção Piroclástica & Gêiseres de Lava",
      type: "VOLCANIC_LAVA",
      intervalSeconds: 140,
      durationSeconds: 35,
      damagePerSecond: 9.0,
      description: "Bombardeio de meteoros vulcânicos e elevação súbita dos canais de magma nas cotas baixas.",
      counterplay: "Monitorar tremores sísmicos no HUD e posicionar-se sob escudos térmicos das fundições."
    },
    zexNodes: [
      { id: "ZEX-CKE-01", name: "Bastião da Forja Norte", coordinates: { x: -200, y: 1050, z: 320 }, activationPhase: 2, extractionTimeSeconds: 35, capacityPlayers: 3 },
      { id: "ZEX-CKE-02", name: "Altar de Obsidiana Leste", coordinates: { x: 1000, y: 250, z: 260 }, activationPhase: 2, extractionTimeSeconds: 35, capacityPlayers: 3 },
      { id: "ZEX-CKE-03", name: "Chaminé Geotérmica Oeste", coordinates: { x: -950, y: -300, z: 250 }, activationPhase: 3, extractionTimeSeconds: 35, capacityPlayers: 3 },
      { id: "ZEX-CKE-04", name: "Crista de Cinzas Sul", coordinates: { x: 100, y: -1100, z: 280 }, activationPhase: 3, extractionTimeSeconds: 35, capacityPlayers: 3 },
    ],
    zuSpec: {
      spawnDelayAfterLastZexSeconds: 30,
      durationSeconds: 60,
      radiusMeters: 30,
      locationLabel: "Anel Superior do Volcano Core (0, 0, 380)"
    },
    inactivityRule: {
      thresholdSeconds: 90,
      penaltyDamagePerSecond: 3.0,
      warningSeconds: 60
    },
    ue5Class: {
      mapDataHeader: "Game/World/Ckesalth/KhaaosCkesalthMapData.h",
      levelHeader: "Game/World/Ckesalth/KhaaosCkesalthLevel.h",
      persistenceEnum: "EKhaaosWorld::Ckesalth"
    }
  },

  Arukheea: {
    id: "Arukheea",
    order: 4,
    name: "Arukheea",
    subtitle: "Singularidade Dimensional & Ruptura de Khaaos",
    biome: "Fragmentos Flutuantes no Vazio, Anomalias Gravitacionais e Cidadelas Astrais",
    dimensionsKm: "4.5 x 4.5 km",
    sizeMeters: 4500,
    recommendedPlayers: "60 Operadores Elite (20 Trios)",
    targetDurationMinutes: 28,
    krcMultiplier: 3.5,
    xpMultiplier: 3.0,
    accentColor: "#a855f7",
    unlockRule: {
      requiredWorld: "Ckesalth",
      requiredCompletions: 15,
      description: "Requer 15 extrações bem-sucedidas em Ckesalth."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Horizonte de Eventos 1", durationSeconds: 360, radiusMeters: 2250, damagePerSecond: 2.5, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 1, phaseName: "Horizonte de Eventos 2", durationSeconds: 300, radiusMeters: 1500, damagePerSecond: 5.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 2, phaseName: "Distorsão Quântica 3", durationSeconds: 240, radiusMeters: 900, damagePerSecond: 10.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 3, phaseName: "Ruptura Astral 4", durationSeconds: 180, radiusMeters: 450, damagePerSecond: 18.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 4, phaseName: "Singularidade Zero", durationSeconds: 180, radiusMeters: 70, damagePerSecond: 40.0, center: { x: 0, y: 0, z: 300 } },
    ],
    pois: [
      {
        name: "Nexus of Khaaos",
        tier: 3,
        theme: "Núcleo da Singularidade Dimensional",
        coordinates: { x: 0, y: 0, z: 500 },
        radiusMeters: 320,
        lootSpawnCount: 20,
        rarityWeights: { common: 0, uncommon: 10, rare: 35, epic: 33, legendary: 22 },
        strategicNote: "Gravidade baixa permanente e portais de dobra curta; maior multiplicador de KRC do jogo."
      },
      {
        name: "North Astral Spire",
        tier: 3,
        theme: "Pináculo Flutuante dos Arquitetos",
        coordinates: { x: 0, y: 1400, z: 450 },
        radiusMeters: 240,
        lootSpawnCount: 15,
        rarityWeights: { common: 5, uncommon: 15, rare: 35, epic: 30, legendary: 15 },
        strategicNote: "Ilhas conectadas por feixes de energia que impulsionam operadores entre níveis."
      },
      {
        name: "East Void Sanctum",
        tier: 2,
        theme: "Catedral Invertida do Vazio",
        coordinates: { x: 1350, y: 150, z: 340 },
        radiusMeters: 220,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 25, rare: 35, epic: 20, legendary: 10 },
        strategicNote: "Cobertura dimensional que oculta assinaturas térmicas contra radares inimigos."
      },
      {
        name: "West Quantum Array",
        tier: 2,
        theme: "Matriz de Estabilização de Realidade",
        coordinates: { x: -1350, y: -150, z: 320 },
        radiusMeters: 220,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 25, rare: 35, epic: 20, legendary: 10 },
        strategicNote: "Permite ativar estabilizadores locais que anulam tempestades gravitacionais."
      }
    ],
    hazard: {
      id: "HAZ_ARUKHEEA_SINGULARITY",
      name: "Anomalia de Inversão Gravitacional & Fenda de Khaaos",
      type: "KHAOS_GRAVITY",
      intervalSeconds: 120,
      durationSeconds: 30,
      damagePerSecond: 12.0,
      description: "Rupturas espaço-temporais alteram a gravidade para 0.35G e drenam escudos fora de âncoras quânticas.",
      counterplay: "Ativar Botas Magnéticas ou permanecer dentro do raio das Âncoras de Realidade nos POIs."
    },
    zexNodes: [
      { id: "ZEX-ARU-01", name: "Portal Astral Norte", coordinates: { x: 250, y: 1250, z: 460 }, activationPhase: 2, extractionTimeSeconds: 40, capacityPlayers: 3 },
      { id: "ZEX-ARU-02", name: "Fenda Estabilizada Leste", coordinates: { x: 1200, y: -100, z: 360 }, activationPhase: 2, extractionTimeSeconds: 40, capacityPlayers: 3 },
      { id: "ZEX-ARU-03", name: "Âncora Quântica Oeste", coordinates: { x: -1200, y: 150, z: 350 }, activationPhase: 3, extractionTimeSeconds: 40, capacityPlayers: 3 },
      { id: "ZEX-ARU-04", name: "Mirante do Vazio Sul", coordinates: { x: 0, y: -1300, z: 390 }, activationPhase: 3, extractionTimeSeconds: 40, capacityPlayers: 3 },
    ],
    zuSpec: {
      spawnDelayAfterLastZexSeconds: 30,
      durationSeconds: 60,
      radiusMeters: 30,
      locationLabel: "Singularidade Central do Nexus (0, 0, 500)"
    },
    inactivityRule: {
      thresholdSeconds: 90,
      penaltyDamagePerSecond: 4.0,
      warningSeconds: 60
    },
    ue5Class: {
      mapDataHeader: "Game/World/Arukheea/KhaaosArukheeaMapData.h",
      levelHeader: "Game/World/Arukheea/KhaaosArukheeaLevel.h",
      persistenceEnum: "EKhaaosWorld::Arukheea"
    }
  }
};

export const WORLD_ORDER: WorldId[] = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"];

export interface PlayerWorldStats {
  worldId: WorldId;
  unlocked: boolean;
  matchesPlayed: number;
  successfulExtractions: number;
  zuVictories: number;
  totalKills: number;
  bestTimeSeconds: number;
  krcEarned: number;
}

export interface MultiWorldPersistenceState {
  playerId: string;
  currentWorld: WorldId;
  totalKrcEarned: number;
  totalCompletions: number;
  worlds: Record<WorldId, PlayerWorldStats>;
  updatedAt: string;
}

export function evaluateWorldUnlocks(
  worldsState: Record<WorldId, PlayerWorldStats>
): Record<WorldId, PlayerWorldStats> {
  const next = { ...worldsState };
  next.CIGKV = { ...next.CIGKV, unlocked: true };

  if ((next.CIGKV?.successfulExtractions ?? 0) >= KHAAOS_WORLDS.Barburhen.unlockRule.requiredCompletions) {
    next.Barburhen = { ...next.Barburhen, unlocked: true };
  }
  if ((next.Barburhen?.successfulExtractions ?? 0) >= KHAAOS_WORLDS.Priadus.unlockRule.requiredCompletions) {
    next.Priadus = { ...next.Priadus, unlocked: true };
  }
  if ((next.Priadus?.successfulExtractions ?? 0) >= KHAAOS_WORLDS.Ckesalth.unlockRule.requiredCompletions) {
    next.Ckesalth = { ...next.Ckesalth, unlocked: true };
  }
  if ((next.Ckesalth?.successfulExtractions ?? 0) >= KHAAOS_WORLDS.Arukheea.unlockRule.requiredCompletions) {
    next.Arukheea = { ...next.Arukheea, unlocked: true };
  }

  return next;
}
