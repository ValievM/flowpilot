import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from './task';

function orderTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      if (left.task.deadline && right.task.deadline) {
        const byDeadline = Temporal.PlainDate.compare(
          left.task.deadline,
          right.task.deadline,
        );
        if (byDeadline !== 0) return byDeadline;
      } else if (left.task.deadline) {
        return -1;
      } else if (right.task.deadline) {
        return 1;
      }
      return (
        left.task.addedOrder - right.task.addedOrder || left.index - right.index
      );
    })
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
