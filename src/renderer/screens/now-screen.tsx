import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { DeadlineRiskResult } from '../../domain/risk/risk';
import type { Task } from '../../domain/task';
import { deadlineRisk } from '../../domain/risk/risk';
import { deadlineMessage, deadlineTitle } from '../deadline-copy';

interface NowScreenProps {
  readonly task: Task | undefined;
  readonly today: Temporal.PlainDate;
  readonly workdays: ReadonlySet<number>;
  readonly isLoading: boolean;
  readonly hasTasks: boolean;
  readonly hasUndatedTasks: boolean;
  readonly onStart: (task: Task) => void;
}

function NoAvailableTask({
  isLoading,
  hasTasks,
  hasUndatedTasks,
}: {
  readonly isLoading: boolean;
  readonly hasTasks: boolean;
  readonly hasUndatedTasks: boolean;
}): React.JSX.Element {
  const isBlocked = hasTasks && !isLoading;
  return (
    <section className="simple-screen" aria-live="polite">
      <p className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</p>
      <h1>Сейчас</h1>
      <h2>
        {isLoading
          ? 'Обновляем сохранённые задачи…'
          : isBlocked
            ? 'Нет доступных дел'
            : 'Сегодня пока пусто'}
      </h2>
      <p>
        {isLoading
          ? 'Сохранённые задачи останутся на экране после обновления.'
          : isBlocked
            ? hasUndatedTasks
              ? 'Есть задачи без назначенного дня. Назначьте им день, чтобы включить их в план.'
              : 'Оставшиеся задачи ожидают ответа, уже готовы или назначены на будущее.'
            : 'Добавьте задачу — она сохранится и появится в сегодняшнем списке.'}
      </p>
    </section>
  );
}

function DeadlineWarning({
  risk,
}: {
  readonly risk: DeadlineRiskResult;
}): React.JSX.Element | null {
  const message = deadlineMessage(risk);
  const title = deadlineTitle(risk);
  if (!message) return null;
  const isRisk = risk.ok && ['tight', 'short', 'overdue'].includes(risk.risk);
  return (
    <p className={`risk-label${isRisk ? ' is-risk' : ''}`}>
      {title && <strong>{title}: </strong>}
      {message}
    </p>
  );
}

export function NowScreen({
  task,
  today,
  workdays,
  isLoading,
  onStart,
  hasTasks,
  hasUndatedTasks,
}: NowScreenProps): React.JSX.Element {
  if (!task)
    return (
      <NoAvailableTask
        isLoading={isLoading}
        hasTasks={hasTasks}
        hasUndatedTasks={hasUndatedTasks}
      />
    );
  const risk = deadlineRisk(task, today, workdays);
  return (
    <section className="simple-screen now-screen">
      <p className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</p>
      <h1>Сейчас</h1>
      <article className="next-step" aria-labelledby="now-task-title">
        {task.rolledOverFrom && <p>Перенесено со вчера.</p>}
        <h2 id="now-task-title">{task.title}</h2>
        <p>Доступно сейчас: ближайший срок, затем порядок добавления.</p>
        <DeadlineWarning risk={risk} />
        <button
          className="button button-primary start-button"
          type="button"
          onClick={() => {
            onStart(task);
          }}
        >
          {task.status.kind === 'doing' ? 'Продолжить' : 'Взять в работу'}
        </button>
      </article>
    </section>
  );
}
