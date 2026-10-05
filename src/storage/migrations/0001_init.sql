CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('todo', 'doing', 'waiting', 'done')),
  built_in INTEGER NOT NULL CHECK (built_in IN (0, 1)),
  position INTEGER NOT NULL UNIQUE
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  column_id TEXT NOT NULL REFERENCES columns(id) ON UPDATE CASCADE,
  day TEXT,
  time TEXT,
  deadline TEXT,
  estimate_unit TEXT CHECK (estimate_unit IS NULL OR estimate_unit = 'workdays'),
  estimate_value INTEGER CHECK (estimate_value IS NULL OR estimate_value >= 1),
  status_kind TEXT NOT NULL CHECK (status_kind IN ('todo', 'doing', 'waiting', 'done')),
  waiting_reason TEXT,
  waiting_until TEXT,
  rolled_over_from TEXT,
  position INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status_kind = 'waiting' AND waiting_reason IS NOT NULL AND length(trim(waiting_reason)) > 0) OR (status_kind != 'waiting' AND waiting_reason IS NULL AND waiting_until IS NULL)),
  CHECK ((estimate_unit IS NULL) = (estimate_value IS NULL))
);
CREATE INDEX tasks_column_position ON tasks(column_id, position);

CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  position INTEGER NOT NULL,
  UNIQUE(task_id, position)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(task_id, position)
);
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  position INTEGER NOT NULL,
  UNIQUE(task_id, position)
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);
INSERT INTO metadata(singleton, revision) VALUES (1, 0);
INSERT INTO settings(key, value_json) VALUES ('workdays', '[1,2,3,4,5]');
INSERT INTO columns(id, name, description, state, built_in, position) VALUES
  ('todo', 'Сделать', '', 'todo', 1, 0),
  ('doing', 'Делаю', '', 'doing', 1, 1),
  ('waiting', 'Ожидание', '', 'waiting', 1, 2),
  ('done', 'Готово', '', 'done', 1, 3);
