-- Comments created before the tracked timestamp are unknown, not invented:
-- created_at becomes nullable so legacy imports can store NULL.
CREATE TABLE comments_with_nullable_created_at (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT,
  position INTEGER NOT NULL,
  UNIQUE(task_id, position)
);
INSERT INTO comments_with_nullable_created_at(id, task_id, text, created_at, position)
SELECT id, task_id, text, created_at, position FROM comments;
DROP TABLE comments;
ALTER TABLE comments_with_nullable_created_at RENAME TO comments;
