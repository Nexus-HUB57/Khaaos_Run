// ─── Khaaos Run — Métricas Prometheus (zero-dependency, roadmap M3) ─────────
//
// Registry in-process com exposição no formato de texto Prometheus 0.0.4:
// counters, gauges (push e sampler) e histograms com labels acotunados.
//
// Decisões de design (staging SRE, M3):
//  - ZERO dependências: sem prom-client — o bundle de produção (dist/index.cjs)
//    não cresce e não há superfície de supply-chain nova.
//  - Cardinalidade CONTROLADA: labels são sempre de enum fechado (method,
//    route normalizada, status, outcome) — nunca userId/roomId (o padrão
//    "khaaos_" evita colisão com métricas do runtime/UE5).
//  - Samplers: gauges dinâmicos (rooms, conexões WS, túneis, pool de DB) são
//    lidos NO SCRAPE via callback — zero custo por tick, valor sempre fresco.
//  - Fallback seguro: render() nunca lança; um sampler quebrado contribui
//    com 0 e é reportado em khaaos_metrics_sampler_errors_total.

const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string | number>;
type SamplerFn = () => number;

type CounterState = { value: number };
type GaugeState = { value: number; sampler?: SamplerFn };
type HistogramState = { buckets: number[]; counts: number[]; sum: number; count: number };

type MetricDef =
  | { type: "counter"; help: string; series: Map<string, { labels: Labels; state: CounterState }> }
  | { type: "gauge"; help: string; series: Map<string, { labels: Labels; state: GaugeState }> }
  | { type: "histogram"; help: string; series: Map<string, { labels: Labels; state: HistogramState }> };

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function escapeHelp(help: string): string {
  return help.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join(",");
}

function renderLabels(labels: Labels, extra?: Record<string, string | number>): string {
  const all = { ...labels, ...(extra ?? {}) };
  const keys = Object.keys(all).sort();
  if (keys.length === 0) return "";
  return `{${keys.map((k) => `${k}="${escapeLabelValue(String(all[k]))}"`).join(",")}}`;
}

/** Normaliza rotas para cardinalidade baixa: ids numéricos/uuid → :id. */
export function normalizeRoute(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ":id";
      if (/^(lobby|room|mm|rl)_[0-9a-z_]+$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

class MetricsRegistry {
  private metrics = new Map<string, MetricDef>();
  private samplerErrors = 0;

  private define(name: string, type: "counter", help: string): Map<string, { labels: Labels; state: CounterState }>;
  private define(name: string, type: "gauge", help: string): Map<string, { labels: Labels; state: GaugeState }>;
  private define(name: string, type: "histogram", help: string): Map<string, { labels: Labels; state: HistogramState }>;
  private define(name: string, type: MetricDef["type"], help: string): Map<string, { labels: Labels; state: CounterState | GaugeState | HistogramState }> {
    let def = this.metrics.get(name);
    if (!def) {
      def = { type, help, series: new Map() } as MetricDef;
      this.metrics.set(name, def);
    }
    return def.series as Map<string, { labels: Labels; state: CounterState | GaugeState | HistogramState }>;
  }

  /** Incrementa um counter (default +1). Labels criam séries distintas. */
  counter(name: string, labels: Labels = {}, value = 1): void {
    if (value < 0) return; // counters não decrescem
    const series = this.define(name, "counter", this.helpOf(name));
    const key = labelKey(labels);
    const entry = series.get(key) ?? { labels, state: { value: 0 } };
    entry.state.value += value;
    series.set(key, entry);
  }

  /** Ajusta um gauge pontual (push). */
  gaugeSet(name: string, value: number, labels: Labels = {}): void {
    const series = this.define(name, "gauge", this.helpOf(name));
    const key = labelKey(labels);
    const entry = series.get(key) ?? { labels, state: { value } };
    entry.state.value = value;
    series.set(key, entry);
  }

  /** Registra sampler de gauge (lido no scrape — custo zero fora dele). */
  gaugeSampler(name: string, labels: Labels, sampler: SamplerFn): void {
    const series = this.define(name, "gauge", this.helpOf(name));
    const key = labelKey(labels);
    const entry = series.get(key) ?? { labels, state: { value: 0 } as GaugeState };
    entry.state.sampler = sampler;
    series.set(key, entry);
  }

  /** Observa um valor (em SEGUNDOS) no histograma. */
  observe(name: string, valueSeconds: number, labels: Labels = {}): void {
    const series = this.define(name, "histogram", this.helpOf(name));
    const key = labelKey(labels);
    const entry = series.get(key) ?? {
      labels,
      state: { buckets: [...HISTOGRAM_BUCKETS], counts: new Array(HISTOGRAM_BUCKETS.length).fill(0), sum: 0, count: 0 },
    };
    const state = entry.state;
    state.sum += valueSeconds;
    state.count += 1;
    for (let i = 0; i < state.buckets.length; i++) {
      if (valueSeconds <= state.buckets[i]) state.counts[i] += 1;
    }
    series.set(key, entry);
  }

  private helpOf(name: string): string {
    return HELP_TEXT[name] ?? `${name} (Khaaos Run)`;
  }

  /** Exposição Prometheus 0.0.4 — nunca lança. */
  render(): string {
    const out: string[] = [];
    for (const [name, def] of this.metrics) {
      out.push(`# HELP ${name} ${escapeHelp(def.help)}`);
      out.push(`# TYPE ${name} ${def.type}`);
      for (const [, series] of def.series as Map<string, { labels: Labels; state: CounterState | GaugeState | HistogramState }>) {
        if (def.type === "counter") {
          const state = (series as { labels: Labels; state: CounterState }).state;
          out.push(`${name}${renderLabels(series.labels)} ${state.value}`);
        } else if (def.type === "gauge") {
          const state = (series as { labels: Labels; state: GaugeState }).state;
          let value = state.value;
          if (state.sampler) {
            try {
              value = state.sampler();
            } catch {
              this.samplerErrors += 1;
              // sampler quebrado não derruba o scrape: mantém último valor
            }
          }
          out.push(`${name}${renderLabels(series.labels)} ${Number.isFinite(value) ? value : 0}`);
        } else {
          const state = (series as { labels: Labels; state: HistogramState }).state;
          // counts[i] já é cumulativo por construção (observação entra em todos
          // os buckets >= valor); renderizamos direto no formato Prometheus.
          for (let i = 0; i < state.buckets.length; i++) {
            out.push(`${name}_bucket${renderLabels(series.labels, { le: state.buckets[i] })} ${state.counts[i]}`);
          }
          out.push(`${name}_bucket${renderLabels(series.labels, { le: "+Inf" })} ${state.count}`);
          out.push(`${name}_sum${renderLabels(series.labels)} ${state.sum}`);
          out.push(`${name}_count${renderLabels(series.labels)} ${state.count}`);
        }
      }
    }
    if (this.samplerErrors > 0) {
      out.push("# HELP khaaos_metrics_sampler_errors_total Samplers de gauge que falharam no scrape");
      out.push("# TYPE khaaos_metrics_sampler_errors_total counter");
      out.push(`khaaos_metrics_sampler_errors_total ${this.samplerErrors}`);
    }
    return `${out.join("\n")}\n`;
  }

  /** Reset total (uso exclusivo de testes). */
  reset(): void {
    this.metrics.clear();
    this.samplerErrors = 0;
  }
}

const HELP_TEXT: Record<string, string> = {
  khaaos_http_requests_total: "Requisições HTTP atendidas por método/rota/status",
  khaaos_http_request_duration_seconds: "Duração de requisições HTTP (s) por método/rota",
  khaaos_http_active_connections: "Conexões HTTP ativas no momento do scrape",
  khaaos_ws_connections: "Conexões WebSocket de jogo ativas",
  khaaos_ws_rooms: "Salas de batalha vivas por status",
  khaaos_ws_relay_tunnels_active: "Túneis cross-node ativos (origem: socket do cliente aqui)",
  khaaos_ws_relay_sessions_hosted: "Sessões relay hospedadas (nó dono da sala)",
  khaaos_ws_messages_total: "Mensagens WS enviadas por direção (s2c server→client, c2s client→server)",
  khaaos_db_pool: "Pool PostgreSQL: total/idle/waiting connections",
  khaaos_db_query_duration_seconds: "Duração de queries PostgreSQL (s) pelo pool do app",
  khaaos_room_leases_total: "Renovações/aquisições de lease de sala no mesh (outcome=renewed|acquired)",
  khaaos_room_fenced_total: "Salas locais cercadas por epoch gap (outro nó assumiu no intervalo)",
  khaaos_relay_publish_total: "Publicações no transporte relay (result=ok|failed)",
  khaaos_metrics_sampler_errors_total: "Samplers de gauge que falharam no scrape",
};

export const metrics = new MetricsRegistry();
export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
