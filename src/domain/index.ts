import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';

export type TaskState = 'todo' | 'doing' | 'waiting' | 'done';

export interface RemainingEstimate {
  unit: 'workdays';
  value: number;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskComment {
  id: string;
  text: string;
}

export interface AttachmentMetadata {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}

export interface WaitingDetails {
  reason: string;
  until?: TemporalTypes.PlainDate;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  state: TaskState;
  columnId: string;
  day?: TemporalTypes.PlainDate;
  time?: TemporalTypes.PlainTime;
  deadline?: TemporalTypes.PlainDate;
  estimate?: RemainingEstimate;
  subtasks: readonly Subtask[];
  comments: readonly TaskComment[];
  attachments: readonly AttachmentMetadata[];
  waiting?: WaitingDetails;
  rolledOver?: boolean;
  addedOrder: number;
}

export interface TaskColumn {
  id: string;
  name: string;
  description: string;
  state: TaskState;
  builtIn: boolean;
}

export const BUILT_IN_COLUMNS: readonly TaskColumn[] = [
  { id: 'todo', name: 'Сделать', description: 'Задачи к выполнению', state: 'todo', builtIn: true },
  { id: 'doing', name: 'Делаю', description: 'Задачи в работе', state: 'doing', builtIn: true },
  { id: 'waiting', name: 'Ожидание', description: 'Задачи, ожидающие ответа или события', state: 'waiting', builtIn: true },
  { id: 'done', name: 'Готово', description: 'Завершённые задачи', state: 'done', builtIn: true },
];

function orderTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      if (left.task.deadline && right.task.deadline) {
        const byDeadline = Temporal.PlainDate.compare(left.task.deadline, right.task.deadline);
        if (byDeadline !== 0) return byDeadline;
      } else if (left.task.deadline) {
        return -1;
      } else if (right.task.deadline) {
        return 1;
      }

      return left.task.addedOrder - right.task.addedOrder || left.index - right.index;
    })
    .map(({ task }) => task);
}

function isAvailable(task: Task): boolean {
  return task.state === 'todo' || task.state === 'doing';
}

export function nowView(
  tasks: readonly Task[],
  today: TemporalTypes.PlainDate,
  nowTime: TemporalTypes.PlainTime,
): Task[] {
  return orderTasks(
    tasks.filter(
      (task) =>
        isAvailable(task) &&
        task.day?.equals(today) === true &&
        (!task.time || Temporal.PlainTime.compare(task.time, nowTime) <= 0),
    ),
  );
}

export function todayView(tasks: readonly Task[], today: TemporalTypes.PlainDate): Task[] {
  return orderTasks(tasks.filter((task) => task.day?.equals(today) === true));
}

export function laterView(tasks: readonly Task[], today: TemporalTypes.PlainDate): Task[] {
  return orderTasks(
    tasks.filter(
      (task) =>
        isAvailable(task) &&
        (task.day === undefined || Temporal.PlainDate.compare(task.day, today) > 0),
    ),
  );
}

export function rollOver(tasks: readonly Task[], newDay: TemporalTypes.PlainDate): Task[] {
  return tasks.map((task) => {
    if (
      !isAvailable(task) ||
      !task.day ||
      Temporal.PlainDate.compare(task.day, newDay) >= 0
    ) {
      return task;
    }

    return { ...task, day: newDay, rolledOver: true };
  });
}

export type RemoveColumnResult =
  | { ok: true; columns: TaskColumn[]; tasks: Task[] }
  | { ok: false; error: 'column-not-found' | 'built-in-column' | 'target-required' | 'invalid-target' };

export function removeColumn(
  columns: readonly TaskColumn[],
  tasks: readonly Task[],
  columnId: string,
  targetColumnId?: string,
): RemoveColumnResult {
  const column = columns.find(({ id }) => id === columnId);
  if (!column) return { ok: false, error: 'column-not-found' };
  if (column.builtIn) return { ok: false, error: 'built-in-column' };

  const movedTasks = tasks.filter((task) => task.columnId === columnId);
  if (movedTasks.length > 0 && targetColumnId === undefined) {
    return { ok: false, error: 'target-required' };
  }

  const target = targetColumnId
    ? columns.find(({ id }) => id === targetColumnId)
    : undefined;
  if (targetColumnId && (!target || targetColumnId === columnId)) {
    return { ok: false, error: 'invalid-target' };
  }

  return {
    ok: true,
    columns: columns.filter(({ id }) => id !== columnId),
    tasks: tasks.map((task) =>
      task.columnId === columnId && target
        ? { ...task, columnId: target.id, state: target.state }
        : task,
    ),
  };
}

export function updateSubtask(
  task: Task,
  subtaskId: string,
  completed: boolean,
): Task | null {
  if (!task.subtasks.some(({ id }) => id === subtaskId)) return null;

  return {
    ...task,
    subtasks: task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, completed } : subtask,
    ),
  };
}
