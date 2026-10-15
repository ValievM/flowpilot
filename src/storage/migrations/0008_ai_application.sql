ALTER TABLE tasks ADD COLUMN ai_rank INTEGER CHECK (ai_rank IS NULL OR ai_rank >= 0);

CREATE TABLE applied_operations (
  operation_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL
);
