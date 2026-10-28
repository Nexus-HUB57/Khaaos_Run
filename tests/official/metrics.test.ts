// Khaaos Run — M3: módulo de métricas Prometheus (zero-dependency).
//
// Contratos validados:
//   1. counter: incrementa por série de labels, nunca decresce;
//   2. gauge: push pontual + sampler lido no scrape (custo zero fora dele);
//   3. histogram: buckets cumulativos, _sum e _count no formato Prometheus;
//   4. render(): cabeçalhos HELP/TYPE, labels escapadas, ordering estável;
//   5. sampler quebrado NÃO derruba o scrape (contador de erros aparece);
//   6. normalizeRoute: cardinalidade baixa (ids → :id).
import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";

import { metrics, normalizeRoute, METRICS_CONTENT_TYPE } from "../../server/game/metrics";

describe("metrics: registry Prometheus", () => {
  beforeEach(() => {
    metrics.reset();
  });

  test("counter incrementa por série e nunca decresce", () => {
    metrics.counter("khaaos_test_total", { route: "/a" });
    metrics.counter("khaaos_test_total", { route: "/a" });
    metrics.counter("khaaos_test_total", { route: "/a", method: "GET" });
    metrics.counter("khaaos_test_total", { route: "/a" }, -5); // ignorado
    const out = metrics.render();
    assert.match(out, /# TYPE khaaos_test_total counter/);
    assert.match(out, /khaaos_test_total\{route="\/a"\} 2/);
    assert.match(out, /khaaos_test_total\{method="GET",route="\/a"\} 1/);
  });

  test("gauge com sampler é lido no scrape", () => {
    let live = 7;
    metrics.gaugeSampler("khaaos_test_live", {}, () => live);
    let out = metrics.render();
    assert.match(out, /khaaos_test_live 7/);
    live = 42;
    out = metrics.render();
    assert.match(out, /khaaos_test_live 42/);
  });

  test("sampler quebrado não derruba o scrape e reporta erro", () => {
    metrics.gaugeSampler("khaaos_test_broken", {}, () => {
      throw new Error("boom");
    });
    const out = metrics.render();
    assert.match(out, /khaaos_test_broken 0/); // mantém último valor conhecido
    assert.match(out, /khaaos_metrics_sampler_errors_total 1/);
  });

  test("histogram produz buckets cumulativos, sum e count", () => {
    metrics.observe("khaaos_test_duration_seconds", 0.02, { route: "/x" });
    metrics.observe("khaaos_test_duration_seconds", 0.6, { route: "/x" });
    const out = metrics.render();
    assert.match(out, /khaaos_test_duration_seconds_bucket\{le="0\.01",route="\/x"\} 0/);
    assert.match(out, /khaaos_test_duration_seconds_bucket\{le="0\.05",route="\/x"\} 1/);
    assert.match(out, /khaaos_test_duration_seconds_bucket\{le="\+Inf",route="\/x"\} 2/);
    assert.match(out, /khaaos_test_duration_seconds_sum\{route="\/x"\} 0\.62/);
    assert.match(out, /khaaos_test_duration_seconds_count\{route="\/x"\} 2/);
  });

  test("render escapa labels e emite HELP/TYPE", () => {
    metrics.counter("khaaos_test_escape", { label: 'com "aspas" e \\ barra' });
    const out = metrics.render();
    assert.match(out, /# HELP khaaos_test_escape /);
    assert.match(out, /# TYPE khaaos_test_escape counter/);
    assert.match(out, /label="com \\"aspas\\" e \\\\ barra"/);
  });

  test("normalizeRoute colapsa ids numéricos, uuids e ids de sala", () => {
    assert.equal(normalizeRoute("/api/matches/12345"), "/api/matches/:id");
    assert.equal(
      normalizeRoute("/api/matches/550e8400-e29b-41d4-a716-446655440000"),
      "/api/matches/:id",
    );
    assert.equal(
      normalizeRoute("/api/rooms/lobby_1793136062490_12f815a821a35d04"),
      "/api/rooms/:id",
    );
    assert.equal(normalizeRoute("/api/economy/wallet"), "/api/economy/wallet");
  });

  test("content-type do endpoint é o canônico Prometheus", () => {
    assert.equal(METRICS_CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8");
  });
});
