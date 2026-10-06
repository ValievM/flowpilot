import { existsSync, readdirSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { join } from 'node:path';
import { moveToTrash, restoreFromTrash } from './attachment-trash';

export function recoverInterruptedAttachmentMoves(
  database: Database.Database,
  directory: string,
): void {
  recoverTrashedAttachments(database, directory);
  recoverInterruptedUndoFiles(database, directory);
}

function recoverTrashedAttachments(
  database: Database.Database,
  directory: string,
): void {
  const trashed = join(directory, '.trash');
  if (!existsSync(trashed)) return;
  const rows = database.prepare('SELECT id FROM attachments').all() as {
    id: string;
  }[];
  const trashedIds = new Set(readdirSync(trashed));
  for (const { id } of rows) {
    if (!trashedIds.has(id)) continue;
    if (!restoreFromTrash(directory, id))
      throw new Error(`Unable to recover attachment ${id}`);
  }
}

function recoverInterruptedUndoFiles(
  database: Database.Database,
  directory: string,
): void {
  for (const id of pendingAttachmentRemovals(database)) {
    const exists = database
      .prepare('SELECT 1 FROM attachments WHERE id = ?')
      .get(id);
    if (exists || !existsSync(join(directory, id))) continue;
    if (!moveToTrash(directory, id))
      throw new Error(`Unable to recover interrupted attachment undo ${id}`);
  }
}

function pendingAttachmentRemovals(database: Database.Database): string[] {
  const rows = database
    .prepare(
      `SELECT entities.state_before_json AS beforeState,
              entities.state_after_json AS afterState
       FROM change_log_entities AS entities
       JOIN change_log AS entries ON entries.id = entities.entry_id
       WHERE entities.entity_kind = 'task'
         AND entries.source != 'undo'
         AND NOT EXISTS (
           SELECT 1 FROM change_log AS undone
           WHERE undone.undone_entry_id = entries.id
         )`,
    )
    .all() as { beforeState: string | null; afterState: string | null }[];
  const removed = new Set<string>();
  for (const { beforeState, afterState } of rows) {
    const before = taskAttachmentIds(beforeState);
    const after = new Set(taskAttachmentIds(afterState));
    for (const id of before) if (!after.has(id)) removed.add(id);
  }
  return [...removed];
}

function taskAttachmentIds(state: string | null): string[] {
  if (!state) return [];
  const parsed = JSON.parse(state) as { attachments?: { id: string }[] };
  return parsed.attachments?.map(({ id }) => id) ?? [];
}
