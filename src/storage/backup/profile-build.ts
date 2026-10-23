import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from '../repository';
import type { Clock } from '../types';
import { copyPackageFile } from './package-files';
import type { BackupData } from './schemas';

export function buildProfile(input: {
  dir: string;
  stagedDb: string;
  stagedAttachments: string;
  data: BackupData;
  buildClock: Clock;
  restoredAt: string;
  backupPath: string | undefined;
}): void {
  const repository = new Repository(input.stagedDb, input.buildClock);
  repository.close();
  populateDatabase(
    input.stagedDb,
    input.data,
    input.restoredAt,
    input.backupPath,
  );
  mkdirSync(input.stagedAttachments, { recursive: true });
  for (const item of input.data.attachments)
    copyPackageFile(
      input.dir,
      `attachments/${item.id}`,
      join(input.stagedAttachments, item.id),
      {
        sizeBytes: item.size_bytes,
        sha256: item.sha256,
      },
    );
}

function populateDatabase(
  path: string,
  data: BackupData,
  restoredAt: string,
  backupPath: string | undefined,
): void {
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      clearProfileRows(db);
      insertRows(db, 'columns', data.columns);
      insertRows(db, 'task_types', data.task_types);
      insertRows(db, 'disciplines', data.disciplines);
      insertRows(db, 'tasks', data.tasks);
      insertRows(db, 'subtasks', data.subtasks);
      insertRows(db, 'comments', data.comments);
      insertRows(db, 'attachments', data.attachments);
      insertRows(db, 'settings', data.settings);
      insertRows(db, 'rule_documents', data.rules);
      insertRows(db, 'rule_versions', data.rule_versions);
      insertRows(db, 'series', data.series ?? []);
      insertRows(db, 'series_outcomes', data.outcomes ?? []);
      if (hasTable(db, 'schedule_events'))
        insertRows(db, 'schedule_events', data.schedule_events ?? []);
      if (hasTable(db, 'schedule_snapshots'))
        insertRows(db, 'schedule_snapshots', data.schedule_snapshots ?? []);
      db.prepare('UPDATE metadata SET revision = ? WHERE singleton = 1').run(
        data.revision + 1,
      );
      addRestoreHistory(db, data.revision + 1, restoredAt, backupPath);
    })();
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

function clearProfileRows(db: Database.Database): void {
  for (const table of [
    'rule_versions',
    'rule_documents',
    'series_outcomes',
    'series',
    'subtasks',
    'comments',
    'attachments',
    'tasks',
    'task_types',
    'disciplines',
    'columns',
    'settings',
    ...(hasTable(db, 'schedule_events') ? ['schedule_events'] : []),
    ...(hasTable(db, 'schedule_snapshots') ? ['schedule_snapshots'] : []),
  ] as const)
    db.prepare(`DELETE FROM ${table}`).run();
}

function hasTable(db: Database.Database, table: string): boolean {
  return (
    db
      .prepare(
        'SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ?',
      )
      .get('table', table) !== undefined
  );
}
function addRestoreHistory(
  db: Database.Database,
  revision: number,
  restoredAt: string,
  backupPath: string | undefined,
): void {
  const id = `restore-${String(Date.parse(restoredAt))}`;
  db.prepare(
    'INSERT INTO change_log(id,revision,occurred_at,source,batch_id,undone_entry_id) VALUES (?,?,?,?,?,NULL)',
  ).run(id, revision, restoredAt, 'restore', backupPath ?? '');
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
