import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Task } from '../domain';
import type {
  CommandsApplyRequest,
  FlowPilotApi,
  IpcSnapshot,
} from '../shared/contracts';

export interface PersistedState {
  readonly tasks: readonly Task[];
  readonly columns: IpcSnapshot['columns'];
  readonly revision: number;
  readonly workdays: ReadonlySet<number>;
  readonly loadError: string | undefined;
  readonly commandError: string | undefined;
  readonly isLoading: boolean;
  readonly isSaved: boolean;
  refresh(): Promise<IpcSnapshot | undefined>;
  apply(commands: CommandsApplyRequest['commands']): Promise<boolean>;
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
  readonly setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setSaved: React.Dispatch<React.SetStateAction<boolean>>;
}

function taskFromIpc(task: IpcSnapshot['tasks'][number]): Task {
  const { day, time, deadline, rolledOverFrom, status, ...rest } = task;
  const parsedStatus: Task['status'] =
    status.kind === 'waiting'
      ? {
          kind: 'waiting',
          reason: status.reason,
          ...(status.until
            ? { until: Temporal.PlainDate.from(status.until) }
            : {}),
        }
      : status;
  return {
    ...rest,
    ...(day ? { day: Temporal.PlainDate.from(day) } : {}),
    ...(time ? { time: Temporal.PlainTime.from(time) } : {}),
    ...(deadline ? { deadline: Temporal.PlainDate.from(deadline) } : {}),
    ...(rolledOverFrom
      ? { rolledOverFrom: Temporal.PlainDate.from(rolledOverFrom) }
      : {}),
    status: parsedStatus,
  };
}

function parsedSnapshot(snapshot: IpcSnapshot) {
  const configured = snapshot.settings.workdays;
  const workdays = Array.isArray(configured)
    ? configured.filter((day): day is number => typeof day === 'number')
    : [1, 2, 3, 4, 5];
  return {
    tasks: snapshot.tasks.map(taskFromIpc),
    columns: snapshot.columns,
    revision: snapshot.revision,
    workdays: new Set(workdays),
  };
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
        const fresh = result.ok
          ? result.value
          : result.error === 'StaleRevision'
            ? await refresh()
            : undefined;
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

interface ParsedTasks {
  readonly tasks: readonly Task[];
  readonly columns: IpcSnapshot['columns'];
  readonly revision: number;
  readonly workdays: ReadonlySet<number>;
}

function parsedTasks(snapshot: IpcSnapshot | undefined): ParsedTasks {
  if (snapshot) return parsedSnapshot(snapshot);
  return {
    tasks: [],
    columns: [],
    revision: 0,
    workdays: new Set([1, 2, 3, 4, 5]),
  };
}

export function usePersistedTasks(
  api: FlowPilotApi = window.flowpilot,
): PersistedState {
  const [snapshot, setSnapshot] = React.useState<IpcSnapshot>();
  const [loadError, setLoadError] = React.useState<string>();
  const [commandError, setCommandError] = React.useState<string>();
  const [isLoading, setLoading] = React.useState(true);
  const [isSaved, setSaved] = React.useState(true);
  const controls = React.useMemo(
    () => ({
      setSnapshot,
      setLoadError,
      setCommandError,
      setLoading,
      setSaved,
    }),
    [setCommandError, setLoadError, setLoading, setSaved, setSnapshot],
  );
  const refresh = useSnapshotRefresh(api, controls);
  const apply = useCommandApply(api, snapshot, refresh, controls);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const parsed = parsedTasks(snapshot);
  return {
    ...parsed,
    loadError,
    commandError,
    isLoading,
    isSaved,
    refresh,
    apply,
  };
}
