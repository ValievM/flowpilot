import React from 'react';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';

const SNAPSHOT_LOAD_ERROR =
  'Не удалось загрузить доску. Проверьте хранилище и повторите попытку.';

type SnapshotSetters = {
  setSnapshot: React.Dispatch<React.SetStateAction<IpcSnapshot | undefined>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

export type ApplyResult = { ok: true } | { ok: false; message: string };

type ApplyInput = SnapshotSetters & {
  snapshot: IpcSnapshot | undefined;
  commands: CommandsApplyRequest['commands'];
  load: () => Promise<boolean>;
  isCurrent?: () => boolean;
};

export type BoardSnapshotState = {
  snapshot: IpcSnapshot | undefined;
  loading: boolean;
  error: string;
  notice: string;
  load: () => Promise<boolean>;
  retry: () => void;
  apply: (
    commands: CommandsApplyRequest['commands'],
    isCurrent?: () => boolean,
  ) => Promise<ApplyResult>;
};

export function useBoardSnapshot(): BoardSnapshotState {
  const [snapshot, setSnapshot] = React.useState<IpcSnapshot>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const setters = { setSnapshot, setLoading, setError, setNotice };
  const load = React.useCallback(
    () =>
      loadBoardSnapshot({
        setSnapshot,
        setLoading,
        setError,
        setNotice,
      }),
    [],
  );
  const retry = (): void => {
    void load();
  };

  React.useEffect(() => {
    void load();
  }, [load]);

  const apply = (
    commands: CommandsApplyRequest['commands'],
    isCurrent?: () => boolean,
  ): Promise<ApplyResult> =>
    applyBoardCommands({
      ...setters,
      snapshot,
      commands,
      load: () => loadBoardSnapshot(setters, isCurrent, false),
      ...(isCurrent !== undefined ? { isCurrent } : {}),
    });
  return { snapshot, loading, error, notice, load, retry, apply };
}

async function loadBoardSnapshot(
  setters: SnapshotSetters,
  isCurrent?: () => boolean,
  showLoading = true,
): Promise<boolean> {
  if (showLoading) setters.setLoading(true);
  try {
    const result = await window.flowpilot.snapshot.load();
    if (!result.ok) {
      setMessageIfCurrent(setters.setError, isCurrent, SNAPSHOT_LOAD_ERROR);
      return false;
    }
    setters.setSnapshot(result.value);
    setMessageIfCurrent(setters.setError, isCurrent, '');
    return true;
  } catch {
    setMessageIfCurrent(setters.setError, isCurrent, SNAPSHOT_LOAD_ERROR);
    return false;
  } finally {
    if (showLoading) setters.setLoading(false);
  }
}

function setMessageIfCurrent(
  setter: SnapshotSetters['setError'],
  isCurrent: (() => boolean) | undefined,
  message: string,
): void {
  if (isCurrent?.() ?? true) setter(message);
}

async function applyBoardCommands(input: ApplyInput): Promise<ApplyResult> {
  if (!input.snapshot) {
    return { ok: false, message: 'Доска ещё не загружена.' };
  }
  const isCurrent = input.isCurrent ?? (() => true);
  setMessageIfCurrent(input.setError, isCurrent, '');
  try {
    const result = await window.flowpilot.commands.apply({
      commands: input.commands,
      expectedRevision: input.snapshot.revision,
    });
    if (result.ok) {
      input.setSnapshot(result.value);
      setMessageIfCurrent(input.setNotice, isCurrent, 'Изменения сохранены.');
      return { ok: true };
    }
    if (result.error === 'StaleRevision') {
      setMessageIfCurrent(
        input.setNotice,
        isCurrent,
        'Доска изменилась в другом месте. Актуальные данные загружаются; это изменение не применено.',
      );
      const refreshed = await input.load();
      const message = refreshed
        ? 'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.'
        : 'Доска изменилась в другом месте. Актуальные данные загрузить не удалось; это изменение не применено.';
      setMessageIfCurrent(input.setNotice, isCurrent, message);
      return { ok: false, message };
    }
    const message =
      'Не удалось сохранить изменения. Проверьте данные и повторите попытку.';
    setMessageIfCurrent(input.setError, isCurrent, message);
    return { ok: false, message };
  } catch {
    const message =
      'Не удалось сохранить изменения. Проверьте соединение и повторите попытку.';
    setMessageIfCurrent(input.setError, isCurrent, message);
    return { ok: false, message };
  }
}
