CREATE TABLE change_log_new (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'undo', 'restore')),
  batch_id TEXT NOT NULL,
  undone_entry_id TEXT REFERENCES change_log_new(id)
);
CREATE TABLE change_log_entities_new (
  entry_id TEXT NOT NULL REFERENCES change_log_new(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  state_before_json TEXT,
  state_after_json TEXT,
  version_after INTEGER,
  PRIMARY KEY (entry_id, entity_kind, entity_id)
);
INSERT INTO change_log_new(id, revision, occurred_at, source, batch_id, undone_entry_id)
SELECT id, revision, occurred_at, source, batch_id, undone_entry_id FROM change_log;
INSERT INTO change_log_entities_new(entry_id, entity_kind, entity_id, state_before_json, state_after_json, version_after)
SELECT entry_id, entity_kind, entity_id, state_before_json, state_after_json, version_after FROM change_log_entities;
DROP TABLE change_log_entities;
DROP TABLE change_log;
ALTER TABLE change_log_new RENAME TO change_log;
ALTER TABLE change_log_entities_new RENAME TO change_log_entities;
CREATE INDEX change_log_revision ON change_log(revision DESC, id DESC);
CREATE INDEX change_log_entity ON change_log_entities(entity_kind, entity_id);
