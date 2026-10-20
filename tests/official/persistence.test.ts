import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";

const [{ AuthStorage }, { users }] = await Promise.all([
  import("../../server/replit_integrations/auth/storage.ts"),
  import("../../shared/models/auth.ts"),
]);

const storedUser = {
  id: "user-test-1",
  email: "operativo@example.test",
  firstName: "Teste",
  lastName: "Persistência",
  profileImageUrl: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("persistência: getUser consulta o usuário pelo ID", async () => {
  let table: unknown;
  let condition: unknown;
  const fakeDb = {
    select: () => ({
      from: (selectedTable: unknown) => {
        table = selectedTable;
        return {
          where: async (whereCondition: unknown) => {
            condition = whereCondition;
            return [storedUser];
          },
        };
      },
    }),
  };
  const storage = new AuthStorage(fakeDb as never);

  const result = await storage.getUser(storedUser.id);

  assert.equal(table, users);
  assert.ok(condition, "a consulta deve incluir a condição de ID");
  assert.equal(result?.id, storedUser.id);
  assert.equal(result?.email, storedUser.email);
});

test("persistência: upsertUser usa conflito pela chave primária e retorna o registro salvo", async () => {
  let insertedTable: unknown;
  let insertedValues: unknown;
  let conflictOptions: { target?: unknown; set?: Record<string, unknown> } | undefined;
  const fakeDb = {
    insert: (table: unknown) => {
      insertedTable = table;
      return {
        values: (values: unknown) => {
          insertedValues = values;
          return {
            onConflictDoUpdate: (options: typeof conflictOptions) => {
              conflictOptions = options;
              return { returning: async () => [storedUser] };
            },
          };
        },
      };
    },
  };
  const storage = new AuthStorage(fakeDb as never);
  const input = {
    id: storedUser.id,
    email: storedUser.email,
    firstName: storedUser.firstName,
    lastName: storedUser.lastName,
    profileImageUrl: storedUser.profileImageUrl,
  };

  const result = await storage.upsertUser(input);

  assert.equal(insertedTable, users);
  assert.deepEqual(insertedValues, input);
  assert.equal(conflictOptions?.target, users.id);
  assert.deepEqual(conflictOptions?.set && Object.keys(conflictOptions.set).sort(), [
    "email", "firstName", "id", "lastName", "profileImageUrl", "updatedAt",
  ]);
  assert.ok(conflictOptions?.set?.updatedAt instanceof Date);
  assert.equal(result.id, storedUser.id);
});
