import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { deadlineRisk } from '../domain/risk/risk';
import type { Task } from '../domain';
import { deadlineMessage } from './deadline-copy';
import type { TodayTask } from './fixtures/today';

export function taskSummaryData(
  task: Task,
  today: TemporalTypes.PlainDate,
  workdays: ReadonlySet<number>,
): TodayTask {
  const risk = deadlineMessage(deadlineRisk(task, today, workdays));
  return {
    id: task.id,
    title: task.title,
    subject: 'Без категории',
    due: task.deadline?.toLocaleString('ru-RU') ?? 'Без срока',
    estimate: task.estimate
      ? `Около ${task.estimate.value.toString()} рабочих дней`
      : 'Объём неизвестен',
    state: task.status.kind,
    ...(risk ? { risk } : {}),
  };
}
