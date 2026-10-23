import React from 'react';
import type { IpcHistoryEntry } from '../shared/contracts';
import type { PersistedState } from './use-persisted-tasks';
import { historyEntryText } from './history-copy';

export type UndoOutcome =
  'ok' | 'UndoConflict' | 'AlreadyUndone' | 'NotUndoable' | 'failed';

export interface HistoryState {
  readonly entries: readonly IpcHistoryEntry[];
  readonly open: boolean;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly notice: string | undefined;
  readonly setOpen: (open: boolean) => void;
  readonly undo: (entryId?: string) => Promise<UndoOutcome>;
  readonly refresh: () => Promise<void>;
}

interface HistoryControls {
  readonly setEntries: React.Dispatch<
    React.SetStateAction<readonly IpcHistoryEntry[]>
  >;
  readonly setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setError: React.Dispatch<React.SetStateAction<string | undefined>>;
}

function useHistoryLoader(controls: HistoryControls) {
  const refresh = React.useCallback(async (): Promise<void> => {
    controls.setLoading(true);
    try {
      const result = await window.flowpilot.history.list();
      if (!result.ok) {
        controls.setError('Не удалось загрузить историю. Попробуйте ещё раз.');
        return;
      }
      controls.setError(undefined);
      controls.setEntries(
        [...result.value].sort((left, right) =>
          right.occurredAt.localeCompare(left.occurredAt),
        ),
      );
    } catch {
      controls.setError('Не удалось загрузить историю. Попробуйте ещё раз.');
    } finally {
      controls.setLoading(false);
    }
  }, [controls]);
  React.useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return refresh;
}

function outcomeNotice(outcome: UndoOutcome): string {
  if (outcome === 'UndoConflict')
    return 'Отмена невозможна: карточка изменена позже. Новые данные сохранены.';
  if (outcome === 'AlreadyUndone') return 'Эта запись уже отменена.';
  if (outcome === 'NotUndoable') return 'Это действие нельзя отменить.';
  return 'Не удалось отменить изменение. Попробуйте ещё раз.';
}

function useUndo(
  entries: readonly IpcHistoryEntry[],
  refresh: () => Promise<void>,
  refreshSnapshot: React.RefObject<PersistedState['refresh']>,
  setNotice: React.Dispatch<React.SetStateAction<string | undefined>>,
): HistoryState['undo'] {
  return React.useCallback(
    async (entryId?: string): Promise<UndoOutcome> => {
      const entry = entryId
        ? entries.find((item) => item.id === entryId)
        : entries[0];
      try {
        const result = await window.flowpilot.history.undo(entryId);
        if (!result.ok) {
          await refresh();
          if (
            result.error === 'UndoConflict' ||
            result.error === 'AlreadyUndone' ||
            result.error === 'NotUndoable'
          ) {
            setNotice(outcomeNotice(result.error));
            return result.error;
          }
          setNotice(outcomeNotice('failed'));
          return 'failed';
        }
        setNotice(`Отменено: ${entry ? historyEntryText(entry) : 'изменение'}`);
        await refreshSnapshot.current();
        await refresh();
        return 'ok';
      } catch {
        setNotice(outcomeNotice('failed'));
        return 'failed';
      }
    },
    [entries, refresh, refreshSnapshot, setNotice],
  );
}

function useUndoShortcut(undo: HistoryState['undo']): void {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z')
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      event.preventDefault();
      void undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [undo]);
}

export function useHistory(
  refreshSnapshot: PersistedState['refresh'],
): HistoryState {
  const [entries, setEntries] = React.useState<readonly IpcHistoryEntry[]>([]);
  const [open, setOpen] = React.useState(false);
  const refreshSnapshotRef = React.useRef(refreshSnapshot);
  React.useEffect(() => {
    refreshSnapshotRef.current = refreshSnapshot;
  }, [refreshSnapshot]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const controls = React.useMemo(
    () => ({ setEntries, setLoading, setError }),
    [setEntries, setError, setLoading],
  );
  const refresh = useHistoryLoader(controls);
  const undo = useUndo(entries, refresh, refreshSnapshotRef, setNotice);
  useUndoShortcut(undo);
  return { entries, open, loading, error, notice, setOpen, undo, refresh };
}
