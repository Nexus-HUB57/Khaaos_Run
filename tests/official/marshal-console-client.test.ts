import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";

const {
  checkMarshalConsoleAccess,
  createMarshalCouncil,
  fetchMarshalNarrativeEvents,
  fetchMarshalCouncil,
  fetchMarshalOverview,
  fetchMarshalProposal,
  marshalTelemetryStreamUrl,
} = await import("../../client/src/lib/marshal-console-api.ts");
const [{ registerMarshalConsoleRoutes, MarshalConsoleStore }, { MemoryMarshalConsoleRepository }] = await Promise.all([
  import("../../server/game/marshalConsole.ts"),
  import("./helpers/marshalConsoleMemoryRepository.ts"),
]);
const { default: MarshalConsolePage } = await import("../../client/src/pages/marshal-console.tsx");

const app = (await import("express")).default();
app.use((await import("express")).default.json({ limit: "20kb" }));
let actorId = "console-admin";
app.use((req, _res, next) => {
  const testActor = req.get("x-test-user-id") ?? actorId;
  (req as any).isAuthenticated = () => Boolean(testActor);
  if (testActor) {
    (req as any).user = {
      claims: { sub: testActor },
      expires_at: Math.floor(Date.now() / 1000) + 60,
    };
  }
  next();
});
registerMarshalConsoleRoutes(app, {
  operatorIds: "console-admin",
  store: new MarshalConsoleStore(new MemoryMarshalConsoleRepository()),
});

const { createServer } = await import("node:http");
const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not determine test server address");
const baseUrl = `http://127.0.0.1:${address.port}`;
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const requestUrl = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : String(input);
  const headers = new Headers(init.headers);
  headers.set("x-test-user-id", actorId);
  if (init.method?.toUpperCase() === "POST") headers.set("origin", baseUrl);
  return originalFetch(new URL(requestUrl, baseUrl), { ...init, headers });
}) as typeof fetch;

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("cliente do console completa overview → conselho assíncrono → proposta pela API HTTP real", async () => {
  actorId = "console-admin";
  assert.equal(await checkMarshalConsoleAccess(), true);

  const overview = await fetchMarshalOverview("W2");
  assert.equal(overview.worldId, "W2");
  assert.equal(overview.name, "Priadus");
  assert.equal(overview.stale, false);
  assert.equal(overview.occupancy.current, 0);
  assert.equal(marshalTelemetryStreamUrl("W2"), "/api/console/v1/marshal/telemetry/stream?worldId=W2");
  const narrative = await fetchMarshalNarrativeEvents("W2");
  assert.equal(narrative.source, "server-runtime-telemetry");
  assert.deepEqual(narrative.events, []);
  assert.equal(narrative.policy.executable, false);

  const submitted = await createMarshalCouncil({
    subject: "revisar-janela-de-entrada",
    scope: { worldId: "W2", periodSeconds: 3600 },
  }, "00000000-0000-4000-8000-000000000021");
  assert.match(submitted.resourcePath, /^\/api\/console\/v1\/marshal\/councils\/[0-9a-f-]{36}$/i);

  let result = submitted.council;
  for (let attempt = 0; attempt < 50 && (result.status === "queued" || result.status === "running"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = await fetchMarshalCouncil(submitted.resourcePath);
  }
  assert.equal(result.status, "complete");
  assert.equal(result.agents?.length, 3);
  assert.equal(result.governance?.[0]?.executable, false);
  assert.ok(result.proposalIds?.length);

  const proposal = await fetchMarshalProposal(result.proposalIds![0]);
  assert.equal(proposal.councilRequestId, result.requestId);
  assert.equal(proposal.executable, false);
});

test("preflight do menu esconde o console de uma sessão fora da allowlist", async () => {
  actorId = "ordinary-player";
  assert.equal(await checkMarshalConsoleAccess(), false);
  actorId = "console-admin";
});

test("página comunica telemetria ausente e não oferece aprovação ou execução", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["marshal-console-overview", "CIGKV"], {
    worldId: "CIGKV",
    name: "Khaaos Ville",
    operationalState: "idle",
    occupancy: { current: 0, capacity: 0, percent: null },
    activeRooms: 0,
    queueCount: 0,
    queueP95Seconds: null,
    networkLatencyP95Ms: null,
    networkLatencySampleCount: 0,
    networkLatencyTelemetryAvailable: false,
    networkLatencyObservedAt: null,
    activeIncidents: null,
    incidentTelemetryAvailable: false,
    configRevision: null,
    observedAt: "2026-10-15T00:00:00.000Z",
    stale: false,
  });
  const markup = renderToStaticMarkup(createElement(
    QueryClientProvider,
    { client },
    createElement(MarshalConsolePage),
  ));
  assert.match(markup, /CONSOLE DO MARECHAL/);
  assert.match(markup, /SNAPSHOT DO RUNTIME/);
  assert.match(markup, /Sem telemetria/);
  assert.match(markup, /RTT P95/);
  assert.match(markup, /Aguardando amostras/);
  assert.match(markup, /marshal-telemetry-trends/);
  assert.match(markup, /Tendência OCUPAÇÃO/);
  assert.match(markup, /Tendência RTT P95/);
  assert.match(markup, /SINAIS NARRATIVOS/);
  assert.match(markup, /Propostas exigem revisão humana/);
  assert.doesNotMatch(markup, /VOLATILIDADE DE MERCADO|INCIDENTES ATIVOS|OCUPAÇÃO \(%\)/);
  assert.doesNotMatch(markup, /APROVAR PROPOSTA|EXECUTAR PROPOSTA/i);
  client.clear();
});
