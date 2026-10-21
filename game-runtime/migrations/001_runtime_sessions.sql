CREATE TABLE IF NOT EXISTS runtime_sessions (
  resume_token TEXT PRIMARY KEY,
  session JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_sessions_expires_at_idx
  ON runtime_sessions (expires_at);
