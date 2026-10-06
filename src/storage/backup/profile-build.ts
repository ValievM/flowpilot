import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from '../repository';
import type { Clock } from '../types';
import type { BackupData } from './schemas';

export function buildProfile(input: {
  dir: string;
  stagedDb: string;
  stagedAttachments: string;
  data: BackupData;
  clock: Clock;
  buildClock: Clock;
}): void {
  const repository = new Repository(input.stagedDb, input.buildClock);
  repository.close();
  populateDatabase(input.stagedDb, input.data, input.clock);
  mkdirSync(input.stagedAttachments, { recursive: true });
  for (const item of input.data.attachments)
    copyFileSync(
      join(input.dir, 'attachments', item.id),
      join(input.stagedAttachments, item.id),
    );
}

function populateDatabase(path: string, data: BackupData, clock: Clock): void {
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      clearProfileRows(db);
      insertRows(db, 'columns', data.columns);
      insertRows(db, 'tasks', data.tasks);
      insertRows(db, 'subtasks', data.subtasks);
      insertRows(db, 'comments', data.comments);
      insertRows(db, 'attachments', data.attachments);
      insertRows(db, 'settings', data.settings);
      db.prepare('UPDATE metadata SET revision = ? WHERE singleton = 1').run(
        data.revision + 1,
      );
      addRestoreHistory(db, data.revision + 1, clock);
    })();
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

function clearProfileRows(db: Database.Database): void {
  for (const table of [
    'subtasks',
    'comments',
    'attachments',
    'tasks',
    'columns',
    'settings',
  ] as const)
    db.prepare(`DELETE FROM ${table}`).run();
}

function addRestoreHistory(
  db: Database.Database,
  revision: number,
  clock: Clock,
): void {
  const restoredAt = clock.now();
  const id = `restore-${String(restoredAt.epochMilliseconds)}`;
  db.prepare(
    'INSERT INTO change_log(id,revision,occurred_at,source,batch_id,undone_entry_id) VALUES (?,?,?,?,?,NULL)',
  ).run(id, revision, restoredAt.toString(), 'restore', id);
}

function insertRows(
  db: Database.Database,
  table: string,
  rows: readonly Record<string, unknown>[],
): void {
  if (!rows.length) return;
  const keys = Object.keys(rows[0] ?? {});
  const insert = db.prepare(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  );
  for (const row of rows) insert.run(...keys.map((key) => row[key]));
}
