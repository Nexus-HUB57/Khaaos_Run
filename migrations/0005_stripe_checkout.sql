-- Stripe test-mode checkout for server-priced, fixed internal KRC packs.
-- No payment or wallet mutation is enabled by this migration alone.

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_brl_minor NUMERIC(12, 0) NOT NULL,
  krc_minor_units NUMERIC(20, 0) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'created',
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  stripe_session_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMP,
  fulfilled_at TIMESTAMP,
  CONSTRAINT payment_orders_provider_valid CHECK (provider = 'stripe'),
  CONSTRAINT payment_orders_currency_brl CHECK (currency = 'brl'),
  CONSTRAINT payment_orders_status_valid CHECK (status IN ('created', 'pending', 'fulfilled', 'failed', 'expired', 'rejected')),
  CONSTRAINT payment_orders_price_positive CHECK (price_brl_minor >= 50),
  CONSTRAINT payment_orders_krc_positive CHECK (krc_minor_units > 0),
  CONSTRAINT payment_orders_request_hash_sha256 CHECK (length(request_hash) = 64)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_user_idempotency_unique
  ON payment_orders (user_id, idempotency_key);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_stripe_session_unique
  ON payment_orders (stripe_session_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON payment_orders (user_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'received',
  error_code TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  CONSTRAINT payment_webhook_events_provider_valid CHECK (provider = 'stripe'),
  CONSTRAINT payment_webhook_events_status_valid CHECK (status IN ('received', 'processed', 'ignored', 'rejected')),
  CONSTRAINT payment_webhook_events_payload_hash_sha256 CHECK (length(payload_hash) = 64)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event_unique
  ON payment_webhook_events (provider, event_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payment_webhook_events_order_idx
  ON payment_webhook_events (order_id, received_at);
