-- Concurrency hardening: one ranking result per player/match and fenced council attempts.
-- The council persistence migration predates the current Drizzle journal on some
-- deployments, so the base tables are created defensively when absent.
CREATE TABLE IF NOT EXISTS "marshal_councils" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_id" text NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "subject" varchar(120) NOT NULL,
  "world_id" varchar(8) NOT NULL,
  "period_seconds" integer,
  "telemetry_snapshot" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'queued' NOT NULL,
  "result" jsonb,
  "error_code" varchar(64),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marshal_proposals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "council_id" uuid NOT NULL,
  "actor_id" text NOT NULL,
  "subject" varchar(120) NOT NULL,
  "governance" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marshal_proposals"
    ADD CONSTRAINT "marshal_proposals_council_id_marshal_councils_id_fk"
    FOREIGN KEY ("council_id") REFERENCES "public"."marshal_councils"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marshal_councils_actor_idempotency_uq"
  ON "marshal_councils" ("actor_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marshal_councils_actor_created_idx"
  ON "marshal_councils" ("actor_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marshal_councils_status_updated_idx"
  ON "marshal_councils" ("status", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marshal_proposals_council_subject_uq"
  ON "marshal_proposals" ("council_id", "subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marshal_proposals_actor_created_idx"
  ON "marshal_proposals" ("actor_id", "created_at");
--> statement-breakpoint
ALTER TABLE "marshal_councils"
  ADD COLUMN IF NOT EXISTS "attempt_id" uuid,
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marshal_councils_status_lease_idx"
  ON "marshal_councils" ("status", "lease_expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_results_room_user_uq"
  ON "match_results" ("room_id", "user_id");
