import React from 'react';
import type { Task } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';
import type { PersistedState } from '../use-persisted-tasks';

type Commands = CommandsApplyRequest['commands'];

export function TaskCardActivity({
  task,
  onApply,
}: {
  readonly task: Task;
  readonly onApply: PersistedState['applyCard'];
}): React.JSX.Element {
  const subtaskInputRef = React.useRef<HTMLInputElement>(null);
  const commentInputRef = React.useRef<HTMLInputElement>(null);
  const [subtaskText, setSubtaskText] = React.useState('');
  const [commentText, setCommentText] = React.useState('');
  const add = async (
    event: React.SyntheticEvent<HTMLFormElement>,
    text: string,
    kind: 'subtask' | 'comment',
  ): Promise<void> => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const commands: Commands =
      kind === 'subtask'
        ? [
            {
              kind: 'subtask.add',
              taskId: task.id,
              subtask: {
                id: crypto.randomUUID(),
                title: trimmed,
                completed: false,
              },
            },
          ]
        : [
            {
              kind: 'comment.add',
              taskId: task.id,
              comment: { id: crypto.randomUUID(), text: trimmed },
            },
          ];
    const result = await onApply(commands);
    if (result === 'saved') {
      if (kind === 'subtask') {
        setSubtaskText('');
        subtaskInputRef.current?.focus();
      } else {
        setCommentText('');
        commentInputRef.current?.focus();
      }
    }
  };
  const complete = async (
    subtaskId: string,
    completed: boolean,
  ): Promise<void> => {
    await onApply([
      { kind: 'subtask.complete', taskId: task.id, subtaskId, completed },
    ]);
  };
  return (
    <>
      <section
        className="task-card-section"
        aria-labelledby="task-card-subtasks"
      >
        <h2 id="task-card-subtasks">Подзадачи</h2>
        {task.subtasks.map((subtask) => (
          <label className="task-subtask" key={subtask.id}>
            <input
              type="checkbox"
              checked={subtask.completed}
              onChange={(event) => {
                void complete(subtask.id, event.target.checked);
              }}
            />
            {subtask.title}
          </label>
        ))}
        <form
          className="task-inline-form"
          onSubmit={(event) => {
            void add(event, subtaskText, 'subtask');
          }}
        >
          <input
            ref={subtaskInputRef}
            aria-label="Новая подзадача"
            value={subtaskText}
            onChange={(event) => {
              setSubtaskText(event.target.value);
            }}
            placeholder="Добавить подзадачу"
          />
          <button
            className="button"
            type="submit"
            disabled={!subtaskText.trim()}
          >
            Добавить
          </button>
        </form>
      </section>
      <section
        className="task-card-section"
        aria-labelledby="task-card-comments"
      >
        <h2 id="task-card-comments">Комментарии</h2>
        {task.comments.map((comment) => (
          <article className="task-comment" key={comment.id}>
            <p>{comment.text}</p>
          </article>
        ))}
        <form
          className="task-inline-form"
          onSubmit={(event) => {
            void add(event, commentText, 'comment');
          }}
        >
          <input
            ref={commentInputRef}
            aria-label="Новый комментарий"
            value={commentText}
            onChange={(event) => {
              setCommentText(event.target.value);
            }}
            placeholder="Оставить заметку"
          />
          <button
            className="button"
            type="submit"
            disabled={!commentText.trim()}
          >
            Добавить
          </button>
        </form>
      </section>
    </>
  );
}
