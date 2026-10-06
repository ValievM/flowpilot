import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from './task';

type OrderedTask = { readonly task: Task; readonly index: number };

function compareAiRank(left: Task, right: Task): number {
  if (left.aiRank === undefined) return right.aiRank === undefined ? 0 : 1;
  if (right.aiRank === undefined) return -1;
  return left.aiRank - right.aiRank;
}

function compareDeadlines(left: Task, right: Task): number {
  if (left.deadline === undefined) return right.deadline === undefined ? 0 : 1;
  if (right.deadline === undefined) return -1;
  return Temporal.PlainDate.compare(left.deadline, right.deadline);
}

function compareTaskOrder(left: OrderedTask, right: OrderedTask): number {
  return (
    compareAiRank(left.task, right.task) ||
    compareDeadlines(left.task, right.task) ||
    left.task.addedOrder - right.task.addedOrder ||
    left.index - right.index
  );
}

function orderTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(compareTaskOrder)
    .map(({ task }) => task);
}

export function nowView(
  tasks: readonly Task[],
  today: TemporalTypes.PlainDate,
  nowTime: TemporalTypes.PlainTime,
): Task[] {
  return orderTasks(
    tasks.filter(
      (task) =>
        (task.status.kind === 'todo' || task.status.kind === 'doing') &&
        task.day?.equals(today) === true &&
        (!task.time || Temporal.PlainTime.compare(task.time, nowTime) <= 0),
    ),
  );
}

export function todayView(
  tasks: readonly Task[],
  today: TemporalTypes.PlainDate,
): Task[] {
  return orderTasks(tasks.filter((task) => task.day?.equals(today) === true));
}

export function laterView(
  tasks: readonly Task[],
  today: TemporalTypes.PlainDate,
): Task[] {
  return orderTasks(
    tasks.filter(
      (task) =>
        (task.status.kind === 'todo' || task.status.kind === 'doing') &&
        (task.day === undefined ||
          Temporal.PlainDate.compare(task.day, today) > 0),
    ),
  );
}
