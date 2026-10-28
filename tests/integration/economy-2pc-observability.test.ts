// KHAAOS RUN — Economy 2PC Observability Tests (PostgreSQL end-to-end)
// =====================================================================
// Suíte E2E da camada de observabilidade do protocolo Two-Phase Commit:
//
//   GET /metrics                → Prometheus (khaaos_economy_2pc_*)
//   GET /healthz                → postgres/health agregado (SELECT 1 + 2PC)
//   GET /api/economy/2pc/health → diagnóstico de escrows
//
// Valida que os contadores/gauges refletem o fluxo real do protocolo
// (prepare → commit / abort / rejected) usando a MESMA pilha de runtime
// do servidor (Express + Drizzle + PostgreSQL), via supertest.
//
// Requisitos: TEST_DATABASE_URL (host local, database *_test) — mesmas
// proteções da suíte economy-2pc.postgres. O bootstrap aplica
// migrations/*.sql em ordem (mini-migrador idempotente).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import request from "supertest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL é obrigatório para a suíte de observabilidade 2PC.");
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
// Auth do 2PC em modo dev: sem ECONOMY_2PC_NODE_SECRET o ator é ue5-player-<id>.
delete process.env.ECONOMY_2PC_NODE_SECRET;

// server/db.ts lê DATABASE_URL na inicialização do módulo.
process.env.DATABASE_URL = testDatabaseUrl;

const [{ pool }, { registerMetricsRoutes }, { registerEconomy2PCRoutes }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/routes/metrics.ts"),
  import("../../server/routes/economy-2pc.ts"),
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

      // DB pré-migrado (ex.: step "Migrate" do 05-integration roda
      // `drizzle-kit migrate` antes dos testes): o schema já existe mas
      // _test_migrations_applied está vazio — reaplicar 0000 quebraria com
      // "relation already exists" (a tag de cada arquivo só é gravada DEPOIS
      // de todas as suas statements). Se o schema canônico já existe,
      // sincroniza as tags e pula a aplicação; em DB fresco segue o fluxo
      // normal (13-monitoring staging).
      if (applied.size === 0) {
        const pre = await client.query<{ t: string | null }>(
          "SELECT to_regclass('public.bank_accounts') AS t",
        );
        if (pre.rows[0]?.t) {
          for (const file of files) {
            await client.query(
              "INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING",
              [file],
            );
          }
          return; // finally libera o lock
        }
      }

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

// ─── App HTTP com a MESMA pilha do server/index.ts ─────────────────────────

const app = express();
app.use(express.json());
registerMetricsRoutes(app); // /metrics + /healthz
registerEconomy2PCRoutes(app); // /api/economy/2pc/*

// ─── Helpers ───────────────────────────────────────────────────────────────

let playerIdSeq = 91_000;

function nextPlayerId(): number {
  playerIdSeq += 1;
  return playerIdSeq;
}

function ue5PreparePayload(overrides: Record<string, unknown> = {}) {
  // Espelha o payload de KhaaosEconomyBridge2PC.cpp
  const guid = randomUUID();
  return {
    transactionId: guid,
    idempotencyKey: `khaaos-forge-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    amountKrc: 250,
    playerId: nextPlayerId(),
    itemId: "SKN_HURAN_AQUA",
    description: "Forja do Armeiro – observability",
    coordinatorNodeId: "ue5-ds-node-obs-01",
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

/** Lê o valor de uma série Prometheus com labels exatos (ordem irrelevante). */
function readMetric(text: string, name: string, labels: Record<string, string>): number | null {
  const expected = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .sort()
    .join(",");
  const pattern = new RegExp(`^${name}\\{(.+)\\} (\\S+)$`, "m");
  for (const line of text.split("\n")) {
    const match = pattern.exec(line);
    if (!match) continue;
    const actual = match[1].split(",").map((p) => p.trim()).sort().join(",");
    if (actual === expected) return Number(match[2]);
  }
  return null;
}

async function fetchMetrics(): Promise<string> {
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  return res.text as string;
}

async function cleanActor(actorId: string): Promise<void> {
  await pool.query("DELETE FROM transactions WHERE user_id = $1", [actorId]);
  await pool.query("DELETE FROM economy_2pc_transactions WHERE actor_id = $1", [actorId]);
  await pool.query("DELETE FROM bank_accounts WHERE user_id = $1", [actorId]);
}

let bootstrapped = false;

before(async () => {
  const result = await pool.query<{ server_version: string }>("SELECT version() AS server_version");
  const serverVersion = result.rows[0]?.server_version ?? "";
  assert.match(serverVersion, /^PostgreSQL /, "O teste exige um servidor PostgreSQL real.");
  await applyMigrations();
  bootstrapped = true;
});

after(async () => {
  await pool.end();
});

// ─── Testes: /metrics ──────────────────────────────────────────────────────

test("bootstrap aplica migrations e habilita a suíte", () => {
  assert.equal(bootstrapped, true);
});

test("GET /metrics expõe payload Prometheus com famílias 2PC", async () => {
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/plain/);
  assert.match(res.headers["content-type"] ?? "", /version=0\.0\.4/);

  const text = res.text as string;
  assert.match(text, /# HELP khaaos_up /);
  assert.match(text, /# TYPE khaaos_economy_2pc_requests_total counter/);
  assert.match(text, /# TYPE khaaos_economy_2pc_phase_duration_ms histogram/);
  assert.match(text, /khaaos_up 1/);
  assert.match(text, /khaaos_build_info\{service="khaaos-economy-api"/);

  // Buckets do histograma só existem após a 1ª observação — o teste de fluxo
  // (prepare→commit) valida séries _bucket/_sum/_count.
  assert.match(text, /# TYPE khaaos_economy_2pc_phase_duration_ms histogram/);

  // Gauges de escrow presentes com séries (refresh no scrape)
  assert.match(text, /khaaos_economy_2pc_escrows\{status="PREPARED"\} \d+/);
  assert.match(text, /khaaos_economy_2pc_oldest_prepared_age_seconds -?\d+(\.\d+)?/);
});

test("/metrics: counter incrementa em prepare→commit com payload UE5 exato", async () => {
  const payload = ue5PreparePayload();
  const actor = `ue5-player-${payload.playerId}`;
  try {
    await seedBalance(actor, "1000.00");

    const before = await fetchMetrics();
    const preparedBefore = readMetric(before, "khaaos_economy_2pc_requests_total", {
      phase: "prepare",
      result: "prepared",
    }) ?? 0;

    const prepareRes = await request(app)
      .post("/api/economy/2pc/prepare")
      .set("Content-Type", "application/json")
      .send(payload);
    assert.equal(prepareRes.status, 201, "prepare fresh é 201 (bridge aceita 2xx)");
    assert.equal(prepareRes.body.prepared, true);

    const committedBefore = readMetric(before, "khaaos_economy_2pc_requests_total", {
      phase: "commit",
      result: "committed",
    }) ?? 0;

    const commitRes = await request(app)
      .post("/api/economy/2pc/commit")
      // Contrato atualizado: bridge UE5 envia playerId em TODAS as fases
      .send({ transactionId: prepareRes.body.transactionId, playerId: payload.playerId });
    assert.equal(commitRes.status, 200);
    assert.equal(commitRes.body.committed, true);

    const afterText = await fetchMetrics();
    const preparedAfter = readMetric(afterText, "khaaos_economy_2pc_requests_total", {
      phase: "prepare",
      result: "prepared",
    });
    const committedAfter = readMetric(afterText, "khaaos_economy_2pc_requests_total", {
      phase: "commit",
      result: "committed",
    });

    assert.ok(preparedAfter !== null && preparedAfter === preparedBefore + 1,
      "counter prepare/prepared deve incrementar exatamente 1");
    assert.ok(committedAfter !== null && committedAfter === committedBefore + 1,
      "counter commit/committed deve incrementar exatamente 1");

    // Histograma observou a fase (buckets canônicos le="...")
    const countAfter = readMetric(afterText, "khaaos_economy_2pc_phase_duration_ms_count", {
      phase: "prepare",
    });
    assert.ok(countAfter !== null && countAfter >= 1, "histogram deve ter observado o prepare");
    assert.match(afterText, /khaaos_economy_2pc_phase_duration_ms_bucket\{phase="prepare",le="\d+"\} \d+/);
    assert.match(afterText, /khaaos_economy_2pc_phase_duration_ms_bucket\{phase="prepare",le="\+Inf"\} \d+/);
    assert.match(afterText, /khaaos_economy_2pc_phase_duration_ms_sum\{phase="prepare"\}/);
  } finally {
    await cleanActor(actor);
  }
});

test("/metrics: abort e rejected refletem resultado por fase", async () => {
  // a) abort: prepare → abort
  const abortPayload = ue5PreparePayload();
  const abortActor = `ue5-player-${abortPayload.playerId}`;
  try {
    await seedBalance(abortActor, "500.00");
    const prepareRes = await request(app)
      .post("/api/economy/2pc/prepare")
      .send(abortPayload);
    assert.equal(prepareRes.status, 201);

    const before = await fetchMetrics();
    const abortedBefore = readMetric(before, "khaaos_economy_2pc_requests_total", {
      phase: "abort",
      result: "aborted",
    }) ?? 0;

    const abortRes = await request(app)
      .post("/api/economy/2pc/abort")
      .send({ transactionId: prepareRes.body.transactionId, playerId: abortPayload.playerId, reason: "observability-test" });
    assert.equal(abortRes.status, 200);
    assert.equal(abortRes.body.aborted, true);

    const afterText = await fetchMetrics();
    const abortedAfter = readMetric(afterText, "khaaos_economy_2pc_requests_total", {
      phase: "abort",
      result: "aborted",
    });
    assert.ok(abortedAfter !== null && abortedAfter === abortedBefore + 1);
  } finally {
    await cleanActor(abortActor);
  }

  // b) rejected: saldo insuficiente → 402
  const poorPayload = ue5PreparePayload();
  const poorActor = `ue5-player-${poorPayload.playerId}`;
  try {
    await seedBalance(poorActor, "10.00"); // menos que amountKrc=250
    const before = await fetchMetrics();
    const rejectedBefore = readMetric(before, "khaaos_economy_2pc_requests_total", {
      phase: "prepare",
      result: "rejected",
    }) ?? 0;

    const res = await request(app)
      .post("/api/economy/2pc/prepare")
      .send(poorPayload);
    assert.equal(res.status, 402);
    assert.equal(res.body.prepared, false);

    const afterText = await fetchMetrics();
    const rejectedAfter = readMetric(afterText, "khaaos_economy_2pc_requests_total", {
      phase: "prepare",
      result: "rejected",
    });
    assert.ok(rejectedAfter !== null && rejectedAfter === rejectedBefore + 1);
  } finally {
    await cleanActor(poorActor);
  }
});

// ─── Testes: health (postgres/health) ──────────────────────────────────────

test("GET /api/economy/2pc/health reporta escrows e oldestPreparedAt", async () => {
  const payload = ue5PreparePayload();
  const actor = `ue5-player-${payload.playerId}`;
  try {
    await seedBalance(actor, "1000.00");
    const prepareRes = await request(app)
      .post("/api/economy/2pc/prepare")
      .send(payload);
    assert.equal(prepareRes.status, 201);

    const res = await request(app).get("/api/economy/2pc/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.service, "economy-2pc");
    assert.equal(res.body.healthy, true);
    assert.ok(Number.isInteger(res.body.escrows?.PREPARED));
    assert.ok(res.body.escrows.PREPARED >= 1, "escrow recém-criado deve aparecer no health");
    assert.ok(typeof res.body.oldestPreparedAt === "string" && res.body.oldestPreparedAt.length > 0,
      "oldestPreparedAt deve apontar o escrow aberto");
  } finally {
    await cleanActor(actor);
  }
});

test("GET /healthz: postgres/health com SELECT 1, latência e saúde do 2PC", async () => {
  const res = await request(app).get("/healthz");
  assert.equal(res.status, 200, "banco de pé → 200");

  const body = res.body as {
    ok: boolean;
    service: string;
    checks: {
      database: { ok: boolean; latencyMs: number; server: string | null };
      economy2pc?: { ok: boolean; healthy: boolean; escrows: Record<string, number> };
    };
  };

  assert.equal(body.ok, true);
  assert.equal(body.service, "khaaos-economy-api");
  assert.equal(body.checks.database.ok, true, "SELECT 1 deve passar no PostgreSQL real");
  assert.equal(typeof body.checks.database.latencyMs, "number");
  assert.match(body.checks.database.server ?? "", /^PostgreSQL/,
    "versão do servidor deve ser PostgreSQL real");

  assert.equal(body.checks.economy2pc?.ok, true);
  assert.equal(body.checks.economy2pc?.healthy, true);
  assert.ok(Number.isInteger(body.checks.economy2pc?.escrows?.PREPARED));
});

test("GET /healthz → 503 quando o PostgreSQL fica indisponível", async () => {
  // Simula queda do banco derrubando a pool temporariamente.
  const originalQuery = pool.query.bind(pool);
  const broken = new Error("simulated-db-outage");
  (pool as unknown as { query: unknown }).query = () => Promise.reject(broken);

  try {
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.checks.database.ok, false);
    assert.match(String(res.body.checks.database.error), /simulated-db-outage/);
    // economy2pc NÃO é checado com banco fora (evita ruído)
    assert.equal(res.body.checks.economy2pc, undefined);
  } finally {
    (pool as unknown as { query: unknown }).query = originalQuery;
  }

  // Recuperação: volta a 200 imediatamente
  const recovered = await request(app).get("/healthz");
  assert.equal(recovered.status, 200);
});

test("/metrics permanece disponível (200) mesmo com banco indisponível", async () => {
  const originalQuery = pool.query.bind(pool);
  (pool as unknown as { query: unknown }).query = () => Promise.reject(new Error("outage"));

  try {
    const res = await request(app).get("/metrics");
    assert.equal(res.status, 200, "scrape do Prometheus não deve depender do banco");
    assert.match(res.text as string, /khaaos_up 1/);
  } finally {
    (pool as unknown as { query: unknown }).query = originalQuery;
  }
});
