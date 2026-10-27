-- =============================================================================
-- Khaaos Run — M2 DR harness: schema-base econômico (espelha 0000/drizzle)
-- Usado pelos scripts de backup/restore para montar um banco "produto"
-- sintético e descartável (prefixo dr-) em ambiente isolado.
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  weapons_balance NUMERIC NOT NULL DEFAULT 0,
  bonus_balance NUMERIC NOT NULL DEFAULT 0,
  fbm_balance NUMERIC NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_krc NUMERIC NOT NULL,
  amount_usd NUMERIC,
  description TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  principal NUMERIC NOT NULL,
  interest NUMERIC NOT NULL,
  total_due NUMERIC NOT NULL,
  days_remaining INTEGER NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'COMUM',
  durability NUMERIC NOT NULL DEFAULT 100,
  max_durability NUMERIC NOT NULL DEFAULT 100,
  is_equipped BOOLEAN DEFAULT FALSE,
  stats JSONB,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS player_stats (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  rank TEXT NOT NULL DEFAULT 'ZHEERS',
  specialization_id TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  health INTEGER NOT NULL DEFAULT 100,
  max_health INTEGER NOT NULL DEFAULT 100,
  energy INTEGER NOT NULL DEFAULT 100,
  max_energy INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'VIVO',
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  last_salary_date TIMESTAMP,
  rating INTEGER NOT NULL DEFAULT 1000,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  top5 INTEGER NOT NULL DEFAULT 0,
  season_kills INTEGER NOT NULL DEFAULT 0
);
