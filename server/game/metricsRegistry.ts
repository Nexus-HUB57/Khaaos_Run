// KHAAOS RUN — Metrics Registry (Prometheus text exposition, sem dependências)
// =============================================================================
// Registry minimalista no formato text/plain; version=0.0.4 consumido pelo
// Prometheus (job `khaaos-economy-api`, monitoring/prometheus.yml) e exibido
// no dashboard Grafana `khaaos-economy`.
//
// Métricas do protocolo 2PC (server-side de UKhaaosEconomyBridge2PC):
//   khaaos_economy_2pc_requests_total{phase,result}
//   khaaos_economy_2pc_errors_total{phase}
//   khaaos_economy_2pc_phase_duration_ms{phase}   (histograma)
//   khaaos_economy_2pc_gc_recovered_total
//   khaaos_economy_2pc_escrows{status}            (gauge refrescado no scrape)
//   khaaos_economy_2pc_oldest_prepared_age_seconds (gauge refrescado no scrape)
//
// Hand-rolled de propósito: zero deps novas, bundle enxuto e saída
// determinística (labels ordenados) para testes de snapshot.

type Labels = Record<string, string>;

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export const ECONOMY_2PC_PHASES = ["prepare", "commit", "abort"] as const;
export type Economy2PCPhaseName = (typeof ECONOMY_2PC_PHASES)[number];

export const ECONOMY_2PC_RESULTS = [
  "prepared",
  "committed",
  "aborted",
  "replayed",
  "rejected",
] as const;
export type Economy2PCResultName = (typeof ECONOMY_2PC_RESULTS)[number];

/** Buckets do histograma de latência por fase (ms). */
export const ECONOMY_2PC_LATENCY_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function escapeMetricHelp(help: string): string {
  return help.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function labelKey(labelNames: readonly string[], labels: Labels = {}): string {
  return labelNames
    .map((name) => `${name}="${escapeLabelValue(String(labels[name] ?? ""))}"`)
    .join(",");
}

function renderSeries(name: string, values: Map<string, number>): string[] {
  return [...values.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) =>
      key ? `${name}{${key}} ${formatNumber(value)}` : `${name} ${formatNumber(value)}`,
    );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "NaN";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

class CounterMetric {
  readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {}

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(this.labelNames, labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${escapeMetricHelp(this.help)}`, `# TYPE ${this.name} counter`];
    lines.push(...renderSeries(this.name, this.values));
    return lines.join("\n");
  }
}

class GaugeMetric {
  readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {}

  set(labels: Labels, value: number): void;
  set(value: number): void;
  set(arg1: Labels | number, arg2?: number): void {
    if (typeof arg1 === "number") {
      this.values.set("", arg1);
      return;
    }
    this.values.set(labelKey(this.labelNames, arg1), arg2 ?? 0);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${escapeMetricHelp(this.help)}`, `# TYPE ${this.name} gauge`];
    lines.push(...renderSeries(this.name, this.values));
    return lines.join("\n");
  }
}

class HistogramMetric {
  private readonly counts = new Map<string, Map<number, number>>();
  private readonly sums = new Map<string, number>();
  private readonly totals = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
    readonly buckets: readonly number[] = ECONOMY_2PC_LATENCY_BUCKETS_MS,
  ) {}

  observe(labels: Labels, value: number): void {
    const key = labelKey(this.labelNames, labels);
    let bucketCounts = this.counts.get(key);
    if (!bucketCounts) {
      bucketCounts = new Map();
      this.counts.set(key, bucketCounts);
    }
    for (const le of this.buckets) {
      if (value <= le) bucketCounts.set(le, (bucketCounts.get(le) ?? 0) + 1);
    }
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${escapeMetricHelp(this.help)} (ms)`, `# TYPE ${this.name} histogram`];
    const keys = [...new Set([...this.counts.keys(), ...this.totals.keys()])].sort();

    for (const key of keys) {
      const bucketCounts = this.counts.get(key) ?? new Map<number, number>();
      for (const le of this.buckets) {
        const labels = key ? `${key},le="${le}"` : `le="${le}"`;
        lines.push(`${this.name}_bucket{${labels}} ${formatNumber(bucketCounts.get(le) ?? 0)}`);
      }
      const infLabels = key ? `${key},le="+Inf"` : `le="+Inf"`;
      lines.push(`${this.name}_bucket{${infLabels}} ${formatNumber(this.totals.get(key) ?? 0)}`);
      lines.push(
        key
          ? `${this.name}_sum{${key}} ${formatNumber(this.sums.get(key) ?? 0)}`
          : `${this.name}_sum ${formatNumber(this.sums.get(key) ?? 0)}`,
      );
      lines.push(
        key
          ? `${this.name}_count{${key}} ${formatNumber(this.totals.get(key) ?? 0)}`
          : `${this.name}_count ${formatNumber(this.totals.get(key) ?? 0)}`,
      );
    }
    return lines.join("\n");
  }
}

const processStartedAt = Date.now();

class MetricsRegistry {
  private readonly counters: CounterMetric[] = [];
  private readonly gauges: GaugeMetric[] = [];
  private readonly histograms: HistogramMetric[] = [];

  readonly up = new GaugeMetric(
    "khaaos_up",
    "Serviço Khaaos em execução (1 = up)",
  );
  readonly buildInfo = new GaugeMetric(
    "khaaos_build_info",
    "Metadados do build (valor sempre 1)",
    ["service", "node_env"],
  );
  readonly uptimeSeconds = new GaugeMetric(
    "khaaos_process_uptime_seconds",
    "Uptime do processo em segundos",
  );

  readonly economy2pcRequests = new CounterMetric(
    "khaaos_economy_2pc_requests_total",
    "Requisições 2PC por fase e resultado",
    ["phase", "result"],
  );
  readonly economy2pcErrors = new CounterMetric(
    "khaaos_economy_2pc_errors_total",
    "Erros internos (exceções) no serviço 2PC por fase",
    ["phase"],
  );
  readonly economy2pcGcRecovered = new CounterMetric(
    "khaaos_economy_2pc_gc_recovered_total",
    "Escrows órfãos recuperados (abort + refund) pelo GC",
  );
  readonly economy2pcPhaseDuration = new HistogramMetric(
    "khaaos_economy_2pc_phase_duration_ms",
    "Duração das fases 2PC (prepare/commit/abort)",
    ["phase"],
  );
  readonly economy2pcEscrows = new GaugeMetric(
    "khaaos_economy_2pc_escrows",
    "Transações 2PC por status (refrescado no scrape)",
    ["status"],
  );
  readonly economy2pcOldestPreparedAge = new GaugeMetric(
    "khaaos_economy_2pc_oldest_prepared_age_seconds",
    "Idade do escrow PREPARED mais antigo (segundos; -1 = nenhum aberto)",
  );

  constructor() {
    this.counters.push(this.economy2pcRequests, this.economy2pcErrors, this.economy2pcGcRecovered);
    this.gauges.push(
      this.up,
      this.buildInfo,
      this.uptimeSeconds,
      this.economy2pcEscrows,
      this.economy2pcOldestPreparedAge,
    );
    this.histograms.push(this.economy2pcPhaseDuration);

    this.up.set({}, 1);
    this.buildInfo.set(
      { service: "khaaos-economy-api", node_env: process.env.NODE_ENV ?? "unset" },
      1,
    );
  }

  /** Renderiza o payload Prometheus com process/uptime atualizados. */
  render(): string {
    this.uptimeSeconds.set({}, (Date.now() - processStartedAt) / 1000);

    const sections: string[] = [];
    for (const gauge of this.gauges) sections.push(gauge.render());
    for (const counter of this.counters) sections.push(counter.render());
    for (const histogram of this.histograms) sections.push(histogram.render());
    return `${sections.join("\n\n")}\n`;
  }
}

export const metricsRegistry = new MetricsRegistry();

// ─── API do serviço 2PC ─────────────────────────────────────────────────────

export interface PhaseTimer {
  end(result: Economy2PCResultName): void;
}

/**
 * Instrumenta uma fase 2PC: duração (histograma) + resultado (counter).
 * Uso: const t = economy2pcMetrics.startPhase("prepare"); ... t.end("prepared");
 */
export const economy2pcMetrics = {
  startPhase(phase: Economy2PCPhaseName): PhaseTimer {
    const startedAt = performance.now();
    return {
      end(result: Economy2PCResultName): void {
        metricsRegistry.economy2pcPhaseDuration.observe({ phase }, performance.now() - startedAt);
        metricsRegistry.economy2pcRequests.inc({ phase, result });
      },
    };
  },

  phaseError(phase: Economy2PCPhaseName): void {
    metricsRegistry.economy2pcErrors.inc({ phase });
  },

  gcRecovered(count: number): void {
    if (count > 0) metricsRegistry.economy2pcGcRecovered.inc({}, count);
  },
};

/** Resultado canônico para o counter, derivado da resposta do serviço. */
export function phaseResultFromResponse(
  phase: Economy2PCPhaseName,
  response: { body: Record<string, unknown>; replayed: boolean },
): Economy2PCResultName {
  if (response.replayed) return "replayed";
  const okField = phase === "prepare" ? "prepared" : phase === "commit" ? "committed" : "aborted";
  return response.body[okField] === true ? okField : "rejected";
}
