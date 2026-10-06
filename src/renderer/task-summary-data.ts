import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { deadlineRisk } from '../domain/risk/risk';
import type { Task } from '../domain';
import { deadlineMessage, deadlineTitle } from './deadline-copy';
import type { TodayTask } from './fixtures/today';

export function taskSummaryData(
  task: Task,
  today: TemporalTypes.PlainDate,
  workdays: ReadonlySet<number>,
): TodayTask {
  const deadline = deadlineRisk(task, today, workdays);
  const risk = deadlineMessage(deadline);
  const riskTitle = deadlineTitle(deadline);
  const riskKind =
    deadline.ok && deadline.risk !== 'none' && deadline.risk !== 'ok'
      ? deadline.risk
      : undefined;
  return {
    id: task.id,
    title: task.title,
    subject: 'Без категории',
    due: task.deadline?.toLocaleString('ru-RU') ?? 'Без срока',
    estimate: task.estimate
      ? `Около ${task.estimate.value.toString()} рабочих дней`
      : 'Объём неизвестен',
    state: task.status.kind,
    ...(risk && riskKind
      ? {
          risk,
          riskKind,
          ...(riskTitle ? { riskTitle } : {}),
        }
      : {}),
  };
}
