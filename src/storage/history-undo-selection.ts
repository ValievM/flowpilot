import type Database from 'better-sqlite3';

export type UndoLogRow = {
  id: string;
  revision: number;
  occurred_at: string;
  source: string;
  batch_id: string | null;
  undone_entry_id: string | null;
};

export function findUndoEntry(
  database: Database.Database,
  entryId: string | undefined,
): UndoLogRow | undefined {
  const row =
    entryId !== undefined
      ? database
          .prepare(
            'SELECT id,revision,occurred_at,source,batch_id,undone_entry_id FROM change_log WHERE id = ?',
          )
          .get(entryId)
      : database
          .prepare(
            `SELECT id,revision,occurred_at,source,batch_id,undone_entry_id
             FROM change_log
             WHERE source != 'undo' AND undone_entry_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM change_log AS undo
                 WHERE undo.undone_entry_id = change_log.id
               )
             ORDER BY revision DESC LIMIT 1`,
          )
          .get();
  return row as UndoLogRow | undefined;
}
