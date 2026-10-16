-- Priority 0.2: persist idempotency claims and exact JSON responses for economic mutations.
-- Apply through the repository's reviewed schema deployment process before enabling the new routes.
CREATE TABLE IF NOT EXISTS economy_idempotency (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint


CREATE UNIQUE INDEX IF NOT EXISTS economy_idempotency_user_key_unique
  ON economy_idempotency (user_id, idempotency_key);
--> statement-breakpoint


CREATE INDEX IF NOT EXISTS economy_idempotency_created_at_idx
  ON economy_idempotency (created_at);
