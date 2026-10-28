// KHAAOS RUN — Isolamento de banco por suíte de teste (PostgreSQL real).
//
// PROBLEMA: `node --test` roda os ARQUIVOS de teste em paralelo; todas as
// suítes oficiais de PostgreSQL compartilhavam o MESMO TEST_DATABASE_URL e
// cada uma montava/destroía o schema à sua maneira (DROPs de ledger,
// re-aplicação seletiva de migrations) — a guerra de schema quebrava
// aleatoriamente as suítes vizinhas (ex.: match-payout-2pc re-aplica a 0007,
// que perde system.2pc_escrow da união da 0008, e a suíte 2PC falha com
// "Failed query: insert into economy_ledger_entries").
//
// SOLUÇÃO: cada suíte com bootstrap próprio deriva um banco EXCLUSIVO do
// TEST_DATABASE_URL (ex.: khaaos_2pc_test → khaaos_2pc_test__match_payout_2pc)
// e conecta nele. O banco base fica para as suítes integration (que coexistem
// via advisory lock + tabela de tags). Idempotente: CREATE DATABASE só na
// primeira execução (check pg_database).
import { Client } from "pg";

export type SuiteDatabase = { databaseUrl: string; databaseName: string };

// Deriva um banco exclusivo para a suíte e conecta-se a ele.
// urlBase: TEST_DATABASE_URL (deve terminar em *_test — mesma regra das suítes).
export async function useSuiteDatabase(urlBase: string, suiteName: string): Promise<SuiteDatabase> {
  const base = new URL(urlBase);
  const dbName = decodeURIComponent(base.pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL precisa apontar para um banco *_test (recebido: ${dbName})`);
  }
  // O nome derivado PRECISA continuar terminando em "_test": as suítes revalidam
  // o sufixo como guarda anti-produção (base "khaaos_2pc_test" → "khaaos_2pc__<suite>_test").
  const rootName = dbName.replace(/_test$/, "");
  const suiteDb = `${rootName}__${suiteName.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}_test`;
  base.pathname = "/postgres";
  const admin = new Client({ connectionString: base.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [suiteDb]);
    if (exists.rowCount === 0) {
      // Identificadores não são interpoláveis — nome é derivado de whitelist.
      await admin.query(`CREATE DATABASE "${suiteDb}"`);
    }
  } finally {
    await admin.end();
  }
  const suiteUrl = new URL(urlBase);
  suiteUrl.pathname = `/${suiteDb}`;
  return { databaseUrl: suiteUrl.toString(), databaseName: suiteDb };
}
