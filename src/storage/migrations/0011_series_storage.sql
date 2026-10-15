CREATE TABLE series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  description TEXT,
  weekdays_json TEXT NOT NULL,
  time TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE series_outcomes (
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('done', 'skipped', 'dismissed', 'rescheduled')),
  new_date TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  new_time TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(series_id, date),
  CHECK(
    (kind = 'rescheduled' AND new_date IS NOT NULL AND new_time IS NOT NULL)
    OR (kind <> 'rescheduled' AND new_date IS NULL AND new_time IS NULL)
  )
);
