import type Database from 'better-sqlite3';
import type { Task, TaskStatus } from '../domain';
import type { StorageCommand } from './types';
import { dateText, timeText } from './sql-values';

type TaskChanges = Extract<StorageCommand, { kind: 'task.update' }>['changes'];

export function insertTask(
  database: Database.Database,
  task: Task,
  now: string,
): void {
  assertStatusMatchesColumn(database, task.columnId, task.status.kind);
  const status = task.status;
  database
    .prepare(
      `INSERT INTO tasks(id,title,description,column_id,day,time,deadline,estimate_unit,estimate_value,status_kind,waiting_reason,waiting_until,rolled_over_from,position,ai_rank,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      task.id,
      task.title,
      task.description ?? null,
      task.columnId,
      dateText(task.day),
      timeText(task.time),
      dateText(task.deadline),
      task.estimate?.unit ?? null,
      task.estimate?.value ?? null,
      status.kind,
      status.kind === 'waiting' ? status.reason : null,
      status.kind === 'waiting' ? dateText(status.until) : null,
      dateText(task.rolledOverFrom),
      task.addedOrder,
      task.aiRank ?? null,
      now,
      now,
    );
  insertTaskSubtasks(database, task);
  insertTaskComments(database, task, now);
  insertTaskAttachments(database, task);
}

export function updateTask(
  database: Database.Database,
  id: string,
  changes: TaskChanges,
  now: string,
): void {
  if (!database.prepare('SELECT id FROM tasks WHERE id = ?').get(id))
    throw new Error('task not found');
  if (changes.status)
    assertStatusMatchesTaskColumn(database, id, changes.status.kind);
  const values = taskUpdateValues(changes);
  const allowed = Object.keys(values).filter(
    (key) => values[key as keyof typeof values] !== undefined,
  );
  if (allowed.length === 0) return;
  const entries = allowed.map((key) => `${key} = @${key}`);
  database
    .prepare(
      `UPDATE tasks SET ${entries.join(', ')}, version = version + 1, updated_at = @now WHERE id = @id`,
    )
    .run({ ...values, now, id });
}
export function setTaskAiRank(
  database: Database.Database,
  taskId: string,
  rank: number,
  now: string,
): void {
  const result = database
    .prepare(
      'UPDATE tasks SET ai_rank = ?, version = version + 1, updated_at = ? WHERE id = ?',
    )
    .run(rank, now, taskId);
  if (result.changes === 0) throw new Error('task not found');
}

function insertTaskSubtasks(database: Database.Database, task: Task): void {
  task.subtasks.forEach((subtask, position) =>
    database
      .prepare(
        'INSERT INTO subtasks(id,task_id,title,completed,position) VALUES(?,?,?,?,?)',
      )
      .run(
        subtask.id,
        task.id,
        subtask.title,
        Number(subtask.completed),
        position,
      ),
  );
}

function insertTaskComments(
  database: Database.Database,
  task: Task,
  now: string,
): void {
  task.comments.forEach((comment, position) =>
    database
      .prepare(
        'INSERT INTO comments(id,task_id,text,created_at,position) VALUES(?,?,?,?,?)',
      )
      .run(comment.id, task.id, comment.text, now, position),
  );
}

function insertTaskAttachments(database: Database.Database, task: Task): void {
  task.attachments.forEach((attachment, position) =>
    database
      .prepare(
        'INSERT INTO attachments(id,task_id,name,media_type,size_bytes,position) VALUES(?,?,?,?,?,?)',
      )
      .run(
        attachment.id,
        task.id,
        attachment.name,
        attachment.mediaType,
        attachment.sizeBytes,
        position,
      ),
  );
}

function taskUpdateValues(changes: TaskChanges) {
  return {
    ...taskFieldValues(changes),
    ...estimateValues(changes),
    ...statusValues(changes.status),
  };
}

function taskFieldValues(changes: TaskChanges) {
  return {
    title: changes.title,
    description: changes.description,
    day: dateText(changes.day),
    time: timeText(changes.time),
    deadline: dateText(changes.deadline),
    rolled_over_from: dateText(changes.rolledOverFrom),
    position: changes.addedOrder,
  };
}

function estimateValues(changes: TaskChanges) {
  return {
    estimate_unit:
      changes.estimate?.unit ??
      (changes.estimate === undefined ? undefined : null),
    estimate_value:
      changes.estimate?.value ??
      (changes.estimate === undefined ? undefined : null),
  };
}

function statusValues(status: TaskStatus | undefined) {
  return {
    status_kind: status?.kind,
    waiting_reason:
      status?.kind === 'waiting' ? status.reason : status ? null : undefined,
    waiting_until:
      status?.kind === 'waiting'
        ? dateText(status.until)
        : status
          ? null
          : undefined,
  };
}

function assertStatusMatchesTaskColumn(
  database: Database.Database,
  taskId: string,
  status: TaskStatus['kind'],
): void {
  const row = database
    .prepare(
      'SELECT c.state FROM tasks t JOIN columns c ON c.id = t.column_id WHERE t.id = ?',
    )
    .get(taskId) as { state: TaskStatus['kind'] } | undefined;
  if (!row || row.state !== status)
    throw new Error('task status must match its column');
}

function assertStatusMatchesColumn(
  database: Database.Database,
  columnId: string,
  status: TaskStatus['kind'],
): void {
  const row = database
    .prepare('SELECT state FROM columns WHERE id = ?')
    .get(columnId) as { state: TaskStatus['kind'] } | undefined;
  if (!row || row.state !== status)
    throw new Error('task status must match its column');
}
