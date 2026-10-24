CREATE TABLE "game_identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" text DEFAULT 'EOS_CONNECT' NOT NULL,
	"provider_subject" text NOT NULL,
	"product_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"deployment_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_identity_provider_valid" CHECK ("game_identity_links"."provider" = 'EOS_CONNECT'),
	CONSTRAINT "game_identity_subject_not_empty" CHECK (length(trim("game_identity_links"."provider_subject")) > 0)
);
--> statement-breakpoint
CREATE TABLE "identity_link_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" text DEFAULT 'EOS_CONNECT' NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_subject" text,
	"product_id" text,
	"sandbox_id" text,
	"deployment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"proof_submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "identity_link_challenge_provider_valid" CHECK ("identity_link_challenges"."provider" = 'EOS_CONNECT'),
	CONSTRAINT "identity_link_challenge_status_valid" CHECK ("identity_link_challenges"."status" IN ('PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "identity_link_challenge_code_hash_sha256" CHECK (length("identity_link_challenges"."code_hash") = 64),
	CONSTRAINT "identity_link_challenge_candidate_required" CHECK ("identity_link_challenges"."status" <> 'AWAITING_CONFIRMATION' OR ("identity_link_challenges"."provider_subject" IS NOT NULL AND "identity_link_challenges"."product_id" IS NOT NULL AND "identity_link_challenges"."sandbox_id" IS NOT NULL AND "identity_link_challenges"."deployment_id" IS NOT NULL AND "identity_link_challenges"."proof_submitted_at" IS NOT NULL)),
	CONSTRAINT "identity_link_challenge_confirmation_timestamp" CHECK ("identity_link_challenges"."status" <> 'CONFIRMED' OR "identity_link_challenges"."confirmed_at" IS NOT NULL),
	CONSTRAINT "identity_link_challenge_expiry_after_creation" CHECK ("identity_link_challenges"."expires_at" > "identity_link_challenges"."created_at")
);
--> statement-breakpoint
ALTER TABLE "game_identity_links" ADD CONSTRAINT "game_identity_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_link_challenges" ADD CONSTRAINT "identity_link_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_identity_provider_subject_unique" ON "game_identity_links" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "game_identity_user_provider_unique" ON "game_identity_links" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_link_challenge_code_hash_unique" ON "identity_link_challenges" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "identity_link_challenge_user_created_idx" ON "identity_link_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "identity_link_challenge_status_expiry_idx" ON "identity_link_challenges" USING btree ("status","expires_at");