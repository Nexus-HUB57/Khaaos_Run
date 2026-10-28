// KHAAOS RUN — Economy 2PC Integration Tests (PostgreSQL end-to-end)
// ====================================================================
// Suíte E2E do protocolo Two-Phase Commit (server-side) consumido por
// UKhaaosEconomyBridge2PC (UE5.8). Cobre o fluxo completo:
//
//   prepare → escrow (débito wallet.weapons → system.2pc_escrow)
//   commit  → finalize (system.2pc_escrow → destination)
//   abort   → refund   (system.2pc_escrow → wallet.weapons)
//
// Cenários:
//   1. Payload EXATO do cliente UE5 (campos de KhaaosEconomyBridge2PC.cpp)
//   2. Idempotência (double-spend, replay, payload diferente → 409)
//   3. Saldo insuficiente → 402 com prepared=false
//   4. Commit / Abort felizes + replays idempotentes
//   5. Transições inválidas (commit pós-abort → 409, abort pós-commit → 409)
//   6. TTL: commit em escrow expirado → auto-abort + 409 ESCROW_EXPIRED
//   7. GC recoverExpired() reembolsa escrows órfãos
//   8. Invariante double-entry: ΣDEBIT = ΣCREDIT por operationId
//
// Requisitos: TEST_DATABASE_URL apontando para PostgreSQL local com sufixo
// *_test (mesma proteção da suíte storage.postgres). O bootstrap aplica
// migrations/*.sql em ordem (mini-migrador idempotente) — basta um DB vazio.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL é obrigatório para a suíte 2PC; nenhum teste será executado sem um DB de teste explícito.");
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error("TEST_DATABASE_URL não é uma URL PostgreSQL válida.");
}
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (parsedDatabaseUrl.protocol !== "postgres:" && parsedDatabaseUrl.protocol !== "postgresql:") {
  throw new Error("TEST_DATABASE_URL precisa usar o protocolo postgres:// ou postgresql://.");
}
if (!databaseName.endsWith("_test") || !allowedHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Proteção de segurança: testes PostgreSQL aceitam somente host local e database com sufixo _test.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("A suíte PostgreSQL não pode ser executada com NODE_ENV=production.");
}

// server/db.ts lê DATABASE_URL na inicialização do módulo.
process.env.DATABASE_URL = testDatabaseUrl;

const [{ pool }, { Economy2PCService, ECONOMY_2PC_LEDGER_LINES }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/game/economy2pcService.ts"),
]);

// ─── Bootstrap: mini-migrador idempotente ──────────────────────────────────

async function applyMigrations(): Promise<void> {
  // Advisory lock (client DEDICADO: lock é por sessão — pool.query pode
  // cair em conexões diferentes): o node --test roda os arquivos de teste
  // EM PARALELO — sem o lock, duas suítes aplicam 0000_initial_schema ao
  // mesmo tempo em um DB fresco e a segunda falha com "relation already
  // exists" (bug latente que só aparece contra PostgreSQL real com DB novo;
  // PGlite persistido mascarava).
  const LOCK_KEY = 778811; // khaaos_test_migrations
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      await client.query(
        "CREATE TABLE IF NOT EXISTS _test_migrations_applied (tag text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
      );
      const { rows } = await client.query<{ tag: string }>("SELECT tag FROM _test_migrations_applied");
      const applied = new Set(rows.map((r) => r.tag));

      const migrationsDir = join(process.cwd(), "migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort();

      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = readFileSync(join(migrationsDir, file), "utf8");
        const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const service = new Economy2PCService();

function uniqueActor(): string {
  return `2pc-it-${randomUUID()}`;
}

/** Payload EXATO que UKhaaosEconomyBridge2PC.cpp envia para /api/economy/2pc/prepare. */
function ue5PreparePayload(overrides: Record<string, unknown> = {}) {
  const guid = randomUUID(); // FGuid DigitsWithHyphensLower = UUID canônico
  return {
    transactionId: guid,
    idempotencyKey: `khaaos-2pc-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    amountKrc: 500,
    playerId: 42,
    itemId: "SKN_HURAN_AQUA",
    description: "Forja do Armeiro – CIGKV",
    coordinatorNodeId: "ue5-ds-node-01",
    expiryTimestamp: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

async function seedBalance(actorId: string, amountKrc: string): Promise<void> {
  await pool.query(
    `INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET weapons_balance = $2`,
    [actorId, amountKrc],
  );
}

async function getBalance(actorId: string): Promise<string> {
  const { rows } = await pool.query<{ weapons_balance: string }>(
    "SELECT weapons_balance FROM bank_accounts WHERE user_id = $1",
    [actorId],
  );
  return rows[0]?.weapons_balance ?? "0";
}

async function getEscrow(transactionId: string): Promise<Record<string, any> | null> {
  const { rows } = await pool.query("SELECT * FROM economy_2pc_transactions WHERE id = $1", [transactionId]);
  return rows[0] ?? null;
}

async function getLedgerByOperation(operationId: string): Promise<Array<{ account_code: string; side: string; amount_krc: string }>> {
  const { rows } = await pool.query(
    "SELECT account_code, side, amount_krc FROM economy_ledger_entries WHERE operation_id = $1 ORDER BY line_number",
    [operationId],
  );
  return rows;
}

async function expireEscrow(transactionId: string): Promise<void> {
  await pool.query("UPDATE economy_2pc_transactions SET expires_at = now() - interval '1 second' WHERE id = $1", [transactionId]);
}

async function cleanActor(actorId: string): Promise<void> {
  // economy_ledger_entries é APPEND-ONLY (trigger economy_ledger_no_row_mutation,
  // migration 0004) — linhas de ledger NUNCA são deletadas. O isolamento entre
  // testes vem do actorId único por teste; asserts filtram por user_id = actor.
  await pool.query("DELETE FROM transactions WHERE user_id = $1", [actorId]);
  await pool.query("DELETE FROM economy_2pc_transactions WHERE actor_id = $1", [actorId]);
  await pool.query("DELETE FROM bank_accounts WHERE user_id = $1", [actorId]);
}

let bootstrapped = false;

before(async () => {
  const result = await pool.query<{ database_name: string; server_version: string }>(
    "SELECT current_database() AS database_name, version() AS server_version",
  );
  const serverVersion = result.rows[0]?.server_version ?? "";
  assert.match(serverVersion, /^PostgreSQL /, "O teste exige um servidor PostgreSQL real.");
  // PGlite (Postgres WASM embedded) reporta database "postgres" independente da URL;
  // sendo instância descartável em-processo, o assert de nome é relaxado.
  const isPglite = serverVersion.includes("PGlite");
  if (!isPglite) {
    assert.equal(result.rows[0]?.database_name, databaseName, "A conexão deve apontar ao database _test informado.");
  }
  await applyMigrations();
  bootstrapped = true;
});

after(async () => {
  await pool.end();
});

// ─── Testes ────────────────────────────────────────────────────────────────

test("bootstrap aplica migrations e habilita a suíte", () => {
  assert.equal(bootstrapped, true);
});

test("prepare: payload EXATO do cliente UE5 cria escrow e debita wallet", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();

    const result = await service.prepare(actor, payload);
    assert.equal(result.status, 201);
    assert.equal(result.body.prepared, true, "cliente UE5 lê GetBoolField(\"prepared\")");
    assert.equal(result.body.transactionId, payload.transactionId, "UUID do UE5 vira PK");
    assert.equal(result.body.status, "PREPARED");

    // Débito exato na wallet
    assert.equal(await getBalance(actor), "500.00");

    // Escrow registrado
    const escrow = await getEscrow(String(payload.transactionId));
    assert.ok(escrow, "escrow deve existir");
    assert.equal(escrow.status, "PREPARED");
    assert.equal(escrow.amount_krc, "500.00");
    assert.equal(escrow.player_id, 42);
    assert.equal(escrow.item_id, "SKN_HURAN_AQUA");
    assert.equal(escrow.destination_account, "system.item_sales");

    // Ledger: linhas 1-2 (wallet DEBIT → escrow CREDIT)
    const ledger = await getLedgerByOperation(String(escrow.prepare_operation_id));
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].account_code, "wallet.weapons");
    assert.equal(ledger[0].side, "DEBIT");
    assert.equal(ledger[1].account_code, "system.2pc_escrow");
    assert.equal(ledger[1].side, "CREDIT");
  } finally {
    await cleanActor(actor);
  }
});

test("prepare: mesma idempotencyKey → replay sem duplo débito (anti double-spend)", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();

    const first = await service.prepare(actor, payload);
    assert.equal(first.status, 201);
    assert.equal(first.replayed, false);
    const afterFirst = await getBalance(actor);
    assert.equal(afterFirst, "500.00");

    const second = await service.prepare(actor, payload);
    assert.equal(second.status, 201);
    assert.equal(second.replayed, true, "segunda chamada é replay");
    assert.equal(second.body.prepared, true);
    assert.equal(second.body.transactionId, payload.transactionId);

    assert.equal(await getBalance(actor), "500.00", "nenhum débito adicional");
  } finally {
    await cleanActor(actor);
  }
});

test("prepare: mesma chave com payload diferente → 409 IDEMPOTENCY_KEY_REUSED", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    const first = await service.prepare(actor, payload);
    assert.equal(first.status, 201);

    const conflict = await service.prepare(actor, { ...payload, amountKrc: 999 });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.prepared, false);
    assert.equal(conflict.body.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await getBalance(actor), "500.00");
  } finally {
    await cleanActor(actor);
  }
});

test("prepare: saldo insuficiente → 402 prepared=false e wallet intacta", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "100.00");
    const payload = ue5PreparePayload({ amountKrc: 500 });

    const result = await service.prepare(actor, payload);
    assert.equal(result.status, 402);
    assert.equal(result.body.prepared, false);
    assert.equal(result.body.code, "INSUFFICIENT_FUNDS");
    assert.equal(await getBalance(actor), "100.00", "nada debitado");

    const escrow = await getEscrow(String(payload.transactionId));
    assert.ok(escrow);
    assert.equal(escrow.status, "ABORTED");
    assert.equal(escrow.abort_reason, "insufficient-funds-at-prepare");
  } finally {
    await cleanActor(actor);
  }
});

test("commit: finaliza escrow credita destino e mantém double-entry", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();

    const prepared = await service.prepare(actor, payload);
    assert.equal(prepared.status, 201);
    const escrowBefore = await getEscrow(String(payload.transactionId));
    const prepareOp = String(escrowBefore!.prepare_operation_id);

    const committed = await service.commit(actor, String(payload.transactionId));
    assert.equal(committed.status, 200);
    assert.equal(committed.body.committed, true);
    assert.equal(committed.body.status, "COMMITTED");
    assert.equal(committed.body.amountKrc, "500.00");

    // Ledger do commit: linhas 3-4 (escrow DEBIT → destination CREDIT)
    const commitOp = String(committed.body.operationId);
    const ledger = await getLedgerByOperation(commitOp);
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].account_code, "system.2pc_escrow");
    assert.equal(ledger[0].side, "DEBIT");
    assert.equal(ledger[1].account_code, "system.item_sales");
    assert.equal(ledger[1].side, "CREDIT");

    // Invariante double-entry nas duas operações
    for (const op of [prepareOp, commitOp]) {
      const lines = await getLedgerByOperation(op);
      const debits = lines.filter((l) => l.side === "DEBIT").reduce((a, l) => a + Number(l.amount_krc), 0);
      const credits = lines.filter((l) => l.side === "CREDIT").reduce((a, l) => a + Number(l.amount_krc), 0);
      assert.equal(debits, credits, `operação ${op} deve estar balanceada`);
    }

    // Escrow COMMITTED
    const escrow = await getEscrow(String(payload.transactionId));
    assert.equal(escrow.status, "COMMITTED");
    assert.ok(escrow.committed_at);
    assert.ok(escrow.commit_operation_id);

    // Saldo final: -500 (commit NÃO devolve para wallet; destino recebe)
    assert.equal(await getBalance(actor), "500.00");
  } finally {
    await cleanActor(actor);
  }
});

test("commit: replay idempotente não credita duas vezes", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    await service.prepare(actor, payload);

    const first = await service.commit(actor, String(payload.transactionId));
    assert.equal(first.status, 200);
    assert.equal(first.replayed, false);

    const second = await service.commit(actor, String(payload.transactionId));
    assert.equal(second.status, 200);
    assert.equal(second.replayed, true);
    assert.equal(second.body.committed, true);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE operation_id = $1",
      [second.body.operationId],
    );
    assert.equal(rows[0].n, 0, "replay não escreve novas linhas de ledger");
  } finally {
    await cleanActor(actor);
  }
});

test("abort: reembolsa wallet e registra linhas 5-6", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    await service.prepare(actor, payload);
    assert.equal(await getBalance(actor), "500.00");

    const aborted = await service.abort(actor, String(payload.transactionId), "jogador cancelou compra");
    assert.equal(aborted.status, 200);
    assert.equal(aborted.body.aborted, true);
    assert.equal(aborted.body.refund, "500.00");
    assert.equal(await getBalance(actor), "1000.00", "reembolso integral");

    const escrow = await getEscrow(String(payload.transactionId));
    assert.equal(escrow.status, "ABORTED");
    assert.equal(escrow.abort_reason, "jogador cancelou compra");
    assert.ok(escrow.aborted_at);

    const ledger = await getLedgerByOperation(String(escrow.abort_operation_id));
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].account_code, "system.2pc_escrow");
    assert.equal(ledger[0].side, "DEBIT");
    assert.equal(ledger[1].account_code, "wallet.weapons");
    assert.equal(ledger[1].side, "CREDIT");
  } finally {
    await cleanActor(actor);
  }
});

test("abort: replay idempotente e abort pós-commit → 409", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");

    // Replay de abort
    const payloadA = ue5PreparePayload();
    await service.prepare(actor, payloadA);
    const firstAbort = await service.abort(actor, String(payloadA.transactionId), "x");
    assert.equal(firstAbort.status, 200);
    assert.equal(firstAbort.replayed, false);
    const secondAbort = await service.abort(actor, String(payloadA.transactionId), "x");
    assert.equal(secondAbort.status, 200);
    assert.equal(secondAbort.replayed, true);

    // Abort pós-commit
    const payloadB = ue5PreparePayload();
    await service.prepare(actor, payloadB);
    await service.commit(actor, String(payloadB.transactionId));
    const abortAfterCommit = await service.abort(actor, String(payloadB.transactionId), "y");
    assert.equal(abortAfterCommit.status, 409);
    assert.equal(abortAfterCommit.body.code, "ALREADY_COMMITTED");
  } finally {
    await cleanActor(actor);
  }
});

test("commit pós-abort → 409 ALREADY_ABORTED; commits de transação inexistente → 404", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    await service.prepare(actor, payload);
    await service.abort(actor, String(payload.transactionId), "a");

    const commitAfterAbort = await service.commit(actor, String(payload.transactionId));
    assert.equal(commitAfterAbort.status, 409);
    assert.equal(commitAfterAbort.body.code, "ALREADY_ABORTED");

    const ghostId = randomUUID();
    const commitGhost = await service.commit(actor, ghostId);
    assert.equal(commitGhost.status, 404);
    const abortGhost = await service.abort(actor, ghostId, "z");
    assert.equal(abortGhost.status, 404);
  } finally {
    await cleanActor(actor);
  }
});

test("TTL: commit em escrow expirado → auto-abort + 409 ESCROW_EXPIRED com reembolso", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload({ ttlSeconds: 10 });
    await service.prepare(actor, payload);
    await expireEscrow(String(payload.transactionId));

    const result = await service.commit(actor, String(payload.transactionId));
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "ESCROW_EXPIRED");
    assert.equal(result.body.aborted, true);

    const escrow = await getEscrow(String(payload.transactionId));
    assert.equal(escrow.status, "ABORTED");
    assert.equal(escrow.abort_reason, "expired-during-commit");
    assert.equal(await getBalance(actor), "1000.00", "reembolso automático");
  } finally {
    await cleanActor(actor);
  }
});

test("GC: recoverExpired() reembolsa apenas escrows PREPARED expirados", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "2000.00");

    const expiredPayload = ue5PreparePayload();
    await service.prepare(actor, expiredPayload);
    await expireEscrow(String(expiredPayload.transactionId));

    // GC manual ANTES do próximo prepare (o prepare tem GC preventivo embutido).
    const recovered = await service.recoverExpired(actor);
    assert.equal(recovered, 1, "somente o escrow expirado");

    const expiredEscrow = await getEscrow(String(expiredPayload.transactionId));
    assert.equal(expiredEscrow.status, "ABORTED");
    assert.equal(expiredEscrow.abort_reason, "gc-expired");
    assert.equal(await getBalance(actor), "2000.00", "reembolso integral do expirado");

    // Escrow vivo não é tocado pelo GC.
    const livePayload = ue5PreparePayload();
    await service.prepare(actor, livePayload);
    const liveEscrow = await getEscrow(String(livePayload.transactionId));
    assert.equal(liveEscrow.status, "PREPARED");
    const recoveredLive = await service.recoverExpired(actor);
    assert.equal(recoveredLive, 0, "escrow válido não é recuperado");

    // GC preventivo do prepare: expira e o próximo prepare aborta automaticamente.
    const preventivePayload = ue5PreparePayload();
    await service.prepare(actor, preventivePayload);
    await expireEscrow(String(preventivePayload.transactionId));
    await service.prepare(actor, ue5PreparePayload()); // dispara GC preventivo
    const preventiveEscrow = await getEscrow(String(preventivePayload.transactionId));
    assert.equal(preventiveEscrow.status, "ABORTED", "GC preventivo do prepare aborta expirados");
    assert.equal(preventiveEscrow.abort_reason, "gc-expired");

    // transactionId não-UUID do cliente (fallback clientTransactionId)
    const customPayload = ue5PreparePayload({ transactionId: "tx-khaaos-42-xyz" });
    await service.prepare(actor, customPayload);
    const byClient = await service.getTransaction(actor, "tx-khaaos-42-xyz");
    assert.equal(byClient.status, 200);
    assert.equal(byClient.body.status, "PREPARED");
  } finally {
    await cleanActor(actor);
  }
});

test("status query e health reportam estados corretos", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    await service.prepare(actor, payload);

    const status = await service.getTransaction(actor, String(payload.transactionId));
    assert.equal(status.status, 200);
    assert.equal(status.body.status, "PREPARED");
    assert.ok(status.body.expiresAt);

    const forbidden = await service.getTransaction(`outro-${randomUUID()}`, String(payload.transactionId));
    assert.equal(forbidden.status, 403, "ator diferente não consulta a transação");

    const health = await service.health();
    assert.equal(health.healthy, true);
    assert.ok(typeof health.escrows === "object");
  } finally {
    await cleanActor(actor);
  }
});

test("invariante global: todo operationId do fluxo 2PC está balanceado", async () => {
  const actor = uniqueActor();
  try {
    await seedBalance(actor, "3000.00");

    // Fluxo completo: prepare → commit
    const p1 = ue5PreparePayload();
    await service.prepare(actor, p1);
    await service.commit(actor, String(p1.transactionId));

    // Fluxo completo: prepare → abort
    const p2 = ue5PreparePayload();
    await service.prepare(actor, p2);
    await service.abort(actor, String(p2.transactionId), "invariante");

    const { rows } = await pool.query<{ operation_id: string; d: string; c: string }>(
      `SELECT operation_id,
              sum(CASE WHEN side = 'DEBIT' THEN amount_krc ELSE 0 END) AS d,
              sum(CASE WHEN side = 'CREDIT' THEN amount_krc ELSE 0 END) AS c
       FROM economy_ledger_entries WHERE user_id = $1
       GROUP BY operation_id`,
      [actor],
    );
    assert.ok(rows.length >= 2, "pelo menos duas operações (commit + abort)");
    for (const row of rows) {
      assert.equal(
        Number(row.d), Number(row.c),
        `operação ${row.operation_id} viola double-entry (D=${row.d}, C=${row.c})`,
      );
    }
  } finally {
    await cleanActor(actor);
  }
});

test("números de linha do ledger seguem o plano 1-2/3-4/5-6", async () => {
  assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.prepare], [1, 2]);
  assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.commit], [3, 4]);
  assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.abort], [5, 6]);

  const actor = uniqueActor();
  try {
    await seedBalance(actor, "1000.00");
    const payload = ue5PreparePayload();
    await service.prepare(actor, payload);
    await service.abort(actor, String(payload.transactionId), "linhas");

    const { rows } = await pool.query<{ line_number: number; operation_id: string }>(
      `SELECT line_number, operation_id FROM economy_ledger_entries
       WHERE user_id = $1 ORDER BY operation_id, line_number`,
      [actor],
    );
    const byOp = new Map<string, number[]>();
    for (const row of rows) {
      byOp.set(row.operation_id, [...(byOp.get(row.operation_id) ?? []), row.line_number]);
    }
    const plans = [...byOp.values()].map((lines) => lines.join(",")).sort();
    assert.ok(plans.includes("1,2"), "prepare usa linhas 1-2");
    assert.ok(plans.includes("5,6"), "abort usa linhas 5-6");
  } finally {
    await cleanActor(actor);
  }
});
