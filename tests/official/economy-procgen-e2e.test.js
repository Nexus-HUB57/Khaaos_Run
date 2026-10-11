/**
 * PR #5 — Economy + Procedural generation pure E2E validation
 * Mirrors EconomyEngine.ts and ProceduralGenerator.ts (seeded RNG).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── EconomyConfig / quoteItem / rollRarity (EconomyEngine.ts) ─────────────

const EconomyConfig = {
  basePrice: {
    ARMA: 120,
    DEFESA: 100,
    CURATIVO: 40,
    UTILIDADE: 80,
    RECURSO: 25,
  },
  rarityMultiplier: {
    COMUM: 1,
    RARO: 2.8,
    EPICO: 7.5,
    LENDARIO: 22,
    MITICO: 65,
  },
  supplyPressureFactor: 40,
  burnRateOnPurchase: 0.35,
  loanDailyInterest: 0.04,
};

function quoteItem(type, rarity, circulatingCount, name = "Item") {
  const base =
    (EconomyConfig.basePrice[type] ?? 50) *
    (EconomyConfig.rarityMultiplier[rarity] ?? 1);
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
    netMint: -burn,
  };
}

function rarityWeights() {
  return { COMUM: 55, RARO: 28, EPICO: 12, LENDARIO: 4, MITICO: 1 };
}

function rollRarity(rng = Math.random) {
  const weights = rarityWeights();
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return "COMUM";
}

function computeLoan(principal, days) {
  const interest = principal * EconomyConfig.loanDailyInterest * days;
  return {
    principal,
    days,
    interest: Math.round(interest * 100) / 100,
    totalDue: Math.round((principal + interest) * 100) / 100,
  };
}

function probeEconomyHealth({
  totalWeaponsBalance,
  totalBonusBalance,
  activePlayers,
  purchasesLast24h,
  avgPurchaseKrc,
}) {
  const total = totalWeaponsBalance + totalBonusBalance;
  const dailyMint = activePlayers * 120;
  const dailyBurn =
    purchasesLast24h * avgPurchaseKrc * EconomyConfig.burnRateOnPurchase;
  const mintBurnRatio = dailyBurn > 0 ? dailyMint / dailyBurn : Infinity;

  let status = "HEALTHY";
  if (mintBurnRatio > 2.5) status = "INFLATIONARY";
  else if (mintBurnRatio < 0.6) status = "DEFLATIONARY";
  if (total > activePlayers * 50000) status = "CRITICAL";

  return { totalKrcInCirculation: total, dailyMint, dailyBurn, status };
}

// ─── Seeded RNG (ProceduralGenerator.ts) ───────────────────────────────────

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Minimal loot field generator — deterministic positions + rarity */
function generateLootField(seed, count, minSeparation = 8) {
  const rng = createRng(seed);
  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * 40) {
    attempts++;
    const posX = 5 + rng() * 90;
    const posY = 5 + rng() * 90;
    const tooClose = items.some((it) => {
      const dx = it.posX - posX;
      const dy = it.posY - posY;
      return Math.sqrt(dx * dx + dy * dy) < minSeparation;
    });
    if (tooClose) continue;
    const rarity = rollRarity(rng);
    const types = ["ARMA", "DEFESA", "CURATIVO", "UTILIDADE"];
    const type = types[Math.floor(rng() * types.length)];
    items.push({
      id: items.length + 1,
      posX,
      posY,
      rarity,
      type,
    });
  }
  return items;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("quoteItem price discovery", () => {
  it("applies rarity multiplier to base price", () => {
    const comum = quoteItem("ARMA", "COMUM", 0);
    const epico = quoteItem("ARMA", "EPICO", 0);
    assert.equal(comum.baseKrc, 120);
    assert.equal(epico.baseKrc, Math.round(120 * 7.5));
    assert.ok(epico.baseKrc > comum.baseKrc);
  });

  it("raises price with circulating supply pressure", () => {
    const low = quoteItem("ARMA", "COMUM", 0);
    const high = quoteItem("ARMA", "COMUM", 40);
    assert.ok(high.supplyAdjustedKrc > low.supplyAdjustedKrc);
    // pressure = 1 + 40/40 = 2 → ~2x
    assert.equal(high.supplyAdjustedKrc, Math.round(120 * 2));
  });

  it("burns fraction of purchase (net sink)", () => {
    const q = quoteItem("ARMA", "COMUM", 0);
    assert.equal(q.burnAmount, Math.round(q.supplyAdjustedKrc * 0.35));
    assert.equal(q.netMint, -q.burnAmount);
    assert.ok(q.netMint < 0);
  });
});

describe("rollRarity distribution", () => {
  it("is deterministic with seeded RNG", () => {
    const a = [];
    const b = [];
    const rngA = createRng(42);
    const rngB = createRng(42);
    for (let i = 0; i < 20; i++) {
      a.push(rollRarity(rngA));
      b.push(rollRarity(rngB));
    }
    assert.deepEqual(a, b);
  });

  it("produces mostly COMUM over many draws", () => {
    const rng = createRng(7);
    const counts = {};
    for (let i = 0; i < 1000; i++) {
      const r = rollRarity(rng);
      counts[r] = (counts[r] || 0) + 1;
    }
    assert.ok(counts.COMUM > 450, `COMUM=${counts.COMUM}`);
    assert.ok((counts.MITICO || 0) < 50, `MITICO=${counts.MITICO || 0}`);
  });
});

describe("seeded RNG / procgen", () => {
  it("createRng is deterministic", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it("different seeds diverge", () => {
    const a = createRng(1);
    const b = createRng(2);
    assert.notEqual(a(), b());
  });

  it("hashStringToSeed is stable", () => {
    assert.equal(hashStringToSeed("room_abc"), hashStringToSeed("room_abc"));
    assert.notEqual(hashStringToSeed("room_a"), hashStringToSeed("room_b"));
  });

  it("same room seed → identical loot field (replay)", () => {
    const seed = hashStringToSeed("mm_match_001");
    const field1 = generateLootField(seed, 12);
    const field2 = generateLootField(seed, 12);
    assert.equal(field1.length, field2.length);
    assert.deepEqual(
      field1.map((i) => [i.posX, i.posY, i.rarity, i.type]),
      field2.map((i) => [i.posX, i.posY, i.rarity, i.type]),
    );
  });

  it("enforces minimum separation between loot", () => {
    const items = generateLootField(99, 15, 8);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const dx = items[i].posX - items[j].posX;
        const dy = items[i].posY - items[j].posY;
        assert.ok(Math.sqrt(dx * dx + dy * dy) >= 8 - 1e-9);
      }
    }
  });
});

describe("loan + economy health", () => {
  it("computes compound-style daily interest total due", () => {
    const loan = computeLoan(1000, 10);
    assert.equal(loan.interest, 400); // 1000 * 0.04 * 10
    assert.equal(loan.totalDue, 1400);
  });

  it("flags inflationary when mint >> burn", () => {
    const h = probeEconomyHealth({
      totalWeaponsBalance: 10_000,
      totalBonusBalance: 5_000,
      activePlayers: 100,
      purchasesLast24h: 5,
      avgPurchaseKrc: 100,
    });
    // mint=12000, burn=5*100*0.35=175 → ratio huge
    assert.equal(h.status, "INFLATIONARY");
  });

  it("flags critical on excess liquidity", () => {
    const h = probeEconomyHealth({
      totalWeaponsBalance: 10_000_000,
      totalBonusBalance: 0,
      activePlayers: 10,
      purchasesLast24h: 1000,
      avgPurchaseKrc: 500,
    });
    assert.equal(h.status, "CRITICAL");
  });
});

describe("E2E economy path: match seed → loot → market quote", () => {
  it("room seed produces loot that can be priced as net sinks", () => {
    const seed = hashStringToSeed("room_e2e_final");
    const loot = generateLootField(seed, 8);
    assert.ok(loot.length >= 5);

    let totalBurn = 0;
    for (const item of loot) {
      // simulate 3 already in circulation of same type/rarity bucket
      const q = quoteItem(item.type, item.rarity, 3, `${item.type}-${item.rarity}`);
      assert.ok(q.supplyAdjustedKrc > 0);
      assert.ok(q.burnAmount > 0);
      totalBurn += q.burnAmount;
    }
    assert.ok(totalBurn > 0, "purchases must burn KRC");
  });
});
