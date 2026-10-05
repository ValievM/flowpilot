import React from 'react';
import type { TodayTask } from '../fixtures/today';

export function TaskSummary({ task }: { task: TodayTask }): React.JSX.Element {
  return (
    <article className="task-summary">
      <p className="task-summary-meta">
        {task.subject} · {task.due}
      </p>
      <h2>{task.title}</h2>
      {task.risk && <p className="risk-label">{task.risk}</p>}
    </article>
  );
}
