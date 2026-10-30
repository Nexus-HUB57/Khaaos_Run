import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL é obrigatório para a suíte PostgreSQL; aponte para um banco de teste descartável.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(testDatabaseUrl);
} catch {
  console.error("TEST_DATABASE_URL não é uma URL válida.");
  process.exit(1);
}

if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  console.error("TEST_DATABASE_URL precisa usar o protocolo postgres:// ou postgresql://.");
  process.exit(1);
}

if (!parsed.pathname.endsWith("_test")) {
  console.error("TEST_DATABASE_URL precisa apontar para um banco cujo nome termine em _test.");
  process.exit(1);
}

const integrationDir = join(process.cwd(), "tests", "integration");
const testFiles = readdirSync(integrationDir)
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => join("tests", "integration", file));

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], {
  stdio: "inherit",
  env: {
    ...process.env,
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
  },
});

if (result.error) {
  console.error(`Não foi possível iniciar a suíte PostgreSQL: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
