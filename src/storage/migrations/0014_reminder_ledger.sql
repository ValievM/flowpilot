CREATE TABLE reminder_ledger (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  sent_json TEXT NOT NULL,
  risks_json TEXT NOT NULL
);
