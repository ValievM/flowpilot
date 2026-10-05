import type Database from 'better-sqlite3';
import type {
  AttachmentMetadata,
  TaskComment,
  TaskStatus,
  Subtask,
} from '../domain';
import type { StorageCommand } from './types';
import { dateText } from './sql-values';

export function moveTask(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'task.move' }>,
  now: string,
): void {
  const target = database
    .prepare('SELECT state FROM columns WHERE id = ?')
    .get(command.columnId) as { state: TaskStatus['kind'] } | undefined;
  if (!target) throw new Error('column not found');
  const status = command.status ?? { kind: target.state };
  if (status.kind !== target.state)
    throw new Error('task status must match target column');
  const reason =
    status.kind === 'waiting' && 'reason' in status ? status.reason : null;
  const until =
    status.kind === 'waiting' && 'until' in status
      ? dateText(status.until)
      : null;
  const changed = database
    .prepare(
      'UPDATE tasks SET column_id = ?, status_kind = ?, waiting_reason = ?, waiting_until = ?, version = version + 1, updated_at = ? WHERE id = ?',
    )
    .run(command.columnId, status.kind, reason, until, now, command.id).changes;
  requireChanged(changed, 'task not found');
}

export function addSubtask(
  database: Database.Database,
  taskId: string,
  subtask: Subtask,
  now: string,
): void {
  database
    .prepare(
      'INSERT INTO subtasks(id, task_id, title, completed, position) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM subtasks WHERE task_id = ?), 0))',
    )
    .run(subtask.id, taskId, subtask.title, Number(subtask.completed), taskId);
  touchTask(database, taskId, now);
}

export function completeSubtask(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'subtask.complete' }>,
  now: string,
): void {
  const changed = database
    .prepare('UPDATE subtasks SET completed = ? WHERE id = ? AND task_id = ?')
    .run(Number(command.completed), command.subtaskId, command.taskId).changes;
  requireChanged(changed, 'subtask not found');
  touchTask(database, command.taskId, now);
}

export function addComment(
  database: Database.Database,
  taskId: string,
  comment: TaskComment,
  now: string,
): void {
  assertTask(database, taskId);
  database
    .prepare(
      'INSERT INTO comments(id, task_id, text, created_at, position) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM comments WHERE task_id = ?), 0))',
    )
    .run(comment.id, taskId, comment.text, now, taskId);
  touchTask(database, taskId, now);
}

export function addAttachment(
  database: Database.Database,
  taskId: string,
  attachment: AttachmentMetadata,
  now: string,
): void {
  assertTask(database, taskId);
  database
    .prepare(
      'INSERT INTO attachments(id, task_id, name, media_type, size_bytes, position) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM attachments WHERE task_id = ?), 0))',
    )
    .run(
      attachment.id,
      taskId,
      attachment.name,
      attachment.mediaType,
      attachment.sizeBytes,
      taskId,
    );
  touchTask(database, taskId, now);
}

function assertTask(database: Database.Database, taskId: string): void {
  if (!database.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId))
    throw new Error('task not found');
}

function touchTask(
  database: Database.Database,
  taskId: string,
  now: string,
): void {
  database
    .prepare(
      'UPDATE tasks SET version = version + 1, updated_at = ? WHERE id = ?',
    )
    .run(now, taskId);
}

function requireChanged(changes: number, message: string): void {
  if (changes !== 1) throw new Error(message);
}
