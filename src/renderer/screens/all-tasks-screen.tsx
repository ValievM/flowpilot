import React from 'react';
import { laterView, todayView } from '../../domain/views';
import type { Task } from '../../domain/task';
import { taskSummaryData } from '../task-summary-data';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';

const filters = ['all', 'today', 'later'] as const;
type Filter = (typeof filters)[number];

const filterLabels: Record<Filter, string> = {
  all: 'Все',
  today: 'Сегодня',
  later: 'Позже',
};

const statusLabels: Record<Task['status']['kind'], string> = {
  todo: 'Сделать',
  doing: 'Делаю',
  waiting: 'Ожидание',
  done: 'Готово',
};

function emptyMessage(filter: Filter): string {
  if (filter === 'today') return 'На сегодня задач нет.';
  if (filter === 'later') return 'Нет будущих и нераспределённых задач.';
  return 'Задач пока нет. Добавьте первую задачу, и она появится здесь.';
}

function TaskRow({
  task,
  index,
  today,
  workdays,
  onOpenTask,
}: {
  readonly task: Task;
  readonly index: number;
  readonly today: TemporalTypes.PlainDate;
  readonly workdays: ReadonlySet<number>;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
}): React.JSX.Element {
  const summary = taskSummaryData(task, today, workdays);
  const state = task.status.kind;
  const metadata = [
    ...(task.disciplineId ? [task.disciplineId] : []),
    `Срок: ${summary.due}`,
  ];
  return (
    <li>
      <article
        className={`task-row${state === 'waiting' ? ' is-waiting' : ''}`}
      >
        <span className="task-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="task-copy">
          <h2>
            <button
              className="task-title-button"
              type="button"
              aria-label={`Открыть задачу: ${task.title}`}
              onClick={(event) => {
                onOpenTask(task.id, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onOpenTask(task.id, event.currentTarget);
                }
              }}
            >
              {task.title}
            </button>
          </h2>
          <div className="task-meta">
            {metadata.map((value, itemIndex) => (
              <React.Fragment key={value}>
                {itemIndex > 0 && <span aria-hidden="true">·</span>}
                <span>{value}</span>
              </React.Fragment>
            ))}
          </div>
          {state === 'waiting' && (
            <p className="task-meta">Причина ожидания: {task.status.reason}</p>
          )}
          {summary.risk && (
            <p
              className={`risk-label${summary.riskKind ? ` risk-${summary.riskKind}${summary.riskKind === 'unknown' ? '' : ' is-risk'}` : ''}`}
              data-risk-kind={summary.riskKind}
              title={summary.riskTitle}
            >
              <span className="risk-icon" aria-hidden="true">
                !
              </span>
              {summary.riskTitle && <strong>{summary.riskTitle}: </strong>}
              {summary.risk}
            </p>
          )}
        </div>
        <span className={`state-label state-${state}`}>
          {statusLabels[state]}
        </span>
      </article>
    </li>
  );
}

export function AllTasksScreen({
  tasks,
  today,
  workdays,
  onOpenTask,
}: {
  readonly tasks: readonly Task[];
  readonly today: TemporalTypes.PlainDate;
  readonly workdays: ReadonlySet<number>;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
}): React.JSX.Element {
  const [filter, setFilter] = React.useState<Filter>('all');
  const lists: Record<Filter, readonly Task[]> = {
    all: tasks,
    today: todayView(tasks, today),
    later: laterView(tasks, today),
  };
  const visibleTasks = lists[filter];
  const handleFilterKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    const current = filters.indexOf(filter);
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (current + 1) % filters.length;
    if (event.key === 'ArrowLeft')
      next = (current + filters.length - 1) % filters.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = filters.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    const nextFilter = filters[next];
    if (!nextFilter) return;
    setFilter(nextFilter);
    const buttons =
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
    buttons.item(next).focus();
  };
  return (
    <section className="all-tasks-screen">
      <header className="all-tasks-heading">
        <div>
          <p className="eyebrow">ЛИЧНОЕ / СПИСОК</p>
          <h1>Все задачи</h1>
          <p className="page-subtitle">Один список для всех дел и состояний.</p>
        </div>
        <div
          className="all-task-filters"
          role="group"
          aria-label="Фильтр задач"
          onKeyDown={handleFilterKeyDown}
        >
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => {
                setFilter(item);
              }}
            >
              {filterLabels[item]} <span>{lists[item].length}</span>
            </button>
          ))}
        </div>
      </header>
      <section
        className="all-task-list"
        aria-label={`${filterLabels[filter]}: ${String(visibleTasks.length)}`}
      >
        {visibleTasks.length > 0 ? (
          <ol className="task-list">
            {visibleTasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                index={index}
                today={today}
                workdays={workdays}
                onOpenTask={onOpenTask}
              />
            ))}
          </ol>
        ) : (
          <p className="all-tasks-empty" role="status">
            {emptyMessage(filter)}
          </p>
        )}
      </section>
    </section>
  );
}
