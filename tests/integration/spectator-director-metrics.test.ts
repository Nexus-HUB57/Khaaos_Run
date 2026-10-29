/**
 * KHAAOS RUN — Fase 24 — métricas do DIRETOR no /admin (trilha TS canônica).
 * ===========================================================================
 * Fecha o circuito client→server→/admin na trilha canônica:
 *   1. puro — sanitizeDirectorReport (whitelist + clamp) e
 *      aggregateDirectorReports (soma p/ o /admin);
 *   2. PARIDADE JS↔TS — o game node roda a porta JS (server/spectator.js);
 *      vocabulário e sanitização têm que ser IDÊNTICOS nas duas trilhas
 *      (mesma lição da Fase 14: config canônica compartilhada);
 *   3. E2E WS real — SpectatorDataPipeline anexado a um http server, cliente
 *      ws mandando DIRECTOR_METRICS; agregado em getMetrics().director com
 *      last-report-wins e desconexão removendo a contribuição.
 * Runner node:test (padrão do repo — lição #128/#132: nunca vitest).
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import {
  SpectatorDataPipeline,
  DIRECTOR_CUT_REASONS,
  DIRECTOR_HAZARDS,
  DIRECTOR_WEIGHT_KEYS,
  sanitizeDirectorReport,
  aggregateDirectorReports,
  type SpectatorDirectorReport,
} from "../../server/game/SpectatorDataPipeline.ts";
import {
  DIRECTOR_CUT_REASONS as JS_REASONS,
  DIRECTOR_HAZARDS as JS_HAZARDS,
  DIRECTOR_WEIGHT_KEYS as JS_WEIGHT_KEYS,
  sanitizeDirectorReport as jsSanitize,
  sanitizeDirectorTuning as jsSanitizeTuning,
} from "../../game-runtime/server/spectator.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conecta um espectador capturando a PRIMEIRA mensagem sem corrida — o
 *  SPECTATOR_WELCOME sai no MESMO chunk do handshake (nota da Fase 14): o
 *  listener de 'message' tem que estar ligado ANTES do await de 'open'. */
async function openSpectator(port: number, query: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?${query}`);
  const firstMessage = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("timeout aguardando primeira mensagem")), 3000);
    ws.once("message", (raw) => { clearTimeout(to); resolve(JSON.parse(raw.toString())); });
  });
  await once(ws, "open");
  return { ws, firstMessage };
}

const report = (over: Partial<SpectatorDirectorReport> = {}): SpectatorDirectorReport => ({
  enabled: true,
  activeHazard: "tsunami",
  cuts: { total: 3, byReason: { "hazard-start": 2, "target-lost": 1 }, byHazard: { tsunami: 3 } },
  manual: { followSelects: 1, cycles: 2 },
  toggles: { on: 1, off: 0 },
  tuning: { margin: 30, weights: { knocked: 43, hazardDamage: 35 } }, // Fase 26
  ...over,
});

afterEach(() => { /* sockets fechados por teste */ });

describe("sanitizeDirectorReport (TS)", () => {
  it("whitelist descarta vocabulário desconhecido e clamp numérico", () => {
    const out = sanitizeDirectorReport({
      enabled: true,
      activeHazard: "lava",
      cuts: { total: 9, byReason: { "hazard-escalation": 3, inject: 42 }, byHazard: { lava: 9, meteor: 7 } },
      manual: { followSelects: -3, cycles: "x" },
      hax: true,
    });
    assert.deepEqual(out.cuts.byReason, { "hazard-escalation": 3 });
    assert.deepEqual(out.cuts.byHazard, { lava: 9 });
    assert.equal(out.manual.followSelects, 0, "negativo vira zero");
    assert.equal(out.manual.cycles, 0, "lixo vira zero");
    assert.equal((out as any).hax, undefined, "campo fora da whitelist descartado");
    assert.equal(out.cuts.total, 9);
    assert.equal(out.activeHazard, "lava");
    // Fase 26 — tuning sempre presente (zerado quando ausente do payload)
    assert.deepEqual(out.tuning, { margin: 0, weights: {} });
  });

  it("Fase 26 — tuning: margem clampada + pesos só do vocabulário canônico", () => {
    const out = sanitizeDirectorReport({
      tuning: { margin: 30.9, weights: { knocked: 43, hazardDamage: 35, infiltrated: 9 }, evil: true },
    });
    assert.equal(out.tuning.margin, 30, "margem floor");
    assert.deepEqual(out.tuning.weights, { knocked: 43, hazardDamage: 35 }, "peso fora da whitelist fora");
    const junk = sanitizeDirectorReport({ tuning: 42 });
    assert.deepEqual(junk.tuning, { margin: 0, weights: {} }, "tuning não-objeto vira zerado");
    const huge = sanitizeDirectorReport({ tuning: { margin: 2e9, weights: { knocked: "-7" } } });
    assert.equal(huge.tuning.margin, 1_000_000, "teto 1e6");
    assert.equal(huge.tuning.weights.knocked, 0, "string não numérica vira zero");
  });

  it("lixo total nunca lança — relatório zerado", () => {
    for (const junk of [null, undefined, 7, "x", [], true]) {
      const out = sanitizeDirectorReport(junk);
      assert.equal(out.cuts.total, 0);
      assert.equal(out.enabled, false);
      assert.equal(out.activeHazard, null);
    }
  });
});

describe("aggregateDirectorReports (TS)", () => {
  it("soma relatórios e ignora conexões sem relatório", () => {
    const agg = aggregateDirectorReports([
      report(),
      report({ cuts: { total: 2, byReason: { "target-lost": 2 }, byHazard: { gravity: 2 } }, manual: { followSelects: 3, cycles: 0 } }),
      null,
      undefined,
    ]);
    assert.equal(agg.reporting, 2);
    assert.equal(agg.enabled, 2);
    assert.equal(agg.cuts.total, 5);
    assert.equal(agg.cuts.byReason["hazard-start"], 2);
    assert.equal(agg.cuts.byReason["target-lost"], 3);
    assert.equal(agg.cuts.byHazard.tsunami, 3);
    assert.equal(agg.cuts.byHazard.gravity, 2);
    assert.deepEqual(agg.manual, { followSelects: 4, cycles: 2 });
    // Fase 26 — afinação é ESTADO: last report wins (não soma)
    assert.deepEqual(agg.tuning, { margin: 30, weights: { knocked: 43, hazardDamage: 35 } });
  });

  it("Fase 26 — afinação: último relatório com tuning substitui (last-wins), sem relatório → null", () => {
    const none = aggregateDirectorReports([null, undefined]);
    assert.equal(none.tuning, null);
    const a = aggregateDirectorReports([report({ tuning: { margin: 15, weights: { knocked: 33 } } }), report({ tuning: { margin: 40, weights: { lowHealth: 6 } } })]);
    assert.deepEqual(a.tuning, { margin: 40, weights: { lowHealth: 6 } }, "última plateia a falar vence");
  });

  it("vazio → agregado zerado (contrato do /admin sem plateia)", () => {
    assert.deepEqual(aggregateDirectorReports(null).reporting, 0);
    assert.deepEqual(aggregateDirectorReports([]).cuts.total, 0);
    assert.equal(aggregateDirectorReports([]).tuning, null);
  });
});

describe("paridade JS↔TS (porta do game node)", () => {
  it("vocabulário canônico idêntico nas duas trilhas", () => {
    assert.deepEqual([...DIRECTOR_CUT_REASONS], [...JS_REASONS]);
    assert.deepEqual([...DIRECTOR_HAZARDS], [...JS_HAZARDS]);
    assert.deepEqual([...DIRECTOR_WEIGHT_KEYS], [...JS_WEIGHT_KEYS], "Fase 26 — pesos canônicos");
  });

  it("sanitização byte a byte sobre payload hostil idêntico", () => {
    const hostile = {
      enabled: "yes",
      activeHazard: "meteor",
      cuts: { total: -9, byReason: { "hazard-start": 1.7, backdoor: 9 }, byHazard: { tsunami: 2e9 } },
      manual: { followSelects: "12", cycles: null },
      tuning: { margin: "x", weights: { knocked: 1e9, ghost: 1 }, prototype: {} },
      intruder: { deep: true },
    };
    assert.deepEqual(sanitizeDirectorReport(hostile), jsSanitize(hostile));
  });

  it("Fase 26 — sanitizeDirectorTuning idêntico nas duas trilhas", () => {
    for (const input of [null, 42, "x", {}, { margin: 30 }, { margin: -5, weights: { knocked: 40, evil: 1 } }, { margin: 1e9, weights: { lowHealth: "3.9" } }]) {
      const ts = (sanitizeDirectorReport({ tuning: input }) as any).tuning;
      const js = jsSanitizeTuning(input);
      assert.deepEqual(ts, js, `paridade p/ ${JSON.stringify(input)}`);
    }
  });
});

describe("SpectatorDataPipeline — DIRECTOR_METRICS end to end (WS real)", () => {
  it("agrega por conexão com last-report-wins e remoção na desconexão", async () => {
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end(); });
    const pipeline = new SpectatorDataPipeline();
    pipeline.attach(server);
    server.listen(0);
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;

    try {
      const a = await openSpectator(port, "roomId=sala-ts-a");
      assert.equal((await a.firstMessage as any).type, "SPECTATOR_WELCOME");

      a.ws.send(JSON.stringify({ type: "DIRECTOR_METRICS", metrics: report() }));
      const b = await openSpectator(port, "roomId=sala-ts-b"); // salas diferentes somam juntas
      await b.firstMessage;
      b.ws.send(JSON.stringify({
        type: "DIRECTOR_METRICS",
        metrics: report({
          cuts: { total: 1, byReason: { "hazard-start": 1 }, byHazard: { lava: 1 } },
          tuning: { margin: 40, weights: { knocked: 46, lowHealth: 6 } }, // Fase 26 — afinação própria de b
        }),
      }));
      await wait(60);

      let d = pipeline.getMetrics().director;
      assert.equal(d.reporting, 2);
      assert.equal(d.cuts.total, 4);
      assert.equal(d.cuts.byReason["hazard-start"], 3);
      // Fase 26 — afinação de b vence (foi o último a falar)
      assert.deepEqual(d.tuning, { margin: 40, weights: { knocked: 46, lowHealth: 6 } });

      // last report wins: 'a' substitui (não soma)
      a.ws.send(JSON.stringify({ type: "DIRECTOR_METRICS", metrics: report({ cuts: { total: 2, byReason: { "hazard-start": 2 }, byHazard: { tsunami: 2 } } }) }));
      await wait(60);
      d = pipeline.getMetrics().director;
      assert.equal(d.cuts.total, 3, "2 (a substituído) + 1 (b)");

      // desconexão remove a contribuição
      a.ws.close();
      await once(a.ws, "close");
      await wait(80);
      d = pipeline.getMetrics().director;
      assert.equal(d.reporting, 1);
      assert.equal(d.cuts.total, 1);
      assert.equal(d.cuts.byHazard.lava, 1);
      // afinação de b permanece (única conexão restante)
      assert.deepEqual(d.tuning, { margin: 40, weights: { knocked: 46, lowHealth: 6 } });
      b.ws.close();
      await once(b.ws, "close");
      await wait(80);
      assert.equal(pipeline.getMetrics().director.tuning, null, "sem plateia: sem afinação");

      // getMetrics() preserva o contrato completo da Fase 14 + director
      const m = pipeline.getMetrics();
      assert.equal(m.totalSpectators, 0);
      assert.deepEqual(m.limits, {
        delayMs: 10_000,
        maxSpectatorsPerRoom: 500,
        globalMaxSpectators: 5_000,
        batchIntervalMs: 200,
      });
      assert.ok(Number.isFinite(m.now));
    } finally {
      pipeline.destroy();
      server.closeAllConnections(); // sockets upgrade não são "idle" — destrói sem corrida
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("payload hostil não derruba o espectador (sanidade RBAC do WS)", async () => {
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end(); });
    const pipeline = new SpectatorDataPipeline();
    pipeline.attach(server);
    server.listen(0);
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;

    try {
      const { ws, firstMessage } = await openSpectator(port, "roomId=sala-hostil");
      assert.equal((await firstMessage as any).type, "SPECTATOR_WELCOME");
      ws.send("não-json{{{");
      ws.send(JSON.stringify({ type: "DIRECTOR_METRICS", metrics: 42 }));
      ws.send(JSON.stringify({ type: "DIRECTOR_METRICS", metrics: { cuts: { total: 7 }, unknown: 1 } }));
      await wait(60);
      const m = pipeline.getMetrics();
      assert.equal(m.totalSpectators, 1, "conexão viva");
      assert.equal(m.director.reporting, 1);
      assert.equal(m.director.cuts.total, 7);
      assert.deepEqual(m.director.cuts.byReason, {});
      ws.close();
      await once(ws, "close");
    } finally {
      pipeline.destroy();
      server.closeAllConnections(); // sockets upgrade não são "idle" — destrói sem corrida
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
