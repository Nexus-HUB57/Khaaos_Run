import type { Pool } from "pg";
import {
  IDEMPOTENCY_CLAIM_RETENTION_DAYS,
  IDEMPOTENCY_RETRY_WINDOW_DAYS,
} from "@shared/economyPolicy";

type Queryable = Pick<Pool, "query">;

export interface PruneEconomyIdempotencyOptions {
  retentionDays?: number;
  batchSize?: number;
  execute?: boolean;
}

export interface PruneEconomyIdempotencyReport {
  generatedAt: string;
  mode: "dry_run" | "executed";
  retryWindowDays: number;
  retentionDays: number;
  cutoff: string;
  eligibleClaimsAtStart: number;
  incompleteClaimsNotDeleted: number;
  successfulClaimsWithoutLedgerNotDeleted: number;
  deletedClaims: number;
  batches: number;
}

const MAX_BATCH_SIZE = 5_000;

export async function pruneEconomyIdempotencyClaims(
  pool: Queryable,
  options: PruneEconomyIdempotencyOptions = {},
): Promise<PruneEconomyIdempotencyReport> {
  const retentionDays = options.retentionDays ?? IDEMPOTENCY_CLAIM_RETENTION_DAYS;
  const batchSize = options.batchSize ?? 1_000;
  const execute = options.execute ?? false;

  if (!Number.isSafeInteger(retentionDays) || retentionDays <= IDEMPOTENCY_RETRY_WINDOW_DAYS) {
    throw new RangeError(`retentionDays precisa ser maior que a janela de retry de ${IDEMPOTENCY_RETRY_WINDOW_DAYS} dias`);
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new RangeError(`batchSize precisa estar entre 1 e ${MAX_BATCH_SIZE}`);
  }

  const [{ cutoff }] = (await pool.query<{ cutoff: string }>(
    `SELECT to_char(CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day'), 'YYYY-MM-DD HH24:MI:SS.US') AS cutoff`,
    [retentionDays],
  )).rows;
  const [eligible, incomplete, successfulWithoutLedger] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM economy_idempotency claim
      WHERE claim.created_at < $1::timestamp
        AND claim.response_status IS NOT NULL AND claim.response_body IS NOT NULL
        AND (
          claim.response_status NOT BETWEEN 200 AND 299
          OR EXISTS (SELECT 1 FROM economy_ledger_entries e WHERE e.operation_id = claim.operation_id)
        )
    `, [cutoff]),
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM economy_idempotency
      WHERE created_at < $1::timestamp
        AND (response_status IS NULL OR response_body IS NULL)
    `, [cutoff]),
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM economy_idempotency claim
      WHERE claim.created_at < $1::timestamp
        AND claim.response_status BETWEEN 200 AND 299
        AND NOT EXISTS (SELECT 1 FROM economy_ledger_entries e WHERE e.operation_id = claim.operation_id)
    `, [cutoff]),
  ]);

  const eligibleClaimsAtStart = Number(eligible.rows[0]?.count ?? 0);
  const incompleteClaimsNotDeleted = Number(incomplete.rows[0]?.count ?? 0);
  const successfulClaimsWithoutLedgerNotDeleted = Number(successfulWithoutLedger.rows[0]?.count ?? 0);
  let deletedClaims = 0;
  let batches = 0;

  if (execute) {
    while (true) {
      const result = await pool.query<{ id: number }>(`
        WITH candidates AS (
          SELECT claim.id FROM economy_idempotency claim
          WHERE claim.created_at < $1::timestamp
            AND claim.response_status IS NOT NULL AND claim.response_body IS NOT NULL
            AND (
              claim.response_status NOT BETWEEN 200 AND 299
              OR EXISTS (SELECT 1 FROM economy_ledger_entries e WHERE e.operation_id = claim.operation_id)
            )
          ORDER BY claim.created_at, claim.id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM economy_idempotency AS claim
        USING candidates
        WHERE claim.id = candidates.id
        RETURNING claim.id
      `, [cutoff, batchSize]);
      const removed = result.rows.length;
      if (removed === 0) break;
      deletedClaims += removed;
      batches += 1;
      if (removed < batchSize) break;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: execute ? "executed" : "dry_run",
    retryWindowDays: IDEMPOTENCY_RETRY_WINDOW_DAYS,
    retentionDays,
    cutoff,
    eligibleClaimsAtStart,
    incompleteClaimsNotDeleted,
    successfulClaimsWithoutLedgerNotDeleted,
    deletedClaims,
    batches,
  };
}
