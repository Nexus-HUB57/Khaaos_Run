#!/usr/bin/env node
/**
 * Khaaos Run — 3D Map (.umap.json / .obj / .gltf), DataTables (.csv) & Niagara VFX Generator
 * Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
 *
 * Generates and synchronizes 3D geometry, DataTables, Niagara Emitter specs,
 * and weapon mesh assets for all 5 Khaaos Run worlds:
 *   - CIGKV (Campo de Instrução de Guerra Khaaos Ville)
 *   - W1/C1 Barburhen (Mundo da Destruição — Chuva Ácida & Água da Morte)
 *   - W2/C2 Priadus (Floresta da Escuridão — Neblina de Esporos Tóxicos)
 *   - W3/C3 Ckesalth (Deserto das Almas Esquecidas — Petróleo em Chamas)
 *   - W4/C4 Arukheea (Ilha dos Gritos Calados — Muralha de Tsunami)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "Unreal", "KhaaosRun", "Content");

const WORLDS_SPEC = [
  {
    id: "CIGKV",
    umapName: "L_CIGKV_KhaaosVille",
    folder: path.join(CONTENT_DIR, "Maps", "CIGKV"),
    meshPrefix: "CIGKV_Terrain",
    sizeMeters: 2000,
    maxPlayers: 50,
    ringStartRadius: 100000,
    ringEndRadius: 6000,
    ringCloseDurationSeconds: 900,
    hazardName: "EMP_CalibrationPulse",
    hazardDps: 0.0015,
    hazardInterval: 180,
    niagaraAsset: "/Game/VFX/NS_EMP_CalibrationPulse",
    accentHex: "#00f0ff",
    sectors: [
      { id: "ArmoryHub", fraction: "1/8", center: [-450, -450, 10], extent: [250, 250, 40] },
      { id: "ProvingGrounds", fraction: "3/8", center: [250, -250, 18], extent: [480, 420, 65] },
      { id: "AbandonedPark", fraction: "4/8", center: [150, 380, 12], extent: [620, 520, 35] },
    ],
  },
  {
    id: "Barburhen",
    umapName: "L_Barburhen_W1",
    folder: path.join(CONTENT_DIR, "Maps", "Barburhen"),
    meshPrefix: "Barburhen_Terrain",
    sizeMeters: 3000,
    maxPlayers: 100,
    ringStartRadius: 25000,
    ringEndRadius: 4000,
    ringCloseDurationSeconds: 600,
    hazardName: "AcidRain_DeathWater",
    hazardDps: 0.001,
    hazardInterval: 10,
    niagaraAsset: "/Game/VFX/NS_AcidRain_Barburhen",
    accentHex: "#f59e0b",
    sectors: [
      { id: "UrbanCommercial", fraction: "2/8", center: [-550, -420, 22], extent: [420, 380, 75] },
      { id: "IndustrialLanding", fraction: "3/8", center: [520, -380, 18], extent: [500, 440, 60] },
      { id: "AbandonedParkCenter", fraction: "3/8", center: [0, 120, 8], extent: [460, 460, 30] },
      { id: "RailStationExtraction", fraction: "ZEX-Hub", center: [0, 780, 15], extent: [280, 200, 45] },
    ],
  },
  {
    id: "Priadus",
    umapName: "L_Priadus_W2",
    folder: path.join(CONTENT_DIR, "Maps", "Priadus"),
    meshPrefix: "Priadus_Terrain",
    sizeMeters: 2800,
    maxPlayers: 75,
    ringStartRadius: 140000,
    ringEndRadius: 5000,
    ringCloseDurationSeconds: 600,
    hazardName: "ToxicSporeFog_GreenAmbush",
    hazardDps: 0.002,
    hazardInterval: 8,
    niagaraAsset: "/Game/VFX/NS_ToxicSporeFog_Priadus",
    accentHex: "#10b981",
    sectors: [
      { id: "SwampBasin", fraction: "2/8", center: [-480, -360, 4], extent: [420, 380, 22] },
      { id: "DarkCanopyLanding", fraction: "3/8", center: [460, -320, 16], extent: [480, 440, 55] },
      { id: "AncientTempleHunt", fraction: "3/8", center: [0, 80, 28], extent: [450, 450, 70] },
      { id: "SlaughterhouseZEX", fraction: "ZEX-Hub", center: [0, 720, 12], extent: [260, 190, 40] },
    ],
  },
  {
    id: "Ckesalth",
    umapName: "L_Ckesalth_W3",
    folder: path.join(CONTENT_DIR, "Maps", "Ckesalth"),
    meshPrefix: "Ckesalth_Terrain",
    sizeMeters: 3200,
    maxPlayers: 60,
    ringStartRadius: 160000,
    ringEndRadius: 4500,
    ringCloseDurationSeconds: 600,
    hazardName: "BurningOilSmoke_SilentAssassin",
    hazardDps: 0.0025,
    hazardInterval: 6,
    niagaraAsset: "/Game/VFX/NS_OilFireSmoke_Ckesalth",
    accentHex: "#ef4444",
    sectors: [
      { id: "AbandonedResort", fraction: "3/8", center: [-520, -400, 18], extent: [460, 420, 50] },
      { id: "BedouinVillage", fraction: "2/8", center: [480, -380, 24], extent: [380, 360, 42] },
      { id: "CentralOilRefinery", fraction: "3/8", center: [0, 60, 32], extent: [500, 480, 85] },
      { id: "ExpeditionOutpostZEX", fraction: "ZEX-Hub", center: [0, 790, 20], extent: [290, 210, 45] },
    ],
  },
  {
    id: "Arukheea",
    umapName: "L_Arukheea_W4",
    folder: path.join(CONTENT_DIR, "Maps", "Arukheea"),
    meshPrefix: "Arukheea_Terrain",
    sizeMeters: 2500,
    maxPlayers: 80,
    ringStartRadius: 125000,
    ringEndRadius: 3500,
    ringCloseDurationSeconds: 600,
    hazardName: "HydraulicTsunamiWall",
    hazardDps: 0.0035,
    hazardInterval: 5,
    niagaraAsset: "/Game/VFX/NS_TsunamiWall_Arukheea",
    accentHex: "#3b82f6",
    sectors: [
      { id: "ForestOfTheLost", fraction: "4/8", center: [-440, -320, 14], extent: [520, 480, 48] },
      { id: "NightSunPrison", fraction: "3/8", center: [40, 110, 45], extent: [440, 440, 95] },
      { id: "WhaleGraveyardFactory", fraction: "1/8", center: [540, -420, 6], extent: [310, 280, 36] },
      { id: "TowerHelipadFinalZEX", fraction: "Heli-ZEX", center: [40, 110, 110], extent: [120, 120, 120] },
    ],
  },
];

function generateObjForWorld(world) {
  const half = world.sizeMeters / 2;
  const lines = [
    `# Khaaos Run UE5.8 3D Terrain & Sector Blockout Mesh — ${world.id}`,
    `# Unit: meters | Coordinate System: Right-Handed OBJ -> Imported to UE5.8 StaticMesh`,
    `o ${world.meshPrefix}`,
    // Base terrain quad
    `v ${-half} 0 ${-half}`,
    `v ${half} 0 ${-half}`,
    `v ${half} 0 ${half}`,
    `v ${-half} 0 ${half}`,
    `vn 0 1 0`,
    `f 1//1 2//1 3//1 4//1`,
  ];

  let vOffset = 5;
  for (const s of world.sectors) {
    const [cx, cy, cz] = s.center;
    const [ex, ey, ez] = s.extent;
    lines.push(`g Sector_${s.id}`);
    lines.push(`v ${cx - ex / 2} 0 ${cy - ey / 2}`);
    lines.push(`v ${cx + ex / 2} 0 ${cy - ey / 2}`);
    lines.push(`v ${cx + ex / 2} ${ez} ${cy + ey / 2}`);
    lines.push(`v ${cx - ex / 2} ${ez} ${cy + ey / 2}`);
    lines.push(`f ${vOffset}//1 ${vOffset + 1}//1 ${vOffset + 2}//1 ${vOffset + 3}//1`);
    vOffset += 4;
  }

  return lines.join("\n") + "\n";
}

function generateGltfForWorld(world) {
  return JSON.stringify(
    {
      asset: {
        version: "2.0",
        generator: "KhaaosRun UE5.8 WorldAssetBuilder v2.0",
        copyright: "Nexus-HUB57 Devs Ph.D",
      },
      scene: 0,
      scenes: [{ name: `${world.id}_Scene`, nodes: [0, ...world.sectors.map((_, idx) => idx + 1)] }],
      nodes: [
        {
          name: `${world.id}_Landscape_Root`,
          translation: [0, 0, 0],
          extras: {
            ue5UMapPath: `/Game/Maps/${world.id}/${world.umapName}`,
            sizeMeters: world.sizeMeters,
            maxPlayers: world.maxPlayers,
            primaryNiagaraHazard: world.niagaraAsset,
          },
        },
        ...world.sectors.map((s) => ({
          name: `SM_Sector_${world.id}_${s.id}`,
          translation: s.center,
          scale: s.extent,
          extras: {
            fraction: s.fraction,
            collisionProfile: "BlockAll",
            naniteEnabled: true,
          },
        })),
      ],
      meshes: [
        {
          name: `${world.meshPrefix}_StaticMesh`,
          primitives: [{ mode: 4, extras: { materialSlot: `MI_${world.id}_MasterTerrain` } }],
        },
      ],
    },
    null,
    2
  );
}

function generateMapPointsCsv(world) {
  const rows = [
    "---,PointId,Type,Sector,LocationX,LocationY,LocationZ,RotationYaw,Radius,Notes",
  ];
  // 8 primary cluster spawns
  for (let i = 1; i <= 8; i++) {
    const angle = ((i - 1) / 8) * Math.PI * 2;
    const r = world.sizeMeters * 0.35;
    const x = Math.round(Math.cos(angle) * r);
    const y = Math.round(Math.sin(angle) * r);
    const sec = world.sectors[i % world.sectors.length].id;
    rows.push(
      `SP_${i},SP_${world.id}_${String(i).padStart(2, "0")},PlayerSpawn,${sec},${x},${y},120,${Math.round((angle * 180) / Math.PI)},500,"Cluster de Spawn ${i} (${world.maxPlayers}p total)"`
    );
  }
  // 15 ZEX Terminals
  for (let i = 1; i <= 15; i++) {
    const angle = ((i - 1) / 15) * Math.PI * 2;
    const r = world.sizeMeters * (i % 2 === 0 ? 0.22 : 0.38);
    const x = Math.round(Math.cos(angle) * r);
    const y = Math.round(Math.sin(angle) * r);
    const sec = world.sectors[i % world.sectors.length].id;
    rows.push(
      `ZEX_${i},ZEX_${world.id}_${String(i).padStart(2, "0")},ZEXTerminal,${sec},${x},${y},110,0,200,"Terminal ZEX #${i} (Luz Azul 20% Transfer)"`
    );
  }
  // Ring Center
  rows.push(
    `RING_CENTER,RC_${world.id}_01,RingCenter,${world.sectors[world.sectors.length - 1].id},0,0,100,0,${world.ringEndRadius},"Centro Final do Anel (${world.hazardName})"`
  );
  return rows.join("\n") + "\n";
}

function generateWorldConfigCsv(world) {
  return [
    "---,WorldId,MaxPlayers,RingStartRadius,RingEndRadius,RingCloseDurationSeconds,HazardDamagePerSecond,HazardTickInterval,ParkCenterX,ParkCenterY,ParkCenterZ,NiagaraHazardSystem",
    `Default,${world.id},${world.maxPlayers},${world.ringStartRadius},${world.ringEndRadius},${world.ringCloseDurationSeconds},${world.hazardDps},${world.hazardInterval},0,0,100,${world.niagaraAsset}`,
  ].join("\n") + "\n";
}

function generateUMapDescriptor(world) {
  return JSON.stringify(
    {
      packageVersion: "UE5.8-Package-Descriptor",
      umapPackagePath: `/Game/Maps/${world.id}/${world.umapName}`,
      levelScriptActorClass: `/Script/KhaaosRun.AKhaaos${world.id === "CIGKV" ? "CIGKV" : world.id}Level`,
      worldPartitionEnabled: true,
      naniteLandscapeEnabled: true,
      lumenGlobalIllumination: true,
      staticMeshes: [
        `/Game/Maps/${world.id}/${world.meshPrefix}.${world.meshPrefix}`,
        ...world.sectors.map((s) => `/Game/Maps/${world.id}/SM_Sector_${s.id}`),
      ],
      dataTables: [
        `/Game/Maps/${world.id}/DT_${world.id}_MapPoints`,
        `/Game/Maps/${world.id}/DT_${world.id}_WorldConfig`,
      ],
      niagaraSystemsPlaced: [
        world.niagaraAsset,
        "/Game/VFX/NS_ZEXBeacon_BluePulse",
        "/Game/VFX/NS_Loot_Pickup_Aura",
      ],
      spawnedActorsSummary: {
        playerStartClusters: 8,
        totalPlayerCapacity: world.maxPlayers,
        zexTerminals: 15,
        sectorVolumes: world.sectors.length,
        safeZoneController: 1,
        hazardVolume: 1,
      },
    },
    null,
    2
  );
}

function generateTopDownSvg(world) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <rect width="800" height="800" fill="#090b10"/>
  <circle cx="400" cy="400" r="340" fill="none" stroke="${world.accentHex}" stroke-width="2" stroke-dasharray="8 6" opacity="0.55"/>
  <circle cx="400" cy="400" r="140" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.75"/>
  <text x="32" y="46" fill="#ffffff" font-family="monospace" font-size="20" font-weight="bold">KHAAOS RUN — ${world.id.toUpperCase()} (${world.umapName})</text>
  <text x="32" y="72" fill="#9ca3af" font-family="monospace" font-size="13">Escala: ${world.sizeMeters}m x ${world.sizeMeters}m | Capacidade: ${world.maxPlayers} Operadores | 15 Terminais ZEX | Niagara: ${world.hazardName}</text>
  ${world.sectors
    .map((s, idx) => {
      const sx = 400 + Math.round((s.center[0] / (world.sizeMeters / 2)) * 280);
      const sy = 400 + Math.round((s.center[1] / (world.sizeMeters / 2)) * 280);
      return `<g>
        <rect x="${sx - 65}" y="${sy - 40}" width="130" height="80" rx="6" fill="${world.accentHex}22" stroke="${world.accentHex}" stroke-width="1.5"/>
        <text x="${sx}" y="${sy - 6}" fill="#ffffff" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">${s.id}</text>
        <text x="${sx}" y="${sy + 14}" fill="${world.accentHex}" font-family="monospace" font-size="10" text-anchor="middle">Fração: ${s.fraction}</text>
      </g>`;
    })
    .join("\n  ")}
</svg>\n`;
}

// 1. Generate all 5 World packages
for (const world of WORLDS_SPEC) {
  fs.mkdirSync(world.folder, { recursive: true });
  fs.writeFileSync(path.join(world.folder, `${world.meshPrefix}.obj`), generateObjForWorld(world));
  fs.writeFileSync(path.join(world.folder, `${world.meshPrefix}.gltf`), generateGltfForWorld(world));
  fs.writeFileSync(path.join(world.folder, `DT_${world.id}_MapPoints.csv`), generateMapPointsCsv(world));
  fs.writeFileSync(path.join(world.folder, `DT_${world.id}_WorldConfig.csv`), generateWorldConfigCsv(world));
  fs.writeFileSync(path.join(world.folder, `${world.umapName}.umap.json`), generateUMapDescriptor(world));
  fs.writeFileSync(path.join(world.folder, `${world.id}_Map_TopDown.svg`), generateTopDownSvg(world));
}

// 2. Generate Niagara VFX Emitter System specifications in Content/VFX/
const VFX_DIR = path.join(CONTENT_DIR, "VFX");
fs.mkdirSync(VFX_DIR, { recursive: true });

const NIAGARA_SPECS = [
  {
    name: "NS_EMP_CalibrationPulse",
    world: "CIGKV",
    emitterType: "GPUComputeSim_RadialWave",
    spawnRate: 1200,
    maxParticles: 8000,
    colorLinear: [0.0, 0.94, 1.0, 0.85],
    velocityRange: [250, 600],
    lifetimeSeconds: 3.5,
    significanceRank: 1,
  },
  {
    name: "NS_AcidRain_Barburhen",
    world: "Barburhen",
    emitterType: "GPUComputeSim_WeatherPrecipitation",
    spawnRate: 4500,
    maxParticles: 32000,
    colorLinear: [0.68, 0.95, 0.18, 0.75],
    velocityRange: [-1800, -2400],
    lifetimeSeconds: 2.2,
    significanceRank: 0,
  },
  {
    name: "NS_DeathWaterRing_Barburhen",
    world: "Barburhen",
    emitterType: "GPUComputeSim_CylindricalWall",
    spawnRate: 3000,
    maxParticles: 24000,
    colorLinear: [0.96, 0.62, 0.04, 0.9],
    velocityRange: [80, 320],
    lifetimeSeconds: 4.0,
    significanceRank: 0,
  },
  {
    name: "NS_ToxicSporeFog_Priadus",
    world: "Priadus",
    emitterType: "GPUComputeSim_VolumetricSpores",
    spawnRate: 2800,
    maxParticles: 20000,
    colorLinear: [0.06, 0.72, 0.5, 0.65],
    velocityRange: [15, 75],
    lifetimeSeconds: 6.5,
    significanceRank: 0,
  },
  {
    name: "NS_OilFireSmoke_Ckesalth",
    world: "Ckesalth",
    emitterType: "GPUComputeSim_ThermalPlume",
    spawnRate: 3500,
    maxParticles: 28000,
    colorLinear: [0.94, 0.26, 0.26, 0.85],
    velocityRange: [120, 480],
    lifetimeSeconds: 5.0,
    significanceRank: 0,
  },
  {
    name: "NS_TsunamiWall_Arukheea",
    world: "Arukheea",
    emitterType: "GPUComputeSim_HydraulicWaveCrest",
    spawnRate: 6000,
    maxParticles: 45000,
    colorLinear: [0.23, 0.51, 0.96, 0.92],
    velocityRange: [400, 1100],
    lifetimeSeconds: 3.8,
    significanceRank: 0,
  },
  {
    name: "NS_ZEXBeacon_BluePulse",
    world: "All",
    emitterType: "CPUSim_PointLightColumn",
    spawnRate: 450,
    maxParticles: 2400,
    colorLinear: [0.1, 0.4, 1.0, 1.0],
    velocityRange: [90, 240],
    lifetimeSeconds: 2.8,
    significanceRank: 1,
  },
  {
    name: "NS_MuzzleFlash_Assault",
    world: "All",
    emitterType: "CPUSim_BurstCone",
    spawnRate: 0,
    burstCount: 45,
    maxParticles: 120,
    colorLinear: [1.0, 0.72, 0.2, 1.0],
    velocityRange: [800, 2200],
    lifetimeSeconds: 0.08,
    significanceRank: 2,
  },
  {
    name: "NS_MuzzleFlash_Shotgun",
    world: "All",
    emitterType: "CPUSim_BurstWideCone",
    spawnRate: 0,
    burstCount: 85,
    maxParticles: 200,
    colorLinear: [1.0, 0.58, 0.12, 1.0],
    velocityRange: [650, 1800],
    lifetimeSeconds: 0.11,
    significanceRank: 2,
  },
  {
    name: "NS_MuzzleFlash_Sniper",
    world: "All",
    emitterType: "CPUSim_HighVelocityBrakeJet",
    spawnRate: 0,
    burstCount: 65,
    maxParticles: 160,
    colorLinear: [1.0, 0.82, 0.35, 1.0],
    velocityRange: [1200, 3400],
    lifetimeSeconds: 0.12,
    significanceRank: 2,
  },
  {
    name: "NS_Loot_Pickup_Aura",
    world: "All",
    emitterType: "CPUSim_RarityHelix",
    spawnRate: 180,
    maxParticles: 600,
    colorLinear: [0.95, 0.65, 0.1, 0.85],
    velocityRange: [25, 80],
    lifetimeSeconds: 2.5,
    significanceRank: 3,
  },
];

for (const spec of NIAGARA_SPECS) {
  fs.writeFileSync(
    path.join(VFX_DIR, `${spec.name}.niagara.json`),
    JSON.stringify(
      {
        assetType: "UNiagaraSystem",
        engineVersion: "5.8",
        packagePath: `/Game/VFX/${spec.name}`,
        ...spec,
        poolingEnabled: true,
        autoActivate: true,
      },
      null,
      2
    )
  );
}

// 3. Generate Weapon 3D glTF Mesh Descriptors in Content/Weapons/
const WEAPONS_DIR = path.join(CONTENT_DIR, "Weapons");
fs.mkdirSync(WEAPONS_DIR, { recursive: true });

const WEAPONS_SPECS = [
  { id: "WPN_AssaultRifle_MK1", category: "AssaultRifle", caliber: "5.56x45mm", muzzleSocket: "Muzzle_Socket", rateOfFireRpm: 720 },
  { id: "WPN_Shotgun_Breach", category: "Shotgun", caliber: "12Gauge", muzzleSocket: "Muzzle_Socket", rateOfFireRpm: 110 },
  { id: "WPN_Sniper_DMR", category: "SniperDMR", caliber: "7.62x51mm", muzzleSocket: "Muzzle_Socket", rateOfFireRpm: 180 },
  { id: "WPN_Melee_Knife", category: "MeleeBlade", caliber: "N/A", muzzleSocket: "BladeTip_Socket", rateOfFireRpm: 140 },
];

for (const wpn of WEAPONS_SPECS) {
  fs.writeFileSync(
    path.join(WEAPONS_DIR, `${wpn.id}.gltf`),
    JSON.stringify(
      {
        asset: { version: "2.0", generator: "KhaaosRun UE5.8 WeaponAssetBuilder" },
        scene: 0,
        scenes: [{ name: wpn.id, nodes: [0, 1] }],
        nodes: [
          { name: `SK_${wpn.id}_Root`, translation: [0, 0, 0], extras: wpn },
          { name: wpn.muzzleSocket, translation: [0.68, 0, 0.08] },
        ],
      },
      null,
      2
    )
  );
}

console.log(`[OK] Generated 3D Maps (.obj/.gltf/.umap.json/.csv/.svg) for ${WORLDS_SPEC.length} worlds, ${NIAGARA_SPECS.length} Niagara VFX specs, and ${WEAPONS_SPECS.length} Weapon glTF assets.`);
