import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import type { Snapshot } from '../../../src/storage/types';
import { seedLegacyHistory } from './legacy-history';
import { migrationFiles } from './migration-files';

const ATTACHMENT_CONTENT = 'Attachment retained from the previous release';
export const LEGACY_ATTACHMENT_HASH = createHash('sha256')
  .update(ATTACHMENT_CONTENT)
  .digest('hex');

export const legacySnapshot: Snapshot = {
  columns: [
    {
      id: 'todo',
      name: 'Сделать',
      description: '',
      state: 'todo',
      builtIn: true,
    },
    {
      id: 'doing',
      name: 'Делаю',
      description: '',
      state: 'doing',
      builtIn: true,
    },
    {
      id: 'waiting',
      name: 'Ожидание',
      description: '',
      state: 'waiting',
      builtIn: true,
    },
    {
      id: 'done',
      name: 'Готово',
      description: '',
      state: 'done',
      builtIn: true,
    },
    {
      id: 'legacy-column',
      name: 'Existing work',
      description: 'Preserve this column',
      state: 'todo',
      builtIn: false,
    },
  ],
  tasks: [
    {
      id: 'legacy-task',
      title: 'Prepare migration tests',
      description: 'Keep data from the previous release.',
      status: {
        kind: 'waiting',
        reason: 'Waiting for review',
        until: Temporal.PlainDate.from('2026-10-09'),
      },
      columnId: 'waiting',
      day: Temporal.PlainDate.from('2026-10-05'),
      time: Temporal.PlainTime.from('14:45'),
      deadline: Temporal.PlainDate.from('2026-10-12'),
      estimate: { unit: 'workdays', value: 3 },
      subtasks: [
        { id: 'legacy-subtask-done', title: 'Check schema', completed: true },
        {
          id: 'legacy-subtask-open',
          title: 'Check rollback',
          completed: false,
        },
      ],
      comments: [
        { id: 'legacy-comment', text: 'Keep the existing attachment.' },
      ],
      attachments: [
        {
          id: 'legacy-attachment',
          name: 'release-notes.txt',
          mediaType: 'text/plain',
          sizeBytes: Buffer.byteLength(ATTACHMENT_CONTENT),
        },
      ],
      rolledOverFrom: Temporal.PlainDate.from('2026-10-04'),
      addedOrder: 15,
    },
  ],
  settings: { workdays: [1, 3, 5], dailyGoal: { minutes: 90 } },
  revision: 14,
};

export function createPreviousVersionDatabase(
  path: string,
  version: number,
): void {
  const database = new Database(path);
  try {
    applySchemaBefore(database, version);
    seedLegacyRows(database, path, version);
  } finally {
    database.close();
  }
}

function applySchemaBefore(database: Database.Database, version: number): void {
  for (const migration of migrationFiles) {
    if (migration.version > version) continue;
    database.exec(migration.sql);
    database.pragma(`user_version = ${String(migration.version)}`);
  }
}

function seedLegacyRows(
  database: Database.Database,
  path: string,
  version: number,
): void {
  seedColumn(database, version);
  seedTask(database);
  seedRelations(database, path, version);
  seedSettings(database);
  seedLegacyHistory(database, version);
  database
    .prepare('UPDATE metadata SET revision = ?')
    .run(legacySnapshot.revision);
}

function seedColumn(database: Database.Database, version: number): void {
  if (version >= 4) {
    database
      .prepare(
        'INSERT INTO columns(id,name,description,state,built_in,position,version) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'legacy-column',
        'Existing work',
        'Preserve this column',
        'todo',
        0,
        4,
        1,
      );
    return;
  }
  database
    .prepare(
      'INSERT INTO columns(id,name,description,state,built_in,position) VALUES(?,?,?,?,?,?)',
    )
    .run(
      'legacy-column',
      'Existing work',
      'Preserve this column',
      'todo',
      0,
      4,
    );
}

function seedTask(database: Database.Database): void {
  database
    .prepare(
      `INSERT INTO tasks(
        id,title,description,column_id,day,time,deadline,estimate_unit,
        estimate_value,status_kind,waiting_reason,waiting_until,
        rolled_over_from,position,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-task',
      'Prepare migration tests',
      'Keep data from the previous release.',
      'waiting',
      '2026-10-05',
      '14:45',
      '2026-10-12',
      'workdays',
      3,
      'waiting',
      'Waiting for review',
      '2026-10-09',
      '2026-10-04',
      15,
      '2026-10-01T09:00:00.000Z',
      '2026-10-05T12:00:00.000Z',
    );
}

function seedRelations(
  database: Database.Database,
  path: string,
  version: number,
): void {
  database
    .prepare(
      'INSERT INTO subtasks(id,task_id,title,completed,position) VALUES(?,?,?,?,?)',
    )
    .run('legacy-subtask-done', 'legacy-task', 'Check schema', 1, 0);
  database
    .prepare(
      'INSERT INTO subtasks(id,task_id,title,completed,position) VALUES(?,?,?,?,?)',
    )
    .run('legacy-subtask-open', 'legacy-task', 'Check rollback', 0, 1);
  database
    .prepare(
      'INSERT INTO comments(id,task_id,text,created_at,position) VALUES(?,?,?,?,?)',
    )
    .run(
      'legacy-comment',
      'legacy-task',
      'Keep the existing attachment.',
      '2026-10-05T11:00:00.000Z',
      0,
    );
  seedAttachment(database, path, version);
}

function seedAttachment(
  database: Database.Database,
  path: string,
  version: number,
): void {
  const attachmentDirectory = join(dirname(path), 'attachments');
  mkdirSync(attachmentDirectory, { recursive: true });
  writeFileSync(
    join(attachmentDirectory, 'legacy-attachment'),
    ATTACHMENT_CONTENT,
  );
  if (version >= 2) {
    database
      .prepare(
        'INSERT INTO attachments(id,task_id,name,media_type,size_bytes,position,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        'legacy-attachment',
        'legacy-task',
        'release-notes.txt',
        'text/plain',
        Buffer.byteLength(ATTACHMENT_CONTENT),
        0,
        LEGACY_ATTACHMENT_HASH,
        '2026-10-01T09:00:00.000Z',
      );
    return;
  }
  database
    .prepare(
      'INSERT INTO attachments(id,task_id,name,media_type,size_bytes,position) VALUES(?,?,?,?,?,?)',
    )
    .run(
      'legacy-attachment',
      'legacy-task',
      'release-notes.txt',
      'text/plain',
      Buffer.byteLength(ATTACHMENT_CONTENT),
      0,
    );
}

function seedSettings(database: Database.Database): void {
  database
    .prepare('UPDATE settings SET value_json = ? WHERE key = ?')
    .run('[1,3,5]', 'workdays');
  database
    .prepare('INSERT INTO settings(key,value_json) VALUES(?,?)')
    .run('dailyGoal', JSON.stringify({ minutes: 90 }));
}
