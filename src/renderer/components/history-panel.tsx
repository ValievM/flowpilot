import React from 'react';
import type { IpcHistoryEntry } from '../../shared/contracts';
import { historyEntryText } from '../history-copy';
import type { UndoOutcome } from '../use-history';

interface HistoryPanelProps {
  readonly open: boolean;
  readonly entries: readonly IpcHistoryEntry[];
  readonly tasks: readonly { readonly id: string; readonly title: string }[];
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly onClose: () => void;
  readonly onUndo: (entryId: string) => Promise<UndoOutcome>;
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
}

interface HistoryEntryProps {
  readonly entry: IpcHistoryEntry;
  readonly entries: readonly IpcHistoryEntry[];
  readonly tasks: HistoryPanelProps['tasks'];
  readonly outcome: UndoOutcome | undefined;
  readonly onUndo: HistoryPanelProps['onUndo'];
}

function entryTime(occurredAt: string): string {
  const instant = new Date(occurredAt);
  if (Number.isNaN(instant.getTime())) return 'Время неизвестно';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(instant);
}

function outcomeText(outcome: UndoOutcome): string | undefined {
  if (outcome === 'UndoConflict')
    return 'Карточка изменена позже. Новые данные сохранены.';
  if (outcome === 'AlreadyUndone') return 'Эта запись уже отменена.';
  if (outcome === 'NotUndoable') return 'Эту запись нельзя отменить.';
  if (outcome === 'failed')
    return 'Не удалось отменить изменение. Попробуйте ещё раз.';
  return undefined;
}

function taskIds(entry: IpcHistoryEntry): readonly string[] {
  return [
    ...new Set(
      entry.entities.filter(({ kind }) => kind === 'task').map(({ id }) => id),
    ),
  ];
}

function titleForTask(id: string, tasks: HistoryPanelProps['tasks']): string {
  return tasks.find((task) => task.id === id)?.title ?? 'карточка недоступна';
}

function wasUndone(
  entry: IpcHistoryEntry,
  entries: readonly IpcHistoryEntry[],
): boolean {
  return entries.some(({ undoneEntryId }) => undoneEntryId === entry.id);
}

function undoUnavailable(
  entry: IpcHistoryEntry,
  outcome: UndoOutcome | undefined,
  alreadyUndone: boolean,
): boolean {
  return (
    alreadyUndone ||
    entry.source === 'undo' ||
    entry.source === 'restore' ||
    outcome === 'AlreadyUndone' ||
    outcome === 'NotUndoable'
  );
}

function HistoryEntry({
  entry,
  entries,
  tasks,
  outcome,
  onUndo,
}: HistoryEntryProps): React.JSX.Element {
  const alreadyUndone = wasUndone(entry, entries);
  const affectedTasks = taskIds(entry);
  const feedback = outcome ? outcomeText(outcome) : undefined;
  return (
    <li className="history-entry">
      <time dateTime={entry.occurredAt}>{entryTime(entry.occurredAt)}</time>
      <p>{historyEntryText(entry)}</p>
      {affectedTasks.map((id) => (
        <p className="history-card" key={id}>
          Карточка: {titleForTask(id, tasks)}
        </p>
      ))}
      <button
        className="button"
        type="button"
        disabled={undoUnavailable(entry, outcome, alreadyUndone)}
        aria-label={`Отменить: ${historyEntryText(entry)}`}
        onClick={() => {
          void onUndo(entry.id);
        }}
      >
        Отменить
      </button>
      {alreadyUndone && <p>Уже отменено.</p>}
      {(entry.source === 'undo' || entry.source === 'restore') && (
        <p>Эту запись нельзя отменить.</p>
      )}
      {feedback && <p role="alert">{feedback}</p>}
      {outcome === 'ok' && (
        <p role="status">Отменено: {historyEntryText(entry)}</p>
      )}
      {outcome === 'UndoConflict' && affectedTasks.length > 0 && (
        <ul aria-label="Карточки, изменённые позже">
          {affectedTasks.map((id) => (
            <li key={id}>{titleForTask(id, tasks)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function HistoryPanel({
  open,
  entries,
  tasks,
  loading,
  error,
  onClose,
  onUndo,
  triggerRef,
}: HistoryPanelProps): React.JSX.Element {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [outcomes, setOutcomes] = React.useState<
    Readonly<Record<string, UndoOutcome>>
  >({});
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const undoEntry = async (id: string): Promise<UndoOutcome> => {
    const outcome = await onUndo(id);
    setOutcomes((current) => ({ ...current, [id]: outcome }));
    return outcome;
  };
  const closeAndFocus = (): void => {
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  return (
    <dialog
      className="history-dialog"
      ref={dialogRef}
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault();
        closeAndFocus();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="history-title">История</h2>
        <button
          className="button icon-button"
          type="button"
          aria-label="Закрыть историю"
          onClick={closeAndFocus}
        >
          ×
        </button>
      </div>
      {loading && <p role="status">Загружаем историю…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="history-empty">История пока пуста.</p>
      )}
      <ol
        className="history-list"
        aria-label="Записи истории от новых к старым"
      >
        {entries.map((entry) => (
          <HistoryEntry
            key={entry.id}
            entry={entry}
            entries={entries}
            tasks={tasks}
            outcome={outcomes[entry.id]}
            onUndo={undoEntry}
          />
        ))}
      </ol>
    </dialog>
  );
}
