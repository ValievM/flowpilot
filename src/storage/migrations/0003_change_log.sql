CREATE TABLE change_log (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'undo')),
  batch_id TEXT NOT NULL,
  undone_entry_id TEXT REFERENCES change_log(id)
);
CREATE INDEX change_log_revision ON change_log(revision DESC, id DESC);
CREATE TABLE change_log_entities (
  entry_id TEXT NOT NULL REFERENCES change_log(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  state_before_json TEXT,
  state_after_json TEXT,
  version_after INTEGER,
  PRIMARY KEY (entry_id, entity_kind, entity_id)
);
CREATE INDEX change_log_entity ON change_log_entities(entity_kind, entity_id);
