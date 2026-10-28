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

async function refreshEscrowGaugesCached(): Promise<void> {
  if (Date.now() - lastEscrowRefreshAt < ESCROW_GAUGES_TTL_MS) return;
  lastEscrowRefreshAt = Date.now();
  try {
    await refreshEscrowGauges();
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
    await refreshEscrowGaugesCached();
    res.set("Content-Type", PROMETHEUS_CONTENT_TYPE);
    res.status(200).send(metricsRegistry.render());
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
