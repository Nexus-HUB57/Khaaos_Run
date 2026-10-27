-- Fase 16: payouts de fim de partida com Two-Phase Commit persistente.
--
-- Auditoria Fase 2 — o EconomyMatchBridge calculava prêmios in-memory, mas o
-- KRC real nunca era liquidado no ledger. Este migration adiciona o livro de
-- reclamações 2PC: PREPARE reserva o prêmio (treasury → in_transit), COMMIT
-- credita a wallet do jogador, ABORT devolve à treasury. Cada fase é uma
-- operação PRÓPRIA do ledger (o trigger economy_ledger_operation_balanced é
-- deferrable por transação — fases compartilhando operation_id violariam o
-- balanço intermediário).
--
-- Idempotência: chave determinística payout.<roomId>.<userId> (formato
-- canônico 16-128 chars) — retries/concorrência convergem sem pagar duas
-- vezes (unique (room_id,user_id) + unique (user_id,idempotency_key) +
-- economy_ledger_user_key_line_unique).

ALTER TABLE economy_ledger_entries DROP CONSTRAINT IF EXISTS economy_ledger_account_valid;
--> statement-breakpoint

ALTER TABLE economy_ledger_entries ADD CONSTRAINT economy_ledger_account_valid CHECK (account_code IN (
  'wallet.weapons', 'wallet.bonus', 'wallet.fbm',
  'external.deposit', 'system.loan_receivable', 'system.loan_interest_income',
  'system.item_sales', 'system.item_repairs', 'system.salary_expense',
  'equity.opening_balance',
  'treasury.match_rewards', 'payout.in_transit'
));
--> statement-breakpoint


CREATE TABLE IF NOT EXISTS match_payout_claims (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  krc_amount NUMERIC NOT NULL,
  status TEXT NOT NULL,
  prepare_operation_id UUID NOT NULL,
  resolve_operation_id UUID,
  reason TEXT,
  prepared_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  CONSTRAINT match_payout_status_valid CHECK (status IN ('PREPARED', 'COMMITTED', 'ABORTED')),
  CONSTRAINT match_payout_amount_positive CHECK (krc_amount > 0),
  CONSTRAINT match_payout_key_format CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{16,128}$'),
  CONSTRAINT match_payout_reason_bounded CHECK (reason IS NULL OR length(reason) <= 256),
  CONSTRAINT match_payout_resolution_shape CHECK (
    (status = 'PREPARED' AND resolve_operation_id IS NULL AND resolved_at IS NULL AND reason IS NULL)
    OR
    (status IN ('COMMITTED', 'ABORTED') AND resolve_operation_id IS NOT NULL AND resolved_at IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS match_payout_room_user_unique
  ON match_payout_claims (room_id, user_id);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS match_payout_user_key_unique
  ON match_payout_claims (user_id, idempotency_key);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS match_payout_status_prepared_idx
  ON match_payout_claims (status, prepared_at);
--> statement-breakpoint


-- O valor/identidade de um payout preparado é imutável: quem reservou KRC na
-- treasury é exatamente quem vai receber (ou devolver). Correções abortam a
-- claim e preparam uma nova — nunca mutam a reserva in-flight.
CREATE OR REPLACE FUNCTION reject_match_payout_identity_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.krc_amount <> OLD.krc_amount
    OR NEW.user_id <> OLD.user_id
    OR NEW.room_id <> OLD.room_id
    OR NEW.idempotency_key <> OLD.idempotency_key THEN
    RAISE EXCEPTION 'match_payout_claims is immutable on amount/identity; abort the claim and prepare a new one'
      USING ERRCODE = '55000';
  END IF;
  -- BEFORE trigger: NULL cancelaria o UPDATE silenciosamente; prosseguir com NEW.
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER match_payout_identity_immutable
    BEFORE UPDATE ON match_payout_claims
    FOR EACH ROW EXECUTE FUNCTION reject_match_payout_identity_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
