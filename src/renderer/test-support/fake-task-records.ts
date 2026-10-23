import type { Temporal } from 'temporal-polyfill';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';

type TestTask = IpcSnapshot['tasks'][number];
type Command = CommandsApplyRequest['commands'][number];
type StatusInput =
  | { readonly kind: 'todo' }
  | { readonly kind: 'doing' }
  | { readonly kind: 'done' }
  | {
      readonly kind: 'waiting';
      readonly reason: string;
      readonly until?: string | Temporal.PlainDate | undefined;
    };
export interface TaskInput {
  readonly id: string;
  readonly status?: TestTask['status'];
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
  readonly estimate?: { readonly unit: 'workdays'; readonly value: number };
  readonly rolledOverFrom?: string;
  readonly title?: string;
  readonly addedOrder?: number;
}

function taskDates(
  input: TaskInput,
): Pick<TestTask, 'day' | 'time' | 'deadline'> {
  return {
    ...(input.day ? { day: input.day } : {}),
    ...(input.time ? { time: input.time } : {}),
    ...(input.deadline ? { deadline: input.deadline } : {}),
  };
}

function taskDetails(
  input: TaskInput,
): Pick<TestTask, 'estimate' | 'rolledOverFrom'> {
  return {
    ...(input.estimate ? { estimate: input.estimate } : {}),
    ...(input.rolledOverFrom ? { rolledOverFrom: input.rolledOverFrom } : {}),
  };
}

export function taskRecord(input: TaskInput): TestTask {
  return {
    id: input.id,
    title: input.title ?? input.id,
    status: input.status ?? { kind: 'todo' },
    columnId: input.status?.kind ?? 'todo',
    addedOrder: input.addedOrder ?? 1,
    subtasks: [],
    comments: [],
    attachments: [],
    ...taskDates(input),
    ...taskDetails(input),
  };
}

export function serializedStatus(status: StatusInput): TestTask['status'] {
  if (status.kind !== 'waiting') return status;
  return {
    kind: 'waiting',
    reason: status.reason,
    ...(status.until ? { until: status.until.toString() } : {}),
  };
}

export function createdTask(
  command: Extract<Command, { kind: 'task.create' }>,
): TestTask {
  const { task } = command;
  return {
    id: task.id,
    title: task.title,
    status: serializedStatus(task.status),
    columnId: task.columnId,
    addedOrder: task.addedOrder,
    subtasks: task.subtasks.map((subtask, position) => ({
      ...subtask,
      position,
    })),
    comments: task.comments.map((comment) => ({
      ...comment,
      createdAt: null,
    })),
    attachments: [],
    ...(task.day ? { day: task.day.toString() } : {}),
    ...(task.time ? { time: task.time.toString() } : {}),
    ...(task.deadline ? { deadline: task.deadline.toString() } : {}),
    ...(task.estimate ? { estimate: task.estimate } : {}),
    ...(task.rolledOverFrom
      ? { rolledOverFrom: task.rolledOverFrom.toString() }
      : {}),
  };
}
