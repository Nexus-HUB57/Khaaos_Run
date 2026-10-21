import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = (name: string) => new URL(`../../migrations/${name}`, import.meta.url);

for (const [name, requiredSnippets] of [
  ["0002_economy_idempotency.sql", ["CREATE TABLE IF NOT EXISTS economy_idempotency", "economy_idempotency_user_key_unique"]],
  ["0003_economy_invariants.sql", ["bank_weapons_nonnegative", "loans_is_paid_present", "items_durability_within_maximum"]],
  ["0004_correlated_append_only_ledger.sql", ["economy_ledger_entries", "economy_ledger_no_row_mutation", "economy_ledger_operation_balanced"]],
  ["0005_optimal_steel_serpent.sql", ["economy_idem_key_format", "economy_ledger_key_format"]],
] as const) {
  test(`${name} mantém os gates econômicos declarados`, async () => {
    const sql = await readFile(migration(name), "utf8");
    for (const snippet of requiredSnippets) assert.match(sql, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

test("migrations econômicas permanecem ordenadas e o boot não as executa implicitamente", async () => {
  const journal = JSON.parse(await readFile(new URL("../../migrations/meta/_journal.json", import.meta.url), "utf8"));
  assert.deepEqual(journal.entries.slice(-4).map((entry: { tag: string }) => entry.tag), [
    "0002_economy_idempotency",
    "0003_economy_invariants",
    "0004_correlated_append_only_ledger",
    "0005_optimal_steel_serpent",
  ]);
  const indexSource = await readFile(new URL("../../server/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(indexSource, /drizzle-kit migrate|db\.migrate/);
});
