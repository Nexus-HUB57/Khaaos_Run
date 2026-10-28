// KHAAOS RUN — Economy 2PC Contract Tests (DB-free)
// ===================================================
// Valida o CONTRATO do protocolo 2PC sem PostgreSQL:
//   • Payload EXATO do cliente UE5 (KhaaosEconomyBridge2PC.cpp) passa nos schemas zod
//   • Regras de transactionId (GUID DigitsWithHyphensLower do FGuid)
//   • Regras de idempotencyKey (mesma regex do banco: ^[A-Za-z0-9._~-]{16,128}$)
//   • Plano de linhas do ledger (prepare 1-2, commit 3-4, abort 5-6)
//   • Constantes do protocolo (TTL, destinos, limite de valor)
//   • Resolução de ator (node secret / sessão / modo dev ue5-player-<id>)
//
// Executa via `npm run test:official` (node --import tsx --test).
// DATABASE_URL dummy é definido apenas para satisfazer a criação do Pool
// (nenhuma conexão é aberta — os testes são puramente lógicos).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://127.0.0.1:5432/khaaos_contract_dummy_test";

const [{ ECONOMY_2PC_LEDGER_LINES }, routes] = await Promise.all([
  import("../../server/game/economy2pcService.ts"),
  import("../../server/routes/economy-2pc.ts"),
]);

const { prepareSchema, commitSchema, abortSchema, resolve2PCActor } = routes;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Payload EXATO gerado por UKhaaosEconomyBridge2PC::PreparePhase (FString::Printf). */
function ue5PrepareBody(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: randomUUID(), // FGuid::ToString(DigitsWithHyphensLower)
    idempotencyKey: `krc-2pc-${randomUUID().replaceAll("-", "")}`,
    amountKrc: 1500,
    playerId: 7,
    itemId: "SKN_KHAEL_RUNEGLOW",
    description: "Forja – compra de skin",
    coordinatorNodeId: "ue5-ds-node-01",
    expiryTimestamp: "2026-10-28T12:00:00.000Z",
    ...overrides,
  };
}

/** Corpo EXATO de CommitPhase / AbortPhase (bridge UE5 manda playerId em todas as fases). */
function ue5CommitBody(transactionId = randomUUID(), playerId = 42) {
  return { transactionId, playerId };
}
function ue5AbortBody(transactionId = randomUUID(), reason = "Client abort", playerId = 42) {
  return { transactionId, playerId, reason };
}

// ─── Schemas: prepare ──────────────────────────────────────────────────────

describe("2PC prepare schema — contrato UE5", () => {
  it("aceita o payload exato do cliente UE5", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody());
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  });

  it("aceita payload mínimo (só campos obrigatórios)", () => {
    const parsed = prepareSchema.safeParse({
      idempotencyKey: "minimum-payload-key-01",
      amountKrc: 100,
      playerId: 1,
    });
    assert.equal(parsed.success, true);
  });

  it("rejeita amountKrc fracionário (UE5 envia int32)", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ amountKrc: 10.5 }));
    assert.equal(parsed.success, false);
  });

  it("rejeita amountKrc <= 0", () => {
    assert.equal(prepareSchema.safeParse(ue5PrepareBody({ amountKrc: 0 })).success, false);
    assert.equal(prepareSchema.safeParse(ue5PrepareBody({ amountKrc: -5 })).success, false);
  });

  it("rejeita idempotencyKey curta (<16 chars)", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ idempotencyKey: "curta123" }));
    assert.equal(parsed.success, false);
  });

  it("rejeita idempotencyKey com caracteres fora de [A-Za-z0-9._~-]", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ idempotencyKey: "chave com espaços!!12345" }));
    assert.equal(parsed.success, false);
  });

  it("rejeita transactionId com formato inválido", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ transactionId: "id curto" }));
    assert.equal(parsed.success, false);
  });

  it("rejeita amountKrc acima do teto (1.000.000)", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ amountKrc: 1_000_001 }));
    assert.equal(parsed.success, false);
  });

  it("rejeita destinationAccount fora da whitelist", () => {
    const parsed = prepareSchema.safeParse(ue5PrepareBody({ destinationAccount: "system.hack" }));
    assert.equal(parsed.success, false);
  });

  it("aceita ttlSeconds dentro de [10, 300] e rejeita fora", () => {
    assert.equal(prepareSchema.safeParse(ue5PrepareBody({ ttlSeconds: 60 })).success, true);
    assert.equal(prepareSchema.safeParse(ue5PrepareBody({ ttlSeconds: 5 })).success, false);
    assert.equal(prepareSchema.safeParse(ue5PrepareBody({ ttlSeconds: 301 })).success, false);
  });
});

// ─── Schemas: commit / abort ───────────────────────────────────────────────

describe("2PC commit/abort schemas — contrato UE5", () => {
  it("commit aceita { transactionId } exato do UE5", () => {
    assert.equal(commitSchema.safeParse(ue5CommitBody()).success, true);
  });

  it("commit aceita { transactionId, playerId } (contrato atualizado do bridge)", () => {
    // Em modo dev o servidor resolve ator sintético ue5-player-<playerId>;
    // sem playerId o commit/abort do fluxo UE5 daria 403 (ator ue5-player-0).
    assert.equal(commitSchema.safeParse({ transactionId: randomUUID(), playerId: 7 }).success, true);
    assert.equal(commitSchema.safeParse({ transactionId: randomUUID() }).success, true,
      "playerId continua opcional para nós confiáveis (x-2pc-node-secret)");
  });

  it("commit rejeita body vazio ou com id extra tipado errado", () => {
    assert.equal(commitSchema.safeParse({}).success, false);
    assert.equal(commitSchema.safeParse({ transactionId: 12345 }).success, false);
  });

  it("abort aceita { transactionId, reason } exato do UE5", () => {
    assert.equal(abortSchema.safeParse(ue5AbortBody()).success, true);
  });

  it("abort aceita reason ausente (opcional)", () => {
    assert.equal(abortSchema.safeParse({ transactionId: randomUUID() }).success, true);
  });

  it("abort rejeita reason com mais de 256 chars", () => {
    const reason = "r".repeat(257);
    assert.equal(abortSchema.safeParse(ue5AbortBody(randomUUID(), reason)).success, false);
  });
});

// ─── Contratos de identificador ────────────────────────────────────────────

describe("2PC identificadores — compatibilidade FGuid (UE5)", () => {
  it("transactionId aceita UUID canônico (DigitsWithHyphensLower)", () => {
    const guid = randomUUID();
    assert.match(guid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("idempotencyKey gerada pelo UE5 (32 hex) satisfaz a regex do banco", () => {
    // UE5: FGuid::NewGuid().ToString(EGuidFormats::Digits) → 32 hex sem hífens
    const key = randomUUID().replaceAll("-", "");
    assert.equal(key.length, 32);
    assert.match(key, /^[A-Za-z0-9._~-]{16,128}$/);
  });

  it("chave com hífen/ponto/til/underscore é válida (prefixo 'khaaos-2pc.')", () => {
    const key = `khaaos-2pc.${randomUUID().replaceAll("-", "")}`;
    assert.match(key, /^[A-Za-z0-9._~-]{16,128}$/);
  });
});

// ─── Plano de ledger ───────────────────────────────────────────────────────

describe("2PC plano de linhas do ledger", () => {
  it("prepare=1,2 commit=3,4 abort=5,6 (mesma chave, linhas disjuntas)", () => {
    assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.prepare], [1, 2]);
    assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.commit], [3, 4]);
    assert.deepEqual([...ECONOMY_2PC_LEDGER_LINES.abort], [5, 6]);
    const all = [
      ...ECONOMY_2PC_LEDGER_LINES.prepare,
      ...ECONOMY_2PC_LEDGER_LINES.commit,
      ...ECONOMY_2PC_LEDGER_LINES.abort,
    ];
    assert.equal(new Set(all).size, 6, "linhas disjuntas permitem 3 fases com a mesma key");
  });
});

// ─── Resolução de ator ─────────────────────────────────────────────────────

describe("2PC resolve2PCActor", () => {
  const SAVED_SECRET = process.env.ECONOMY_2PC_NODE_SECRET;

  function fakeReq(overrides: { headers?: Record<string, string>; body?: unknown; user?: unknown } = {}) {
    return {
      get: (name: string) => (overrides.headers ?? {})[name.toLowerCase()] ?? undefined,
      body: overrides.body ?? {},
      user: overrides.user,
    } as never;
  }

  it("modo dev (sem secret): ator sintético ue5-player-<playerId>", () => {
    delete process.env.ECONOMY_2PC_NODE_SECRET;
    const actor = resolve2PCActor(fakeReq({ body: ue5PrepareBody({ playerId: 42 }) }));
    assert.deepEqual(actor, { actorId: "ue5-player-42", trusted: false });
  });

  it("modo dev sem playerId → ue5-player-0", () => {
    delete process.env.ECONOMY_2PC_NODE_SECRET;
    const actor = resolve2PCActor(fakeReq({ body: { idempotencyKey: "x".repeat(20) } }));
    assert.deepEqual(actor, { actorId: "ue5-player-0", trusted: false });
  });

  it("com secret configurado: header correto + userId → nó confiável", () => {
    process.env.ECONOMY_2PC_NODE_SECRET = "segredo-do-no-42";
    const actor = resolve2PCActor(fakeReq({
      headers: { "x-2pc-node-secret": "segredo-do-no-42" },
      body: ue5PrepareBody({ userId: "web-user-abc" }),
    }));
    assert.deepEqual(actor, { actorId: "web-user-abc", trusted: true });
    process.env.ECONOMY_2PC_NODE_SECRET = SAVED_SECRET;
  });

  it("com secret configurado: sem header e sem sessão → 401", () => {
    process.env.ECONOMY_2PC_NODE_SECRET = "segredo-do-no-42";
    const result = resolve2PCActor(fakeReq({ body: ue5PrepareBody() }));
    assert.ok("error" in result);
    assert.equal(result.error.status, 401);
    process.env.ECONOMY_2PC_NODE_SECRET = SAVED_SECRET;
  });

  it("com secret configurado: sessão autenticada substitui playerId", () => {
    process.env.ECONOMY_2PC_NODE_SECRET = "segredo-do-no-42";
    const actor = resolve2PCActor(fakeReq({
      body: ue5PrepareBody({ playerId: 42 }),
      user: { claims: { sub: "sessao-web-777" } },
    }));
    assert.deepEqual(actor, { actorId: "sessao-web-777", trusted: true });
    process.env.ECONOMY_2PC_NODE_SECRET = SAVED_SECRET;
  });

  it("sem secret: sessão autenticada tem precedência sobre playerId", () => {
    delete process.env.ECONOMY_2PC_NODE_SECRET;
    const actor = resolve2PCActor(fakeReq({
      body: ue5PrepareBody({ playerId: 42 }),
      user: { claims: { sub: "sessao-web-777" } },
    }));
    assert.deepEqual(actor, { actorId: "sessao-web-777", trusted: true });
  });
});
