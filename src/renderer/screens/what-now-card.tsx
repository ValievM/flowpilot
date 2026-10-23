import React from 'react';
import type { Task } from '../../domain/task';
import type { WhatNowView } from '../what-now/what-now-outcome';

interface WhatNowCardProps {
  readonly view: WhatNowView;
  readonly tasks: readonly Task[];
  readonly onStart: (task: Task) => void;
  readonly onAgain: () => void;
}

function Reason({ text }: { readonly text: string }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="what-now-why">
      <button
        className="button"
        type="button"
        aria-expanded={open}
        aria-controls="what-now-reason"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Почему
      </button>
      <p id="what-now-reason" hidden={!open}>
        {text}
      </p>
    </div>
  );
}

export function WhatNowCard({
  view,
  tasks,
  onStart,
  onAgain,
}: WhatNowCardProps): React.JSX.Element {
  if (view.kind === 'no-available-tasks' || !view.answer.action)
    return (
      <article className="what-now-card" aria-label="Совет AI">
        <p>
          {view.kind === 'no-available-tasks'
            ? view.reason
            : view.answer.reason}
        </p>
      </article>
    );
  const { taskId, subtaskId } = view.answer.action;
  const task = tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  return (
    <article className="what-now-card" aria-label="Совет AI">
      <p className="what-now-title">
        {subtask ? `${subtask.title} · ${task?.title ?? ''}` : task?.title}
      </p>
      <Reason text={view.answer.reason} />
      <div className="what-now-actions">
        {task && (
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              onStart(task);
            }}
          >
            Начать
          </button>
        )}
        <button className="button" type="button" onClick={onAgain}>
          Другое
        </button>
      </div>
    </article>
  );
}
