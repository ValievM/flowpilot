import React from 'react';
import type { TodayTask } from '../fixtures/today';

export function TaskSummary({ task }: { task: TodayTask }): React.JSX.Element {
  const riskClass = task.riskKind
    ? ` risk-${task.riskKind}${task.riskKind === 'unknown' ? '' : ' is-risk'}`
    : '';
  return (
    <article className="task-summary">
      <p className="task-summary-meta">
        {task.subject} · {task.due}
      </p>
      <h2>{task.title}</h2>
      {task.risk && (
        <p
          className={`risk-label${riskClass}`}
          data-risk-kind={task.riskKind}
          title={task.riskTitle}
        >
          {task.riskTitle && <strong>{task.riskTitle}</strong>}
          {task.risk}
        </p>
      )}
    </article>
  );
}
