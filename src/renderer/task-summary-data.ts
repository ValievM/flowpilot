import type { Task } from '../domain';
import type { TodayTask } from './fixtures/today';

export function taskSummaryData(task: Task): TodayTask {
  return {
    id: task.id,
    title: task.title,
    subject: 'Без категории',
    due: task.deadline?.toLocaleString('ru-RU') ?? 'Без срока',
    estimate: task.estimate
      ? `Около ${task.estimate.value.toString()} рабочих дней`
      : 'Объём неизвестен',
    state: task.status.kind,
  };
}
