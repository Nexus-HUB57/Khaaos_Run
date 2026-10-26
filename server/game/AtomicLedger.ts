/**
 * KHAAOS RUN — Atomic Ledger
 * ==========================
 * ACID ledger for KRC/FBM with hold/release, transfer, and rollback support.
 */

// ─── Ledger Entry Types ──────────────────────────────────────────────────────

export type LedgerEntryType = "CREDIT" | "DEBIT" | "TRANSFER" | "HOLD" | "RELEASE";
export type Currency = "KRC" | "FBM";

// ─── Ledger Entry ────────────────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  playerId: string;
  type: LedgerEntryType;
  amount: number;
  currency: Currency;
  reference: string;
  matchId?: string;
  timestamp: number;
  balanceBefore: number;
  balanceAfter: number;
}

// ─── Hold Record ─────────────────────────────────────────────────────────────

interface HoldRecord {
  holdId: string;
  playerId: string;
  amount: number;
  currency: Currency;
  reference: string;
  createdAt: number;
}

// ─── AtomicLedger Class ──────────────────────────────────────────────────────

export class AtomicLedger {
  private balances: Map<string, number> = new Map();       // key: `${playerId}:${currency}`
  private holds: Map<string, HoldRecord> = new Map();       // key: holdId
  private entries: LedgerEntry[] = [];
  private entryCounter = 0;

  // ─── Credit ─────────────────────────────────────────────────────────────────

  credit(params: {
    playerId: string;
    amount: number;
    currency: Currency;
    reference: string;
    matchId?: string;
  }): LedgerEntry {
    if (params.amount < 0) throw new Error("Credit amount must be non-negative");
    const key = `${params.playerId}:${params.currency}`;
    const balanceBefore = this.balances.get(key) ?? 0;
    const balanceAfter = balanceBefore + params.amount;
    this.balances.set(key, balanceAfter);

    const entry = this.createEntry(params, "CREDIT", params.amount, balanceBefore, balanceAfter);
    return entry;
  }

  // ─── Debit ──────────────────────────────────────────────────────────────────

  debit(params: {
    playerId: string;
    amount: number;
    currency: Currency;
    reference: string;
    matchId?: string;
  }): LedgerEntry {
    if (params.amount < 0) throw new Error("Debit amount must be non-negative");
    const key = `${params.playerId}:${params.currency}`;
    const balanceBefore = this.balances.get(key) ?? 0;
    const available = this.getAvailableBalanceForPlayer(params.playerId, params.currency);

    if (params.amount > available) {
      throw new Error(`Insufficient available balance: ${available} ${params.currency}`);
    }

    const balanceAfter = balanceBefore - params.amount;
    this.balances.set(key, balanceAfter);

    const entry = this.createEntry(params, "DEBIT", params.amount, balanceBefore, balanceAfter);
    return entry;
  }

  // ─── Hold ───────────────────────────────────────────────────────────────────

  hold(params: {
    playerId: string;
    amount: number;
    currency: Currency;
    reference: string;
  }): { holdId: string; entry: LedgerEntry } {
    if (params.amount < 0) throw new Error("Hold amount must be non-negative");

    const key = `${params.playerId}:${params.currency}`;
    const available = this.getAvailableBalanceForPlayer(params.playerId, params.currency);

    if (params.amount > available) {
      throw new Error(`Insufficient available balance for hold: ${available} ${params.currency}`);
    }

    const holdId = `hold-${++this.entryCounter}`;
    this.holds.set(holdId, {
      holdId,
      playerId: params.playerId,
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      createdAt: Date.now(),
    });

    const balanceBefore = this.balances.get(key) ?? 0;
    const entry = this.createEntry(params, "HOLD", params.amount, balanceBefore, balanceBefore);

    return { holdId, entry };
  }

  // ─── Release Hold ───────────────────────────────────────────────────────────

  releaseHold(holdId: string, action: "release" | "capture" = "release"): LedgerEntry | null {
    const hold = this.holds.get(holdId);
    if (!hold) return null;

    this.holds.delete(holdId);

    const key = `${hold.playerId}:${hold.currency}`;
    const balanceBefore = this.balances.get(key) ?? 0;

    if (action === "capture") {
      // Deduct the held amount
      const balanceAfter = balanceBefore - hold.amount;
      this.balances.set(key, balanceAfter);

      return this.createEntry(
        { playerId: hold.playerId, amount: hold.amount, currency: hold.currency, reference: hold.reference },
        "DEBIT",
        hold.amount,
        balanceBefore,
        balanceAfter,
      );
    }

    // Release: balance unchanged, just remove the hold
    return this.createEntry(
      { playerId: hold.playerId, amount: hold.amount, currency: hold.currency, reference: hold.reference },
      "RELEASE",
      hold.amount,
      balanceBefore,
      balanceBefore,
    );
  }

  // ─── Transfer with Rollback ────────────────────────────────────────────────

  transfer(params: {
    fromPlayerId: string;
    toPlayerId: string;
    amount: number;
    currency: Currency;
    reference: string;
    matchId?: string;
  }): { fromEntry: LedgerEntry; toEntry: LedgerEntry } | null {
    const fromKey = `${params.fromPlayerId}:${params.currency}`;
    const toKey = `${params.toPlayerId}:${params.currency}`;
    const fromAvailable = this.getAvailableBalanceForPlayer(params.fromPlayerId, params.currency);

    if (params.amount > fromAvailable) {
      return null; // Insufficient funds — rollback
    }

    const fromBalanceBefore = this.balances.get(fromKey) ?? 0;
    const toBalanceBefore = this.balances.get(toKey) ?? 0;

    const fromBalanceAfter = fromBalanceBefore - params.amount;
    const toBalanceAfter = toBalanceBefore + params.amount;

    this.balances.set(fromKey, fromBalanceAfter);
    this.balances.set(toKey, toBalanceAfter);

    const fromEntry = this.createEntry(
      { ...params, playerId: params.fromPlayerId },
      "TRANSFER",
      params.amount,
      fromBalanceBefore,
      fromBalanceAfter,
    );
    const toEntry = this.createEntry(
      { ...params, playerId: params.toPlayerId },
      "TRANSFER",
      params.amount,
      toBalanceBefore,
      toBalanceAfter,
    );

    return { fromEntry, toEntry };
  }

  // ─── Query Methods ─────────────────────────────────────────────────────────

  getBalance(playerId: string, currency: Currency): number {
    return this.balances.get(`${playerId}:${currency}`) ?? 0;
  }

  getAvailableBalance(playerId: string, currency: Currency): number {
    return this.getAvailableBalanceForPlayer(playerId, currency);
  }

  getTotalHolds(playerId?: string, currency?: Currency): number {
    let total = 0;
    for (const hold of this.holds.values()) {
      if (playerId && hold.playerId !== playerId) continue;
      if (currency && hold.currency !== currency) continue;
      total += hold.amount;
    }
    return total;
  }

  getEntries(playerId?: string, currency?: Currency): LedgerEntry[] {
    let filtered = this.entries;
    if (playerId) filtered = filtered.filter(e => e.playerId === playerId);
    if (currency) filtered = filtered.filter(e => e.currency === currency);
    return [...filtered];
  }

  getStats(): {
    totalEntries: number;
    totalCredits: number;
    totalDebits: number;
    totalHolds: number;
    totalTransfers: number;
    totalReleases: number;
    activeHoldCount: number;
  } {
    const byType: Record<string, number> = {};
    for (const entry of this.entries) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    }

    return {
      totalEntries: this.entries.length,
      totalCredits: byType["CREDIT"] ?? 0,
      totalDebits: byType["DEBIT"] ?? 0,
      totalHolds: byType["HOLD"] ?? 0,
      totalTransfers: byType["TRANSFER"] ?? 0,
      totalReleases: byType["RELEASE"] ?? 0,
      activeHoldCount: this.holds.size,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private getAvailableBalanceForPlayer(playerId: string, currency: Currency): number {
    const balance = this.balances.get(`${playerId}:${currency}`) ?? 0;
    let holdTotal = 0;
    for (const hold of this.holds.values()) {
      if (hold.playerId === playerId && hold.currency === currency) {
        holdTotal += hold.amount;
      }
    }
    return balance - holdTotal;
  }

  private createEntry(
    params: { playerId: string; amount: number; currency: Currency; reference: string; matchId?: string },
    type: LedgerEntryType,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
  ): LedgerEntry {
    const entry: LedgerEntry = {
      id: `ledger-${++this.entryCounter}`,
      playerId: params.playerId,
      type,
      amount,
      currency: params.currency,
      reference: params.reference,
      matchId: params.matchId,
      timestamp: Date.now(),
      balanceBefore,
      balanceAfter,
    };
    this.entries.push(entry);
    return entry;
  }
}
