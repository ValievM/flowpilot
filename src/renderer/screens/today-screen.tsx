import React from 'react';
import type { TodayTask } from '../fixtures/today';

interface TodayScreenProps {
  tasks: TodayTask[];
  availableCount: number;
  nextTask: TodayTask | undefined;
  onViewChange: (view: 'today' | 'board' | 'now') => void;
  onStart: (id: string) => void;
}

export function TodayScreen({
  tasks,
  availableCount,
  nextTask,
  onViewChange,
  onStart,
}: TodayScreenProps): React.JSX.Element {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ЛИЧНОЕ / СЕГОДНЯ</p>
          <h1>Сегодня, 5 октября</h1>
          <p className="page-subtitle">
            Начни с доступного шага. Остальное — в своём порядке.
          </p>
        </div>
        <div className="view-tabs" role="group" aria-label="Режим просмотра">
          <button
            type="button"
            aria-current="page"
            onClick={() => {
              onViewChange('today');
            }}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => {
              onViewChange('board');
            }}
          >
            Доска
          </button>
          <button
            type="button"
            onClick={() => {
              onViewChange('now');
            }}
          >
            Сейчас
          </button>
        </div>
      </div>
      <div className="today-layout">
        <section className="queue" aria-labelledby="queue-heading">
          <div className="queue-heading">
            <h2 id="queue-heading">Очередь на сегодня</h2>
            <span className="queue-count">{availableCount} ЗАДАЧ</span>
          </div>
          <ol className="task-list">
            {tasks.map((task, index) => (
              <li
                className={`task-row${task.state === 'waiting' ? ' is-waiting' : ''}`}
                key={task.id}
              >
                <span className="task-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="task-copy">
                  <h3>{task.title}</h3>
                  <div className="task-meta">
                    <span>{task.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {task.state === 'waiting' ? 'Ждёт ответа' : task.due}
                    </span>
                  </div>
                  {task.risk && (
                    <p className="risk-label">
                      <span className="risk-icon" aria-hidden="true">
                        !
                      </span>
                      {task.risk}
                    </p>
                  )}
                </div>
                <span className={`state-label state-${task.state}`}>
                  {task.state === 'doing'
                    ? 'В работе'
                    : task.state === 'waiting'
                      ? 'Ожидание'
                      : task.state === 'done'
                        ? 'Готово'
                        : 'Сделать'}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="next-step" aria-labelledby="next-heading">
          <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ</p>
          {nextTask ? (
            <>
              <h2 id="next-heading">{nextTask.step ?? nextTask.title}</h2>
              <p className="next-description">
                {nextTask.id === 'coursework'
                  ? 'Часть курсовой. Впереди около пяти рабочих дней работы — начать стоит сегодня.'
                  : nextTask.estimate}
              </p>
              {nextTask.risk && (
                <p className="risk-detail">
                  <strong>Риск не успеть</strong>
                  <span>{nextTask.risk}</span>
                </p>
              )}
              <div className="next-meta">
                <span>{nextTask.subject}</span>
                <span>{nextTask.due}</span>
              </div>
              <button
                className="button button-primary start-button"
                type="button"
                onClick={() => {
                  onStart(nextTask.id);
                }}
              >
                Начать задачу
              </button>
            </>
          ) : (
            <>
              <h2 id="next-heading">На сегодня всё</h2>
              <p>Можно посмотреть будущие дела или добавить новое.</p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
