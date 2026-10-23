CREATE TABLE schedule_events (
  source_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('modeus', 'ics', 'manual')),
  title TEXT NOT NULL,
  start_utc TEXT,
  end_utc TEXT,
  time_zone TEXT NOT NULL,
  place TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  weekdays_json TEXT,
  local_start_time TEXT,
  local_end_time TEXT,
  recurrence_start TEXT,
  recurrence_end TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (source, source_key),
  CHECK (
    (source = 'manual' AND weekdays_json IS NOT NULL AND
     local_start_time IS NOT NULL AND local_end_time IS NOT NULL AND
     recurrence_start IS NOT NULL AND start_utc IS NULL AND end_utc IS NULL)
    OR
    (source != 'manual' AND weekdays_json IS NULL AND
     start_utc IS NOT NULL AND end_utc IS NOT NULL)
  )
);
CREATE TABLE schedule_snapshots (
  source TEXT PRIMARY KEY CHECK (source IN ('modeus', 'ics', 'manual')),
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  last_error TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
