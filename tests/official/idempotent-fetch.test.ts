import assert from "node:assert/strict";
import test from "node:test";

const { idempotentFetch } = await import("../../client/src/lib/queryClient");

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  get length() { return this.values.size; }
}

test("cliente reusa a chave após falha de rede e limpa depois do replay confirmado", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  const keys: Array<string | null> = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    if (calls === 1) throw new Error("network timeout");
    return new Response(JSON.stringify({ accepted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"amount":"1.23"}' };
    await assert.rejects(idempotentFetch("/api/bank/deposit", request), /network timeout/);
    assert.equal(storage.length, 1);
    const response = await idempotentFetch("/api/bank/deposit", request);
    assert.equal(response.status, 200);
    assert.equal(keys[0], keys[1]);
    assert.equal(storage.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else delete (globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage;
  }
});

test("cliente mantém a chave após 5xx ambíguo e não consome a resposta JSON", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  const keys: Array<string | null> = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    return calls === 1
      ? new Response(JSON.stringify({ message: "temporary failure" }), { status: 500 })
      : new Response(JSON.stringify({ accepted: true }), { status: 200 });
  };

  try {
    const request = { method: "POST", body: "{}" };
    const failed = await idempotentFetch("/api/player/daily-salary", request);
    assert.equal(failed.status, 500);
    assert.equal(storage.length, 1);
    const succeeded = await idempotentFetch("/api/player/daily-salary", request);
    assert.deepEqual(await succeeded.json(), { accepted: true });
    assert.equal(keys[0], keys[1]);
    assert.equal(storage.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else delete (globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage;
  }
});
