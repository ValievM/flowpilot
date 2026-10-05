import type { Temporal } from 'temporal-polyfill';
import type { Task, TaskColumn } from './task';

export const BUILT_IN_COLUMNS: readonly TaskColumn[] = [
  {
    id: 'todo',
    name: 'Сделать',
    description: 'Задачи к выполнению',
    state: 'todo',
    builtIn: true,
  },
  {
    id: 'doing',
    name: 'Делаю',
    description: 'Задачи в работе',
    state: 'doing',
    builtIn: true,
  },
  {
    id: 'waiting',
    name: 'Ожидание',
    description: 'Задачи, ожидающие ответа или события',
    state: 'waiting',
    builtIn: true,
  },
  {
    id: 'done',
    name: 'Готово',
    description: 'Завершённые задачи',
    state: 'done',
    builtIn: true,
  },
];

export interface WaitingDetails {
  reason: string;
  until?: Temporal.PlainDate;
}

export type MoveTaskResult =
  { ok: true; task: Task } | { ok: false; error: 'waiting-reason-required' };

export function moveTask(
  task: Task,
  column: TaskColumn,
  waiting?: WaitingDetails,
): MoveTaskResult {
  if (column.state === 'waiting') {
    if (!waiting?.reason.trim())
      return { ok: false, error: 'waiting-reason-required' };
    return {
      ok: true,
      task: {
        ...task,
        columnId: column.id,
        status: {
          kind: 'waiting',
          reason: waiting.reason,
          ...(waiting.until ? { until: waiting.until } : {}),
        },
      },
    };
  }
  return {
    ok: true,
    task: { ...task, columnId: column.id, status: { kind: column.state } },
  };
}

export type RemoveColumnResult =
  | { ok: true; columns: TaskColumn[]; tasks: Task[] }
  | {
      ok: false;
      error:
        | 'column-not-found'
        | 'built-in-column'
        | 'target-required'
        | 'invalid-target'
        | 'waiting-reason-required';
    };

export interface RemoveColumnOptions {
  targetColumnId?: string;
  waiting?: WaitingDetails;
}

export function removeColumn(
  columns: readonly TaskColumn[],
  tasks: readonly Task[],
  columnId: string,
  options: RemoveColumnOptions = {},
): RemoveColumnResult {
  const column = columns.find(({ id }) => id === columnId);
  if (!column) return { ok: false, error: 'column-not-found' };
  if (column.builtIn) return { ok: false, error: 'built-in-column' };

  const movedTasks = tasks.filter(
    ({ columnId: taskColumnId }) => taskColumnId === columnId,
  );
  if (movedTasks.length > 0 && !options.targetColumnId) {
    return { ok: false, error: 'target-required' };
  }

  const target = options.targetColumnId
    ? columns.find(({ id }) => id === options.targetColumnId)
    : undefined;
  if (
    options.targetColumnId &&
    (!target || options.targetColumnId === columnId)
  ) {
    return { ok: false, error: 'invalid-target' };
  }

  const updatedTasks: Task[] = [];
  for (const task of tasks) {
    if (task.columnId !== columnId || !target) {
      updatedTasks.push(task);
      continue;
    }
    const moved = moveTask(task, target, options.waiting);
    if (!moved.ok) return moved;
    updatedTasks.push(moved.task);
  }

  return {
    ok: true,
    columns: columns.filter(({ id }) => id !== columnId),
    tasks: updatedTasks,
  };
}
