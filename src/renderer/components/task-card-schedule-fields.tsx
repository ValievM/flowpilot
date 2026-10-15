import React from 'react';
import type { Temporal } from 'temporal-polyfill';
import type { Task } from '../../domain';
import type { TaskUpdateChanges } from './task-card-types';

export function TaskCardScheduleFields({
  task,
  today,
  estimate,
  onEstimateChange,
  onUpdate,
  onInvalidEstimate,
}: {
  readonly task: Task;
  readonly today: Temporal.PlainDate;
  readonly estimate: string;
  readonly onEstimateChange: (value: string) => void;
  readonly onUpdate: (changes: TaskUpdateChanges) => Promise<void>;
  readonly onInvalidEstimate: () => void;
}): React.JSX.Element {
  const saveEstimate = (): void => {
    if (estimate === '') {
      if (task.estimate) void onUpdate({ estimate: null });
    } else if (/^[1-9]\d*$/.test(estimate)) {
      const value = Number(estimate);
      if (value !== task.estimate?.value)
        void onUpdate({ estimate: { unit: 'workdays', value } });
    } else {
      onEstimateChange(task.estimate?.value.toString() ?? '');
      onInvalidEstimate();
    }
  };
  return (
    <>
      <div>
        <label htmlFor="task-card-day">День</label>
        <select
          id="task-card-day"
          value={
            task.day?.toString() === today.toString()
              ? today.toString()
              : task.day
                ? 'choose'
                : ''
          }
          onChange={(event) => {
            if (event.target.value !== 'choose')
              void onUpdate({ day: event.target.value || null });
          }}
        >
          <option value="">Без дня</option>
          <option value={today.toString()}>Сегодня</option>
          <option value="choose">Выбрать дату…</option>
        </select>
        <input
          aria-label="Дата задачи"
          type="date"
          value={task.day?.toString() ?? ''}
          onChange={(event) =>
            void onUpdate({ day: event.target.value || null })
          }
        />
      </div>
      <div>
        <label htmlFor="task-card-time">Время</label>
        <input
          id="task-card-time"
          type="time"
          value={task.time?.toString({ smallestUnit: 'minute' }) ?? ''}
          onChange={(event) =>
            void onUpdate({ time: event.target.value || null })
          }
        />
      </div>
      <div>
        <label htmlFor="task-card-deadline">Срок</label>
        <input
          id="task-card-deadline"
          type="date"
          value={task.deadline?.toString() ?? ''}
          onChange={(event) =>
            void onUpdate({ deadline: event.target.value || null })
          }
        />
      </div>
      <div>
        <label htmlFor="task-card-estimate">Остаток, рабочие дни</label>
        <input
          id="task-card-estimate"
          inputMode="numeric"
          value={estimate}
          onChange={(event) => {
            onEstimateChange(event.target.value);
          }}
          onBlur={saveEstimate}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <small>Приблизительно, не часы</small>
      </div>
    </>
  );
}
