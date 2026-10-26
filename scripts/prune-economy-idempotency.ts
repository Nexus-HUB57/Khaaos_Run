import { Pool } from "pg";
import { IDEMPOTENCY_CLAIM_RETENTION_DAYS } from "../shared/economyPolicy";
import { pruneEconomyIdempotencyClaims } from "../server/game/economyRetention";

function parseIntegerFlag(args: string[], name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isSafeInteger(parsed)) throw new Error(`Valor inválido para --${name}`);
  return parsed;
}

const args = process.argv.slice(2);
const unsupported = args.filter((arg) =>
  arg !== "--execute" && !arg.startsWith("--retention-days=") && !arg.startsWith("--batch-size="),
);
if (unsupported.length > 0) {
  console.error(`Argumento desconhecido: ${unsupported[0]}`);
  process.exitCode = 2;
} else {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL é obrigatório para executar a política de retenção.");
    process.exitCode = 1;
  } else {
    const pool = new Pool({ connectionString, max: 2 });
    try {
      const report = await pruneEconomyIdempotencyClaims(pool, {
        retentionDays: parseIntegerFlag(args, "retention-days", IDEMPOTENCY_CLAIM_RETENTION_DAYS),
        batchSize: parseIntegerFlag(args, "batch-size", 1_000),
        execute: args.includes("--execute"),
      });
      console.log(JSON.stringify(report, null, 2));
      if (report.incompleteClaimsNotDeleted > 0 || report.successfulClaimsWithoutLedgerNotDeleted > 0) process.exitCode = 2;
    } catch (error) {
      console.error("Falha na limpeza de claims idempotentes:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
