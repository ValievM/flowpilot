import React from 'react';
import { DisciplineTag } from '../catalog/catalog-context';
import { Temporal } from 'temporal-polyfill';
import type { DeadlineRiskResult } from '../../domain/risk/risk';
import type { Task } from '../../domain/task';
import { deadlineRisk } from '../../domain/risk/risk';
import { deadlineMessage, deadlineTitle } from '../deadline-copy';
import { WhatNowPanel } from './what-now-panel';
import { useSchedulePlan } from '../schedule/schedule-context';
import { ConflictNote, NextClass } from './schedule-notes';

const SELECTION_RULE =
  'Выбрано по ближайшему сроку, затем по порядку добавления.';

interface NowScreenProps {
  readonly task: Task | undefined;
  readonly allTasks: readonly Task[];
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
  readonly workdays: ReadonlySet<number>;
  readonly isLoading: boolean;
  readonly hasTasks: boolean;
  readonly hasUndatedTasks: boolean;
  readonly onStart: (task: Task) => void;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
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

function dayLabel(date: Temporal.PlainDate | undefined): string {
  return (
    date?.toLocaleString('ru-RU', { day: 'numeric', month: 'long' }) ??
    'указанная дата'
  );
}

/** One short line: what is wrong with the deadline. The calculation sits in the details. */
function DeadlineBadge({
  risk,
}: {
  readonly risk: DeadlineRiskResult;
}): React.JSX.Element | null {
  if (!risk.ok) return null;
  if (risk.risk === 'overdue')
    return (
      <p className="risk-label is-risk">
        <strong>Просрочено · {dayLabel(risk.due)}</strong>
      </p>
    );
  if (risk.risk === 'unknown')
    return <p className="risk-label">Срок есть, объём неизвестен</p>;
  const title = deadlineTitle(risk);
  if (!title) return null;
  return (
    <p className="risk-label is-risk">
      <strong>{title}</strong>
    </p>
  );
}

function WhyThisTask({
  risk,
}: {
  readonly risk: DeadlineRiskResult;
}): React.JSX.Element {
  const hasEstimate = risk.ok && risk.risk !== 'overdue';
  const message = hasEstimate ? deadlineMessage(risk) : undefined;
  return (
    <details className="now-details">
      <summary>Почему эта задача</summary>
      <p className="now-details-text">{SELECTION_RULE}</p>
      {message && <p className="now-details-text">{message}</p>}
    </details>
  );
}

export function NowScreen({
  task,
  allTasks,
  today,
  now,
  workdays,
  isLoading,
  onStart,
  onOpenTask,
  hasTasks,
  hasUndatedTasks,
}: NowScreenProps): React.JSX.Element {
  const plan = useSchedulePlan(today, now);
  if (!task)
    return (
      <>
        <NoAvailableTask
          isLoading={isLoading}
          hasTasks={hasTasks}
          hasUndatedTasks={hasUndatedTasks}
        />
        <NextClass plan={plan} />
        <WhatNowPanel tasks={allTasks} onStart={onStart} />
      </>
    );
  const risk = deadlineRisk(task, today, workdays);
  return (
    <section className="now-screen">
      <h1>Сейчас</h1>
      <article className="next-step" aria-labelledby="now-task-title">
        {task.rolledOverFrom && <p className="now-note">Перенесено со вчера</p>}
        <h2 id="now-task-title">
          <button
            className="task-title-button"
            type="button"
            aria-label={`Открыть задачу: ${task.title}`}
            onClick={(event) => {
              onOpenTask(task.id, event.currentTarget);
            }}
          >
            {task.title}
          </button>
        </h2>
        <DisciplineTag id={task.disciplineId} />
        <DeadlineBadge risk={risk} />
        <ConflictNote task={task} today={today} plan={plan} />
        <button
          className="button button-primary start-button"
          type="button"
          onClick={() => {
            onStart(task);
          }}
        >
          {task.status.kind === 'doing' ? 'Продолжить' : 'Взять в работу'}
        </button>
        <WhyThisTask risk={risk} />
      </article>
      <NextClass plan={plan} />
      <WhatNowPanel tasks={allTasks} onStart={onStart} />
    </section>
  );
}
