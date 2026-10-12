/**
 * KHAAOS RUN — Monte-Carlo Economic Balance Simulator
 * ===================================================
 * Agent-based simulation of the in-game economy over N days.
 *
 * Each agent:
 *  - Claims daily salary by rank
 *  - Buys items with probability based on wealth & rarity desire
 *  - Occasionally takes/repays loans
 *  - Suffers controlled burn on purchases
 *
 * Outputs distribution statistics and health verdict so designers
 * can tune EconomyConfig before shipping balance patches.
 */

import {
  EconomyConfig,
  quoteItem,
  rollRarity,
  probeEconomyHealth,
  type EconomyHealth,
} from "./EconomyEngine";
import { createRng, hashStringToSeed } from "./ProceduralGenerator";

// ─── Agent model ─────────────────────────────────────────────────────────────

interface Agent {
  id: number;
  rank: string;
  krc: number;
  inventoryCount: Record<string, number>; // "TYPE:RARITY" → count
  openLoans: number;
  purchases: number;
}

const RANKS = Object.keys(EconomyConfig.dailySalary);
const TYPES = ["ARMA", "DEFESA", "CURATIVO", "UTILIDADE"];

function createAgents(n: number, rng: () => number): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < n; i++) {
    // Rank distribution skewed toward lower ranks
    const rankRoll = rng();
    let rank = "ZHEERS";
    if (rankRoll > 0.97) rank = "OVERLORD";
    else if (rankRoll > 0.92) rank = "MALAKOR";
    else if (rankRoll > 0.85) rank = "KHAEL";
    else if (rankRoll > 0.75) rank = "VENEX";
    else if (rankRoll > 0.60) rank = "HURAN";
    else if (rankRoll > 0.40) rank = "SKEETW";
    else if (rankRoll > 0.20) rank = "ONITH";

    agents.push({
      id: i,
      rank,
      krc: 80 + Math.floor(rng() * 120),
      inventoryCount: {},
      openLoans: 0,
      purchases: 0,
    });
  }
  return agents;
}

function circulatingOf(agents: Agent[], type: string, rarity: string): number {
  const key = `${type}:${rarity}`;
  let n = 0;
  for (const a of agents) n += a.inventoryCount[key] ?? 0;
  return n;
}

// ─── Simulation core ─────────────────────────────────────────────────────────

export interface MonteCarloConfig {
  agents: number;
  days: number;
  seed?: number | string;
  /** Probability an agent attempts a purchase each day */
  buyProbability: number;
  /** Probability of taking a loan when poor */
  loanProbability: number;
}

export interface DaySnapshot {
  day: number;
  totalKrc: number;
  mint: number;
  burn: number;
  purchases: number;
  meanWealth: number;
  gini: number;
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  daily: DaySnapshot[];
  finalHealth: EconomyHealth;
  wealthPercentiles: { p10: number; p50: number; p90: number; p99: number };
  rarityDistribution: Record<string, number>;
  recommendation: string;
  runsSummary?: string;
}

function giniCoefficient(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sum / (2 * n * n * mean);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function runMonteCarlo(cfg: Partial<MonteCarloConfig> = {}): MonteCarloResult {
  const config: MonteCarloConfig = {
    agents: cfg.agents ?? 200,
    days: cfg.days ?? 30,
    seed: cfg.seed ?? Date.now(),
    buyProbability: cfg.buyProbability ?? 0.45,
    loanProbability: cfg.loanProbability ?? 0.08,
  };

  const rng = createRng(
    typeof config.seed === "string" ? hashStringToSeed(config.seed) : (config.seed as number),
  );

  const agents = createAgents(config.agents, rng);
  const daily: DaySnapshot[] = [];
  const rarityCounts: Record<string, number> = {
    COMUM: 0, RARO: 0, EPICO: 0, LENDARIO: 0, MITICO: 0,
  };

  for (let day = 1; day <= config.days; day++) {
    let mint = 0;
    let burn = 0;
    let purchases = 0;

    for (const agent of agents) {
      // Salary
      const salary = EconomyConfig.dailySalary[agent.rank] ?? 50;
      agent.krc += salary;
      mint += salary;

      // Loan repayment pressure (simplified)
      if (agent.openLoans > 0 && agent.krc > 100) {
        const repay = Math.min(agent.krc * 0.15, 80);
        agent.krc -= repay;
        if (rng() < 0.3) agent.openLoans = Math.max(0, agent.openLoans - 1);
      }

      // Purchase attempt
      if (rng() < config.buyProbability) {
        const type = TYPES[Math.floor(rng() * TYPES.length)];
        const rarity = rollRarity(rng);
        const circ = circulatingOf(agents, type, rarity);
        const quote = quoteItem(type, rarity, circ);

        if (agent.krc >= quote.supplyAdjustedKrc) {
          agent.krc -= quote.supplyAdjustedKrc;
          burn += quote.burnAmount;
          // Remaining stays in "merchant" pool (not tracked as player wealth)
          const key = `${type}:${rarity}`;
          agent.inventoryCount[key] = (agent.inventoryCount[key] ?? 0) + 1;
          agent.purchases++;
          purchases++;
          rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;
        } else if (
          agent.openLoans < EconomyConfig.maxOpenLoans &&
          rng() < config.loanProbability
        ) {
          // Take a small loan to buy
          const loanAmt = quote.supplyAdjustedKrc - agent.krc + 20;
          agent.krc += loanAmt;
          agent.openLoans++;
          // Immediately buy
          if (agent.krc >= quote.supplyAdjustedKrc) {
            agent.krc -= quote.supplyAdjustedKrc;
            burn += quote.burnAmount;
            const key = `${type}:${rarity}`;
            agent.inventoryCount[key] = (agent.inventoryCount[key] ?? 0) + 1;
            agent.purchases++;
            purchases++;
            rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;
          }
        }
      }
    }

    const wealths = agents.map((a) => a.krc);
    const totalKrc = wealths.reduce((a, b) => a + b, 0);

    daily.push({
      day,
      totalKrc: Math.round(totalKrc),
      mint: Math.round(mint),
      burn: Math.round(burn),
      purchases,
      meanWealth: Math.round(totalKrc / agents.length),
      gini: Math.round(giniCoefficient(wealths) * 1000) / 1000,
    });
  }

  const finalWealths = agents.map((a) => a.krc).sort((a, b) => a - b);
  const totalPurchases = daily.reduce((s, d) => s + d.purchases, 0);
  const avgPurchaseKrc =
    totalPurchases > 0
      ? daily.reduce((s, d) => s + d.burn / Math.max(1, d.purchases) / EconomyConfig.burnRateOnPurchase, 0) /
        config.days
      : 150;

  const finalHealth = probeEconomyHealth({
    totalWeaponsBalance: finalWealths.reduce((a, b) => a + b, 0),
    totalBonusBalance: 0,
    activePlayers: config.agents,
    purchasesLast24h: daily[daily.length - 1]?.purchases ?? 0,
    avgPurchaseKrc,
  });

  // Aggregate recommendation from trajectory
  const last = daily[daily.length - 1];
  const first = daily[0];
  const growth = first.totalKrc > 0 ? last.totalKrc / first.totalKrc : 1;

  let recommendation = finalHealth.recommendation;
  if (growth > 3) {
    recommendation =
      "Liquidez cresceu >3× no período. Aumentar burnRateOnPurchase ou reduzir salários de ranks baixos.";
  } else if (growth < 0.5) {
    recommendation =
      "Liquidez caiu pela metade. Economia deflacionária — reduzir preços base ou aumentar mint.";
  } else if (last.gini > 0.55) {
    recommendation =
      "Gini alto (>0.55). Considerar sinks progressivos ou sinks em itens de alto tier apenas.";
  }

  return {
    config,
    daily,
    finalHealth,
    wealthPercentiles: {
      p10: Math.round(percentile(finalWealths, 10)),
      p50: Math.round(percentile(finalWealths, 50)),
      p90: Math.round(percentile(finalWealths, 90)),
      p99: Math.round(percentile(finalWealths, 99)),
    },
    rarityDistribution: rarityCounts,
    recommendation,
  };
}

/**
 * Run K independent simulations and aggregate.
 * Useful for confidence intervals on balance parameters.
 */
export function runMonteCarloBatch(
  runs = 5,
  cfg: Partial<MonteCarloConfig> = {},
): { runs: MonteCarloResult[]; aggregateRecommendation: string; meanFinalKrc: number; meanGini: number } {
  const results: MonteCarloResult[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(
      runMonteCarlo({
        ...cfg,
        seed: (typeof cfg.seed === "number" ? cfg.seed : 42) + i * 9973,
      }),
    );
  }

  const meanFinalKrc =
    results.reduce((s, r) => s + r.daily[r.daily.length - 1].totalKrc, 0) / runs;
  const meanGini =
    results.reduce((s, r) => s + r.daily[r.daily.length - 1].gini, 0) / runs;

  const inflationary = results.filter((r) => r.finalHealth.status === "INFLATIONARY" || r.finalHealth.status === "CRITICAL").length;
  const deflationary = results.filter((r) => r.finalHealth.status === "DEFLATIONARY").length;

  let aggregateRecommendation = "Parâmetros estáveis na maioria das runs.";
  if (inflationary >= runs * 0.6) {
    aggregateRecommendation =
      `Inflação em ${inflationary}/${runs} runs. Aumentar burn ou reduzir mint.`;
  } else if (deflationary >= runs * 0.6) {
    aggregateRecommendation =
      `Deflação em ${deflationary}/${runs} runs. Reduzir preços ou aumentar salários.`;
  }

  return { runs: results, aggregateRecommendation, meanFinalKrc, meanGini };
}
