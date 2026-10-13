CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"weapons_balance" numeric DEFAULT '0' NOT NULL,
	"bonus_balance" numeric DEFAULT '0' NOT NULL,
	"fbm_balance" numeric DEFAULT '0' NOT NULL,
	CONSTRAINT "bank_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "eliminations" (
	"id" serial PRIMARY KEY NOT NULL,
	"eliminated_user_id" text NOT NULL,
	"eliminated_name" text,
	"eliminator_user_id" text,
	"eliminator_name" text,
	"cause" text DEFAULT 'ZONA' NOT NULL,
	"session_id" integer,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"rarity" text DEFAULT 'COMUM' NOT NULL,
	"durability" numeric DEFAULT '100' NOT NULL,
	"max_durability" numeric DEFAULT '100' NOT NULL,
	"is_equipped" boolean DEFAULT false,
	"stats" jsonb,
	"image_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"principal" numeric NOT NULL,
	"interest" numeric NOT NULL,
	"total_due" numeric NOT NULL,
	"days_remaining" integer NOT NULL,
	"is_paid" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loot_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"rarity" text DEFAULT 'COMUM' NOT NULL,
	"pos_x" integer NOT NULL,
	"pos_y" integer NOT NULL,
	"is_picked_up" boolean DEFAULT false NOT NULL,
	"picked_up_by" text,
	"picked_up_at" timestamp,
	"stats" jsonb,
	"session_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"placement" integer NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"damage_dealt" integer DEFAULT 0 NOT NULL,
	"survived_ms" integer DEFAULT 0 NOT NULL,
	"rating_before" integer NOT NULL,
	"rating_after" integer NOT NULL,
	"xp_gained" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rank" text DEFAULT 'ZHEERS' NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"health" integer DEFAULT 100 NOT NULL,
	"max_health" integer DEFAULT 100 NOT NULL,
	"energy" integer DEFAULT 100 NOT NULL,
	"max_energy" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'VIVO' NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"last_salary_date" timestamp,
	"rating" integer DEFAULT 1000 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"top5" integer DEFAULT 0 NOT NULL,
	"season_kills" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_krc" numeric NOT NULL,
	"amount_usd" numeric,
	"description" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zone_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"current_phase" integer DEFAULT 1 NOT NULL,
	"phase_started_at" timestamp DEFAULT now() NOT NULL,
	"is_shrinking" boolean DEFAULT false NOT NULL,
	"center_x" integer DEFAULT 50 NOT NULL,
	"center_y" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");