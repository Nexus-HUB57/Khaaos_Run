// KHAAOS RUN — Metrics & Health Routes (Express)
// ===============================================
//   GET /metrics   → exposição Prometheus (text/plain; version=0.0.4)
//   GET /healthz   → health check agregado (PostgreSQL + serviço 2PC)
//
// /metrics é consumido pelo Prometheus (job `khaaos-economy-api`,
// monitoring/prometheus.yml) e alimenta os painéis 2PC do dashboard
// Grafana `khaaos-economy` (infra/grafana/khaaos-economy-dashboard.json).
//
// /healthz cobre o diagnóstico "postgres/health": ping direto no PostgreSQL
// (SELECT 1 com latência) + health do serviço 2PC (escrows por status).
// Retorna 503 quando o banco está indisponível (pronto para probes k8s).

import type { Express } from "express";
import { pool } from "../db";
import { economy2pcService } from "../game/economy2pcService";
import {
  PROMETHEUS_CONTENT_TYPE,
  metricsRegistry,
} from "../game/metricsRegistry";
import { metrics as m3Metrics } from "../game/metrics";

const DB_PING_TIMEOUT_MS = 3_000;
const ESCROW_GAUGES_TTL_MS = 5_000;
const ESCROW_STATUSES = ["PREPARED", "COMMITTED", "ABORTED"] as const;

/**
 * Gauges de escrow (contagens por status + idade do PREPARED mais antigo),
 * refrescados no scrape com TTL cache — Prometheus scrapeia a cada 15s, então
 * o custo médio é desprezível e os painéis Grafana nunca ficam sem série.
 */
let lastEscrowRefreshAt = 0;

async function refreshEscrowGauges(): Promise<void> {
  const health = await economy2pcService.health();
  const escrows = (health.escrows ?? {}) as Record<string, number>;
  for (const status of ESCROW_STATUSES) {
    metricsRegistry.economy2pcEscrows.set({ status }, escrows[status] ?? 0);
  }
  const oldestPreparedAt = typeof health.oldestPreparedAt === "string" ? health.oldestPreparedAt : null;
  const ageSeconds = oldestPreparedAt
    ? Math.max(0, (Date.now() - new Date(oldestPreparedAt).getTime()) / 1000)
    : -1;
  metricsRegistry.economy2pcOldestPreparedAge.set({}, ageSeconds);
}

/**
 * Métricas macro da economia (painéis "Economy" do dashboard Grafana).
 * Todas derivadas do ledger append-only / tabelas canônicas — mesmas
 * verdades que o reconcile usa. Roda em paralelo e é resiliente: qualquer
 * falha deixa o gauge em degradado (0/NaN seguro) sem quebrar o scrape.
 */
async function refreshEconomyMacroGauges(): Promise<void> {
  const [krc, flow, txTypes, integrity, loans] = await Promise.all([
    pool.query<{ circulating: string }>(
      "SELECT COALESCE(SUM(weapons_balance + bonus_balance + fbm_balance), 0) AS circulating FROM bank_accounts",
    ),
    pool.query<{ side: string; total: string }>(
      "SELECT side, COALESCE(SUM(amount_krc), 0) AS total FROM economy_ledger_entries WHERE account_code LIKE 'wallet.%' GROUP BY side",
    ),
    pool.query<{ tx_type: string; total: string }>(
      "SELECT type AS tx_type, COUNT(*) AS total FROM transactions GROUP BY type",
    ),
    // Invariante double-entry: toda operação do ledger soma zero (DEBIT = CREDIT).
    pool.query<{ unbalanced: string }>(
      "SELECT COUNT(*) AS unbalanced FROM (SELECT operation_id FROM economy_ledger_entries GROUP BY operation_id HAVING SUM(CASE side WHEN 'DEBIT' THEN amount_krc ELSE -amount_krc END) <> 0) AS unbalanced_ops",
    ),
    pool.query<{ active: string; created: string; defaulted: string }>(
      "SELECT COUNT(*) FILTER (WHERE is_paid = false AND days_remaining > 0) AS active, COUNT(*) AS created, COUNT(*) FILTER (WHERE is_paid = false AND days_remaining <= 0) AS defaulted FROM loans",
    ),
  ]);

  metricsRegistry.economyKrcCirculating.set({}, Number(krc.rows[0]?.circulating ?? 0));

  for (const row of flow.rows) {
    if (row.side === "CREDIT") metricsRegistry.economyKrcEarnedTotal.setAbsolute({}, Number(row.total));
    if (row.side === "DEBIT") metricsRegistry.economyKrcSpentTotal.setAbsolute({}, Number(row.total));
  }
  for (const row of txTypes.rows) {
    metricsRegistry.economyTransactions.setAbsolute({ tx_type: row.tx_type }, Number(row.total));
  }

  const unbalanced = Number(integrity.rows[0]?.unbalanced ?? 0);
  metricsRegistry.economyLedgerIntegrity.set({}, unbalanced === 0 ? 1 : 0);

  metricsRegistry.economyLoansActive.set({}, Number(loans.rows[0]?.active ?? 0));
  metricsRegistry.economyLoansCreatedTotal.setAbsolute({}, Number(loans.rows[0]?.created ?? 0));
  metricsRegistry.economyLoansDefaultedTotal.setAbsolute({}, Number(loans.rows[0]?.defaulted ?? 0));

  // Saúde composta: queries OK + ledger íntegro.
  metricsRegistry.economyHealthStatus.set({}, unbalanced === 0 ? 1 : 0);
}

async function refreshAllGauges(): Promise<void> {
  await refreshEscrowGauges();
  await refreshEconomyMacroGauges();
}

async function refreshEscrowGaugesCached(): Promise<void> {
  if (Date.now() - lastEscrowRefreshAt < ESCROW_GAUGES_TTL_MS) return;
  lastEscrowRefreshAt = Date.now();
  try {
    await refreshAllGauges();
  } catch {
    // Banco indisponível: mantém último snapshot (ou série vazia) — o scrape
    // do Prometheus nunca deve falhar por causa dos gauges derivados.
  }
}

interface HealthzCheck {
  ok: boolean;
  [key: string]: unknown;
}

interface HealthzPayload {
  ok: boolean;
  service: string;
  time: string;
  uptimeSeconds: number;
  checks: {
    database: HealthzCheck;
    economy2pc?: HealthzCheck;
  };
}

async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; server: string | null; error?: string }> {
  const startedAt = performance.now();
  try {
    const result = await Promise.race([
      pool.query<{ version: string }>("SELECT version() AS version"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("database ping timeout")), DB_PING_TIMEOUT_MS),
      ),
    ]);
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      server: (result.rows[0]?.version ?? "").split(" ").slice(0, 2).join(" ") || null,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      server: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkEconomy2PC(): Promise<HealthzCheck> {
  try {
    const health = await economy2pcService.health();
    return { ok: health.healthy === true, ...health };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Registra /metrics e /healthz. Deve ser chamado ANTES das demais rotas
 * (observability não depende de auth nem de sessão).
 */
export function registerMetricsRoutes(app: Express): void {
  app.get("/metrics", async (_req, res) => {
    // Gate herdado do M3 (staging SRE): KR_METRICS_ENABLED=0 desliga a
    // exposição pública inteira (econômica e HTTP/WS/DB juntas).
    if (process.env.KR_METRICS_ENABLED === "0") {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await refreshEscrowGaugesCached();
    // Registro único: economia/2PC (metricsRegistry) + HTTP/WS/DB M3
    // (game/metrics.ts) — mesma resposta, mesmo content type Prometheus 0.0.4.
    res.set("Content-Type", PROMETHEUS_CONTENT_TYPE);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(metricsRegistry.render() + m3Metrics.render());
  });

  app.get("/healthz", async (_req, res) => {
    const database = await pingDatabase();

    const payload: HealthzPayload = {
      ok: database.ok,
      service: "khaaos-economy-api",
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database,
      },
    };

    // Saúde do 2PC só é significativa com o banco de pé (evita ruído no 503).
    if (database.ok) {
      payload.checks.economy2pc = await checkEconomy2PC();
    }

    return res.status(database.ok ? 200 : 503).json(payload);
  });
}
