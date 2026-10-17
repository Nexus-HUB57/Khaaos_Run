import type { Pool } from "pg";

type Queryable = Pick<Pool, "query">;

export interface WalletDriftRow {
  user_id: string;
  account_code: string;
  wallet_balance: string;
  ledger_balance: string;
  difference_krc: string;
}

export interface UnbalancedOperationRow {
  operation_id: string;
  debit_total: string;
  credit_total: string;
  entry_count: number;
}

export interface TransactionWithoutLedgerRow {
  transaction_id: number;
  operation_id: string;
  user_id: string;
  type: string;
}

export interface IncompleteIdempotencyClaimRow {
  id: number;
  user_id: string;
  created_at: string;
}

export interface SuccessfulClaimWithoutLedgerRow {
  id: number;
  user_id: string;
  operation_id: string;
  response_status: number;
}

export interface EconomyAuditReport {
  generatedAt: string;
  status: "clean" | "needs_attention";
  counts: {
    walletAccountsScanned: number;
    walletDrifts: number;
    unbalancedOperations: number;
    transactionsWithoutLedger: number;
    successfulClaimsWithoutLedger: number;
    incompleteIdempotencyClaims: number;
  };
  walletDrifts: WalletDriftRow[];
  unbalancedOperations: UnbalancedOperationRow[];
  transactionsWithoutLedger: TransactionWithoutLedgerRow[];
  successfulClaimsWithoutLedger: SuccessfulClaimWithoutLedgerRow[];
  incompleteIdempotencyClaims: IncompleteIdempotencyClaimRow[];
}

const walletDriftSql = `
  WITH wallet_balances AS (
    SELECT user_id, 'wallet.weapons'::text AS account_code, weapons_balance::numeric AS wallet_balance
    FROM bank_accounts
    UNION ALL
    SELECT user_id, 'wallet.bonus'::text, bonus_balance::numeric FROM bank_accounts
    UNION ALL
    SELECT user_id, 'wallet.fbm'::text, fbm_balance::numeric FROM bank_accounts
  ), ledger_balances AS (
    SELECT user_id, account_code,
      SUM(CASE WHEN side = 'CREDIT' THEN amount_krc ELSE -amount_krc END)::numeric AS ledger_balance
    FROM economy_ledger_entries
    WHERE account_code IN ('wallet.weapons', 'wallet.bonus', 'wallet.fbm')
    GROUP BY user_id, account_code
  )
  SELECT
    COALESCE(w.user_id, l.user_id)::text AS user_id,
    COALESCE(w.account_code, l.account_code)::text AS account_code,
    COALESCE(w.wallet_balance, 0::numeric)::text AS wallet_balance,
    COALESCE(l.ledger_balance, 0::numeric)::text AS ledger_balance,
    (COALESCE(w.wallet_balance, 0::numeric) - COALESCE(l.ledger_balance, 0::numeric))::text AS difference_krc
  FROM wallet_balances w
  FULL OUTER JOIN ledger_balances l
    ON l.user_id = w.user_id AND l.account_code = w.account_code
  WHERE COALESCE(w.wallet_balance, 0::numeric) <> COALESCE(l.ledger_balance, 0::numeric)
  ORDER BY 1, 2
`;

const unbalancedOperationsSql = `
  SELECT operation_id::text AS operation_id,
    COALESCE(SUM(amount_krc) FILTER (WHERE side = 'DEBIT'), 0::numeric)::text AS debit_total,
    COALESCE(SUM(amount_krc) FILTER (WHERE side = 'CREDIT'), 0::numeric)::text AS credit_total,
    COUNT(*)::int AS entry_count
  FROM economy_ledger_entries
  GROUP BY operation_id
  HAVING COALESCE(SUM(amount_krc) FILTER (WHERE side = 'DEBIT'), 0::numeric)
      <> COALESCE(SUM(amount_krc) FILTER (WHERE side = 'CREDIT'), 0::numeric)
  ORDER BY operation_id
`;

const transactionWithoutLedgerSql = `
  SELECT t.id::int AS transaction_id, t.operation_id::text AS operation_id, t.user_id, t.type
  FROM transactions t
  LEFT JOIN economy_ledger_entries e ON e.operation_id = t.operation_id
  WHERE t.operation_id IS NOT NULL
  GROUP BY t.id, t.operation_id, t.user_id, t.type
  HAVING COUNT(e.id) = 0
  ORDER BY t.id
`;

const incompleteClaimsSql = `
  SELECT id, user_id, created_at::text AS created_at
  FROM economy_idempotency
  WHERE response_status IS NULL OR response_body IS NULL
  ORDER BY created_at, id
`;

const successfulClaimsWithoutLedgerSql = `
  SELECT i.id, i.user_id, i.operation_id::text AS operation_id,
    i.response_status
  FROM economy_idempotency i
  WHERE i.response_status BETWEEN 200 AND 299
    AND i.created_at >= COALESCE(
      (SELECT applied_at FROM economy_ledger_migration_state
       WHERE migration_key = '0003_initial_wallet_snapshot_v1'),
      TIMESTAMP 'epoch'
    )
    AND NOT EXISTS (
      SELECT 1 FROM economy_ledger_entries e WHERE e.operation_id = i.operation_id
    )
  ORDER BY i.created_at, i.id
`;

export async function createEconomyAuditReport(
  pool: Queryable,
  generatedAt = new Date(),
): Promise<EconomyAuditReport> {
  const [wallets, unbalanced, transactionsWithoutLedger, successfulClaimsWithoutLedger, incompleteClaims, accounts] = await Promise.all([
    pool.query<WalletDriftRow>(walletDriftSql),
    pool.query<UnbalancedOperationRow>(unbalancedOperationsSql),
    pool.query<TransactionWithoutLedgerRow>(transactionWithoutLedgerSql),
    pool.query<SuccessfulClaimWithoutLedgerRow>(successfulClaimsWithoutLedgerSql),
    pool.query<IncompleteIdempotencyClaimRow>(incompleteClaimsSql),
    pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM bank_accounts"),
  ]);

  const counts = {
    walletAccountsScanned: Number(accounts.rows[0]?.count ?? 0) * 3,
    walletDrifts: wallets.rows.length,
    unbalancedOperations: unbalanced.rows.length,
    transactionsWithoutLedger: transactionsWithoutLedger.rows.length,
    successfulClaimsWithoutLedger: successfulClaimsWithoutLedger.rows.length,
    incompleteIdempotencyClaims: incompleteClaims.rows.length,
  };
  const status = [
    counts.walletDrifts,
    counts.unbalancedOperations,
    counts.transactionsWithoutLedger,
    counts.successfulClaimsWithoutLedger,
    counts.incompleteIdempotencyClaims,
  ].some((count) => count > 0)
    ? "needs_attention"
    : "clean";

  return {
    generatedAt: generatedAt.toISOString(),
    status,
    counts,
    walletDrifts: wallets.rows,
    unbalancedOperations: unbalanced.rows,
    transactionsWithoutLedger: transactionsWithoutLedger.rows,
    successfulClaimsWithoutLedger: successfulClaimsWithoutLedger.rows,
    incompleteIdempotencyClaims: incompleteClaims.rows,
  };
}
