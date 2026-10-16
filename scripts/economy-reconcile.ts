import { Pool } from "pg";
import { createEconomyAuditReport } from "../server/game/economyAudit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL é obrigatório para gerar o relatório econômico.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, max: 2 });
  try {
    const report = await createEconomyAuditReport(pool);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "clean") process.exitCode = 2;
  } catch (error) {
    console.error("Falha ao executar a auditoria econômica:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
