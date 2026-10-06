import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

export function collectOrphanAttachments(
  database: Database.Database,
  directory: string,
): number {
  const rows = database.prepare('SELECT id FROM attachments').all() as {
    id: string;
  }[];
  const recorded = new Set(rows.map(({ id }) => id));
  let removed = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && !recorded.has(entry.name)) {
      unlinkSync(join(directory, entry.name));
      removed += 1;
    }
  }
  return removed;
}
