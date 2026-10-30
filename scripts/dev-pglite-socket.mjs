#!/usr/bin/env node
// KHAAOS RUN — PGlite wire-protocol bridge (desenvolvimento local)
// ================================================================
// Expõe um PostgreSQL embarcado (PGlite WASM) via TCP no protocolo wire
// nativo do Postgres, permitindo rodar as suítes tests/integration/*.test.ts
// sem docker/psql na máquina. O CI usa postgres:16 REAL
// (.github/workflows/05-test-integration.yml — service container).
//
// Uso:
//   node scripts/dev-pglite-socket.mjs --port 54329 &
//   TEST_DATABASE_URL='postgresql://test:test@127.0.0.1:54329/khaaos_test?max=1' \
//     npm run test:postgres
//
// Notas:
//   - PGlite serve UM banco (nome "postgres"); as suítes relaxam o assert de
//     database_name quando version() reporta PGlite.
//   - `?max=1` no pool do cliente evita contenção — o wire server já serializa
//     queries entre conexões (maxConnections interno).
//   - In-memory por padrão: --data <dir> persiste em disco.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Node 24 deste ambiente: bare-specifier ESM import e o interop CJS por
// require() quebram em arquivos (funcionam apenas em -e). Solução robusta:
// resolver o pacote via require.resolve (CJS entry) e importar o build ESM
// vizinho (dist/index.js) por path absoluto — interop ESM real.
const require = createRequire(import.meta.url);

async function importPackageESM(packageName) {
  const cjsEntry = require.resolve(packageName); // <pkg>/dist/index.cjs
  const esmEntry = join(dirname(cjsEntry), "index.js"); // <pkg>/dist/index.js
  return import(pathToFileURL(esmEntry).href);
}

const pgliteModule = await importPackageESM("@electric-sql/pglite");
const socketModule = await importPackageESM("@electric-sql/pglite-socket");
const PGlite = pgliteModule.PGlite ?? pgliteModule.default?.PGlite;
const PGliteSocketServer =
  socketModule.PGLiteSocketServer ?? socketModule.default?.PGLiteSocketServer;

if (typeof PGlite !== "function" || typeof PGliteSocketServer !== "function") {
  console.error("[pglite-bridge] exports inesperados:", {
    pglite: Object.keys(pgliteModule),
    socket: Object.keys(socketModule),
  });
  process.exit(1);
}

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const port = Number(argValue("--port", "54329"));
const host = argValue("--host", "127.0.0.1");
const dataDir = argValue("--data", undefined);

const db = dataDir ? new PGlite(dataDir) : new PGlite();
const server = new PGliteSocketServer({
  db,
  port,
  host,
  maxConnections: Number(argValue("--max-connections", "4")),
});

await server.start();
const version = (await db.query("SELECT version() AS v")).rows[0]?.v ?? "unknown";
console.log(`[pglite-bridge] ${version}`);
console.log(`[pglite-bridge] wire-protocol em ${host}:${port} (database "postgres")`);

process.on("SIGINT", async () => {
  console.log("\n[pglite-bridge] encerrando...");
  try {
    await server.stop();
    await db.close();
  } finally {
    process.exit(0);
  }
});
