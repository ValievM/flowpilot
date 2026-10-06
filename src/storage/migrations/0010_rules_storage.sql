CREATE TABLE task_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT CHECK (color IS NULL OR color IN ('study', 'health', 'personal', 'none'))
);
CREATE TABLE disciplines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT CHECK (color IS NULL OR color IN ('study', 'health', 'personal', 'none'))
);
ALTER TABLE tasks ADD COLUMN type_id TEXT REFERENCES task_types(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN discipline_id TEXT REFERENCES disciplines(id) ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX tasks_type_id ON tasks(type_id);
CREATE INDEX tasks_discipline_id ON tasks(discipline_id);
CREATE TABLE rule_documents (
  id TEXT PRIMARY KEY,
  document_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active')),
  version INTEGER NOT NULL CHECK (version >= 1),
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE rule_versions (
  rule_id TEXT NOT NULL REFERENCES rule_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  document_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (rule_id, version)
);
ALTER TABLE rule_documents ADD COLUMN active_document_json TEXT;
ALTER TABLE rule_documents ADD COLUMN active_version INTEGER;
