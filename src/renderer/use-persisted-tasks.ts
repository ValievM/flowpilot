import React from 'react';
import type { Task } from '../domain';
import { parsedTasks } from './parse-ipc-tasks';
import type { CommandsApplyRequest, IpcSnapshot } from '../shared/contracts';
import type { FlowPilotApi } from '../shared/flowpilot-api';

export interface PersistedState {
  readonly tasks: readonly Task[];
  readonly columns: IpcSnapshot['columns'];
  readonly revision: number;
  readonly workdays: ReadonlySet<number>;
  readonly loadError: string | undefined;
  readonly commandError: string | undefined;
  readonly settingsError: string | undefined;
  readonly isLoading: boolean;
  readonly isSaved: boolean;
  refresh(): Promise<IpcSnapshot | undefined>;
  updateWorkdays(workdays: ReadonlySet<number>): Promise<boolean>;
  apply(commands: CommandsApplyRequest['commands']): Promise<boolean>;
  applyCard(
    commands: CommandsApplyRequest['commands'],
  ): Promise<'saved' | 'stale' | 'failed'>;
}

interface PersistenceControls {
  readonly setSnapshot: React.Dispatch<
    React.SetStateAction<IpcSnapshot | undefined>
  >;
  readonly setLoadError: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  readonly setCommandError: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  readonly setSettingsError: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  readonly setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setSaved: React.Dispatch<React.SetStateAction<boolean>>;
}

function useSnapshotRefresh(api: FlowPilotApi, controls: PersistenceControls) {
  return React.useCallback(async (): Promise<IpcSnapshot | undefined> => {
    controls.setLoading(true);
    try {
      const result = await api.snapshot.load();
      if (!result.ok) throw new Error('snapshot');
      controls.setSnapshot(result.value);
      controls.setLoadError(undefined);
      return result.value;
    } catch {
      controls.setLoadError(
        'Не удалось загрузить сохранённые задачи. Проверьте приложение и попробуйте снова.',
      );
      return undefined;
    } finally {
      controls.setLoading(false);
    }
  }, [api, controls]);
}

function useWorkdaysUpdate(
  api: FlowPilotApi,
  snapshot: IpcSnapshot | undefined,
  controls: PersistenceControls,
): (workdays: ReadonlySet<number>) => Promise<boolean> {
  return React.useCallback(
    async (workdays) => {
      if (!snapshot || workdays.size === 0) return false;
      controls.setSaved(false);
      controls.setSettingsError(undefined);
      try {
        const latest = await api.snapshot.load();
        if (!latest.ok) throw new Error('snapshot');
        const result = await api.settings.set({
          key: 'workdays',
          value: [...workdays].sort(),
          expectedRevision: latest.value.revision,
        });
        if (!result.ok) throw new Error('settings');
        controls.setSnapshot(result.value);
        controls.setSaved(true);
        return true;
      } catch {
        controls.setSettingsError(
          'Не удалось сохранить рабочие дни. Настройка не изменена; попробуйте снова.',
        );
        controls.setSaved(true);
        return false;
      }
    },
    [api, controls, snapshot],
  );
}

async function applyAfterStale(
  api: FlowPilotApi,
  commands: CommandsApplyRequest['commands'],
  fresh: IpcSnapshot,
): Promise<IpcSnapshot> {
  const retry = await api.commands.apply({
    commands,
    expectedRevision: fresh.revision,
  });
  if (!retry.ok) throw new Error('retry');
  return retry.value;
}

function useCommandApply(
  api: FlowPilotApi,
  snapshot: IpcSnapshot | undefined,
  refresh: () => Promise<IpcSnapshot | undefined>,
  controls: PersistenceControls,
) {
  return React.useCallback(
    async (commands: CommandsApplyRequest['commands']): Promise<boolean> => {
      if (!snapshot) {
        controls.setCommandError(
          'Задачи ещё не загружены. Попробуйте снова после загрузки.',
        );
        return false;
      }
      controls.setSaved(false);
      try {
        const result = await api.commands.apply({
          commands,
          expectedRevision: snapshot.revision,
        });
        if (!result.ok && result.error !== 'StaleRevision') {
          controls.setCommandError(
            'Сохранение не удалось. Данные не изменены; попробуйте снова.',
          );
          controls.setSaved(true);
          return false;
        }
        const fresh = result.ok ? result.value : await refresh();
        if (!fresh) {
          controls.setSaved(true);
          return false;
        }
        const saved = result.ok
          ? fresh
          : await applyAfterStale(api, commands, fresh);
        controls.setSnapshot(saved);
        controls.setSaved(true);
        controls.setCommandError(undefined);
        return true;
      } catch {
        controls.setCommandError(
          'Сохранение не удалось. Данные не изменены; попробуйте снова.',
        );
        return false;
      }
    },
    [api, controls, refresh, snapshot],
  );
}
function useTaskCardApply(
  api: FlowPilotApi,
  snapshot: IpcSnapshot | undefined,
  refresh: () => Promise<IpcSnapshot | undefined>,
  controls: PersistenceControls,
): PersistedState['applyCard'] {
  return React.useCallback(
    async (commands) => {
      if (!snapshot) return 'failed';
      controls.setSaved(false);
      try {
        const result = await api.commands.apply({
          commands,
          expectedRevision: snapshot.revision,
        });
        if (!result.ok && result.error === 'StaleRevision') {
          const fresh = await refresh();
          if (fresh) controls.setSnapshot(fresh);
          controls.setSaved(true);
          controls.setCommandError(
            'Данные задачи изменились. Показана актуальная карточка; повторите изменение.',
          );
          return 'stale';
        }
        if (!result.ok) {
          controls.setSaved(true);
          controls.setCommandError(
            'Сохранение не удалось. Данные не изменены; попробуйте снова.',
          );
          return 'failed';
        }
        controls.setSnapshot(result.value);
        controls.setSaved(true);
        controls.setCommandError(undefined);
        return 'saved';
      } catch {
        controls.setSaved(true);
        controls.setCommandError(
          'Сохранение не удалось. Данные не изменены; попробуйте снова.',
        );
        return 'failed';
      }
    },
    [api, controls, refresh, snapshot],
  );
}

export function usePersistedTasks(
  api: FlowPilotApi = window.flowpilot,
): PersistedState {
  const [snapshot, setSnapshot] = React.useState<IpcSnapshot>();
  const [loadError, setLoadError] = React.useState<string>();
  const [commandError, setCommandError] = React.useState<string>();
  const [settingsError, setSettingsError] = React.useState<string>();
  const [isLoading, setLoading] = React.useState(true);
  const [isSaved, setSaved] = React.useState(true);
  const controls = React.useMemo(
    () => ({
      setSnapshot,
      setLoadError,
      setCommandError,
      setSettingsError,
      setLoading,
      setSaved,
    }),
    [
      setCommandError,
      setLoadError,
      setLoading,
      setSaved,
      setSettingsError,
      setSnapshot,
    ],
  );
  const refresh = useSnapshotRefresh(api, controls);
  const updateWorkdays = useWorkdaysUpdate(api, snapshot, controls);
  const apply = useCommandApply(api, snapshot, refresh, controls);
  const applyCard = useTaskCardApply(api, snapshot, refresh, controls);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const parsed = parsedTasks(snapshot);
  return {
    ...parsed,
    loadError,
    commandError,
    settingsError,
    isLoading,
    isSaved,
    refresh,
    updateWorkdays,
    apply,
    applyCard,
  };
}
