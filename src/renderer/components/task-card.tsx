import React from 'react';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';
import { deadlineRisk } from '../../domain/risk/risk';
import { deadlineMessage, deadlineTitle } from '../deadline-copy';
import type { PersistedState } from '../use-persisted-tasks';
import { TaskAttachments } from './task-attachments';
import { TaskCardActivity } from './task-card-activity';
import { TaskCardScheduleFields } from './task-card-schedule-fields';
import { TaskCardStatusFields } from './task-card-status-fields';
import { TaskCardTextFields } from './task-card-text-fields';
import type { TaskUpdateChanges } from './task-card-types';

function taskDraftValues(task: Task): {
  readonly title: string;
  readonly description: string;
  readonly estimate: string;
} {
  return {
    title: task.title,
    description: task.description ?? '',
    estimate: task.estimate?.value.toString() ?? '',
  };
}

export function TaskCard({
  task,
  state,
  today,
  workdays,
  onClose,
}: {
  readonly task: Task;
  readonly state: PersistedState;
  readonly today: TemporalTypes.PlainDate;
  readonly workdays: ReadonlySet<number>;
  readonly onClose: () => void;
}): React.JSX.Element {
  const initialDraft = taskDraftValues(task);
  const [title, setTitle] = React.useState(initialDraft.title);
  const [description, setDescription] = React.useState(
    initialDraft.description,
  );
  const [estimate, setEstimate] = React.useState(initialDraft.estimate);
  const previousTask = React.useRef(task);
  const previousDraft = React.useRef(initialDraft);
  React.useEffect(() => {
    if (previousTask.current !== task) {
      const previous = previousDraft.current;
      const next = taskDraftValues(task);
      setTitle(title === previous.title ? next.title : title);
      setDescription(
        description === previous.description ? next.description : description,
      );
      setEstimate(estimate === previous.estimate ? next.estimate : estimate);
      previousTask.current = task;
      previousDraft.current = next;
    }
  }, [task, title, description, estimate]);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const risk = deadlineRisk(task, today, workdays);
  const riskText = deadlineMessage(risk);
  const isRisk = risk.ok && ['tight', 'short', 'overdue'].includes(risk.risk);
  const announce = (result: 'saved' | 'stale' | 'failed'): void => {
    setMessage(
      result === 'saved'
        ? 'Сохранено'
        : result === 'stale'
          ? 'Данные задачи изменились. Показана актуальная карточка; повторите изменение.'
          : (state.commandError ?? 'Не удалось сохранить. Попробуйте ещё раз.'),
    );
  };
  const applyCard: PersistedState['applyCard'] = async (commands) => {
    setSaving(true);
    const result = await state.applyCard(commands);
    setSaving(false);
    announce(result);
    return result;
  };
  const update = async (changes: TaskUpdateChanges): Promise<void> => {
    await applyCard([
      { kind: 'task.update', id: task.id, changes },
    ] satisfies CommandsApplyRequest['commands']);
  };
  const saveText = async (
    key: 'title' | 'description',
    value: string,
    original: string,
  ): Promise<void> => {
    const next = key === 'title' ? value.trim() : value;
    if (next === original) return;
    if (key === 'title' && !next) {
      setTitle(task.title);
      setMessage('Название не может быть пустым.');
      return;
    }
    await update({
      [key]: key === 'description' && !next.trim() ? null : next,
    });
  };
  const closeOnEscape = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <aside
      className="task-card"
      aria-label={`Карточка задачи: ${task.title}`}
      onKeyDown={closeOnEscape}
    >
      <header className="task-card-header">
        <span className="eyebrow">ЗАДАЧА</span>
        <button
          className="button icon-button"
          type="button"
          aria-label="Закрыть карточку задачи"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="task-card-content">
        <TaskCardTextFields
          title={title}
          description={description}
          riskText={riskText}
          riskTitle={deadlineTitle(risk)}
          isRisk={isRisk}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onTitleBlur={() => {
            void saveText('title', title, task.title);
          }}
          onDescriptionBlur={() => {
            void saveText('description', description, task.description ?? '');
          }}
        />
        <div className="task-card-fields">
          <TaskCardStatusFields
            task={task}
            columns={state.columns}
            onApply={applyCard}
          />
          <TaskCardScheduleFields
            task={task}
            today={today}
            estimate={estimate}
            onEstimateChange={setEstimate}
            onUpdate={update}
            onInvalidEstimate={() => {
              setMessage('Укажите целое число рабочих дней от 1.');
            }}
          />
        </div>
        <TaskAttachments task={task} refresh={() => state.refresh()} />
        <TaskCardActivity task={task} onApply={applyCard} />
      </div>
      <p className="task-card-status" role="status" aria-live="polite">
        {saving ? 'Сохраняем…' : message || (state.isSaved ? 'Сохранено' : '')}
      </p>
    </aside>
  );
}
