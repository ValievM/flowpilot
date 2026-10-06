import type Database from 'better-sqlite3';
import { removeColumn, type TaskColumn } from '../domain';
import { advanceColumnGeneration } from './column-generations';
import { loadTask, type TaskRow } from './snapshot-tasks';
import { dateText } from './sql-values';
import type { StorageCommand } from './types';

export function executeColumnCommand(
  database: Database.Database,
  command: StorageCommand,
): void {
  switch (command.kind) {
    case 'column.create':
      createColumn(database, command);
      return;
    case 'column.rename':
      renameColumn(database, command);
      return;
    case 'column.delete':
      deleteColumn(database, command);
      return;
    case 'setting.set':
      database
        .prepare(
          'INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, version = settings.version + 1',
        )
        .run(command.key, JSON.stringify(command.value));
      return;
    default:
      throw new Error('Unsupported column command');
  }
}

function createColumn(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'column.create' }>,
): void {
  const version = advanceColumnGeneration(database, command.column.id);
  database
    .prepare(
      'INSERT INTO columns(id,name,description,state,built_in,position,version) VALUES(?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM columns),0),?)',
    )
    .run(
      command.column.id,
      command.column.name,
      command.column.description,
      command.column.state,
      Number(command.column.builtIn),
      version,
    );
}

function renameColumn(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'column.rename' }>,
): void {
  const column = database
    .prepare('SELECT built_in FROM columns WHERE id = ?')
    .get(command.id) as { built_in: number } | undefined;
  if (!column || column.built_in === 1)
    throw new Error('column not found or built-in');
  const version = advanceColumnGeneration(database, command.id);
  requireChanged(
    database
      .prepare(
        'UPDATE columns SET name = ?, description = ?, version = ? WHERE id = ?',
      )
      .run(command.name, command.description, version, command.id).changes,
    'column not found or built-in',
  );
}

function deleteColumn(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'column.delete' }>,
): void {
  const columnRows = database
    .prepare(
      'SELECT id,name,description,state,built_in FROM columns ORDER BY position',
    )
    .all() as {
    id: string;
    name: string;
    description: string;
    state: TaskColumn['state'];
    built_in: number;
  }[];
  const columns = columnRows.map(({ built_in, ...column }) => ({
    ...column,
    builtIn: built_in === 1,
  }));
  const taskRows = database
    .prepare('SELECT * FROM tasks WHERE column_id = ? ORDER BY position,id')
    .all(command.id) as TaskRow[];
  const tasks = taskRows.map((row) => loadTask(database, row));
  const removed = removeColumn(columns, tasks, command.id, {
    ...(command.targetColumnId
      ? { targetColumnId: command.targetColumnId }
      : {}),
    ...(command.waiting ? { waiting: command.waiting } : {}),
  });
  if (!removed.ok) throw new Error(removed.error);
  const updateTask = database.prepare(
    `UPDATE tasks SET column_id = ?, status_kind = ?, waiting_reason = ?,
      waiting_until = ?, version = version + 1 WHERE id = ?`,
  );
  for (const task of removed.tasks) {
    updateTask.run(
      task.columnId,
      task.status.kind,
      task.status.kind === 'waiting' ? task.status.reason : null,
      task.status.kind === 'waiting' ? dateText(task.status.until) : null,
      task.id,
    );
  }
  advanceColumnGeneration(database, command.id);
  requireChanged(
    database.prepare('DELETE FROM columns WHERE id = ?').run(command.id)
      .changes,
    'column not found',
  );
}

function requireChanged(changes: number, message: string): void {
  if (changes !== 1) throw new Error(message);
}
