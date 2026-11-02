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

export interface WorldHazardAnchor {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface WorldHazardSpec {
  id: string;
  name: string;
  /**
   * Cânon F42 (docs/FASE42_MUNDOS_FIDELIDADE_README.md).
   * - ACID_RAIN     → Barburhen  (id-gated no sim3d via `acidTimer` + gate `Barburhen`)
   * - SPORE_FOG      → Priadus    (Neblina com Esporos Tóxicos; sporeTopY = 90)
   * - TOXIC_SMOKE    → Ckesalth   (Fumaça Tóxica; smokeTopY = 180)
   * - TSUNAMI_WAVE   → Arukheea   (Tsunami; submergeBelowY = 90)
   * - KHAOS_GRAVITY  → CIGKV      (Pulso Khaaos; gravityScale = 0.35 + 4 âncoras)
   *
   * `VOLCANIC_LAVA` e `SAFE_TRAINING` foram removidos em F42 (não-cânon do
   * README; a erupção de lava saiu do vocabulário e o Pulso Khaaos substituiu
   * o placeholder de "treinamento seguro" do CIGKV).
   */
  type: "ACID_RAIN" | "TSUNAMI_WAVE" | "SPORE_FOG" | "TOXIC_SMOKE" | "KHAOS_GRAVITY";
  intervalSeconds: number;
  durationSeconds: number;
  damagePerSecond: number;
  description: string;
  counterplay: string;
  /** F42 cânon: KHAOS_GRAVITY (CIGKV Pulso Khaaos) — gravidade reduzida e âncoras de contenção. */
  gravityScale?: number;
  anchorRadius?: number;
  anchors?: ReadonlyArray<WorldHazardAnchor>;
  /** F42 cânon: SPORE_FOG (Priadus) — teto da neblina de esporos (acima = seguro). */
  sporeTopY?: number;
  /** F42 cânon: TOXIC_SMOKE (Ckesalth) — teto da fumaça tóxica (acima = seguro). */
  smokeTopY?: number;
  /** F42 cânon: TSUNAMI_WAVE (Arukheea) — cota de submersão (abaixo = afogamento). */
  submergeBelowY?: number;
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
  /**
   * Tag de revisão canônica (contrato da arquitetura §4).
   * Pinado em `f42-2026-11-02` após a migração F42 (Pulso Khaaos → CIGKV,
   * Tsunami → Arukheea, lava removida, SPORE_FOG/TOXIC_SMOKE introduzidos).
   */
  configRevision: string;
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
    subtitle: "Khaaos Ville — Campo de Instrução de Guerra",
    biome: "Vila Militar Murada — Pátio de Armamento, Setor de Testes (Proving Grounds), Parque Abandonado e 15 Zonas de Extração de XP",
    dimensionsKm: "2.0 x 2.0 km",
    sizeMeters: 2000,
    recommendedPlayers: "100 Operadores (especificação canônica do Descentralizador)",
    targetDurationMinutes: 15,
    krcMultiplier: 0.5,
    xpMultiplier: 1.0,
    accentColor: "#00f0ff",
    configRevision: "f42-2026-11-02",
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
      id: "HAZ_CIGKV_PULSO_KHAAOS",
      name: "Pulso Khaaos — Anomalia de Inversão Gravitacional",
      type: "KHAOS_GRAVITY",
      intervalSeconds: 120,
      durationSeconds: 30,
      damagePerSecond: 12,
      gravityScale: 0.35,
      anchorRadius: 28,
      anchors: [
        { id: "NEXUS", name: "Nexus of Khaaos", x: 0, z: 0 },
        { id: "NORTH", name: "North Astral Spire", x: 0, z: -95 },
        { id: "EAST", name: "East Void Sanctum", x: 95, z: 0 },
        { id: "WEST", name: "West Quantum Array", x: -95, z: 0 },
      ],
      description: "Pulso Khaaos a cada 10 minutos (README, Protocolo CIGKV): alteração climática ou drop de loot lendário. Fora das âncoras de contenção a gravidade cai para 0.35G e escudos/vida são drenados a 12 dps — morte direta, sem DBNO.",
      counterplay: "Permanecer dentro do raio das 4 âncoras quânticas (NEXUS/NORTH/EAST/WEST) ou ativar Botas Magnéticas durante o pulso."
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
      levelHeader: "Game/World/CIGKV/KhaaosCIGKVLevel.h",
      persistenceEnum: "EKhaaosWorld::CIGKV"
    }
  },

  Barburhen: {
    id: "Barburhen",
    order: 1,
    name: "Barburhen",
    subtitle: "Barburhen — Mundo da Destruição (Ruínas Urbanas Pós-Guerra)",
    biome: "Urbano Pós-Guerra: Construções Inacabadas, Carros Abandonados, Cadáveres que Apodrecem, Chuva Ácida, Desabamentos e Fumaça",
    dimensionsKm: "3.0 x 3.0 km",
    sizeMeters: 3000,
    recommendedPlayers: "100 Operadores (especificação canônica do Descentralizador)",
    targetDurationMinutes: 20,
    krcMultiplier: 1.0,
    xpMultiplier: 1.25,
    accentColor: "#f59e0b",
    configRevision: "f42-2026-11-02",
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
    subtitle: "Priadus — Floresta da Escuridão (Selva Hostil, Pântanos, Neblina Alucinógena)",
    biome: "Selva Densa, Pântanos, Flora Carnívora, Neblina com Esporos Tóxicos e Jacarés — Teste de Sanidade Mental diante do Invisível",
    dimensionsKm: "3.5 x 3.5 km",
    sizeMeters: 3500,
    recommendedPlayers: "100 Operadores (especificação canônica do Descentralizador)",
    targetDurationMinutes: 22,
    krcMultiplier: 1.5,
    xpMultiplier: 1.5,
    accentColor: "#06b6d4",
    configRevision: "f42-2026-11-02",
    unlockRule: {
      requiredWorld: "Barburhen",
      requiredCompletions: 5,
      description: "Requer 5 extrações bem-sucedidas em Barburhen."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Neblina Crescente 1", durationSeconds: 300, radiusMeters: 1750, damagePerSecond: 1.5, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 1, phaseName: "Neblina Crescente 2", durationSeconds: 300, radiusMeters: 1200, damagePerSecond: 3.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 2, phaseName: "Esporos Densos 3", durationSeconds: 240, radiusMeters: 750, damagePerSecond: 6.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 3, phaseName: "Floresta Sufocante 4", durationSeconds: 180, radiusMeters: 380, damagePerSecond: 12.0, center: { x: 0, y: 0, z: 100 } },
      { phaseIndex: 4, phaseName: "Coração do Templo", durationSeconds: 180, radiusMeters: 60, damagePerSecond: 25.0, center: { x: 0, y: 0, z: 100 } },
    ],
    pois: [
      {
        name: "Templo Antigo",
        tier: 3,
        theme: "Ruínas do Templo da Selva — Centro do Anel de Fechamento",
        coordinates: { x: 0, y: 0, z: 150 },
        radiusMeters: 280,
        lootSpawnCount: 16,
        rarityWeights: { common: 8, uncommon: 20, rare: 32, epic: 25, legendary: 15 },
        strategicNote: "Anel fecha no templo; neblina com esporos tóxicos pune o atraso (acima de 90m = seguro)."
      },
      {
        name: "Bosque",
        tier: 3,
        theme: "Bosque de Desembarque — Setor de Inserção Zu",
        coordinates: { x: 0, y: 1050, z: 280 },
        radiusMeters: 210,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 22, rare: 33, epic: 25, legendary: 10 },
        strategicNote: "Dossel alto oferece cobertura aérea contra a neblina rasteira; disputado por snipers."
      },
      {
        name: "Área de Caça",
        tier: 2,
        theme: "Clareira de Caça com Flora Carnívora",
        coordinates: { x: 950, y: 150, z: 60 },
        radiusMeters: 190,
        lootSpawnCount: 11,
        rarityWeights: { common: 18, uncommon: 32, rare: 28, epic: 16, legendary: 6 },
        strategicNote: "Arbustos carnívoros ocultam armadilhas; alto risco de emboscada em CQB."
      },
      {
        name: "Área Pantanosa",
        tier: 2,
        theme: "Pântano dos Jacarés — Setor de Inundação Lenta",
        coordinates: { x: -950, y: -100, z: 95 },
        radiusMeters: 200,
        lootSpawnCount: 11,
        rarityWeights: { common: 20, uncommon: 30, rare: 28, epic: 16, legendary: 6 },
        strategicNote: "Jacarés com IA patrulham o pântano; conteúdo de engine UE5.8 (deferred em F42)."
      }
    ],
    hazard: {
      id: "HAZ_PRIADUS_SPORE_FOG",
      name: "Neblina com Esporos Tóxicos (Emboscada Verde)",
      type: "SPORE_FOG",
      intervalSeconds: 150,
      durationSeconds: 45,
      damagePerSecond: 7,
      sporeTopY: 90,
      description: "Neblina alucinógena de esporos tóxicos abaixo de 90m de altitude — furam blindagem e causam dano contínuo. README W2: 'anel fecha no templo; neblina com esporos tóxicos pune o atraso'.",
      counterplay: "Subir para platforms elevadas (>90m), ativar máscara de esporos ou avançar rápido para o templo antes do fechamento do anel."
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
    subtitle: "Ckesalth — Deserto das Almas Esquecidas (Petróleo em Chamas, Fumaça Tóxica)",
    biome: "Deserto Árido, Lagoas de Petróleo em Chamas, Fumaça Tóxica e Areia Movediça — Lição sobre a Fragilidade da Vaidade",
    dimensionsKm: "4.0 x 4.0 km",
    sizeMeters: 4000,
    recommendedPlayers: "100 Operadores (especificação canônica do Descentralizador)",
    targetDurationMinutes: 25,
    krcMultiplier: 2.25,
    xpMultiplier: 2.0,
    accentColor: "#ef4444",
    configRevision: "f42-2026-11-02",
    unlockRule: {
      requiredWorld: "Priadus",
      requiredCompletions: 10,
      description: "Requer 10 extrações bem-sucedidas em Priadus."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Duna Exterior 1", durationSeconds: 330, radiusMeters: 2000, damagePerSecond: 2.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 1, phaseName: "Duna Exterior 2", durationSeconds: 300, radiusMeters: 1350, damagePerSecond: 4.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 2, phaseName: "Areia Movediça 3", durationSeconds: 240, radiusMeters: 800, damagePerSecond: 8.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 3, phaseName: "Refinaria em Chamas 4", durationSeconds: 180, radiusMeters: 400, damagePerSecond: 15.0, center: { x: 0, y: 0, z: 200 } },
      { phaseIndex: 4, phaseName: "Vila Sombria Suffocada", durationSeconds: 180, radiusMeters: 65, damagePerSecond: 30.0, center: { x: 0, y: 0, z: 200 } },
    ],
    pois: [
      {
        name: "Refinaria de Petróleo",
        tier: 3,
        theme: "Refinaria Central em Chamas — Centro do Anel de Fechamento",
        coordinates: { x: 0, y: 0, z: 380 },
        radiusMeters: 300,
        lootSpawnCount: 18,
        rarityWeights: { common: 5, uncommon: 15, rare: 35, epic: 28, legendary: 17 },
        strategicNote: "Lagoas de petróleo em chamas cercam a refinaria; maior concentração de loot lendário de Ckesalth."
      },
      {
        name: "Vilarejo dos Beduínos",
        tier: 3,
        theme: "Vilarejo dos Beduínos — Setor de Inserção Zu",
        coordinates: { x: 0, y: 1200, z: 310 },
        radiusMeters: 230,
        lootSpawnCount: 14,
        rarityWeights: { common: 8, uncommon: 20, rare: 34, epic: 26, legendary: 12 },
        strategicNote: "Construções de adobe oferecem abrigo contra a fumaça tóxica; terminais de upgrade de armas."
      },
      {
        name: "Resort Abandonado",
        tier: 2,
        theme: "Resort Abandonado no Deserto",
        coordinates: { x: 1150, y: 100, z: 240 },
        radiusMeters: 200,
        lootSpawnCount: 12,
        rarityWeights: { common: 15, uncommon: 30, rare: 30, epic: 18, legendary: 7 },
        strategicNote: "Piscinas secas e cabanas de praia fornecem cobertura CQB; refúgio contra tempestades de areia."
      },
      {
        name: "Areia Movediça",
        tier: 2,
        theme: "Caminho de Areia Movediça — Setor Plus- do README",
        coordinates: { x: -1150, y: -150, z: 140 },
        radiusMeters: 210,
        lootSpawnCount: 12,
        rarityWeights: { common: 15, uncommon: 30, rare: 30, epic: 18, legendary: 7 },
        strategicNote: "Mecânica de afundamento diferida para o cook UE5.8 (F42); o setor existe com nome + dunas canônicas."
      }
    ],
    hazard: {
      id: "HAZ_CKESALTH_TOXIC_SMOKE",
      name: "Fumaça Tóxica (Assassino Silencioso)",
      type: "TOXIC_SMOKE",
      intervalSeconds: 140,
      durationSeconds: 35,
      damagePerSecond: 9,
      smokeTopY: 180,
      description: "Fumaça tóxica das lagoas de petróleo em chamas abaixo de 180m de altitude — furam blindagem e causam dano contínuo. README W3: 'a partir de 5 min o anel fecha na Vila Sombria sob fumaça tóxica'.",
      counterplay: "Subir para plataformas elevadas (>180m), ativar máscara de gás ou avançar para o Vilarejo dos Beduínos antes do fechamento do anel."
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
    subtitle: "Arukheea — Ilha dos Gritos Calados (Prisão do Sol da Noite, Tsunami Iminente)",
    biome: "Ilha Isolada, Prisão do Sol da Noite (Luz Perpétua), Tsunami Iminente, Tubarões e Cemitério das Baleias — Pressão Hidráulica e Claustrofobia em Céu Aberto",
    dimensionsKm: "4.5 x 4.5 km",
    sizeMeters: 4500,
    recommendedPlayers: "100 Operadores Elite (especificação canônica do Descentralizador)",
    targetDurationMinutes: 28,
    krcMultiplier: 3.5,
    xpMultiplier: 3.0,
    accentColor: "#a855f7",
    configRevision: "f42-2026-11-02",
    unlockRule: {
      requiredWorld: "Ckesalth",
      requiredCompletions: 15,
      description: "Requer 15 extrações bem-sucedidas em Ckesalth."
    },
    safeZonePhases: [
      { phaseIndex: 0, phaseName: "Maré Baixa 1", durationSeconds: 360, radiusMeters: 2250, damagePerSecond: 2.5, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 1, phaseName: "Maré Baixa 2", durationSeconds: 300, radiusMeters: 1500, damagePerSecond: 5.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 2, phaseName: "Tromba d'água 3", durationSeconds: 240, radiusMeters: 900, damagePerSecond: 10.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 3, phaseName: "Tsunami Iminente 4", durationSeconds: 180, radiusMeters: 450, damagePerSecond: 18.0, center: { x: 0, y: 0, z: 300 } },
      { phaseIndex: 4, phaseName: "Prisão do Sol da Noite", durationSeconds: 180, radiusMeters: 70, damagePerSecond: 40.0, center: { x: 0, y: 0, z: 300 } },
    ],
    pois: [
      {
        name: "Prisão do Sol da Noite",
        tier: 3,
        theme: "Prisão de Luz Perpétua — Centro do Anel de Fechamento",
        coordinates: { x: 0, y: 0, z: 500 },
        radiusMeters: 320,
        lootSpawnCount: 20,
        rarityWeights: { common: 0, uncommon: 10, rare: 35, epic: 33, legendary: 22 },
        strategicNote: "Luz perpétua e heliponto da torre de extração final; maior multiplicador de KRC do jogo."
      },
      {
        name: "Bosque dos Perdidos",
        tier: 3,
        theme: "Bosque dos Perdidos — Setor de Inserção Zu",
        coordinates: { x: 0, y: 1400, z: 450 },
        radiusMeters: 240,
        lootSpawnCount: 15,
        rarityWeights: { common: 5, uncommon: 15, rare: 35, epic: 30, legendary: 15 },
        strategicNote: "Dossel denso oferece cobertura aérea contra o tsunami; rotas de tirolesa para a prisão."
      },
      {
        name: "Cemitério das Baleias",
        tier: 2,
        theme: "Cemitério das Baleias — Costão com Esqueletos",
        coordinates: { x: 1350, y: 150, z: 340 },
        radiusMeters: 220,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 25, rare: 35, epic: 20, legendary: 10 },
        strategicNote: "Costão rochoso com esqueletos de baleia — cobertura CQB natural e tubarões patrulhando o mar."
      },
      {
        name: "Fábrica Abandonada",
        tier: 2,
        theme: "Fábrica da Ilha — Setor Industrial Decaído",
        coordinates: { x: -1350, y: -150, z: 320 },
        radiusMeters: 220,
        lootSpawnCount: 13,
        rarityWeights: { common: 10, uncommon: 25, rare: 35, epic: 20, legendary: 10 },
        strategicNote: "Estrutura elevada e impermeável ao tsunami; terminais de upgrade de equipamento."
      }
    ],
    hazard: {
      id: "HAZ_ARUKHEEA_TSUNAMI",
      name: "Tsunami Iminente (Ilha dos Gritos Calados)",
      type: "TSUNAMI_WAVE",
      intervalSeconds: 180,
      durationSeconds: 40,
      damagePerSecond: 6,
      submergeBelowY: 90,
      description: "Onda de tsunami que submerge terrenos abaixo de 90m de altitude, causando arrasto e afogamento. README W4: 'anel fecha na Prisão; quem não sobe no helicóptero torna-se grito calado'.",
      counterplay: "Subir para plataformas superiores (>90m) — Prisão do Sol da Noite, Fábrica Abandonada, Bosque dos Perdidos — ou aguardar extração por helicóptero na torre."
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

/* ────────────────────────────────────────────────────────────────────────────
 * Contrato de dimensões canônicas dos rings (especificação do Descentralizador)
 *
 * Faixa 15.000–25.000 m² · 100 operadores por ring · densidade 150–250 m²/jogador
 * (combate CQB estilo Free Fire). `areaM2` ≠ `perimeterM` de contorno — ambos são
 * campos independentes do contrato e a paridade é verificada por
 * `tests/official/worlds-dimensions.test.ts`.
 *
 * Fonte: README.md § "Mundos Oficiais (W1–W4)" (sync 2026-11-02, PRs #243/#244);
 * port do item 1.1 do Roadmap end to end (docs/ROADMAP_DESENVOLVIMENTO_2026-11.md).
 * ──────────────────────────────────────────────────────────────────────────── */

export type WorldShape =
  | "fortified_rectangle"
  | "urban_gridiron"
  | "organic_blob"
  | "desert_basin"
  | "coastal_island";

export interface WorldRingDimensions {
  worldId: WorldId;
  operationalId: OperationalWorldId;
  /** Forma orgânica do contorno por bioma (spec do WorldMapPreview). */
  shape: WorldShape;
  /** Área canônica jogável em m² (≠ perímetro de contorno). */
  areaM2: number;
  /** Bounding box canônica em metros. */
  boundingBoxM: { widthM: number; depthM: number };
  /** Perímetro de contorno em metros (contrato independente da área). */
  perimeterM: number;
  /** Capacidade fixa do Descentralizador: 100 operadores por ring. */
  operatorCapacity: number;
  /** Densidade canônica em m² por operador (areaM2 / operatorCapacity). */
  densityM2PerOperator: number;
  shapeNote: string;
}

export const WORLD_RING_CAPACITY_OPERATORS = 100;

export const WORLD_RING_DIMENSIONS: Readonly<
  Record<WorldId, WorldRingDimensions>
> = {
  CIGKV: {
    worldId: "CIGKV",
    operationalId: "CIGKV",
    shape: "fortified_rectangle",
    areaM2: 16_000,
    boundingBoxM: { widthM: 160, depthM: 100 },
    perimeterM: 520,
    operatorCapacity: 100,
    densityM2PerOperator: 160,
    shapeNote: "Vila militar murada",
  },
  Barburhen: {
    worldId: "Barburhen",
    operationalId: "W1",
    shape: "urban_gridiron",
    areaM2: 19_000,
    boundingBoxM: { widthM: 190, depthM: 100 },
    perimeterM: 580,
    operatorCapacity: 100,
    densityM2PerOperator: 190,
    shapeNote: "Grid urbano irregular",
  },
  Priadus: {
    worldId: "Priadus",
    operationalId: "W2",
    shape: "organic_blob",
    areaM2: 22_000,
    boundingBoxM: { widthM: 220, depthM: 100 },
    perimeterM: 640,
    operatorCapacity: 100,
    densityM2PerOperator: 220,
    shapeNote: "Blob orgânico radial",
  },
  Ckesalth: {
    worldId: "Ckesalth",
    operationalId: "W3",
    shape: "desert_basin",
    areaM2: 25_000,
    boundingBoxM: { widthM: 250, depthM: 100 },
    perimeterM: 700,
    operatorCapacity: 100,
    densityM2PerOperator: 250,
    shapeNote: "Bacia de dunas",
  },
  Arukheea: {
    worldId: "Arukheea",
    operationalId: "W4",
    shape: "coastal_island",
    areaM2: 18_000,
    boundingBoxM: { widthM: 180, depthM: 100 },
    perimeterM: 560,
    operatorCapacity: 100,
    densityM2PerOperator: 180,
    shapeNote: "Ilha costeira com enseadas",
  },
} as const;

/** Lista ordenada (CIGKV → W4) das dimensões canônicas dos rings. */
export const WORLD_RING_DIMENSIONS_LIST: readonly WorldRingDimensions[] = (
  ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"] as const
).map((id) => WORLD_RING_DIMENSIONS[id]);
