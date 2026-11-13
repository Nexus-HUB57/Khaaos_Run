ALTER TABLE "campaign_ring_players" ADD COLUMN IF NOT EXISTS "random_tie_break" bigint;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaign_ring_players_tiebreak_check'
      AND conrelid = 'campaign_ring_players'::regclass
  ) THEN
    ALTER TABLE "campaign_ring_players"
      ADD CONSTRAINT "campaign_ring_players_tiebreak_check"
      CHECK ("random_tie_break" IS NULL OR "random_tie_break" BETWEEN 0 AND 4294967295);
  END IF;
END $$;
