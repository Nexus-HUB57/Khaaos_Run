DROP INDEX "game_identity_provider_subject_unique";--> statement-breakpoint
ALTER TABLE "identity_link_challenges" ADD COLUMN "proof_token_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "identity_link_challenge_proof_token_hash_unique" ON "identity_link_challenges" USING btree ("proof_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "game_identity_provider_subject_unique" ON "game_identity_links" USING btree ("provider","product_id","provider_subject");