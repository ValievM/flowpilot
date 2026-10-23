import React from 'react';
import type { Task } from '../../domain';
import {
  describeChanges,
  errorText,
  formatValue,
  rejectedReasonText,
} from '../chat/chat-copy';
import type { ChatChange, ChatRejectedCommand } from '../chat/chat-outcome';
import type { ChatModel, ChatTurn } from '../chat/use-chat';
import { WhatNowCard } from './what-now-card';

function Rejected({
  rejected,
}: {
  readonly rejected: readonly ChatRejectedCommand[];
}): React.JSX.Element | null {
  if (rejected.length === 0) return null;
  return (
    <div className="chat-rejected" role="note">
      <p>Не применено команд: {rejected.length}</p>
      <ul>
        {rejected.map((item) => (
          <li key={`${item.index.toString()}-${item.kind}`}>
            {item.kind}: {rejectedReasonText(item.reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function unreadFiles(
  changes: readonly ChatChange[],
  tasks: readonly Task[],
): string[] {
  const ids = new Set(changes.map((change) => change.entityId));
  return tasks
    .filter((task) => ids.has(task.id))
    .flatMap((task) => task.attachments.map((file) => file.name));
}

function Diff({
  changes,
  tasks,
}: {
  readonly changes: readonly ChatChange[];
  readonly tasks: readonly Task[];
}): React.JSX.Element {
  const groups = new Map<string, ChatChange[]>();
  for (const change of changes)
    groups.set(change.entityId, [
      ...(groups.get(change.entityId) ?? []),
      change,
    ]);
  const files = unreadFiles(changes, tasks);
  return (
    <div className="chat-diff">
      {[...groups].map(([entityId, list]) => {
        const known = tasks.find((task) => task.id === entityId)?.title;
        const created = list.find((change) => change.field === 'title');
        return (
          <section className="chat-diff-group" key={entityId}>
            <h4>
              {known ??
                (created ? formatValue(created.after) : 'Новая карточка')}
              {!known && <span className="chat-new">Новая карточка</span>}
            </h4>
            <dl>
              {describeChanges(list).map((row) => (
                <div className="chat-diff-row" key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.before !== '—' && (
                      <>
                        <span className="chat-before">{row.before}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only"> стало </span>
                      </>
                    )}
                    <span className="chat-after">{row.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {files.length > 0 && (
        <p className="chat-note">
          Файлы AI не читал:{' '}
          {files.map((name) => `${name} — не прочитан`).join(', ')}
        </p>
      )}
    </div>
  );
}

function ManualExchange({
  turn,
  onReply,
}: {
  readonly turn: ChatTurn;
  readonly onReply: ChatModel['replyManually'];
}): React.JSX.Element | null {
  const [reply, setReply] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  if (!turn.manual) return null;
  const { prompt } = turn.manual;
  return (
    <div className="chat-manual">
      <label>
        Запрос для AI
        <textarea readOnly value={prompt} rows={5} />
      </label>
      <button
        className="button"
        type="button"
        onClick={() => {
          void navigator.clipboard
            .writeText(prompt)
            .then(() => {
              setCopied(true);
            })
            .catch(() => {
              setCopied(false);
            });
        }}
      >
        {copied ? 'Скопировано' : 'Скопировать запрос'}
      </button>
      <label>
        Ответ AI (JSON)
        <textarea
          value={reply}
          rows={5}
          onChange={(event) => {
            setReply(event.target.value);
          }}
        />
      </label>
      {failed && (
        <p role="alert" className="chat-error">
          Этот запрос уже закрыт. Отправьте новый.
        </p>
      )}
      <button
        className="button primary"
        type="button"
        disabled={reply.trim() === ''}
        onClick={() => {
          void onReply(turn.id, reply).then((ok) => {
            setFailed(!ok);
          });
        }}
      >
        Передать ответ
      </button>
    </div>
  );
}

export function ChatTurnView({
  turn,
  tasks,
  chat,
  onStart,
}: {
  readonly turn: ChatTurn;
  readonly tasks: readonly Task[];
  readonly chat: ChatModel;
  readonly onStart: (task: Task) => void;
}): React.JSX.Element {
  const { state } = turn;
  return (
    <li className="chat-turn">
      <p className="chat-user">{turn.text}</p>
      <div className="chat-reply">
        {state.phase === 'running' && (
          <>
            <p role="status">Жду ответ AI…</p>
            <ManualExchange turn={turn} onReply={chat.replyManually} />
            <button className="button" type="button" onClick={chat.cancel}>
              Отменить запрос
            </button>
          </>
        )}
        {state.phase === 'proposal' && (
          <>
            <h3>Предложение AI</h3>
            <Diff changes={state.changes} tasks={tasks} />
            <Rejected rejected={state.rejected} />
            <div className="chat-actions">
              <button
                className="button primary"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  chat.confirm(turn.id);
                }}
              >
                Применить
              </button>
              <button
                className="button"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  chat.decline(turn.id);
                }}
              >
                Отклонить
              </button>
            </div>
          </>
        )}
        {state.phase === 'applied' && (
          <>
            <p role="status">
              {state.undone ? 'Изменения отменены.' : 'Изменения применены.'}
            </p>
            <Rejected rejected={state.rejected} />
            {!state.undone && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  chat.undo(turn.id);
                }}
              >
                Отменить изменения
              </button>
            )}
          </>
        )}
        {state.phase === 'whatNow' && (
          <WhatNowCard
            view={state.view}
            tasks={tasks}
            onStart={onStart}
            onAgain={chat.askWhatNow}
          />
        )}
        {state.phase === 'declined' && (
          <p role="status">Предложение отклонено. Данные не изменены.</p>
        )}
        {state.phase === 'cancelled' && (
          <p role="status">{errorText('Aborted')}</p>
        )}
        {state.phase === 'error' && (
          <p role="alert" className="chat-error">
            {state.message}
          </p>
        )}
      </div>
    </li>
  );
}
