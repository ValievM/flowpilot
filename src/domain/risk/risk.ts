import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../task';

export type RiskKind =
  'none' | 'unknown' | 'ok' | 'tight' | 'short' | 'overdue';

export interface RiskResult {
  ok: true;
  risk: RiskKind;
  available: number | undefined;
  estimate: number | undefined;
  startDate: TemporalTypes.PlainDate | undefined;
  due: TemporalTypes.PlainDate | undefined;
  startsAfterDue: boolean;
}

export type DeadlineRiskResult =
  | RiskResult
  | { ok: false; error: 'empty-workdays' | 'not-integer' | 'below-one' };

export type AvailableWorkdaysResult =
  { ok: true; value: number } | { ok: false; error: 'empty-workdays' };
interface AvailableRiskInput {
  task: Task;
  today: TemporalTypes.PlainDate;
  startDate: TemporalTypes.PlainDate;
  due: TemporalTypes.PlainDate;
  available: number;
}

export function availableWorkdays(
  start: TemporalTypes.PlainDate,
  due: TemporalTypes.PlainDate,
  workdays: ReadonlySet<number>,
): AvailableWorkdaysResult {
  if (workdays.size === 0) return { ok: false, error: 'empty-workdays' };
  const totalDays = start.until(due, { largestUnit: 'day' }).days + 1;
  if (totalDays <= 0) return { ok: true, value: 0 };
  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * workdays.size;
  const remainder = totalDays % 7;
  for (let offset = 0; offset < remainder; offset += 1) {
    const weekday = ((start.dayOfWeek - 1 + offset) % 7) + 1;
    if (workdays.has(weekday)) count += 1;
  }
  return { ok: true, value: count };
}

export function deadlineRisk(
  task: Task,
  today: TemporalTypes.PlainDate,
  workdays: ReadonlySet<number>,
): DeadlineRiskResult {
  const validation = validateRiskInput(task, workdays);
  if (validation) return validation;
  if (task.status.kind === 'done' || !task.deadline) {
    return riskResult({
      risk: 'none',
      available: undefined,
      estimate: task.estimate?.value,
      startDate: undefined,
      due: task.deadline,
      startsAfterDue: false,
    });
  }
  const startDate =
    task.day && Temporal.PlainDate.compare(task.day, today) > 0
      ? task.day
      : today;
  const availableResult = availableWorkdays(startDate, task.deadline, workdays);
  if (!availableResult.ok) return availableResult;
  return deadlineRiskForAvailable({
    task,
    today,
    startDate,
    due: task.deadline,
    available: availableResult.value,
  });
}

function validateRiskInput(
  task: Task,
  workdays: ReadonlySet<number>,
):
  | { ok: false; error: 'empty-workdays' | 'not-integer' | 'below-one' }
  | undefined {
  if (workdays.size === 0) return { ok: false, error: 'empty-workdays' };
  if (task.estimate && !Number.isInteger(task.estimate.value)) {
    return { ok: false, error: 'not-integer' };
  }
  if (task.estimate && task.estimate.value < 1) {
    return { ok: false, error: 'below-one' };
  }
  return undefined;
}

function deadlineRiskForAvailable(input: AvailableRiskInput): RiskResult {
  const startsAfterDue =
    Temporal.PlainDate.compare(input.startDate, input.due) > 0;
  return riskResult({
    risk: resolveRisk(input, startsAfterDue),
    available: input.available,
    estimate: input.task.estimate?.value,
    startDate: input.startDate,
    due: input.due,
    startsAfterDue,
  });
}

function resolveRisk(
  input: AvailableRiskInput,
  startsAfterDue: boolean,
): RiskKind {
  if (Temporal.PlainDate.compare(input.due, input.today) < 0) return 'overdue';
  if (!input.task.estimate) return 'unknown';
  if (startsAfterDue || input.available < input.task.estimate.value) {
    return 'short';
  }
  if (input.available === input.task.estimate.value) return 'tight';
  return 'ok';
}

function riskResult(result: Omit<RiskResult, 'ok'>): RiskResult {
  return { ok: true, ...result };
}
