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

test("PostgreSQL: pickup de curativo confirma loot, inventário e cura em uma transação", async () => {
  const userId = uniqueUserId();
  const rollbackUserId = `rollback-probe-user-${randomUUID()}`;
  const successLootName = `Atomic pickup medkit ${randomUUID()}`;
  const rollbackLootName = `Rollback pickup medkit ${randomUUID()}`;
  let successLootId: number | undefined;
  let rollbackLootId: number | undefined;

  try {
    await storage.getPlayerStats(userId);
    await storage.updatePlayerStats(userId, { health: 40 });
    const successLoot = await pool.query<{ id: number }>(
      `INSERT INTO loot_items (name, type, rarity, pos_x, pos_y, stats)
       VALUES ($1, 'CURATIVO', 'COMUM', 30, 40, $2::jsonb) RETURNING id`,
      [successLootName, JSON.stringify({ heal: 25 })],
    );
    successLootId = successLoot.rows[0].id;

    const picked = await storage.pickupLoot(successLootId, userId);
    assert.equal(picked.loot.isPickedUp, true);
    assert.equal(picked.loot.pickedUpBy, userId);
    assert.equal(picked.item.userId, userId);
    assert.equal(picked.item.name, successLootName);
    const healed = await pool.query<{ health: number }>(
      "SELECT health FROM player_stats WHERE user_id = $1",
      [userId],
    );
    assert.equal(healed.rows[0].health, 65);

    await storage.getPlayerStats(rollbackUserId);
    await storage.updatePlayerStats(rollbackUserId, { health: 20 });
    const rollbackLoot = await pool.query<{ id: number }>(
      `INSERT INTO loot_items (name, type, rarity, pos_x, pos_y, stats)
       VALUES ($1, 'CURATIVO', 'COMUM', 50, 50, $2::jsonb) RETURNING id`,
      [rollbackLootName, JSON.stringify({ heal: 25 })],
    );
    rollbackLootId = rollbackLoot.rows[0].id;

    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_test_pickup_heal() RETURNS trigger AS $$
      BEGIN
        IF NEW.user_id LIKE 'rollback-probe-user-%' AND NEW.health > OLD.health THEN
          RAISE EXCEPTION 'injected pickup heal failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query("DROP TRIGGER IF EXISTS reject_test_pickup_heal ON player_stats");
    await pool.query(`
      CREATE TRIGGER reject_test_pickup_heal
      BEFORE UPDATE OF health ON player_stats
      FOR EACH ROW EXECUTE FUNCTION reject_test_pickup_heal()
    `);

    await assert.rejects(
      storage.pickupLoot(rollbackLootId, rollbackUserId),
      (error: any) => /injected pickup heal failure/.test(`${error?.message ?? ""} ${error?.cause?.message ?? ""}`),
    );
    const rolledBackLoot = await pool.query<{ is_picked_up: boolean; picked_up_by: string | null }>(
      "SELECT is_picked_up, picked_up_by FROM loot_items WHERE id = $1",
      [rollbackLootId],
    );
    assert.equal(rolledBackLoot.rows[0].is_picked_up, false, "o claim deve voltar atrás quando a cura falha");
    assert.equal(rolledBackLoot.rows[0].picked_up_by, null);
    const rolledBackItems = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM items WHERE user_id = $1 AND name = $2",
      [rollbackUserId, rollbackLootName],
    );
    assert.equal(rolledBackItems.rows[0].count, 0, "o inventário não pode manter item de um pickup revertido");
    const unchangedHealth = await pool.query<{ health: number }>(
      "SELECT health FROM player_stats WHERE user_id = $1",
      [rollbackUserId],
    );
    assert.equal(unchangedHealth.rows[0].health, 20, "a falha não pode deixar cura parcial");
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS reject_test_pickup_heal ON player_stats");
    await pool.query("DROP FUNCTION IF EXISTS reject_test_pickup_heal()");
    if (successLootId !== undefined) await pool.query("DELETE FROM loot_items WHERE id = $1", [successLootId]);
    if (rollbackLootId !== undefined) await pool.query("DELETE FROM loot_items WHERE id = $1", [rollbackLootId]);
    await cleanUserRows(userId);
    await cleanUserRows(rollbackUserId);
  }
});
