import React from 'react';
import type { Task } from '../../domain/task';
import { useWhatNow } from '../what-now/use-what-now';
import { WhatNowCard } from './what-now-card';

interface WhatNowPanelProps {
  readonly tasks: readonly Task[];
  readonly onStart: (task: Task) => void;
}

export function WhatNowPanel({
  tasks,
  onStart,
}: WhatNowPanelProps): React.JSX.Element {
  const { state, ask, cancel } = useWhatNow();
  return (
    <section className="what-now" aria-label="Подсказка AI">
      <button
        className="button"
        type="button"
        disabled={state.phase === 'running'}
        onClick={ask}
      >
        Что делать сейчас?
      </button>
      {state.phase === 'running' && (
        <p role="status">
          Жду ответ AI…{' '}
          <button className="button" type="button" onClick={cancel}>
            Отменить
          </button>
        </p>
      )}
      {state.phase === 'error' && (
        <p role="alert" className="chat-error">
          {state.message}
        </p>
      )}
      {state.phase === 'answer' && (
        <WhatNowCard
          view={state.view}
          tasks={tasks}
          onStart={onStart}
          onAgain={ask}
        />
      )}
    </section>
  );
}
