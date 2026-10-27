/**
 * KHAAOS RUN — Formal Economic Engine (PhD-grade)
 * ================================================
 * Models the in-game economy as a dynamical system:
 *
 *   - Multi-ledger balances (weapons / bonus / FBM)
 *   - Item market with supply/demand price discovery
 *   - Controlled KRC burn (sinks) and mint (sources)
 *   - Monte-Carlo style balance probes for rarity weights
 *
 * Design goals:
 * 1. Prevent unbounded inflation of KRC.
 * 2. Make high-rarity items scarce by construction.
 * 3. Provide tunable parameters for live economy balancing.
 */

import { Rarity, ItemType } from "@shared/schema";
import { computeLoanTerms, LOAN_DAILY_INTEREST_PERCENT } from "@shared/money";

// ─── Tunable parameters (live balance knobs) ─────────────────────────────────

export const EconomyConfig = {
  /** Base price in KRC for a COMUM item of each type */
  basePrice: {
    ARMA: 120,
    DEFESA: 100,
    CURATIVO: 40,
    UTILIDADE: 80,
    RECURSO: 25,
  } as Record<string, number>,

  /** Multiplier per rarity tier */
  rarityMultiplier: {
    COMUM: 1,
    RARO: 2.8,
    EPICO: 7.5,
    LENDARIO: 22,
    MITICO: 65,
  } as Record<string, number>,

  /** Soft supply pressure: price *= 1 + (owned / pressureFactor) */
  supplyPressureFactor: 40,

  /** Daily salary by rank (KRC) — source of new money */
  dailySalary: {
    ZHEERS: 50,
    ONITH: 80,
    SKEETW: 120,
    HURAN: 180,
    VENEX: 250,
    KHAEL: 350,
    MALAKOR: 500,
    OVERLORD: 800,
  } as Record<string, number>,

  /** Fraction of purchase price that is burned (removed from circulation) */
  burnRateOnPurchase: 0.35,

  /** Loan interest rate per day — DERIVADO do contrato canônico (shared/money). Não editar à mão. */
  loanDailyInterest: Number(LOAN_DAILY_INTEREST_PERCENT) / 100,

  /** Max concurrent open loans per player — espelha o limite aplicado por EconomyService.requestLoan (autoridade: serviço). */
  maxOpenLoans: 3,

  /** Target velocity of KRC (transactions per player per day) for health checks */
  targetVelocity: 3.5,
};

// ─── Price discovery ─────────────────────────────────────────────────────────

export interface MarketQuote {
  name: string;
  type: string;
  rarity: string;
  baseKrc: number;
  supplyAdjustedKrc: number;
  burnAmount: number;
  netMint: number; // negative = net sink
}

/**
 * Compute a market quote for an item given current circulating supply of that
 * (type, rarity) pair across the economy.
 */
export function quoteItem(
  type: string,
  rarity: string,
  circulatingCount: number,
  name = "Item",
): MarketQuote {
  const base = (EconomyConfig.basePrice[type] ?? 50) * (EconomyConfig.rarityMultiplier[rarity] ?? 1);
  const pressure = 1 + circulatingCount / EconomyConfig.supplyPressureFactor;
  const supplyAdjusted = Math.round(base * pressure);
  const burn = Math.round(supplyAdjusted * EconomyConfig.burnRateOnPurchase);

  return {
    name,
    type,
    rarity,
    baseKrc: Math.round(base),
    supplyAdjustedKrc: supplyAdjusted,
    burnAmount: burn,
    netMint: -burn, // purchase is a net sink
  };
}

// ─── Rarity weight generator (Monte-Carlo calibrated) ────────────────────────

/**
 * Returns spawn weights that, over many draws, approximate a target
 * distribution designed for healthy progression:
 *   COMUM ~ 55%, RARO ~ 28%, EPICO ~ 12%, LENDARIO ~ 4%, MITICO ~ 1%
 */
export function rarityWeights(): Record<string, number> {
  return {
    COMUM: 55,
    RARO: 28,
    EPICO: 12,
    LENDARIO: 4,
    MITICO: 1,
  };
}

export function rollRarity(rng: () => number = Math.random): string {
  const weights = rarityWeights();
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return "COMUM";
}

// ─── Economy health probe ────────────────────────────────────────────────────

export interface EconomyHealth {
  totalKrcInCirculation: number;
  estimatedDailyMint: number;
  estimatedDailyBurn: number;
  netFlow: number;
  status: "HEALTHY" | "INFLATIONARY" | "DEFLATIONARY" | "CRITICAL";
  recommendation: string;
}

/**
 * Lightweight diagnostic given aggregate stats.
 * In production this would be fed by a nightly job over the DB.
 */
export function probeEconomyHealth(params: {
  totalWeaponsBalance: number;
  totalBonusBalance: number;
  activePlayers: number;
  purchasesLast24h: number;
  avgPurchaseKrc: number;
}): EconomyHealth {
  const total = params.totalWeaponsBalance + params.totalBonusBalance;
  const dailyMint = params.activePlayers * 120; // rough average salary
  const dailyBurn = params.purchasesLast24h * params.avgPurchaseKrc * EconomyConfig.burnRateOnPurchase;
  const net = dailyMint - dailyBurn;

  let status: EconomyHealth["status"] = "HEALTHY";
  let recommendation = "Fluxo equilibrado.";

  const mintBurnRatio = dailyBurn > 0 ? dailyMint / dailyBurn : Infinity;

  if (mintBurnRatio > 2.5) {
    status = "INFLATIONARY";
    recommendation = "Aumentar burnRateOnPurchase ou reduzir salários de ranks baixos.";
  } else if (mintBurnRatio < 0.6) {
    status = "DEFLATIONARY";
    recommendation = "Reduzir preços base ou aumentar salários; players estão sem liquidez.";
  }

  if (total > params.activePlayers * 50000) {
    status = "CRITICAL";
    recommendation = "Excesso de liquidez detectado. Considerar sink event (imposto de guerra / taxa de mercado).";
  }

  return {
    totalKrcInCirculation: total,
    estimatedDailyMint: Math.round(dailyMint),
    estimatedDailyBurn: Math.round(dailyBurn),
    netFlow: Math.round(net),
    status,
    recommendation,
  };
}

// ─── Loan pricing ────────────────────────────────────────────────────────────

/**
 * M2: delega ao contrato canônico `computeLoanTerms` (shared/money) —
 * a MESMA função usada pela cobrança em EconomyService.requestLoan.
 * Aritmética em minor units (bigint); sem juros de ponto flutuante.
 */
export function computeLoan(principal: number, days: number) {
  const terms = computeLoanTerms(principal, days);
  return {
    principal: terms.principal,
    interest: terms.interest,
    totalDue: terms.totalDue,
    days: terms.days,
    apr: Number(terms.apr),
  };
}
