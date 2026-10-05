import type Database from 'better-sqlite3';
import type { StorageCommand } from './types';
import { advanceColumnGeneration } from './column-generations';
type EntityRef = { kind: 'task' | 'column' | 'setting'; id: string };
type Row = Record<string, string | number | null>;
export type EntitySnapshot = EntityRef & {
  state: string | null;
  version: number | null;
};
export function affectedEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] {
  if ('task' in command) return [{ kind: 'task', id: command.task.id }];
  if ('taskId' in command) return [{ kind: 'task', id: command.taskId }];
  if (command.kind === 'task.update' || command.kind === 'task.move')
    return [{ kind: 'task', id: command.id }];
  if (command.kind === 'attachment.remove')
    return attachmentOwner(database, command.attachmentId);
  if ('column' in command) return [{ kind: 'column', id: command.column.id }];
  if (command.kind === 'column.rename')
    return [{ kind: 'column', id: command.id }];
  if (command.kind === 'column.delete')
    return deletedColumnEntities(database, command.id);
  return [{ kind: 'setting', id: command.key }];
}

function attachmentOwner(database: Database.Database, id: string): EntityRef[] {
  const row = database
    .prepare('SELECT task_id FROM attachments WHERE id = ?')
    .get(id) as { task_id: string } | undefined;
  return row ? [{ kind: 'task', id: row.task_id }] : [];
}

function deletedColumnEntities(
  database: Database.Database,
  id: string,
): EntityRef[] {
  const rows = database
    .prepare('SELECT id FROM tasks WHERE column_id = ?')
    .all(id) as { id: string }[];
  return [
    { kind: 'column', id },
    ...rows.map(({ id: taskId }) => ({ kind: 'task' as const, id: taskId })),
  ];
}

export function snapshotEntity(
  database: Database.Database,
  ref: EntityRef,
): EntitySnapshot {
  if (ref.kind === 'setting') {
    const row = database
      .prepare('SELECT key,value_json,version FROM settings WHERE key = ?')
      .get(ref.id) as Row | undefined;
    return {
      ...ref,
      state: row ? JSON.stringify(row) : null,
      version: row ? Number(row.version) : null,
    };
  }
  if (ref.kind === 'column') return snapshotColumn(database, ref);
  const row = database
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(ref.id) as Row | undefined;
  if (!row) return { ...ref, state: null, version: null };
  const relations = (['subtasks', 'comments', 'attachments'] as const).map(
    (table) =>
      database
        .prepare(`SELECT * FROM ${table} WHERE task_id = ? ORDER BY position`)
        .all(ref.id) as Row[],
  );
  const version = row.version as number;
  return {
    ...ref,
    state: JSON.stringify({
      task: row,
      subtasks: relations[0],
      comments: relations[1],
      attachments: relations[2],
    }),
    version,
  };
}

function snapshotColumn(
  database: Database.Database,
  ref: EntityRef,
): EntitySnapshot {
  const row = database
    .prepare('SELECT * FROM columns WHERE id = ?')
    .get(ref.id) as Row | undefined;
  const generation = row
    ? Number(row.version)
    : ((
        database
          .prepare('SELECT generation FROM column_generations WHERE id = ?')
          .get(ref.id) as { generation: number } | undefined
      )?.generation ?? null);
  return {
    ...ref,
    state: row ? JSON.stringify(row) : null,
    version: generation,
  };
}

export function restoreEntity(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  if (snapshot.kind === 'setting') {
    database.prepare('DELETE FROM settings WHERE key = ?').run(snapshot.id);
    if (snapshot.state) {
      const row = JSON.parse(snapshot.state) as Row;
      database
        .prepare('INSERT INTO settings(key,value_json,version) VALUES(?,?,?)')
        .run(row.key, row.value_json, row.version);
    }
    return;
  }
  if (snapshot.kind === 'column') {
    restoreColumn(database, snapshot);
    return;
  }
  restoreTask(database, snapshot);
}

function restoreColumn(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  const current = database
    .prepare('SELECT id FROM columns WHERE id = ?')
    .get(snapshot.id);
  if (!snapshot.state) {
    if (current) {
      advanceColumnGeneration(database, snapshot.id);
      database.prepare('DELETE FROM columns WHERE id = ?').run(snapshot.id);
    }
    return;
  }
  const row = JSON.parse(snapshot.state) as Row;
  const version = advanceColumnGeneration(database, snapshot.id);
  if (current) {
    database
      .prepare(
        'UPDATE columns SET name = ?,description = ?,state = ?,built_in = ?,position = ?,version = ? WHERE id = ?',
      )
      .run(
        row.name,
        row.description,
        row.state,
        row.built_in,
        row.position,
        version,
        snapshot.id,
      );
    return;
  }
  const savedPosition = row.position;
  if (typeof savedPosition !== 'number')
    throw new Error('Invalid column position');
  const occupied = database
    .prepare('SELECT id FROM columns WHERE position = ?')
    .get(savedPosition);
  const position = occupied
    ? (
        database
          .prepare(
            'SELECT COALESCE(MAX(position) + 1, 0) AS position FROM columns',
          )
          .get() as { position: number }
      ).position
    : savedPosition;
  insertRow(database, 'columns', { ...row, position, version });
}

function restoreTask(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  database.prepare('DELETE FROM tasks WHERE id = ?').run(snapshot.id);
  if (!snapshot.state) return;
  const state = JSON.parse(snapshot.state) as {
    task: Row;
    subtasks: Row[];
    comments: Row[];
    attachments: Row[];
  };
  insertRow(database, 'tasks', state.task);
  for (const table of ['subtasks', 'comments', 'attachments'] as const)
    for (const row of state[table]) insertRow(database, table, row);
}

function insertRow(database: Database.Database, table: string, row: Row): void {
  const columns = Object.keys(row);
  const names = columns.join(',');
  const placeholders = columns.map(() => '?').join(',');
  database
    .prepare(`INSERT INTO ${table}(${names}) VALUES(${placeholders})`)
    .run(...columns.map((column) => row[column]));
}
