import React from 'react';
import { Temporal } from 'temporal-polyfill';
import { deadlineRisk } from '../../domain/risk/risk';
import type { Task } from '../../domain/task';
import { deadlineMessage, deadlineTitle } from '../deadline-copy';
import { taskCountPhrase } from '../today-copy';

interface TodayScreenProps {
  readonly tasks: readonly Task[];
  readonly hasTasks: boolean;
  readonly hasUndatedTasks: boolean;
  readonly available: readonly Task[];
  readonly workdays: ReadonlySet<number>;
  readonly today: Temporal.PlainDate;
  readonly todayLabel: string;
  readonly onStart: (task: Task) => void;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
}

function taskState(task: Task): string {
  switch (task.status.kind) {
    case 'todo':
      return 'Сделать';
    case 'doing':
      return 'Делаю';
    case 'waiting':
      return 'Ожидание';
    case 'done':
      return 'Готово';
  }
}

function TaskRow({
  task,
  today,
  workdays,
  index,
  onOpenTask,
}: {
  readonly task: Task;
  readonly today: Temporal.PlainDate;
  readonly workdays: ReadonlySet<number>;
  readonly index: number;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
}): React.JSX.Element {
  const risk = deadlineRisk(task, today, workdays);
  const riskText = deadlineMessage(risk);
  const riskTitle = deadlineTitle(risk);
  const isRisk = risk.ok && ['tight', 'short', 'overdue'].includes(risk.risk);
  return (
    <li
      className={`task-row${task.status.kind === 'waiting' ? ' is-waiting' : ''}`}
    >
      <span className="task-number">{String(index + 1).padStart(2, '0')}</span>
      <div className="task-copy">
        <h3>
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
        </h3>
        <div className="task-meta">
          {task.status.kind === 'waiting' && (
            <span>Ожидание: {task.status.reason}</span>
          )}
          {task.deadline && (
            <>
              <span aria-hidden="true">·</span>
              <span>Срок {task.deadline.toLocaleString('ru-RU')}</span>
            </>
          )}
          {task.rolledOverFrom && <span>Перенесено со вчера</span>}
        </div>
        {riskText && (
          <p className={`risk-label${isRisk ? ' is-risk' : ''}`}>
            <span className="risk-icon" aria-hidden="true">
              {isRisk ? '!' : 'i'}
            </span>
            {riskTitle && <strong>{riskTitle}</strong>}
            {riskText}
          </p>
        )}
      </div>
      <span className={`state-label state-${task.status.kind}`}>
        {taskState(task)}
      </span>
    </li>
  );
}

function EmptyDay({
  blocked,
  hasUndatedTasks,
}: {
  readonly blocked: boolean;
  readonly hasUndatedTasks: boolean;
}): React.JSX.Element {
  return (
    <section className="empty-state" aria-live="polite">
      <h2>{blocked ? 'Нет доступных дел' : 'Сегодня пока пусто'}</h2>
      <p>
        {blocked
          ? hasUndatedTasks
            ? 'Есть задачи без назначенного дня. Назначьте им день, чтобы включить их в план.'
            : 'Оставшиеся задачи ожидают ответа, уже готовы или назначены на будущее.'
          : 'Добавьте задачу — она сохранится и появится в сегодняшнем списке.'}
      </p>
    </section>
  );
}

function TodayHeading({
  todayLabel,
}: {
  readonly todayLabel: string;
}): React.JSX.Element {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">ЛИЧНОЕ / СЕГОДНЯ</p>
        <h1>{todayLabel}</h1>
        <p className="page-subtitle">
          Начни с доступного шага. Остальное — в своём порядке.
        </p>
      </div>
    </div>
  );
}

export function TodayScreen({
  tasks,
  hasTasks,
  hasUndatedTasks,
  available,
  workdays,
  today,
  todayLabel,
  onStart,
  onOpenTask,
}: TodayScreenProps): React.JSX.Element {
  const nextTask = available[0];
  const nextRisk = nextTask
    ? deadlineRisk(nextTask, today, workdays)
    : undefined;
  const nextRiskText = nextRisk ? deadlineMessage(nextRisk) : undefined;
  if (!nextTask)
    return (
      <>
        <TodayHeading todayLabel={todayLabel} />
        <EmptyDay blocked={hasTasks} hasUndatedTasks={hasUndatedTasks} />
      </>
    );
  return (
    <>
      <TodayHeading todayLabel={todayLabel} />
      <div className="today-layout">
        <section className="queue" aria-labelledby="queue-heading">
          <div className="queue-heading">
            <h2 id="queue-heading">Очередь на сегодня</h2>
            <span className="queue-count">
              {taskCountPhrase(available.length)}
            </span>
          </div>
          <ol className="task-list">
            {tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                workdays={workdays}
                index={index}
                onOpenTask={onOpenTask}
              />
            ))}
          </ol>
        </section>
        <aside className="next-step" aria-labelledby="next-heading">
          <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ</p>
          <h2 id="next-heading">{nextTask.title}</h2>
          <p className="next-description">
            Выбрано по ближайшему сроку, затем по порядку добавления.
          </p>
          {nextTask.rolledOverFrom && <p>Перенесено со вчера.</p>}
          {nextRiskText && (
            <p
              className={`risk-label${nextRisk?.ok && ['tight', 'short', 'overdue'].includes(nextRisk.risk) ? ' is-risk' : ''}`}
            >
              {nextRiskText}
            </p>
          )}
          <button
            className="button button-primary start-button"
            type="button"
            onClick={() => {
              onStart(nextTask);
            }}
          >
            Взять в работу
          </button>
        </aside>
      </div>
    </>
  );
}
