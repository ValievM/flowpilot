import type Database from 'better-sqlite3';
import type { StorageCommand } from './types';
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
      .prepare('SELECT key,value_json FROM settings WHERE key = ?')
      .get(ref.id) as Row | undefined;
    return { ...ref, state: row ? JSON.stringify(row) : null, version: null };
  }
  if (ref.kind === 'column') {
    const row = database
      .prepare('SELECT * FROM columns WHERE id = ?')
      .get(ref.id) as Row | undefined;
    return { ...ref, state: row ? JSON.stringify(row) : null, version: null };
  }
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

export function restoreEntity(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  if (snapshot.kind === 'setting') {
    database.prepare('DELETE FROM settings WHERE key = ?').run(snapshot.id);
    if (snapshot.state) {
      const row = JSON.parse(snapshot.state) as Row;
      database
        .prepare('INSERT INTO settings(key,value_json) VALUES(?,?)')
        .run(row.key, row.value_json);
    }
    return;
  }
  if (snapshot.kind === 'column') {
    database.prepare('DELETE FROM columns WHERE id = ?').run(snapshot.id);
    if (snapshot.state)
      insertRow(database, 'columns', JSON.parse(snapshot.state) as Row);
    return;
  }
  restoreTask(database, snapshot);
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
