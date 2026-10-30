// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// DDL para modo PGlite embutido (testes). Espelha src/db/schema.ts — qualquer
// mudança de schema precisa refletir aqui (contrato testado por
// 2pc.integration.test.ts).
// Statements separados: PGlite executa um statement por query via drizzle.
// ==============================================================================

export const KHAADOS_SCHEMA_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS two_pc_transactions (
    transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key varchar(128) NOT NULL UNIQUE,
    player_id integer NOT NULL,
    amount_krc integer NOT NULL,
    item_id varchar(64),
    description varchar(256),
    coordinator_node_id varchar(64) NOT NULL,
    phase varchar(16) NOT NULL DEFAULT 'none',
    status varchar(16) NOT NULL DEFAULT 'idle',
    expiry_timestamp timestamptz,
    abort_reason varchar(512),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS krc_balances (
    player_id integer PRIMARY KEY,
    balance_krc integer NOT NULL DEFAULT 0,
    locked_krc integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS krc_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL,
    player_id integer NOT NULL,
    amount_krc integer NOT NULL,
    type varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];
