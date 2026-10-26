-- Khaaos Run — ledger de economia virtual (KRC), dupla entrada append-only.
--
-- Cada lançamento move `amount` (inteiro positivo) de `debit_account` para
-- `credit_account`. Saldo de uma conta = Σ créditos − Σ débitos. A
-- conservação é estrutural: todo débito tem crédito de mesmo valor.
-- `idempotency_key` único garante efeito único sob retry/concorrência.
CREATE TABLE IF NOT EXISTS economy_entries (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_type TEXT NOT NULL,
  debit_account TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  reason TEXT,
  idempotency_key TEXT UNIQUE,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS economy_entries_debit_idx ON economy_entries (debit_account, id);
CREATE INDEX IF NOT EXISTS economy_entries_credit_idx ON economy_entries (credit_account, id);
CREATE INDEX IF NOT EXISTS economy_entries_grant_idx ON economy_entries (entry_type, credit_account, at);
