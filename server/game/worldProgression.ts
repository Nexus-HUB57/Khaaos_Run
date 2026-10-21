import {
  KHAAOS_WORLDS,
  WORLD_ORDER,
  type WorldId,
  type WorldDefinition,
  type PlayerWorldStats,
  type MultiWorldPersistenceState,
  evaluateWorldUnlocks,
} from "@shared/worlds";
import { generateMatchContent } from "./ProceduralGenerator";

export interface WorldSimulationResult {
  simulationId: string;
  worldId: WorldId;
  worldName: string;
  extractionType: "ZEX" | "ZU" | "ELIMINATED";
  phaseReached: number;
  survivalTimeSeconds: number;
  kills: number;
  poiVisited: string;
  hazardSurvived: string;
  hazardDamageTaken: number;
  baseKrcReward: number;
  worldMultiplier: number;
  totalKrcMinted: number;
  newlyUnlockedWorlds: WorldId[];
  updatedPersistence: MultiWorldPersistenceState;
  proceduralSeed: number;
  timestamp: string;
}

class WorldProgressionService {
  private states: Map<string, MultiWorldPersistenceState> = new Map();

  private createDefaultState(playerId: string): MultiWorldPersistenceState {
    const worlds: Record<WorldId, PlayerWorldStats> = {
      CIGKV: {
        worldId: "CIGKV",
        unlocked: true,
        matchesPlayed: 2,
        successfulExtractions: 1,
        zuVictories: 0,
        totalKills: 5,
        bestTimeSeconds: 740,
        krcEarned: 125,
      },
      Barburhen: {
        worldId: "Barburhen",
        unlocked: true,
        matchesPlayed: 4,
        successfulExtractions: 3,
        zuVictories: 1,
        totalKills: 11,
        bestTimeSeconds: 1080,
        krcEarned: 680,
      },
      Priadus: {
        worldId: "Priadus",
        unlocked: false,
        matchesPlayed: 0,
        successfulExtractions: 0,
        zuVictories: 0,
        totalKills: 0,
        bestTimeSeconds: 0,
        krcEarned: 0,
      },
      Ckesalth: {
        worldId: "Ckesalth",
        unlocked: false,
        matchesPlayed: 0,
        successfulExtractions: 0,
        zuVictories: 0,
        totalKills: 0,
        bestTimeSeconds: 0,
        krcEarned: 0,
      },
      Arukheea: {
        worldId: "Arukheea",
        unlocked: false,
        matchesPlayed: 0,
        successfulExtractions: 0,
        zuVictories: 0,
        totalKills: 0,
        bestTimeSeconds: 0,
        krcEarned: 0,
      },
    };

    const evaluated = evaluateWorldUnlocks(worlds);
    return {
      playerId,
      currentWorld: "Barburhen",
      totalKrcEarned: 805,
      totalCompletions: 4,
      worlds: evaluated,
      updatedAt: new Date().toISOString(),
    };
  }

  public getPlayerState(playerId = "OP-KHAAOS-01"): MultiWorldPersistenceState {
    const existing = this.states.get(playerId);
    if (existing) {
      return existing;
    }
    const created = this.createDefaultState(playerId);
    this.states.set(playerId, created);
    return created;
  }

  public selectActiveWorld(playerId: string, worldId: WorldId): MultiWorldPersistenceState {
    const state = this.getPlayerState(playerId);
    const stats = state.worlds[worldId];
    if (!stats || !stats.unlocked) {
      throw new Error(`Mundo ${worldId} ainda está bloqueado. Cumpra os requisitos de extração.`);
    }
    state.currentWorld = worldId;
    state.updatedAt = new Date().toISOString();
    this.states.set(playerId, state);
    return state;
  }

  public recordWorldRun(
    playerId: string,
    worldId: WorldId,
    options?: {
      extractionType?: "ZEX" | "ZU" | "ELIMINATED";
      kills?: number;
      forceUnlockCheck?: boolean;
    }
  ): WorldSimulationResult {
    const state = this.getPlayerState(playerId);
    const worldDef: WorldDefinition = KHAAOS_WORLDS[worldId];
    if (!worldDef) {
      throw new Error(`Mundo inválido: ${worldId}`);
    }

    const currentStats = state.worlds[worldId];
    if (!currentStats.unlocked) {
      throw new Error(`Mundo ${worldId} bloqueado para operação.`);
    }

    const previouslyUnlocked = WORLD_ORDER.filter((id) => state.worlds[id].unlocked);

    const extractionType = options?.extractionType ?? "ZEX";
    const kills = options?.kills ?? Math.floor(Math.random() * 6) + 2;
    const isSuccess = extractionType === "ZEX" || extractionType === "ZU";

    const phaseReached =
      extractionType === "ZU"
        ? 4
        : extractionType === "ZEX"
        ? Math.random() > 0.4
          ? 3
          : 2
        : Math.floor(Math.random() * 3) + 1;

    const survivalTimeSeconds =
      phaseReached * 210 + Math.floor(Math.random() * 95) + 120;

    const poiIndex = Math.floor(Math.random() * worldDef.pois.length);
    const poiVisited = worldDef.pois[poiIndex]?.name ?? "Central Core";

    const hazardDamageTaken = Math.round(
      worldDef.hazard.damagePerSecond * (Math.floor(Math.random() * 8) + 3)
    );

    const baseReward =
      extractionType === "ZU"
        ? 250 + kills * 25
        : extractionType === "ZEX"
        ? 140 + kills * 20
        : 25 + kills * 10;

    const totalKrcMinted = Math.round(baseReward * worldDef.krcMultiplier);

    // Update stats
    currentStats.matchesPlayed += 1;
    currentStats.totalKills += kills;
    currentStats.krcEarned += totalKrcMinted;

    if (isSuccess) {
      currentStats.successfulExtractions += 1;
      if (extractionType === "ZU") {
        currentStats.zuVictories += 1;
      }
      if (
        currentStats.bestTimeSeconds === 0 ||
        survivalTimeSeconds < currentStats.bestTimeSeconds
      ) {
        currentStats.bestTimeSeconds = survivalTimeSeconds;
      }
      state.totalCompletions += 1;
    }

    state.totalKrcEarned += totalKrcMinted;
    state.worlds = evaluateWorldUnlocks(state.worlds);
    state.updatedAt = new Date().toISOString();

    const newlyUnlockedWorlds = WORLD_ORDER.filter(
      (id) => state.worlds[id].unlocked && !previouslyUnlocked.includes(id)
    );

    const seed = Date.now() % 1000000;
    generateMatchContent(`${worldId}_${seed}`, 24);

    this.states.set(playerId, state);

    return {
      simulationId: `SIM-${worldId.toUpperCase()}-${seed}`,
      worldId,
      worldName: worldDef.name,
      extractionType,
      phaseReached,
      survivalTimeSeconds,
      kills,
      poiVisited,
      hazardSurvived: worldDef.hazard.name,
      hazardDamageTaken,
      baseKrcReward: baseReward,
      worldMultiplier: worldDef.krcMultiplier,
      totalKrcMinted,
      newlyUnlockedWorlds,
      updatedPersistence: state,
      proceduralSeed: seed,
      timestamp: state.updatedAt,
    };
  }

  public fastForwardUnlockAll(playerId = "OP-KHAAOS-01"): MultiWorldPersistenceState {
    const state = this.getPlayerState(playerId);
    state.worlds.CIGKV.successfulExtractions = Math.max(state.worlds.CIGKV.successfulExtractions, 1);
    state.worlds.Barburhen.successfulExtractions = Math.max(state.worlds.Barburhen.successfulExtractions, 5);
    state.worlds.Priadus.successfulExtractions = Math.max(state.worlds.Priadus.successfulExtractions, 10);
    state.worlds.Ckesalth.successfulExtractions = Math.max(state.worlds.Ckesalth.successfulExtractions, 15);
    state.worlds = evaluateWorldUnlocks(state.worlds);
    state.updatedAt = new Date().toISOString();
    this.states.set(playerId, state);
    return state;
  }
}

export const worldProgressionService = new WorldProgressionService();
