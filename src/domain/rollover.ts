import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from './task';

export function rollOver(
  tasks: readonly Task[],
  newDay: TemporalTypes.PlainDate,
): Task[] {
  return tasks.map((task) => {
    if (
      (task.status.kind !== 'todo' && task.status.kind !== 'doing') ||
      !task.day ||
      Temporal.PlainDate.compare(task.day, newDay) >= 0
    ) {
      return task;
    }
    return {
      ...task,
      day: newDay,
      rolledOverFrom: task.rolledOverFrom ?? task.day,
    };
  });
}
