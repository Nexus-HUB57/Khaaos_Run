CREATE TABLE "cie_campaign_players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"player_id" text NOT NULL,
	"state" varchar(16) NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"return_used" boolean DEFAULT false NOT NULL,
	"presence_expires_at" timestamp with time zone,
	"presence_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cie_campaign_players_state_check" CHECK ("cie_campaign_players"."state" IN ('SURVIVOR', 'ELIMINATED', 'COMPLETED')),
	CONSTRAINT "cie_campaign_players_day_check" CHECK ("cie_campaign_players"."current_day" BETWEEN 1 AND 7)
);
--> statement-breakpoint
CREATE TABLE "cie_campaigns" (
	"campaign_id" varchar(64) PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"rule_version" varchar(32) DEFAULT 'GDD-03A-03-v0.2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cie_campaigns_status_check" CHECK ("cie_campaigns"."status" IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "cie_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"campaign_day" integer NOT NULL,
	"status" varchar(16) DEFAULT 'ARMED' NOT NULL,
	"scheduled_trigger_at" timestamp with time zone NOT NULL,
	"retry_until_at" timestamp with time zone NOT NULL,
	"next_check_at" timestamp with time zone NOT NULL,
	"regular_rings_resolved" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"registration_closes_at" timestamp with time zone,
	"roster_locked_at" timestamp with time zone,
	"seed" varchar(128),
	"result_hash" varchar(64),
	"rule_version" varchar(32) DEFAULT 'GDD-03A-03-v0.2' NOT NULL,
	"failure_reason" varchar(64),
	"room_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cie_events_status_check" CHECK ("cie_events"."status" IN ('ARMED', 'REGISTRATION', 'LOCKED', 'IN_PROGRESS', 'RESOLVING', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "cie_events_day_check" CHECK ("cie_events"."campaign_day" BETWEEN 1 AND 6),
	CONSTRAINT "cie_events_retry_after_trigger_check" CHECK ("cie_events"."retry_until_at" >= "cie_events"."scheduled_trigger_at")
);
--> statement-breakpoint
CREATE TABLE "cie_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" varchar(160) NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" text,
	"event_type" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cie_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "cie_outbox_status_check" CHECK ("cie_outbox"."status" IN ('PENDING', 'DELIVERED', 'DEAD')),
	CONSTRAINT "cie_outbox_attempts_check" CHECK ("cie_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cie_participants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" text NOT NULL,
	"role" varchar(16) NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"presence_observed_at" timestamp with time zone,
	"placement" integer,
	"alive_at_end" boolean,
	"return_seal_at_finish" boolean DEFAULT false NOT NULL,
	"resolution" varchar(32),
	"resolved_at" timestamp with time zone,
	CONSTRAINT "cie_participants_placement_check" CHECK ("cie_participants"."placement" IS NULL OR "cie_participants"."placement" > 0),
	CONSTRAINT "cie_participants_role_check" CHECK ("cie_participants"."role" IN ('SURVIVOR', 'ELIMINATED')),
	CONSTRAINT "cie_participants_resolution_check" CHECK ("cie_participants"."resolution" IS NULL OR "cie_participants"."resolution" IN ('RETURN_NEXT_DAY', 'REMAINS_ELIMINATED', 'SURVIVOR_REMAINS_ACTIVE', 'SURVIVOR_ELIMINATED_IN_CIE'))
);
--> statement-breakpoint
ALTER TABLE "cie_campaign_players" ADD CONSTRAINT "cie_campaign_players_campaign_id_cie_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cie_campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cie_events" ADD CONSTRAINT "cie_events_campaign_id_cie_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cie_campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cie_outbox" ADD CONSTRAINT "cie_outbox_event_id_cie_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cie_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cie_participants" ADD CONSTRAINT "cie_participants_event_id_cie_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cie_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cie_campaign_players_campaign_player_uq" ON "cie_campaign_players" USING btree ("campaign_id","player_id");--> statement-breakpoint
CREATE INDEX "cie_campaign_players_presence_idx" ON "cie_campaign_players" USING btree ("campaign_id","current_day","state","presence_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cie_events_campaign_day_uq" ON "cie_events" USING btree ("campaign_id","campaign_day");--> statement-breakpoint
CREATE INDEX "cie_events_due_idx" ON "cie_events" USING btree ("status","next_check_at");--> statement-breakpoint
CREATE INDEX "cie_outbox_pending_idx" ON "cie_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cie_participants_event_player_uq" ON "cie_participants" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE INDEX "cie_participants_event_role_idx" ON "cie_participants" USING btree ("event_id","role","selected");--> statement-breakpoint