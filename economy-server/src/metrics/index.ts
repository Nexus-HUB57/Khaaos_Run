// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Prometheus metrics via prom-client
// ==============================================================================

import client from "prom-client";

// Coletar métricas default (GC, memory, event loop lag)
client.collectDefaultMetrics({ register: client.register });

// ─── Custom Metrics ───────────────────────────────────────────────────────────

/** Contador de transações 2PC por fase */
export const twoPcTransactionsTotal = new client.Counter({
  name: "khaaos_2pc_transactions_total",
  help: "Total de transações 2PC processadas",
  labelNames: ["phase", "status"] as const,
});

/** Histograma de duração de transações 2PC */
export const twoPcTransactionDuration = new client.Histogram({
  name: "khaaos_2pc_transaction_duration_seconds",
  help: "Duração de transações 2PC em segundos",
  labelNames: ["phase"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** Gauge de KRC locked no momento */
export const krcLockedGauge = new client.Gauge({
  name: "khaaos_krc_locked_total",
  help: "KRC total locked em transações 2PC ativas",
});

/** Contador de saldos insuficientes */
export const insufficientFundsTotal = new client.Counter({
  name: "khaaos_2pc_insufficient_funds_total",
  help: "Total de transações 2PC rejeitadas por saldo insuficiente",
});

/** Contador de requests HTTP por rota */
export const httpRequestTotal = new client.Counter({
  name: "khaaos_http_requests_total",
  help: "Total de requests HTTP",
  labelNames: ["method", "route", "status"] as const,
});

/** Histograma de latência HTTP */
export const httpRequestDuration = new client.Histogram({
  name: "khaaos_http_request_duration_seconds",
  help: "Latência de requests HTTP em segundos",
  labelNames: ["method", "route"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

/** Exportar métricas como string Prometheus */
export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

/** Content-Type para Prometheus */
export function getContentType(): string {
  return client.register.contentType;
}
