import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL é obrigatório para a suíte PostgreSQL; nenhum teste será executado sem um DB de teste explícito.");
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error("TEST_DATABASE_URL não é uma URL PostgreSQL válida.");
}

const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (parsedDatabaseUrl.protocol !== "postgres:" && parsedDatabaseUrl.protocol !== "postgresql:") {
  throw new Error("TEST_DATABASE_URL precisa usar o protocolo postgres:// ou postgresql://.");
}
if (!databaseName.endsWith("_test") || !allowedHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Proteção de segurança: testes PostgreSQL aceitam somente host local e database com sufixo _test.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("A suíte PostgreSQL não pode ser executada com NODE_ENV=production.");
}

// server/db.ts reads DATABASE_URL during module initialization. Set it only after
// validating the explicit test URL above; test operations use the real Drizzle pool.
process.env.DATABASE_URL = testDatabaseUrl;

const [{ DatabaseStorage }, { pool }] = await Promise.all([
  import("../../server/storage.ts"),
  import("../../server/db.ts"),
]);
const storage = new DatabaseStorage();

before(async () => {
  const result = await pool.query<{ database_name: string; server_version: string }>(
    "SELECT current_database() AS database_name, version() AS server_version",
  );
  assert.equal(result.rows[0]?.database_name, databaseName, "A conexão deve apontar ao database _test informado.");
  assert.match(result.rows[0]?.server_version ?? "", /^PostgreSQL /, "O teste exige um servidor PostgreSQL real.");
});

after(async () => {
  await pool.end();
});

function uniqueUserId() {
  return `postgres-integration-${randomUUID()}`;
}

async function cleanUserRows(userId: string) {
  // All IDs are unique to the test. Delete only rows created by this fixture;
  // never truncate shared CI data or reset global sequences.
  await pool.query("DELETE FROM items WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM transactions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM loans WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM bank_accounts WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM player_stats WHERE user_id = $1", [userId]);
}

test("PostgreSQL: player stats e bank account são inicializados e persistidos", async () => {
  const userId = uniqueUserId();
  try {
    const initialStats = await storage.getPlayerStats(userId);
    const initialBank = await storage.getBankAccount(userId);

    assert.equal(initialStats.userId, userId);
    assert.equal(initialStats.health, 100);
    assert.equal(initialStats.status, "VIVO");
    assert.equal(initialStats.rating, 1000);
    assert.equal(initialBank.userId, userId);
    assert.equal(initialBank.weaponsBalance, "0");
    assert.equal(initialBank.bonusBalance, "0");

    await storage.updatePlayerStats(userId, { health: 67, xp: 420 });
    const reloadedStats = await storage.getPlayerStats(userId);
    assert.equal(reloadedStats.health, 67, "o valor deve ser lido de volta do PostgreSQL");
    assert.equal(reloadedStats.xp, 420);
  } finally {
    await cleanUserRows(userId);
  }
});

test("PostgreSQL: item, ownership, loadout e consumo concorrente de durabilidade persistem", async () => {
  const ownerId = uniqueUserId();
  const otherUserId = uniqueUserId();
  try {
    const created = await storage.createItem({
      userId: ownerId,
      name: "Fixture PostgreSQL War’I",
      type: "UTILIDADE",
      rarity: "EPICO",
      durability: "100",
      maxDurability: "100",
      isEquipped: false,
      stats: { damage: 42, ammo: 12 },
    });

    const loaded = await storage.getItemForUser(created.id, ownerId);
    assert.equal(loaded?.name, "Fixture PostgreSQL War’I");
    assert.equal(loaded?.rarity, "EPICO");
    assert.equal(loaded?.stats?.damage, 42);
    assert.equal(await storage.getItemForUser(created.id, otherUserId), undefined, "ownership deve ser parte da query SQL");

    const equipped = await storage.setItemEquipped(created.id, ownerId, true);
    assert.equal(equipped?.isEquipped, true);
    assert.equal((await storage.getEquippedItems(ownerId)).some((item) => item.id === created.id), true);

    // Concurrent UPDATEs run against the same PostgreSQL row. The final value
    // catches lost updates that an in-memory mock cannot expose.
    const deductions = await Promise.all(
      Array.from({ length: 5 }, () => storage.consumeItemDurability(created.id, ownerId, 10)),
    );
    assert.equal(deductions.filter((item) => item?.id === created.id).length, 5);

    const persisted = await storage.getItemForUser(created.id, ownerId);
    assert.equal(Number(persisted?.durability), 50);
    assert.equal(persisted?.isEquipped, true);
  } finally {
    await cleanUserRows(ownerId);
  }
});
