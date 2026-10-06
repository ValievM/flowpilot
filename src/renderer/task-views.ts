import { Temporal } from 'temporal-polyfill';
import type { Task } from '../domain/task';
import { rollOver } from '../domain/rollover';
import { nowView, todayView } from '../domain/views';
import type { LocalClock } from './use-current-time';

export interface TaskViews {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
  readonly all: readonly Task[];
  readonly todayTasks: readonly Task[];
  readonly available: readonly Task[];
}

export function taskViews(
  tasks: readonly Task[],
  clock: LocalClock,
): TaskViews {
  const rolled = rollOver(tasks, clock.today);
  return {
    today: clock.today,
    now: clock.now,
    all: rolled,
    todayTasks: todayView(rolled, clock.today),
    available: nowView(rolled, clock.today, clock.now),
  };
}
