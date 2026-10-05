import type Database from 'better-sqlite3';
import type { StorageCommand } from './types';

export function executeColumnCommand(
  database: Database.Database,
  command: StorageCommand,
): void {
  switch (command.kind) {
    case 'column.create':
      database
        .prepare(
          'INSERT INTO columns(id,name,description,state,built_in,position) VALUES(?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM columns),0))',
        )
        .run(
          command.column.id,
          command.column.name,
          command.column.description,
          command.column.state,
          Number(command.column.builtIn),
        );
      return;
    case 'column.rename':
      requireChanged(
        database
          .prepare(
            'UPDATE columns SET name = ?, description = ? WHERE id = ? AND built_in = 0',
          )
          .run(command.name, command.description, command.id).changes,
        'column not found or built-in',
      );
      return;
    case 'column.delete':
      deleteColumn(database, command.id, command.targetColumnId);
      return;
    case 'setting.set':
      database
        .prepare(
          'INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json',
        )
        .run(command.key, JSON.stringify(command.value));
      return;
    default:
      throw new Error('Unsupported column command');
  }
}

function deleteColumn(
  database: Database.Database,
  id: string,
  targetId?: string,
): void {
  const column = database
    .prepare('SELECT built_in FROM columns WHERE id = ?')
    .get(id) as { built_in: number } | undefined;
  if (!column || column.built_in === 1)
    throw new Error('column not found or built-in');
  const taskCount = (
    database
      .prepare('SELECT COUNT(*) AS count FROM tasks WHERE column_id = ?')
      .get(id) as { count: number }
  ).count;
  if (taskCount > 0 && !targetId)
    throw new Error('target column required for non-empty column');
  if (targetId) {
    if (targetId === id) throw new Error('target column must be different');
    const target = database
      .prepare('SELECT state FROM columns WHERE id = ?')
      .get(targetId) as { state: string } | undefined;
    if (!target) throw new Error('target column not found');
    database
      .prepare(
        `UPDATE tasks SET column_id = ?, status_kind = ?, waiting_reason = CASE WHEN ? = 'waiting' THEN waiting_reason ELSE NULL END,
      waiting_until = CASE WHEN ? = 'waiting' THEN waiting_until ELSE NULL END, version = version + 1 WHERE column_id = ?`,
      )
      .run(targetId, target.state, target.state, target.state, id);
  }
  requireChanged(
    database.prepare('DELETE FROM columns WHERE id = ?').run(id).changes,
    'column not found',
  );
}

function requireChanged(changes: number, message: string): void {
  if (changes !== 1) throw new Error(message);
}
