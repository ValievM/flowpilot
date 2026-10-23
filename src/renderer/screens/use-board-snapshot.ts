import React from 'react';
import { toWireCommands } from '../wire-commands';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';

const SNAPSHOT_LOAD_ERROR =
  'Не удалось загрузить доску. Проверьте хранилище и повторите попытку.';

type SnapshotSetters = {
  setSnapshot: React.Dispatch<React.SetStateAction<IpcSnapshot | undefined>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

type SnapshotLoadResult = 'loaded' | 'superseded' | 'failed';

export type ApplyResult = { ok: true } | { ok: false; message: string };

type ApplyInput = SnapshotSetters & {
  snapshot: IpcSnapshot | undefined;
  commands: CommandsApplyRequest['commands'];
  load: () => Promise<SnapshotLoadResult>;
  isCurrent?: () => boolean;
};

export type BoardSnapshotState = {
  snapshot: IpcSnapshot | undefined;
  loading: boolean;
  error: string;
  notice: string;
  load: () => Promise<SnapshotLoadResult>;
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
  const latestLoad = React.useRef(0);
  const setters = { setSnapshot, setLoading, setError, setNotice };
  const loadCurrent = React.useCallback(
    (isCurrent?: () => boolean, showLoading = true) => {
      const loadId = latestLoad.current + 1;
      latestLoad.current = loadId;
      return loadBoardSnapshot(
        { setSnapshot, setLoading, setError, setNotice },
        () => loadId === latestLoad.current && (isCurrent?.() ?? true),
        showLoading,
      );
    },
    [],
  );
  const load = React.useCallback(() => loadCurrent(), [loadCurrent]);
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
      load: () => loadCurrent(isCurrent, false),
      ...(isCurrent !== undefined ? { isCurrent } : {}),
    });
  return { snapshot, loading, error, notice, load, retry, apply };
}

async function loadBoardSnapshot(
  setters: SnapshotSetters,
  isCurrent?: () => boolean,
  showLoading = true,
): Promise<SnapshotLoadResult> {
  if (showLoading) setters.setLoading(true);
  try {
    const result = await window.flowpilot.snapshot.load();
    if (!result.ok) {
      setMessageIfCurrent(setters.setError, isCurrent, SNAPSHOT_LOAD_ERROR);
      return 'failed';
    }
    if (!(isCurrent?.() ?? true)) return 'superseded';
    setters.setSnapshot(result.value);
    setMessageIfCurrent(setters.setError, isCurrent, '');
    return 'loaded';
  } catch {
    setMessageIfCurrent(setters.setError, isCurrent, SNAPSHOT_LOAD_ERROR);
    return 'failed';
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
      commands: toWireCommands(input.commands),
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
      if (refreshed === 'superseded') {
        return {
          ok: false,
          message:
            'Доска изменилась в другом месте. Актуальные данные ещё загружаются; это изменение не применено.',
        };
      }
      const message =
        refreshed === 'loaded'
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
