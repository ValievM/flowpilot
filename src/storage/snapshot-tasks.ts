import Database from 'better-sqlite3';
import { Temporal } from 'temporal-polyfill';
import type {
  AttachmentMetadata,
  Subtask,
  Task,
  TaskComment,
  TaskStatus,
} from '../domain';

export type TaskRow = {
  type_id: string | null;
  discipline_id: string | null;
  id: string;
  title: string;
  description: string | null;
  column_id: string;
  day: string | null;
  time: string | null;
  deadline: string | null;
  estimate_unit: 'workdays' | null;
  estimate_value: number | null;
  status_kind: TaskStatus['kind'];
  waiting_reason: string | null;
  waiting_until: string | null;
  rolled_over_from: string | null;
  ai_rank: number | null;
  position: number;
};

type TaskRelations = {
  subtasks: Subtask[];
  comments: TaskComment[];
  attachments: AttachmentMetadata[];
};

export function loadTask(database: Database.Database, row: TaskRow): Task {
  const relations = loadTaskRelations(database, row.id);
  return {
    id: row.id,
    title: row.title,
    status: statusFromRow(row),
    columnId: row.column_id,
    addedOrder: row.position,
    ...optionalTaskFields(row),
    subtasks: relations.subtasks,
    comments: relations.comments,
    attachments: relations.attachments,
  };
}
function optionalTaskFields(row: TaskRow): Partial<Task> {
  return {
    ...(row.type_id !== null ? { typeId: row.type_id } : {}),
    ...(row.discipline_id !== null ? { disciplineId: row.discipline_id } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.ai_rank !== null ? { aiRank: row.ai_rank } : {}),
    ...scheduledTaskFields(row),
  };
}

function scheduledTaskFields(row: TaskRow): Partial<Task> {
  return {
    ...(row.day ? { day: Temporal.PlainDate.from(row.day) } : {}),
    ...(row.time ? { time: Temporal.PlainTime.from(row.time) } : {}),
    ...(row.deadline
      ? { deadline: Temporal.PlainDate.from(row.deadline) }
      : {}),
    ...(row.estimate_unit && row.estimate_value !== null
      ? { estimate: { unit: row.estimate_unit, value: row.estimate_value } }
      : {}),
    ...(row.rolled_over_from
      ? { rolledOverFrom: Temporal.PlainDate.from(row.rolled_over_from) }
      : {}),
  };
}

function statusFromRow(row: TaskRow): TaskStatus {
  if (row.status_kind !== 'waiting') return { kind: row.status_kind };
  return {
    kind: 'waiting',
    reason: row.waiting_reason ?? '',
    ...(row.waiting_until
      ? { until: Temporal.PlainDate.from(row.waiting_until) }
      : {}),
  };
}

function loadTaskRelations(
  database: Database.Database,
  taskId: string,
): TaskRelations {
  // Result shapes follow the fixed table columns in migration 0001.
  const subtasks = database
    .prepare(
      'SELECT id,title,completed FROM subtasks WHERE task_id = ? ORDER BY position',
    )
    .all(taskId) as { id: string; title: string; completed: number }[];
  const commentRows = database
    .prepare('SELECT id,text FROM comments WHERE task_id = ? ORDER BY position')
    .all(taskId) as TaskComment[];
  const attachmentRows = database
    .prepare(
      'SELECT id,name,media_type,size_bytes FROM attachments WHERE task_id = ? ORDER BY position',
    )
    .all(taskId) as {
    id: string;
    name: string;
    media_type: string;
    size_bytes: number;
  }[];
  return {
    subtasks: subtasks.map(({ id, title, completed }) => ({
      id,
      title,
      completed: completed === 1,
    })),
    comments: commentRows,
    attachments: attachmentRows.map(({ id, name, media_type, size_bytes }) => ({
      id,
      name,
      mediaType: media_type,
      sizeBytes: size_bytes,
    })),
  };
}
