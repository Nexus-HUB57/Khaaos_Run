# M2 — Integridade de persistência/economia e recuperação (P0)

Closes the M2 milestone from `docs/ROADMAP.md` with **executed evidence** (no stubs): loan preview≡charge parity, multi-table rollback under injected failures, and backup/restore + migration rollback with measured RPO/RTO.

## 1. Loan parity — preview === débito

**Problem found:** `/api/economy/loan-preview` priced loans at **4%/day with float math** (`EconomyEngine.computeLoan`) while `EconomyService.requestLoan` charged **5%/day in minor units** — the player saw one value and was debited another. The client (`bank.tsx`) already displayed 5%/day.

**Fix:** single source of truth `computeLoanTerms()` in `shared/money.ts` (integer minor units, half-up, **integer-KRC domain 100..10000 × 1..30 days**) consumed by the preview route, the charging service and the simulation engine. `loanPreviewInput` zod schema now matches the charging domain exactly.

**Evidence (`m2-loan-parity-recovery.postgres.test.ts`):** 7 principals × 6 terms = **42-cell matrix** — preview === canonical contract === charged row, plus an independent bigint oracle; 5 boundary values rejected identically in all 3 layers. Unit matrix in `economy-money.test.ts` for fast feedback.

## 2. Idempotency & concurrency

- Sequential replay: `replayed: true`, same `operationId`, 1 loan / 2 ledger lines.
- **8× same key concurrently**: all 201 with the same `operationId`; exactly 1 loan, 2 ledger lines.
- **8× distinct keys concurrently**: the 3-active-loan cap holds — exactly 3×201, 5×403, 6 balanced ledger lines.
- Same key + different payload → 409.

## 3. Multi-table rollback with injected faults

Fault injector = `BEFORE INSERT ON economy_ledger_entries` trigger raising for `m2-fault-%` users — the failure hits **after** loans/bank/transactions writes, exactly where persistence bugs bite.

- requestLoan fault → full rollback: `loans=0, transactions=0, ledger=0, idempotency claims=0`; wallet/ledger identical to pre-fault.
- Retry with the **same key** after the fault executes exactly once (`replayed: false`).
- payLoan fault → loan stays open, balance untouched.
- Successful payment → wallet === ledger-derived balance; ledger net = 0.00; receivable mirrors open principal.

## 4. Backup/restore & migration rollback with measured RPO/RTO

Executed on ephemeral PostgreSQL 16.2 (disposable `*_dr` / `*_restore` databases):

| Metric | Measured | Method |
|---|---|---|
| **RTO (restore)** | **42 ms** | `DROP DATABASE` → `pg_restore -Fc -1` accepting connections |
| Backup duration | 35 ms | `pg_dump -Fc` single transaction (31 KB), LSN + sha256 recorded |
| **RPO demonstrated** | **1 row** | post-backup write (`dr-dave`) confirmed then absent after restore |
| Integrity | 4/4 tables | row counts + deterministic per-table MD5 checksums === pre-disaster |
| Invariants restored | 2/2 constraints, 3/3 append-only triggers | `pg_constraint` / `pg_trigger` post-restore |

Migration rollback: `migrations/rollback/0004_correlated_append_only_ledger.down.sql` (documented reverse DDL, append-only ledger removed, base data intact, writes accepted) — **RTO 7 ms**, intentional RPO (ledger history) mitigated by mandatory prior backup. Evidence JSONs in `artifacts/dr/`.

Runbook, per-environment RPO/RTO targets and explicit out-of-scope items: **`docs/M2_PERSISTENCE_RECOVERY.md`**.

## Gates (all executed locally)

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `drizzle-kit check` | ok |
| `npm run test:official` | 369 tests — **361 pass, 0 fail**, 8 skipped (PG-gated) |
| PG suites (`economy-postgres` + `m2-loan-parity-recovery`) | 2/2 pass |
| `npm run economy:reconcile` | **clean** — 138 wallets, 0 drift, 0 unbalanced |
| `tests/integration/eos-economy.integration.test.ts` | 7/7 pass |
| `npm run verify:all` | **7/7 PASSOU** |

## Reproduce

```bash
source scripts/m2_e2e/postgres_env.sh          # ephemeral PG + TEST_DATABASE_URL
node --import tsx --test tests/official/m2-loan-parity-recovery.postgres.test.ts
scripts/m2_e2e/dr_backup_restore.sh            # RPO/RTO evidence
scripts/m2_e2e/dr_migration_rollback.sh
```

## Explicit non-goals (documented in docs/M2_PERSISTENCE_RECOVERY.md §7)

- Production legacy-data audit and runtime/owner role separation (requires production access).
- Continuous WAL archiving in real staging (depends on M3 provisioning; targets documented).
- Redis DR already covered by alpha scripts (session state is re-derivable by design).
