CREATE TABLE "campaign_intake_signups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"intake_id" uuid NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"campaign_day" integer NOT NULL,
	"player_id" text NOT NULL,
	"source" varchar(8) DEFAULT 'SIGNED' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_intake_signups_source_check" CHECK ("campaign_intake_signups"."source" IN ('SIGNED', 'RANDOM')),
	CONSTRAINT "campaign_intake_signups_day_check" CHECK ("campaign_intake_signups"."campaign_day" BETWEEN 1 AND 7)
);--> statement-breakpoint
CREATE TABLE "campaign_intakes" (
	"intake_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"campaign_day" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"next_check_at" timestamp with time zone NOT NULL,
	"draw_seed" varchar(128),
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_intakes_status_check" CHECK ("campaign_intakes"."status" IN ('OPEN', 'WAITING_FOR_POOL', 'CLOSED', 'CANCELLED')),
	CONSTRAINT "campaign_intakes_day_check" CHECK ("campaign_intakes"."campaign_day" BETWEEN 1 AND 7),
	CONSTRAINT "campaign_intakes_time_check" CHECK ("campaign_intakes"."closes_at" > "campaign_intakes"."opened_at"),
	CONSTRAINT "campaign_intakes_closed_at_check" CHECK (("campaign_intakes"."status" = 'CLOSED' AND "campaign_intakes"."closed_at" IS NOT NULL) OR ("campaign_intakes"."status" <> 'CLOSED' AND "campaign_intakes"."closed_at" IS NULL))
);--> statement-breakpoint
CREATE TABLE "campaign_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "campaign_outbox_status_check" CHECK ("campaign_outbox"."status" IN ('PENDING', 'DELIVERED', 'DEAD')),
	CONSTRAINT "campaign_outbox_attempts_check" CHECK ("campaign_outbox"."attempts" >= 0),
	CONSTRAINT "campaign_outbox_delivered_at_check" CHECK (("campaign_outbox"."status" = 'DELIVERED' AND "campaign_outbox"."delivered_at" IS NOT NULL) OR ("campaign_outbox"."status" <> 'DELIVERED' AND "campaign_outbox"."delivered_at" IS NULL))
);--> statement-breakpoint
CREATE TABLE "campaign_players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"player_id" text NOT NULL,
	"status" varchar(16) DEFAULT 'READY' NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"attempts_used_today" integer DEFAULT 0 NOT NULL,
	"active_match_id" varchar(128),
	"ring_protection_until" timestamp with time zone,
	"presence_expires_at" timestamp with time zone,
	"return_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_players_status_check" CHECK ("campaign_players"."status" IN ('READY', 'IN_RING', 'ELIMINATED', 'COMPLETED')),
	CONSTRAINT "campaign_players_day_check" CHECK ("campaign_players"."current_day" BETWEEN 1 AND 7),
	CONSTRAINT "campaign_players_attempts_check" CHECK ("campaign_players"."attempts_used_today" IN (0, 1)),
	CONSTRAINT "campaign_players_active_match_check" CHECK (("campaign_players"."status" = 'IN_RING' AND "campaign_players"."attempts_used_today" = 1 AND "campaign_players"."active_match_id" IS NOT NULL) OR ("campaign_players"."status" <> 'IN_RING' AND "campaign_players"."active_match_id" IS NULL))
);--> statement-breakpoint
CREATE TABLE "campaign_ring_players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ring_id" uuid NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"campaign_day" integer NOT NULL,
	"player_id" text NOT NULL,
	"source" varchar(8) NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placement" integer,
	"alive_at_finish" boolean,
	"final_health" integer,
	"account_xp" numeric,
	"battles_played" integer,
	"lifetime_kills" integer,
	"lifetime_deaths" integer,
	CONSTRAINT "campaign_ring_players_source_check" CHECK ("campaign_ring_players"."source" IN ('SIGNED', 'RANDOM')),
	CONSTRAINT "campaign_ring_players_day_check" CHECK ("campaign_ring_players"."campaign_day" BETWEEN 1 AND 7),
	CONSTRAINT "campaign_ring_players_placement_check" CHECK ("campaign_ring_players"."placement" IS NULL OR "campaign_ring_players"."placement" > 0),
	CONSTRAINT "campaign_ring_players_metrics_check" CHECK (("campaign_ring_players"."final_health" IS NULL OR "campaign_ring_players"."final_health" >= 0) AND ("campaign_ring_players"."account_xp" IS NULL OR "campaign_ring_players"."account_xp" >= 0) AND ("campaign_ring_players"."battles_played" IS NULL OR "campaign_ring_players"."battles_played" >= 0) AND ("campaign_ring_players"."lifetime_kills" IS NULL OR "campaign_ring_players"."lifetime_kills" >= 0) AND ("campaign_ring_players"."lifetime_deaths" IS NULL OR "campaign_ring_players"."lifetime_deaths" >= 0))
);--> statement-breakpoint
CREATE TABLE "campaign_rings" (
	"ring_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"campaign_day" integer NOT NULL,
	"status" varchar(16) DEFAULT 'PREPARING' NOT NULL,
	"draw_seed" varchar(128),
	"room_id" varchar(128),
	"finish_reason" varchar(16),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_rings_intake_id_unique" UNIQUE("intake_id"),
	CONSTRAINT "campaign_rings_status_check" CHECK ("campaign_rings"."status" IN ('PREPARING', 'READY', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')),
	CONSTRAINT "campaign_rings_day_check" CHECK ("campaign_rings"."campaign_day" BETWEEN 1 AND 7),
	CONSTRAINT "campaign_rings_finish_reason_check" CHECK ("campaign_rings"."finish_reason" IS NULL OR "campaign_rings"."finish_reason" IN ('LAST_SURVIVOR', 'TIME_LIMIT')),
	CONSTRAINT "campaign_rings_finish_time_check" CHECK ("campaign_rings"."finished_at" IS NULL OR ("campaign_rings"."started_at" IS NOT NULL AND "campaign_rings"."finished_at" >= "campaign_rings"."started_at"))
);--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_intake_signups_intake_player_uq" ON "campaign_intake_signups" USING btree ("intake_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_intake_signups_daily_player_uq" ON "campaign_intake_signups" USING btree ("campaign_id","campaign_day","player_id");--> statement-breakpoint
CREATE INDEX "campaign_intake_signups_campaign_idx" ON "campaign_intake_signups" USING btree ("campaign_id","campaign_day","intake_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_intakes_intake_context_uq" ON "campaign_intakes" USING btree ("intake_id","campaign_id","campaign_day");--> statement-breakpoint
CREATE INDEX "campaign_intakes_due_idx" ON "campaign_intakes" USING btree ("status","next_check_at");--> statement-breakpoint
CREATE INDEX "campaign_outbox_pending_idx" ON "campaign_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_players_campaign_player_uq" ON "campaign_players" USING btree ("campaign_id","player_id");--> statement-breakpoint
CREATE INDEX "campaign_players_roster_lookup_idx" ON "campaign_players" USING btree ("campaign_id","current_day","status","ring_protection_until");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_ring_players_ring_player_uq" ON "campaign_ring_players" USING btree ("ring_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_ring_players_campaign_day_player_uq" ON "campaign_ring_players" USING btree ("campaign_id","campaign_day","player_id");--> statement-breakpoint
CREATE INDEX "campaign_ring_players_roster_idx" ON "campaign_ring_players" USING btree ("ring_id","source","placement");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_rings_ring_context_uq" ON "campaign_rings" USING btree ("ring_id","campaign_id","campaign_day");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_rings_room_uq" ON "campaign_rings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "campaign_rings_status_idx" ON "campaign_rings" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "campaign_intake_signups" ADD CONSTRAINT "campaign_intake_signups_intake_context_fk" FOREIGN KEY ("intake_id","campaign_id","campaign_day") REFERENCES "public"."campaign_intakes"("intake_id","campaign_id","campaign_day") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_signups" ADD CONSTRAINT "campaign_intake_signups_campaign_player_fk" FOREIGN KEY ("campaign_id","player_id") REFERENCES "public"."campaign_players"("campaign_id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intakes" ADD CONSTRAINT "campaign_intakes_campaign_id_cie_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cie_campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_players" ADD CONSTRAINT "campaign_players_campaign_id_cie_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cie_campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_ring_players" ADD CONSTRAINT "campaign_ring_players_ring_context_fk" FOREIGN KEY ("ring_id","campaign_id","campaign_day") REFERENCES "public"."campaign_rings"("ring_id","campaign_id","campaign_day") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_ring_players" ADD CONSTRAINT "campaign_ring_players_campaign_player_fk" FOREIGN KEY ("campaign_id","player_id") REFERENCES "public"."campaign_players"("campaign_id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_rings" ADD CONSTRAINT "campaign_rings_intake_id_campaign_intakes_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."campaign_intakes"("intake_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_rings" ADD CONSTRAINT "campaign_rings_campaign_id_cie_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cie_campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Enforce signup window and the hard 100-player cap under the intake row lock.
CREATE FUNCTION enforce_campaign_intake_signup_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  intake_status varchar(20);
  intake_close timestamptz;
  player_status varchar(16);
  player_day integer;
  player_protected_until timestamptz;
  signup_count integer;
BEGIN
  SELECT status, closes_at INTO intake_status, intake_close
  FROM campaign_intakes
  WHERE intake_id = NEW.intake_id
    AND campaign_id = NEW.campaign_id
    AND campaign_day = NEW.campaign_day
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign intake context not found' USING ERRCODE = '23503';
  END IF;
  IF intake_status NOT IN ('OPEN', 'WAITING_FOR_POOL') THEN
    RAISE EXCEPTION 'campaign intake is not accepting roster rows' USING ERRCODE = '23514';
  END IF;
  IF NEW.source = 'SIGNED' AND (intake_status <> 'OPEN' OR clock_timestamp() >= intake_close) THEN
    RAISE EXCEPTION 'campaign signup window is closed' USING ERRCODE = '23514';
  END IF;

  SELECT status, current_day, ring_protection_until
    INTO player_status, player_day, player_protected_until
  FROM campaign_players
  WHERE campaign_id = NEW.campaign_id AND player_id = NEW.player_id
  FOR UPDATE;
  IF NOT FOUND OR player_status <> 'READY' OR player_day <> NEW.campaign_day THEN
    RAISE EXCEPTION 'campaign player is not eligible for this Ring day' USING ERRCODE = '23514';
  END IF;
  IF NEW.source = 'RANDOM' AND player_protected_until > clock_timestamp() THEN
    RAISE EXCEPTION 'protected player cannot be randomly selected' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO signup_count
  FROM campaign_intake_signups
  WHERE intake_id = NEW.intake_id;
  IF signup_count >= 100 THEN
    RAISE EXCEPTION 'campaign intake roster exceeds 100 players' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER campaign_intake_signups_cap_trg
BEFORE INSERT ON campaign_intake_signups
FOR EACH ROW EXECUTE FUNCTION enforce_campaign_intake_signup_cap();
--> statement-breakpoint
-- A regular CHECK cannot inspect another table. Deferred constraint triggers
-- validate the final roster at commit, after the transaction changes PREPARING
-- to READY and inserts all 100 ring-player rows.
CREATE FUNCTION enforce_campaign_ring_exact_roster() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_ring_id uuid;
  ring_status varchar(16);
  roster_count integer;
BEGIN
  IF TG_TABLE_NAME = 'campaign_rings' THEN
    target_ring_id := NEW.ring_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_ring_id := OLD.ring_id;
  ELSE
    target_ring_id := NEW.ring_id;
  END IF;

  SELECT status INTO ring_status
  FROM campaign_rings
  WHERE ring_id = target_ring_id;
  IF NOT FOUND OR ring_status NOT IN ('READY', 'IN_PROGRESS', 'FINISHED') THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO roster_count
  FROM campaign_ring_players
  WHERE ring_id = target_ring_id;
  IF roster_count <> 100 THEN
    RAISE EXCEPTION 'campaign Ring % must contain exactly 100 players; found %', target_ring_id, roster_count
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_rings_exact_roster_ck
AFTER INSERT OR UPDATE ON campaign_rings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_campaign_ring_exact_roster();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_ring_players_exact_roster_ck
AFTER INSERT OR UPDATE OR DELETE ON campaign_ring_players
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_campaign_ring_exact_roster();
