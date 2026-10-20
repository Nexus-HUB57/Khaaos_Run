/**
 * Khaaos Run — Shared UE5.8 Build, 3D Maps/Niagara & EAC SDK Engineering Hub
 * Synchronizes C++20 / UE5.8 Editor Commandlets, 3D Assets, and Anti-Cheat Binary Telemetry
 */

import type { WorldId } from "./worlds";

export interface NiagaraSystemDescriptor {
  id: string;
  packagePath: string;
  worldId: WorldId | "All";
  emitterType: string;
  spawnRate: number;
  maxParticles: number;
  lifetimeSeconds: number;
  colorHex: string;
  significanceRank: number;
  description: string;
}

export interface World3DAssetBundle {
  worldId: WorldId;
  umapPackagePath: string;
  levelScriptClass: string;
  objMeshPath: string;
  gltfMeshPath: string;
  mapPointsCsvPath: string;
  worldConfigCsvPath: string;
  topDownSvgPath: string;
  primaryNiagaraHazard: string;
  sizeMeters: number;
  maxPlayers: number;
  ringStartRadiusMeters: number;
  ringEndRadiusMeters: number;
  ringCloseSeconds: number;
  hazardFormulaSummary: string;
  sectors: Array<{
    id: string;
    name: string;
    fraction: string;
    centerMeters: [number, number, number];
    extentMeters: [number, number, number];
  }>;
  zexCoordinates: Array<{
    id: string;
    x: number;
    y: number;
    sector: string;
  }>;
}

export interface EACViolationSimulationInput {
  playerId: number;
  clientHandle: string;
  violationCode: string;
  description: string;
  priorStrikes?: number;
}

export interface EACViolationSimulationResult {
  playerId: number;
  clientHandle: string;
  authenticated: boolean;
  violationCode: string;
  category: "Informational" | "Minor" | "Major" | "Critical";
  strikesAssigned: number;
  totalStrikes: number;
  kicked: boolean;
  recommendedAction: "NONE" | "WARNING" | "KICK_PLAYER";
  attestationDigestHex: string;
  binaryLoaded: string;
}

export const KHAAOS_NIAGARA_SYSTEMS: NiagaraSystemDescriptor[] = [
  {
    id: "NS_EMP_CalibrationPulse",
    packagePath: "/Game/VFX/NS_EMP_CalibrationPulse",
    worldId: "CIGKV",
    emitterType: "GPUComputeSim_RadialWave",
    spawnRate: 1200,
    maxParticles: 8000,
    lifetimeSeconds: 3.5,
    colorHex: "#00f0ff",
    significanceRank: 1,
    description: "Onda radial eletromagnética de calibração no domo CIGKV (varredura anti-camping a cada 180s).",
  },
  {
    id: "NS_AcidRain_Barburhen",
    packagePath: "/Game/VFX/NS_AcidRain_Barburhen",
    worldId: "Barburhen",
    emitterType: "GPUComputeSim_WeatherPrecipitation",
    spawnRate: 4500,
    maxParticles: 32000,
    lifetimeSeconds: 2.2,
    colorHex: "#a3e635",
    significanceRank: 0,
    description: "Precipitação corrosiva sincronizada com ABarburhenAcidRainVolume (−1% MaxVitality / 10s +2 Fear).",
  },
  {
    id: "NS_DeathWaterRing_Barburhen",
    packagePath: "/Game/VFX/NS_DeathWaterRing_Barburhen",
    worldId: "Barburhen",
    emitterType: "GPUComputeSim_CylindricalWall",
    spawnRate: 3000,
    maxParticles: 24000,
    lifetimeSeconds: 4.0,
    colorHex: "#f59e0b",
    significanceRank: 0,
    description: "Parede perimetral da Água da Morte (ABarburhenRingController: 250m → 40m em 600s, −5%/s fora do anel).",
  },
  {
    id: "NS_ToxicSporeFog_Priadus",
    packagePath: "/Game/VFX/NS_ToxicSporeFog_Priadus",
    worldId: "Priadus",
    emitterType: "GPUComputeSim_VolumetricSpores",
    spawnRate: 2800,
    maxParticles: 20000,
    lifetimeSeconds: 6.5,
    colorHex: "#10b981",
    significanceRank: 0,
    description: "Neblina volumétrica de esporos alucinógenos na Emboscada Verde de Priadus (W2/C2).",
  },
  {
    id: "NS_OilFireSmoke_Ckesalth",
    packagePath: "/Game/VFX/NS_OilFireSmoke_Ckesalth",
    worldId: "Ckesalth",
    emitterType: "GPUComputeSim_ThermalPlume",
    spawnRate: 3500,
    maxParticles: 28000,
    lifetimeSeconds: 5.0,
    colorHex: "#ef4444",
    significanceRank: 0,
    description: "Pluma térmica de petróleo em chamas e fumaça tóxica no Assassino Silencioso de Ckesalth (W3/C3).",
  },
  {
    id: "NS_TsunamiWall_Arukheea",
    packagePath: "/Game/VFX/NS_TsunamiWall_Arukheea",
    worldId: "Arukheea",
    emitterType: "GPUComputeSim_HydraulicWaveCrest",
    spawnRate: 6000,
    maxParticles: 45000,
    lifetimeSeconds: 3.8,
    colorHex: "#3b82f6",
    significanceRank: 0,
    description: "Crista hidráulica de tsunami fechando sobre a Prisão do Sol da Noite em Arukheea (W4/C4).",
  },
  {
    id: "NS_ZEXBeacon_BluePulse",
    packagePath: "/Game/VFX/NS_ZEXBeacon_BluePulse",
    worldId: "All",
    emitterType: "CPUSim_PointLightColumn",
    spawnRate: 450,
    maxParticles: 2400,
    lifetimeSeconds: 2.8,
    colorHex: "#38bdf8",
    significanceRank: 1,
    description: "Coluna luminosa azul de AKhaaosZEXTerminal (800 → 5000 lumens conforme extrações de 20% KRC).",
  },
  {
    id: "NS_MuzzleFlash_Assault",
    packagePath: "/Game/VFX/NS_MuzzleFlash_Assault",
    worldId: "All",
    emitterType: "CPUSim_BurstCone",
    spawnRate: 0,
    maxParticles: 120,
    lifetimeSeconds: 0.08,
    colorHex: "#fbbf24",
    significanceRank: 2,
    description: "Flash balístico de fuzil de assalto 5.56mm com dispersão gasosa curta em Muzzle_Socket.",
  },
  {
    id: "NS_MuzzleFlash_Shotgun",
    packagePath: "/Game/VFX/NS_MuzzleFlash_Shotgun",
    worldId: "All",
    emitterType: "CPUSim_BurstWideCone",
    spawnRate: 0,
    maxParticles: 200,
    lifetimeSeconds: 0.11,
    colorHex: "#f97316",
    significanceRank: 2,
    description: "Cone amplo de ignição calibre 12 para WPN_Shotgun_Breach.",
  },
  {
    id: "NS_MuzzleFlash_Sniper",
    packagePath: "/Game/VFX/NS_MuzzleFlash_Sniper",
    worldId: "All",
    emitterType: "CPUSim_HighVelocityBrakeJet",
    spawnRate: 0,
    maxParticles: 160,
    lifetimeSeconds: 0.12,
    colorHex: "#fde047",
    significanceRank: 2,
    description: "Jato lateral de freio de boca de alta pressão 7.62mm para WPN_Sniper_DMR.",
  },
  {
    id: "NS_Loot_Pickup_Aura",
    packagePath: "/Game/VFX/NS_Loot_Pickup_Aura",
    worldId: "All",
    emitterType: "CPUSim_RarityHelix",
    spawnRate: 180,
    maxParticles: 600,
    lifetimeSeconds: 2.5,
    colorHex: "#f59e0b",
    significanceRank: 3,
    description: "Hélice de raridade parametrizada por cor em AKhaaosLootPickup.",
  },
];

function buildZexRing(worldId: WorldId, sizeMeters: number, sectors: string[]) {
  const list: Array<{ id: string; x: number; y: number; sector: string }> = [];
  for (let i = 1; i <= 15; i++) {
    const angle = ((i - 1) / 15) * Math.PI * 2;
    const r = sizeMeters * (i % 2 === 0 ? 0.22 : 0.38);
    list.push({
      id: `ZEX_${worldId}_${String(i).padStart(2, "0")}`,
      x: Math.round(Math.cos(angle) * r),
      y: Math.round(Math.sin(angle) * r),
      sector: sectors[i % sectors.length],
    });
  }
  return list;
}

export const KHAAOS_WORLD_3D_BUNDLES: Record<WorldId, World3DAssetBundle> = {
  CIGKV: {
    worldId: "CIGKV",
    umapPackagePath: "/Game/Maps/CIGKV/L_CIGKV_KhaaosVille",
    levelScriptClass: "AKhaaosCIGKVLevel",
    objMeshPath: "Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_Terrain.obj",
    gltfMeshPath: "Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_Terrain.gltf",
    mapPointsCsvPath: "Unreal/KhaaosRun/Content/Maps/CIGKV/DT_CIGKV_MapPoints.csv",
    worldConfigCsvPath: "Unreal/KhaaosRun/Content/Maps/CIGKV/DT_CIGKV_WorldConfig.csv",
    topDownSvgPath: "Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_Map_TopDown.svg",
    primaryNiagaraHazard: "NS_EMP_CalibrationPulse",
    sizeMeters: 2000,
    maxPlayers: 50,
    ringStartRadiusMeters: 1000,
    ringEndRadiusMeters: 60,
    ringCloseSeconds: 900,
    hazardFormulaSummary: "Pulso Khaaos EMP a cada 180s (1.5 DPS fora dos domos blindados) + 1000 KRC iniciais no Zu 1",
    sectors: [
      { id: "ArmoryHub", name: "Pátio de Armamento", fraction: "1/8", centerMeters: [-450, -450, 10], extentMeters: [250, 250, 40] },
      { id: "ProvingGrounds", name: "Setor de Testes Urbano", fraction: "3/8", centerMeters: [250, -250, 18], extentMeters: [480, 420, 65] },
      { id: "AbandonedPark", name: "Parque Abandonado", fraction: "4/8", centerMeters: [150, 380, 12], extentMeters: [620, 520, 35] },
    ],
    zexCoordinates: buildZexRing("CIGKV", 2000, ["ArmoryHub", "ProvingGrounds", "AbandonedPark"]),
  },
  Barburhen: {
    worldId: "Barburhen",
    umapPackagePath: "/Game/Maps/Barburhen/L_Barburhen_W1",
    levelScriptClass: "AKhaaosBarburhenLevel + ABarburhenMapBuilder",
    objMeshPath: "Unreal/KhaaosRun/Content/Maps/Barburhen/Barburhen_Terrain.obj",
    gltfMeshPath: "Unreal/KhaaosRun/Content/Maps/Barburhen/Barburhen_Terrain.gltf",
    mapPointsCsvPath: "Unreal/KhaaosRun/Content/Maps/Barburhen/DT_Barburhen_MapPoints.csv",
    worldConfigCsvPath: "Unreal/KhaaosRun/Content/Maps/Barburhen/DT_Barburhen_WorldConfig.csv",
    topDownSvgPath: "Unreal/KhaaosRun/Content/Maps/Barburhen/Barburhen_Map_TopDown.svg",
    primaryNiagaraHazard: "NS_AcidRain_Barburhen",
    sizeMeters: 3000,
    maxPlayers: 100,
    ringStartRadiusMeters: 250,
    ringEndRadiusMeters: 40,
    ringCloseSeconds: 600,
    hazardFormulaSummary: "Chuva Ácida: −1% MaxVitality / 10s (0.001 × 10) + 2 Fear | Água da Morte: −5%/s fora do anel",
    sectors: [
      { id: "UrbanCommercial", name: "Área Urbana & Comercial", fraction: "2/8", centerMeters: [-550, -420, 22], extentMeters: [420, 380, 75] },
      { id: "IndustrialLanding", name: "Setor Industrial (Desembarque)", fraction: "3/8", centerMeters: [520, -380, 18], extentMeters: [500, 440, 60] },
      { id: "AbandonedParkCenter", name: "Parque Abandonado (Centro)", fraction: "3/8", centerMeters: [0, 120, 8], extentMeters: [460, 460, 30] },
      { id: "RailStationExtraction", name: "Estação Ferroviária (Extração)", fraction: "ZEX-Hub", centerMeters: [0, 780, 15], extentMeters: [280, 200, 45] },
    ],
    zexCoordinates: buildZexRing("Barburhen", 3000, ["UrbanCommercial", "IndustrialLanding", "AbandonedParkCenter", "RailStationExtraction"]),
  },
  Priadus: {
    worldId: "Priadus",
    umapPackagePath: "/Game/Maps/Priadus/L_Priadus_W2",
    levelScriptClass: "AKhaaosPriadusLevel",
    objMeshPath: "Unreal/KhaaosRun/Content/Maps/Priadus/Priadus_Terrain.obj",
    gltfMeshPath: "Unreal/KhaaosRun/Content/Maps/Priadus/Priadus_Terrain.gltf",
    mapPointsCsvPath: "Unreal/KhaaosRun/Content/Maps/Priadus/DT_Priadus_MapPoints.csv",
    worldConfigCsvPath: "Unreal/KhaaosRun/Content/Maps/Priadus/DT_Priadus_WorldConfig.csv",
    topDownSvgPath: "Unreal/KhaaosRun/Content/Maps/Priadus/Priadus_Map_TopDown.svg",
    primaryNiagaraHazard: "NS_ToxicSporeFog_Priadus",
    sizeMeters: 2800,
    maxPlayers: 75,
    ringStartRadiusMeters: 1400,
    ringEndRadiusMeters: 50,
    ringCloseSeconds: 600,
    hazardFormulaSummary: "Emboscada Verde: Esporos Tóxicos (−1.6% MaxVitality / 8s) + Drenagem de Sanidade na Neblina",
    sectors: [
      { id: "SwampBasin", name: "Área Pantanosa", fraction: "2/8", centerMeters: [-480, -360, 4], extentMeters: [420, 380, 22] },
      { id: "DarkCanopyLanding", name: "Bosque de Desembarque", fraction: "3/8", centerMeters: [460, -320, 16], extentMeters: [480, 440, 55] },
      { id: "AncientTempleHunt", name: "Área de Caça + Templo Antigo", fraction: "3/8", centerMeters: [0, 80, 28], extentMeters: [450, 450, 70] },
      { id: "SlaughterhouseZEX", name: "Matadouro (Extração)", fraction: "ZEX-Hub", centerMeters: [0, 720, 12], extentMeters: [260, 190, 40] },
    ],
    zexCoordinates: buildZexRing("Priadus", 2800, ["SwampBasin", "DarkCanopyLanding", "AncientTempleHunt", "SlaughterhouseZEX"]),
  },
  Ckesalth: {
    worldId: "Ckesalth",
    umapPackagePath: "/Game/Maps/Ckesalth/L_Ckesalth_W3",
    levelScriptClass: "AKhaaosCkesalthLevel",
    objMeshPath: "Unreal/KhaaosRun/Content/Maps/Ckesalth/Ckesalth_Terrain.obj",
    gltfMeshPath: "Unreal/KhaaosRun/Content/Maps/Ckesalth/Ckesalth_Terrain.gltf",
    mapPointsCsvPath: "Unreal/KhaaosRun/Content/Maps/Ckesalth/DT_Ckesalth_MapPoints.csv",
    worldConfigCsvPath: "Unreal/KhaaosRun/Content/Maps/Ckesalth/DT_Ckesalth_WorldConfig.csv",
    topDownSvgPath: "Unreal/KhaaosRun/Content/Maps/Ckesalth/Ckesalth_Map_TopDown.svg",
    primaryNiagaraHazard: "NS_OilFireSmoke_Ckesalth",
    sizeMeters: 3200,
    maxPlayers: 60,
    ringStartRadiusMeters: 1600,
    ringEndRadiusMeters: 45,
    ringCloseSeconds: 600,
    hazardFormulaSummary: "Assassino Silencioso: Fumaça de Petróleo (−1.5% MaxVitality / 6s) + Asfixia de Altitude",
    sectors: [
      { id: "AbandonedResort", name: "Resort Abandonado", fraction: "3/8", centerMeters: [-520, -400, 18], extentMeters: [460, 420, 50] },
      { id: "BedouinVillage", name: "Vilarejo dos Beduínos", fraction: "2/8", centerMeters: [480, -380, 24], extentMeters: [380, 360, 42] },
      { id: "CentralOilRefinery", name: "Refinaria de Petróleo (Centro)", fraction: "3/8", centerMeters: [0, 60, 32], extentMeters: [500, 480, 85] },
      { id: "ExpeditionOutpostZEX", name: "Posto de Expedição (Extração)", fraction: "ZEX-Hub", centerMeters: [0, 790, 20], extentMeters: [290, 210, 45] },
    ],
    zexCoordinates: buildZexRing("Ckesalth", 3200, ["AbandonedResort", "BedouinVillage", "CentralOilRefinery", "ExpeditionOutpostZEX"]),
  },
  Arukheea: {
    worldId: "Arukheea",
    umapPackagePath: "/Game/Maps/Arukheea/L_Arukheea_W4",
    levelScriptClass: "AKhaaosArukheeaLevel",
    objMeshPath: "Unreal/KhaaosRun/Content/Maps/Arukheea/Arukheea_Terrain.obj",
    gltfMeshPath: "Unreal/KhaaosRun/Content/Maps/Arukheea/Arukheea_Terrain.gltf",
    mapPointsCsvPath: "Unreal/KhaaosRun/Content/Maps/Arukheea/DT_Arukheea_MapPoints.csv",
    worldConfigCsvPath: "Unreal/KhaaosRun/Content/Maps/Arukheea/DT_Arukheea_WorldConfig.csv",
    topDownSvgPath: "Unreal/KhaaosRun/Content/Maps/Arukheea/Arukheea_Map_TopDown.svg",
    primaryNiagaraHazard: "NS_TsunamiWall_Arukheea",
    sizeMeters: 2500,
    maxPlayers: 80,
    ringStartRadiusMeters: 1250,
    ringEndRadiusMeters: 35,
    ringCloseSeconds: 600,
    hazardFormulaSummary: "Muralha de Tsunami: Pressão Hidráulica (−1.75% MaxVitality / 5s) → Heliporto da Prisão do Sol da Noite",
    sectors: [
      { id: "ForestOfTheLost", name: "Bosque dos Perdidos", fraction: "4/8", centerMeters: [-440, -320, 14], extentMeters: [520, 480, 48] },
      { id: "NightSunPrison", name: "Prisão do Sol da Noite", fraction: "3/8", centerMeters: [40, 110, 45], extentMeters: [440, 440, 95] },
      { id: "WhaleGraveyardFactory", name: "Fábrica / Cemitério das Baleias", fraction: "1/8", centerMeters: [540, -420, 6], extentMeters: [310, 280, 36] },
      { id: "TowerHelipadFinalZEX", name: "Heliporto da Torre (Extração Final)", fraction: "Heli-ZEX", centerMeters: [40, 110, 110], extentMeters: [120, 120, 120] },
    ],
    zexCoordinates: buildZexRing("Arukheea", 2500, ["ForestOfTheLost", "NightSunPrison", "WhaleGraveyardFactory", "TowerHelipadFinalZEX"]),
  },
};

export function simulateEACViolationEvaluation(
  input: EACViolationSimulationInput
): EACViolationSimulationResult {
  const lower = input.violationCode.toLowerCase();
  let category: EACViolationSimulationResult["category"] = "Informational";
  let strikesAssigned = 0;

  if (
    lower.includes("critical") ||
    lower.includes("cheat_detected") ||
    lower.includes("memory_tamper") ||
    lower.includes("kernel_hook") ||
    lower.includes("aimbot_confirmed") ||
    lower.includes("speedhack_critical")
  ) {
    category = "Critical";
    strikesAssigned = 3;
  } else if (
    lower.includes("major") ||
    lower.includes("integrity") ||
    lower.includes("dll_injection") ||
    lower.includes("wallhack") ||
    lower.includes("teleport")
  ) {
    category = "Major";
    strikesAssigned = 2;
  } else if (
    lower.includes("minor") ||
    lower.includes("suspicious") ||
    lower.includes("heartbeat_late") ||
    lower.includes("firerate")
  ) {
    category = "Minor";
    strikesAssigned = 1;
  }

  const prior = Math.max(0, input.priorStrikes ?? 0);
  const totalStrikes = prior + strikesAssigned;
  const kicked = category === "Critical" || totalStrikes >= 3;
  const authenticated =
    input.clientHandle.startsWith("EAC-") || input.clientHandle.trim().length >= 8;

  // FNV-1a 32-bit digest for display
  let hash = 0x811c9dc5;
  const raw = `${input.playerId}:${input.clientHandle}:${input.violationCode}`;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return {
    playerId: input.playerId,
    clientHandle: input.clientHandle,
    authenticated,
    violationCode: input.violationCode,
    category,
    strikesAssigned,
    totalStrikes,
    kicked,
    recommendedAction: kicked
      ? "KICK_PLAYER"
      : strikesAssigned > 0
      ? "WARNING"
      : "NONE",
    attestationDigestHex: `0x${hash.toString(16).padStart(8, "0")}`,
    binaryLoaded: "ThirdParty/EasyAntiCheat/Binaries/Linux/libeasyanticheat_server.so",
  };
}
