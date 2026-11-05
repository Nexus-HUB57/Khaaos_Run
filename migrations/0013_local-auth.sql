-- Local email/password credentials are separated from OIDC user rows.
CREATE TABLE "local_auth_credentials" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"email_normalized" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_credentials_email_normalized_unique" UNIQUE("email_normalized")
);
--> statement-breakpoint
CREATE TABLE "local_auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "local_auth_tokens_purpose_check" CHECK ("local_auth_tokens"."purpose" IN ('verify_email', 'password_reset'))
);
--> statement-breakpoint
ALTER TABLE "local_auth_credentials" ADD CONSTRAINT "local_auth_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_auth_tokens" ADD CONSTRAINT "local_auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "local_auth_tokens_user_purpose_idx" ON "local_auth_tokens" USING btree ("user_id", "purpose", "created_at");
