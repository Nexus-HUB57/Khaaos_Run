import { randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { bankAccounts, economyIdempotency, economyLedgerEntries, items, loans, playerStats, transactions } from "@shared/schema";
import { calculateLoanInterestMinorUnits, fromMinorUnits, hashEconomicRequest, isValidIdempotencyKey, toMinorUnits, usdToKrcMinorUnits } from "./economyMoney";
import { getForgeCatalogItem } from "./forgeCatalog";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResponseBody = Record<string, unknown>;
export interface EconomyResponse {
  status: number;
  body: ResponseBody;
  replayed: boolean;
}
type OperationResponse = Pick<EconomyResponse, "status" | "body">;
type LedgerLine = { accountCode: string; side: "DEBIT" | "CREDIT"; amountKrc: string; description: string };
type OperationContext = { userId: string; idempotencyKey: string; operationId: string };

const insufficientFunds = (required: string, available: string): OperationResponse => ({
  status: 402,
  body: { message: "Saldo insuficiente", required, available },
});

function boundedMinorUnits(value: number | string, minimum: bigint, maximum: bigint): bigint {
  const amount = toMinorUnits(value);
  if (amount < minimum || amount > maximum) throw new RangeError("Valor monetário fora da faixa permitida");
  return amount;
}

async function appendLedger(tx: DbTransaction, context: OperationContext, lines: LedgerLine[]) {
  const entries = lines.map((line, index) => ({
    operationId: context.operationId,
    idempotencyKey: context.idempotencyKey,
    userId: context.userId,
    lineNumber: index + 1,
    accountCode: line.accountCode,
    side: line.side,
    amountKrc: line.amountKrc,
    description: line.description,
  }));
  await tx.insert(economyLedgerEntries).values(entries);
}

export class EconomyService {
  constructor(private readonly database: typeof db = db) {}

  private async execute(
    userId: string,
    idempotencyKey: string,
    operation: string,
    input: unknown,
    work: (tx: DbTransaction, context: OperationContext) => Promise<OperationResponse>,
  ): Promise<EconomyResponse> {
    if (typeof userId !== "string" || !userId.trim()) throw new Error("Authenticated user ID is required");
    if (!isValidIdempotencyKey(idempotencyKey)) throw new Error("Invalid idempotency key");
    const requestHash = hashEconomicRequest(operation, input);
    return this.database.transaction(async (tx) => {
      const proposedOperationId = randomUUID();
      const [claim] = await tx.insert(economyIdempotency).values({
        userId,
        idempotencyKey,
        requestHash,
        operationId: proposedOperationId,
        responseStatus: null,
        responseBody: {},
      }).onConflictDoNothing({
        target: [economyIdempotency.userId, economyIdempotency.idempotencyKey],
      }).returning();

      if (!claim) {
        const [existing] = await tx.select().from(economyIdempotency).where(and(
          eq(economyIdempotency.userId, userId),
          eq(economyIdempotency.idempotencyKey, idempotencyKey),
        )).limit(1);
        if (!existing) throw new Error("Idempotency claim disappeared during transaction");
        if (existing.requestHash !== requestHash) {
          return { status: 409, body: { message: "Esta chave de idempotência já foi usada com outro conteúdo." }, replayed: false };
        }
        if (!existing.responseStatus || !existing.responseBody) {
          throw new Error("Idempotency record has no committed response");
        }
        return {
          status: existing.responseStatus,
          body: existing.responseBody,
          replayed: true,
        };
      }

      const [previousLedgerUse] = await tx.select({ operationId: economyLedgerEntries.operationId })
        .from(economyLedgerEntries)
        .where(and(
          eq(economyLedgerEntries.userId, userId),
          eq(economyLedgerEntries.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (previousLedgerUse) {
        const responseBody = {
          code: "IDEMPOTENCY_KEY_EXPIRED",
          message: "A janela de replay desta chave expirou; a operação já consta no ledger e não será executada novamente.",
          operationId: previousLedgerUse.operationId,
        };
        await tx.update(economyIdempotency).set({
          operationId: previousLedgerUse.operationId,
          responseStatus: 409,
          responseBody,
        }).where(eq(economyIdempotency.id, claim.id));
        return { status: 409, body: responseBody, replayed: false };
      }

      const result = await work(tx, { userId, idempotencyKey, operationId: claim.operationId });
      const responseBody = { ...result.body, operationId: claim.operationId };
      await tx.update(economyIdempotency).set({
        responseStatus: result.status,
        responseBody,
      }).where(eq(economyIdempotency.id, claim.id));
      return { ...result, body: responseBody, replayed: false };
    });
  }

  private async lockBank(tx: DbTransaction, userId: string) {
    await tx.insert(bankAccounts).values({ userId }).onConflictDoNothing();
    const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).for("update");
    if (!account) throw new Error("Bank account could not be initialized");
    return account;
  }

  async deposit(userId: string, key: string, amountUsd: string | number): Promise<EconomyResponse> {
    return this.execute(userId, key, "bank.deposit", { amountUsd }, async (tx, context) => {
      const account = await this.lockBank(tx, userId);
      const amountUsdMinor = boundedMinorUnits(amountUsd, 100n, 1_000_000n);
      const amountKrcMinor = usdToKrcMinorUnits(amountUsd);
      const amountUsdValue = fromMinorUnits(amountUsdMinor);
      const amountKrcValue = fromMinorUnits(amountKrcMinor);
      const [updated] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} + ${amountKrcValue}::numeric, 2)`,
        bonusBalance: sql`round(${bankAccounts.bonusBalance} + ${amountKrcValue}::numeric, 2)`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      if (!updated) throw new Error("Bank account disappeared during deposit");
      await appendLedger(tx, context, [
        { accountCode: "wallet.weapons", side: "CREDIT", amountKrc: amountKrcValue, description: "Deposit to Weapons wallet" },
        { accountCode: "wallet.bonus", side: "CREDIT", amountKrc: amountKrcValue, description: "Deposit to Bonus wallet" },
        { accountCode: "external.deposit", side: "DEBIT", amountKrc: fromMinorUnits(amountKrcMinor * 2n), description: "External deposit clearing" },
      ]);
      const [ledger] = await tx.insert(transactions).values({
        userId,
        type: "DEPOSITO",
        amountKrc: amountKrcValue,
        amountUsd: amountUsdValue,
        operationId: context.operationId,
        description: `Deposit $${amountUsdValue}`,
      }).returning();
      return { status: 200, body: { newBalance: updated.weaponsBalance, transactionId: ledger.id } };
    });
  }

  async transfer(userId: string, key: string, amountKrc: string | number, destination: "bonus" | "fbm"): Promise<EconomyResponse> {
    return this.execute(userId, key, "bank.transfer", { amountKrc, destination }, async (tx, context) => {
      const amountMinor = boundedMinorUnits(amountKrc, 1n, 100_000_000n);
      const amount = fromMinorUnits(amountMinor);
      const account = await this.lockBank(tx, userId);
      const targetColumn = destination === "fbm" ? bankAccounts.fbmBalance : bankAccounts.bonusBalance;
      const [updated] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} - ${amount}::numeric, 2)`,
        [destination === "fbm" ? "fbmBalance" : "bonusBalance"]: sql`round(${targetColumn} + ${amount}::numeric, 2)`,
      }).where(and(
        eq(bankAccounts.userId, userId),
        sql`${bankAccounts.weaponsBalance} >= ${amount}::numeric`,
      )).returning();
      if (!updated) return insufficientFunds(amount, String(account.weaponsBalance));
      await appendLedger(tx, context, [
        { accountCode: "wallet.weapons", side: "DEBIT", amountKrc: amount, description: "Transfer out of Weapons wallet" },
        { accountCode: destination === "fbm" ? "wallet.fbm" : "wallet.bonus", side: "CREDIT", amountKrc: amount, description: `Transfer into ${destination.toUpperCase()} wallet` },
      ]);
      await tx.insert(transactions).values({
        userId,
        type: "TRANSFERENCIA",
        amountKrc: amount,
        operationId: context.operationId,
        description: `Transfer from weapons to ${destination}`,
      });
      return { status: 200, body: { message: "Transferência realizada", newBalance: updated.weaponsBalance } };
    });
  }

  async requestLoan(userId: string, key: string, amountKrc: number, days: number): Promise<EconomyResponse> {
    return this.execute(userId, key, "loans.request", { amountKrc, days }, async (tx, context) => {
      if (!Number.isSafeInteger(amountKrc) || amountKrc < 100 || amountKrc > 10_000) throw new RangeError("Valor do empréstimo fora da faixa permitida");
      if (!Number.isSafeInteger(days) || days < 1 || days > 30) throw new RangeError("Prazo do empréstimo fora da faixa permitida");
      await this.lockBank(tx, userId);
      const activeLoans = await tx.select({ id: loans.id }).from(loans).where(and(
        eq(loans.userId, userId),
        or(eq(loans.isPaid, false), isNull(loans.isPaid)),
      ));
      if (activeLoans.length >= 3) {
        return { status: 403, body: { message: "Limite de 3 empréstimos ativos atingido" } };
      }
      const principalMinor = toMinorUnits(amountKrc);
      const interestMinor = calculateLoanInterestMinorUnits(amountKrc, days);
      const principal = fromMinorUnits(principalMinor);
      const interest = fromMinorUnits(interestMinor);
      const totalDue = fromMinorUnits(principalMinor + interestMinor);
      const [loan] = await tx.insert(loans).values({
        userId,
        principal,
        interest,
        totalDue,
        daysRemaining: days,
        isPaid: false,
      }).returning();
      await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} + ${principal}::numeric, 2)`,
      }).where(eq(bankAccounts.userId, userId));
      await appendLedger(tx, context, [
        { accountCode: "wallet.weapons", side: "CREDIT", amountKrc: principal, description: "Loan proceeds to Weapons wallet" },
        { accountCode: "system.loan_receivable", side: "DEBIT", amountKrc: principal, description: "Principal receivable created" },
      ]);
      await tx.insert(transactions).values({
        userId,
        type: "EMPRESTIMO",
        amountKrc: principal,
        operationId: context.operationId,
        description: `Loan for ${days} days`,
      });
      return { status: 201, body: loan as unknown as ResponseBody };
    });
  }

  async payLoan(userId: string, key: string, loanId: number): Promise<EconomyResponse> {
    return this.execute(userId, key, "loans.pay", { loanId }, async (tx, context) => {
      if (!Number.isSafeInteger(loanId) || loanId <= 0) throw new RangeError("ID de empréstimo inválido");
      await this.lockBank(tx, userId);
      const [loan] = await tx.select().from(loans).where(and(
        eq(loans.id, loanId),
        eq(loans.userId, userId),
      )).for("update");
      if (!loan) return { status: 404, body: { message: "Empréstimo não encontrado" } };
      if (loan.isPaid === true) return { status: 409, body: { message: "Empréstimo já pago" } };
      if (loan.isPaid !== false) return { status: 409, body: { message: "Estado do empréstimo inválido" } };
      let due: string;
      let principal: string;
      let interest: string;
      try {
        const principalMinor = boundedMinorUnits(String(loan.principal), 1n, 2_500_000n);
        const interestMinor = boundedMinorUnits(String(loan.interest), 0n, 2_500_000n);
        const dueMinor = boundedMinorUnits(String(loan.totalDue), 1n, 2_500_000n);
        if (principalMinor + interestMinor !== dueMinor) throw new RangeError("Inconsistent loan total");
        principal = fromMinorUnits(principalMinor);
        interest = fromMinorUnits(interestMinor);
        due = fromMinorUnits(dueMinor);
      }
      catch { return { status: 409, body: { message: "Valor devido do empréstimo inválido" } }; }
      const [sufficient] = await tx.select({ enough: sql<boolean>`${bankAccounts.weaponsBalance} >= ${due}::numeric` })
        .from(bankAccounts).where(eq(bankAccounts.userId, userId));
      if (!sufficient?.enough) {
        const [account] = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
        return insufficientFunds(due, String(account?.weaponsBalance ?? "0.00"));
      }
      const [paidLoan] = await tx.update(loans).set({ isPaid: true }).where(and(
        eq(loans.id, loanId),
        eq(loans.userId, userId),
        eq(loans.isPaid, false),
      )).returning();
      if (!paidLoan) return { status: 409, body: { message: "Empréstimo já pago" } };
      await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} - ${due}::numeric, 2)`,
      }).where(eq(bankAccounts.userId, userId));
      await appendLedger(tx, context, [
        { accountCode: "wallet.weapons", side: "DEBIT", amountKrc: due, description: `Loan repayment from Weapons wallet #${loan.id}` },
        { accountCode: "system.loan_receivable", side: "CREDIT", amountKrc: principal, description: `Principal repayment #${loan.id}` },
        ...(interest === "0.00" ? [] : [{ accountCode: "system.loan_interest_income", side: "CREDIT" as const, amountKrc: interest, description: `Interest income #${loan.id}` }]),
      ]);
      await tx.insert(transactions).values({
        userId,
        type: "PAGAMENTO_EMPRESTIMO",
        amountKrc: due,
        operationId: context.operationId,
        description: `Repaid loan #${loan.id}`,
      });
      return { status: 200, body: { message: "Empréstimo pago" } };
    });
  }

  async purchaseItem(userId: string, key: string, input: { catalogId: string }): Promise<EconomyResponse> {
    const catalogItem = getForgeCatalogItem(input.catalogId);
    if (!catalogItem) throw new RangeError("Item não encontrado no catálogo da Forja");
    const normalizedInput = { catalogId: catalogItem.catalogId };
    const price = fromMinorUnits(BigInt(catalogItem.priceKrc) * 100n);
    return this.execute(userId, key, "items.purchase", normalizedInput, async (tx, context) => {
      const account = await this.lockBank(tx, userId);
      const [updated] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} - ${price}::numeric, 2)`,
      }).where(and(
        eq(bankAccounts.userId, userId),
        sql`${bankAccounts.weaponsBalance} >= ${price}::numeric`,
      )).returning();
      if (!updated) return insufficientFunds(price, String(account.weaponsBalance));
      const [item] = await tx.insert(items).values({
        userId,
        name: catalogItem.name,
        type: catalogItem.type,
        rarity: catalogItem.rarity,
        catalogId: catalogItem.catalogId,
      }).returning();
      await appendLedger(tx, context, [
        { accountCode: "system.item_sales", side: "CREDIT", amountKrc: price, description: `Item sale: ${catalogItem.catalogId}` },
        { accountCode: "wallet.weapons", side: "DEBIT", amountKrc: price, description: `Purchase from Weapons wallet: ${catalogItem.catalogId}` },
      ]);
      await tx.insert(transactions).values({
        userId,
        type: "COMPRA",
        amountKrc: price,
        operationId: context.operationId,
        description: `Purchased ${catalogItem.name} (${catalogItem.catalogId})`,
      });
      return { status: 201, body: item as unknown as ResponseBody };
    });
  }

  async repairItem(userId: string, key: string, itemId: number, amountKrc: string | number): Promise<EconomyResponse> {
    return this.execute(userId, key, "items.repair", { itemId, amountKrc }, async (tx, context) => {
      if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new RangeError("ID de item inválido");
      const amountMinor = boundedMinorUnits(amountKrc, 100n, 10_000_000n);
      const amount = fromMinorUnits(amountMinor);
      const account = await this.lockBank(tx, userId);
      const [item] = await tx.select().from(items).where(and(
        eq(items.id, itemId),
        eq(items.userId, userId),
      )).for("update");
      if (!item) return { status: 404, body: { message: "Item não encontrado" } };
      const [updatedAccount] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} - ${amount}::numeric, 2)`,
      }).where(and(
        eq(bankAccounts.userId, userId),
        sql`${bankAccounts.weaponsBalance} >= ${amount}::numeric`,
      )).returning();
      if (!updatedAccount) return insufficientFunds(amount, String(account.weaponsBalance));
      const [updatedItem] = await tx.update(items).set({
        durability: sql`least(${items.maxDurability}, round(${items.durability} + ${amount}::numeric * 0.5, 2))`,
      }).where(and(eq(items.id, itemId), eq(items.userId, userId))).returning();
      if (!updatedItem) throw new Error("Owned item disappeared during repair");
      await appendLedger(tx, context, [
        { accountCode: "system.item_repairs", side: "CREDIT", amountKrc: amount, description: `Repair service: ${item.name}` },
        { accountCode: "wallet.weapons", side: "DEBIT", amountKrc: amount, description: `Repair payment from Weapons wallet: ${item.name}` },
      ]);
      await tx.insert(transactions).values({
        userId,
        type: "REPARO",
        amountKrc: amount,
        operationId: context.operationId,
        description: `Repaired ${item.name}`,
      });
      return { status: 200, body: { message: `Reparado ${item.name}`, newDurability: updatedItem.durability } };
    });
  }

  async claimDailySalary(userId: string, key: string, now = new Date()): Promise<EconomyResponse> {
    return this.execute(userId, key, "player.dailySalary", {}, async (tx, context) => {
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError("Data de solicitação inválida");
      await this.lockBank(tx, userId);
      await tx.insert(playerStats).values({ userId }).onConflictDoNothing();
      const [stats] = await tx.select().from(playerStats).where(eq(playerStats.userId, userId)).for("update");
      if (!stats) throw new Error("Player stats could not be initialized");
      const last = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
      if (last && now.getTime() - last.getTime() < 24 * 60 * 60 * 1000) {
        return { status: 400, body: { message: "Salário já recebido hoje" } };
      }
      const salaries: Record<string, string> = {
        ZHEERS: "100.00", ONITH: "200.00", SKEETW: "500.00", HURAN: "800.00",
        VENEX: "1200.00", KHAEL: "2000.00", MALAKOR: "3500.00", OVERLORD: "5000.00",
      };
      const salary = salaries[stats.rank || "ZHEERS"] ?? "100.00";
      await tx.update(playerStats).set({ lastSalaryDate: now }).where(eq(playerStats.userId, userId));
      await tx.update(bankAccounts).set({
        bonusBalance: sql`round(${bankAccounts.bonusBalance} + ${salary}::numeric, 2)`,
      }).where(eq(bankAccounts.userId, userId));
      await appendLedger(tx, context, [
        { accountCode: "system.salary_expense", side: "DEBIT", amountKrc: salary, description: "Daily salary expense" },
        { accountCode: "wallet.bonus", side: "CREDIT", amountKrc: salary, description: "Daily salary to Bonus wallet" },
      ]);
      await tx.insert(transactions).values({ userId, type: "SALARY", amountKrc: salary, operationId: context.operationId, description: "Daily Salary" });
      return { status: 200, body: { message: "Salário recebido", amount: salary } };
    });
  }
}

export const economyService = new EconomyService();
