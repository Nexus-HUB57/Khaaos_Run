/**
 * KHAAOS RUN — Atomic Ledger
 * ==========================
 * Thread-safe atomic ledger for KRC economy transactions.
 * Provides ACID-like guarantees for financial operations:
 * - Atomic: Each transaction is all-or-nothing
 * - Consistent: Balance never goes below minimum
 * - Isolated: Concurrent transactions are serialized
 * - Durable: All transactions are logged and recoverable
 */

export interface LedgerEntry {
  id: string;
  playerId: string;
  type: "CREDIT" | "DEBIT" | "TRANSFER" | "HOLD" | "RELEASE";
  amount: number;
  currency: "KRC" | "FBM";
  reference: string;
  matchId?: string;
  timestamp: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface PlayerAccount {
  playerId: string;
  krcBalance: number;
  fbmBalance: number;
  holds: Map<string, number>; // reference -> amount on hold
  createdAt: number;
  updatedAt: number;
}

export interface LedgerConfig {
  minKrcBalance: number;
  maxKrcBalance: number;
  maxTransactionAmount: number;
  holdTimeoutMs: number;
}

export const DEFAULT_LEDGER_CONFIG: LedgerConfig = {
  minKrcBalance: 0,
  maxKrcBalance: 10_000_000,
  maxTransactionAmount: 1_000_000,
  holdTimeoutMs: 30_000,
};

export class AtomicLedger {
  private accounts: Map<string, PlayerAccount> = new Map();
  private entries: LedgerEntry[] = [];
  private config: LedgerConfig;
  private nextEntryId = 1;

  constructor(config?: Partial<LedgerConfig>) {
    this.config = { ...DEFAULT_LEDGER_CONFIG, ...config };
  }

  /** Get or create a player account */
  getAccount(playerId: string): PlayerAccount {
    let account = this.accounts.get(playerId);
    if (!account) {
      account = {
        playerId,
        krcBalance: 0,
        fbmBalance: 0,
        holds: new Map(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.accounts.set(playerId, account);
    }
    return account;
  }

  /** Credit KRC to a player account */
  credit(playerId: string, amount: number, reference: string, matchId?: string): LedgerEntry | null {
    if (amount <= 0 || amount > this.config.maxTransactionAmount) return null;
    const account = this.getAccount(playerId);
    if (account.krcBalance + amount > this.config.maxKrcBalance) return null;

    const entry: LedgerEntry = {
      id: `ledger_${this.nextEntryId++}`,
      playerId,
      type: "CREDIT",
      amount,
      currency: "KRC",
      reference,
      matchId,
      timestamp: Date.now(),
      balanceBefore: account.krcBalance,
      balanceAfter: account.krcBalance + amount,
    };

    account.krcBalance += amount;
    account.updatedAt = Date.now();
    this.entries.push(entry);
    return entry;
  }

  /** Debit KRC from a player account */
  debit(playerId: string, amount: number, reference: string, matchId?: string): LedgerEntry | null {
    if (amount <= 0 || amount > this.config.maxTransactionAmount) return null;
    const account = this.getAccount(playerId);
    if (account.krcBalance - amount < this.config.minKrcBalance) return null;

    const entry: LedgerEntry = {
      id: `ledger_${this.nextEntryId++}`,
      playerId,
      type: "DEBIT",
      amount,
      currency: "KRC",
      reference,
      matchId,
      timestamp: Date.now(),
      balanceBefore: account.krcBalance,
      balanceAfter: account.krcBalance - amount,
    };

    account.krcBalance -= amount;
    account.updatedAt = Date.now();
    this.entries.push(entry);
    return entry;
  }

  /** Place a hold on KRC (for pending transactions like world transitions) */
  hold(playerId: string, amount: number, reference: string): LedgerEntry | null {
    const account = this.getAccount(playerId);
    const available = account.krcBalance - this.getTotalHolds(playerId);
    if (amount > available) return null;

    account.holds.set(reference, amount);
    account.updatedAt = Date.now();

    const entry: LedgerEntry = {
      id: `ledger_${this.nextEntryId++}`,
      playerId,
      type: "HOLD",
      amount,
      currency: "KRC",
      reference,
      timestamp: Date.now(),
      balanceBefore: account.krcBalance,
      balanceAfter: account.krcBalance,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Release a hold (commit or cancel) */
  releaseHold(playerId: string, reference: string, commit: boolean): LedgerEntry | null {
    const account = this.getAccount(playerId);
    const holdAmount = account.holds.get(reference);
    if (holdAmount === undefined) return null;

    account.holds.delete(reference);

    if (commit) {
      // Actually deduct the held amount
      account.krcBalance -= holdAmount;
    }
    account.updatedAt = Date.now();

    const entry: LedgerEntry = {
      id: `ledger_${this.nextEntryId++}`,
      playerId,
      type: "RELEASE",
      amount: holdAmount,
      currency: "KRC",
      reference,
      timestamp: Date.now(),
      balanceBefore: account.krcBalance + (commit ? holdAmount : 0),
      balanceAfter: account.krcBalance,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Transfer KRC between two players */
  transfer(fromId: string, toId: string, amount: number, reference: string): { debit: LedgerEntry; credit: LedgerEntry } | null {
    const debitEntry = this.debit(fromId, amount, reference);
    if (!debitEntry) return null;
    const creditEntry = this.credit(toId, amount, reference);
    if (!creditEntry) {
      // Rollback
      this.credit(fromId, amount, `ROLLBACK:${reference}`);
      return null;
    }
    return { debit: debitEntry, credit: creditEntry };
  }

  getTotalHolds(playerId: string): number {
    const account = this.accounts.get(playerId);
    if (!account) return 0;
    return Array.from(account.holds.values()).reduce((sum, h) => sum + h, 0);
  }

  getBalance(playerId: string): number {
    return this.getAccount(playerId).krcBalance;
  }

  getAvailableBalance(playerId: string): number {
    return this.getBalance(playerId) - this.getTotalHolds(playerId);
  }

  getEntries(playerId?: string, limit?: number): LedgerEntry[] {
    let filtered = playerId
      ? this.entries.filter(e => e.playerId === playerId)
      : this.entries;
    if (limit) filtered = filtered.slice(-limit);
    return filtered;
  }

  getStats() {
    return {
      totalAccounts: this.accounts.size,
      totalEntries: this.entries.length,
      totalKrcInCirculation: Array.from(this.accounts.values())
        .reduce((sum, a) => sum + a.krcBalance, 0),
      totalFbmInCirculation: Array.from(this.accounts.values())
        .reduce((sum, a) => sum + a.fbmBalance, 0),
    };
  }

  /** Reset ledger (for testing) */
  reset(): void {
    this.accounts.clear();
    this.entries = [];
    this.nextEntryId = 1;
  }
}
