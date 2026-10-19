/**
 * KHAAOS RUN — Procedural Content Generator (PhD-grade)
 * =====================================================
 * Deterministic, seedable generation of:
 *   - Zone centers and phase-aware radii jitter
 *   - Loot placements with rarity + type distribution
 *   - Named items from composition tables
 *
 * Guarantees:
 * 1. Same seed → identical output (reproducible matches / replays).
 * 2. Spatial poisson-like separation so loot does not stack.
 * 3. Rarity curve calibrated via EconomyEngine.rollRarity.
 */

import { rollRarity, EconomyConfig } from "./EconomyEngine";
import { ZONE_PHASES } from "@shared/schema";

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Name composition tables ─────────────────────────────────────────────────

const PREFIXES = ["Khaaos", "War'I", "Malakor", "Zheers", "Huran", "Skeetw", "Venex", "Khael", "Overlord", "CIGKV"];
const WEAPON_ROOTS = ["Fuzil", "Sniper", "SMG", "Canhão", "Lâmina", "Pistola", "Rifle", "Espada"];
const DEFENSE_ROOTS = ["Colete", "Capacete", "Escudo", "Armadura", "Placa"];
const HEAL_ROOTS = ["Kit", "Bandagem", "Adrenalina", "Soro", "Injetor"];
const UTIL_ROOTS = ["Granada", "Drone", "Mochila", "Scanner", "Beacon"];

const SUFFIXES = ["Prime", "Mk.II", "Alpha", "Void", "Neon", "Core", "X", "47", "Zero"];

function composeName(type: string, rarity: string, rng: () => number): string {
  const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
  let root: string;
  switch (type) {
    case "ARMA":
      root = WEAPON_ROOTS[Math.floor(rng() * WEAPON_ROOTS.length)];
      break;
    case "DEFESA":
      root = DEFENSE_ROOTS[Math.floor(rng() * DEFENSE_ROOTS.length)];
      break;
    case "CURATIVO":
      root = HEAL_ROOTS[Math.floor(rng() * HEAL_ROOTS.length)];
      break;
    default:
      root = UTIL_ROOTS[Math.floor(rng() * UTIL_ROOTS.length)];
  }
  const suffix = rarity === "MITICO" || rarity === "LENDARIO"
    ? SUFFIXES[Math.floor(rng() * SUFFIXES.length)]
    : "";
  return suffix ? `${root} ${prefix} ${suffix}` : `${root} ${prefix}`;
}

function rollStats(type: string, rarity: string, rng: () => number): Record<string, number> {
  const mult = EconomyConfig.rarityMultiplier[rarity] ?? 1;
  switch (type) {
    case "ARMA":
      return {
        damage: Math.round(12 * mult + rng() * 15 * mult),
        accuracy: Math.round(55 + rng() * 40),
        ammo: Math.round(5 + rng() * 30),
      };
    case "DEFESA":
      return { defense: Math.round(10 * mult + rng() * 20 * mult) };
    case "CURATIVO":
      return { heal: Math.round(15 * mult + rng() * 25 * mult) };
    case "UTILIDADE":
      return {
        damage: Math.round(20 * mult + rng() * 30),
        radius: Math.round(3 + rng() * 6),
      };
    default:
      return {};
  }
}

// ─── Spatial helpers ─────────────────────────────────────────────────────────

function minDistanceOk(
  x: number,
  y: number,
  existing: { posX: number; posY: number }[],
  minDist: number,
): boolean {
  for (const e of existing) {
    const dx = x - e.posX;
    const dy = y - e.posY;
    if (Math.sqrt(dx * dx + dy * dy) < minDist) return false;
  }
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface GeneratedLoot {
  id: number;
  name: string;
  type: string;
  rarity: string;
  posX: number;
  posY: number;
  stats: Record<string, number>;
  isPickedUp: boolean;
}

export interface GeneratedZone {
  centerX: number;
  centerY: number;
  /** Optional per-phase radius jitter (pct) */
  radiusJitter: number[];
}

/**
 * Generate a full loot field for a match.
 * @param seed  numeric or string seed (room id works well)
 * @param count target number of loot pieces
 * @param startId sequential id offset
 */
export function generateLootField(
  seed: number | string,
  count = 24,
  startId = 1,
): GeneratedLoot[] {
  const rng = createRng(typeof seed === "string" ? hashStringToSeed(seed) : seed);
  const types = ["ARMA", "DEFESA", "CURATIVO", "UTILIDADE"];
  const result: GeneratedLoot[] = [];
  const minDist = 6; // % of map

  let attempts = 0;
  while (result.length < count && attempts < count * 20) {
    attempts++;
    const posX = 5 + Math.floor(rng() * 90);
    const posY = 5 + Math.floor(rng() * 90);
    if (!minDistanceOk(posX, posY, result, minDist)) continue;

    const type = types[Math.floor(rng() * types.length)];
    const rarity = rollRarity(rng);
    const name = composeName(type, rarity, rng);
    const stats = rollStats(type, rarity, rng);

    result.push({
      id: startId + result.length,
      name,
      type,
      rarity,
      posX,
      posY,
      stats,
      isPickedUp: false,
    });
  }

  return result;
}

/**
 * Generate a zone center + optional radius jitter from seed.
 * Keeps centers away from extreme edges.
 */
export function generateZoneLayout(seed: number | string): GeneratedZone {
  const rng = createRng(typeof seed === "string" ? hashStringToSeed(seed) : seed);
  const centerX = 30 + Math.floor(rng() * 40); // 30-70
  const centerY = 30 + Math.floor(rng() * 40);
  const radiusJitter = ZONE_PHASES.map(() => (rng() - 0.5) * 4); // ±2 pct
  return { centerX, centerY, radiusJitter };
}

/**
 * Combined match seed package — call once at match start.
 */
export function generateMatchContent(roomId: string, lootCount = 24) {
  const seed = hashStringToSeed(roomId + "_match");
  const zone = generateZoneLayout(seed);
  const loot = generateLootField(seed ^ 0x9e3779b9, lootCount);
  return { seed, zone, loot };
}
