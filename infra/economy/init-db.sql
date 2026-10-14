-- Khaaos Run — Economy Database Schema
-- Copyright Nexus-HUB57. PostgreSQL 16

-- KRC Ledger (append-only, immutable)
CREATE TABLE IF NOT EXISTS krc_ledger (
    tx_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eos_id        VARCHAR(64) NOT NULL,
    tx_type       VARCHAR(32) NOT NULL CHECK (tx_type IN ('Purchase','Sale','MatchReward','Burn','Mint','Loan','Repayment')),
    amount_krc   DECIMAL(18,2) NOT NULL,
    balance_after DECIMAL(18,2) NOT NULL,
    ref_id        VARCHAR(128),
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_eos_id ON krc_ledger(eos_id);
CREATE INDEX idx_ledger_tx_type ON krc_ledger(tx_type);
CREATE INDEX idx_ledger_created ON krc_ledger(created_at DESC);
CREATE INDEX idx_ledger_eos_time ON krc_ledger(eos_id, created_at DESC);

-- Player Accounts
CREATE TABLE IF NOT EXISTS player_accounts (
    eos_id            VARCHAR(64) PRIMARY KEY,
    display_name      VARCHAR(64),
    species           VARCHAR(32),
    rank              VARCHAR(32) DEFAULT 'RECRUTA',
    krc_balance       DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (krc_balance >= 0),
    total_krc_earned  DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_krc_burned  DECIMAL(18,2) NOT NULL DEFAULT 0,
    active_loan_krc   DECIMAL(18,2) NOT NULL DEFAULT 0,
    loan_due_date     TIMESTAMPTZ,
    matches_played    INT NOT NULL DEFAULT 0,
    matches_won       INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_rank ON player_accounts(rank);
CREATE INDEX idx_accounts_species ON player_accounts(species);

-- Match Results
CREATE TABLE IF NOT EXISTS match_results (
    match_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    world         VARCHAR(32) NOT NULL,
    player_count  INT NOT NULL,
    duration_sec  INT NOT NULL,
    results       JSONB NOT NULL DEFAULT '[]',
    krc_distributed DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matches_world ON match_results(world);
CREATE INDEX idx_matches_created ON match_results(created_at DESC);

-- Audit trigger for player_accounts updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounts_updated ON player_accounts;
CREATE TRIGGER trg_accounts_updated
    BEFORE UPDATE ON player_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
