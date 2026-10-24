import type {
  CommandsApplyRequest,
  IpcSnapshot,
  SettingsSetRequest,
} from '../../shared/contracts';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import type { Result } from '../../shared/ipc-result';
import {
  fakeCatalogApi,
  fakeNotificationsApi,
  fakeRulesApi,
  fakeScheduleApi,
} from './fake-catalog-rules';
import {
  createFakeAppApi,
  createFakeHistoryFileApi,
} from './fake-history-file-api';
import { applyRepeatCommands } from './fake-repeat-commands';
import { createdTask, serializedStatus } from './fake-task-records';

export { taskRecord, type TaskInput } from './fake-task-records';

type TestTask = IpcSnapshot['tasks'][number];
type Command = CommandsApplyRequest['commands'][number];
const columns: IpcSnapshot['columns'] = [
  {
    id: 'todo',
    name: 'Сделать',
    description: '',
    state: 'todo',
    builtIn: true,
  },
  {
    id: 'doing',
    name: 'Делаю',
    description: '',
    state: 'doing',
    builtIn: true,
  },
  {
    id: 'waiting',
    name: 'Ожидание',
    description: '',
    state: 'waiting',
    builtIn: true,
  },
  { id: 'done', name: 'Готово', description: '', state: 'done', builtIn: true },
];

interface FakeState {
  current: IpcSnapshot;
  readonly calls: CommandsApplyRequest[];
  readonly settingsCalls: SettingsSetRequest[];
  staleOnce: boolean;
  rejectAll: boolean;
  rejectRetry: boolean;
  loadFailure: boolean;
  settingsFailure: boolean;
  changedByConflict: boolean;
}

function applyCommands(
  state: FakeState,
  request: CommandsApplyRequest,
): IpcSnapshot {
  const updated = [...state.current.tasks];
  for (const command of request.commands) {
    if (command.kind === 'task.create') updated.push(createdTask(command));
    if (command.kind === 'task.move' && command.status)
      moveTask(updated, command);
  }
  const repeats = applyRepeatCommands(state.current, request.commands);
  state.current = {
    ...state.current,
    tasks: updated,
    revision: state.current.revision + 1,
    ...repeats,
  };
  return state.current;
}

function moveTask(
  tasks: TestTask[],
  command: Extract<Command, { kind: 'task.move' }>,
): void {
  if (!command.status) return;
  const index = tasks.findIndex((task) => task.id === command.id);
  const task = tasks[index];
  if (task)
    tasks[index] = {
      ...task,
      status: serializedStatus(command.status),
      columnId: command.columnId,
    };
}

function apiSnapshot(state: FakeState): Promise<Result<IpcSnapshot>> {
  return Promise.resolve(
    state.loadFailure
      ? { ok: false, error: 'InternalError' }
      : { ok: true, value: state.current },
  );
}

function apiApply(
  state: FakeState,
  request: CommandsApplyRequest,
): Promise<Result<IpcSnapshot>> {
  state.calls.push(request);
  if (state.rejectAll || (state.rejectRetry && state.changedByConflict))
    return Promise.resolve({ ok: false, error: 'ValidationFailed' });
  if (state.staleOnce && !state.changedByConflict) {
    state.changedByConflict = true;
    state.current = { ...state.current, revision: state.current.revision + 1 };
    return Promise.resolve({ ok: false, error: 'StaleRevision' });
  }
  return Promise.resolve({ ok: true, value: applyCommands(state, request) });
}
function apiSetSetting(
  state: FakeState,
  request: SettingsSetRequest,
): Promise<Result<IpcSnapshot>> {
  state.settingsCalls.push(request);
  if (state.settingsFailure)
    return Promise.resolve({ ok: false, error: 'InternalError' });
  state.current = {
    ...state.current,
    settings: { ...state.current.settings, [request.key]: request.value },
    revision: state.current.revision + 1,
  };
  return Promise.resolve({ ok: true, value: state.current });
}

export interface FakeFlowPilot {
  readonly api: FlowPilotApi;
  readonly calls: CommandsApplyRequest[];
  readonly settingsCalls: SettingsSetRequest[];
  setStaleOnce(): void;
  setAlwaysReject(): void;
  setRejectRetry(): void;
  setLoadFailure(failed?: boolean): void;
  setSettingsFailure(failed?: boolean): void;
  snapshot(): IpcSnapshot;
}

function fakeApiFor(
  state: FakeState,
  clock: () => string | undefined,
): FlowPilotApi {
  return {
    appearance: {
      initialize: () => Promise.resolve({ ok: true, value: 'system' }),
      ready: () => Promise.resolve(),
      setTheme: ({ theme }) => {
        state.current = {
          ...state.current,
          settings: { ...state.current.settings, theme },
          revision: state.current.revision + 1,
        };
        return Promise.resolve({ ok: true, value: null });
      },
    },
    snapshot: { load: () => apiSnapshot(state) },
    commands: { apply: (request) => apiApply(state, request) },
    catalog: fakeCatalogApi,
    schedule: fakeScheduleApi,
    notifications: fakeNotificationsApi,
    rules: fakeRulesApi,
    settings: {
      get: () => Promise.resolve({ ok: true, value: state.current.settings }),
      set: (request) => apiSetSetting(state, request),
    },
    ...createFakeHistoryFileApi(() => state.current),
    ai: {
      scenario: () =>
        Promise.resolve({
          ok: false,
          error: {
            kind: 'ProviderUnavailable',
            message: 'AI is unavailable in this test.',
          },
        }),
      run: () => Promise.resolve({ ok: false, error: 'ProviderUnavailable' }),
      cancel: () => Promise.resolve({ ok: false, error: 'ValidationFailed' }),
      prompt: () => Promise.resolve({ ok: false, error: 'NotFound' }),
      pending: () => Promise.resolve({ ok: true, value: [] }),
      reply: () => Promise.resolve({ ok: false, error: 'NotFound' }),
    },
    app: createFakeAppApi(clock),
  };
}

export function fakeApi(
  tasks: readonly TestTask[] = [],
  clock: () => string | undefined = () => undefined,
  workdays: readonly number[] = [1, 2, 3, 4, 5],
): FakeFlowPilot {
  const state: FakeState = {
    current: {
      columns,
      tasks,
      series: [],
      outcomes: [],
      settings: { workdays },
      revision: 0,
    },
    calls: [],
    settingsCalls: [],
    staleOnce: false,
    rejectAll: false,
    rejectRetry: false,
    loadFailure: false,
    settingsFailure: false,
    changedByConflict: false,
  };
  const api = fakeApiFor(state, clock);
  return {
    api,
    calls: state.calls,
    settingsCalls: state.settingsCalls,
    setStaleOnce: () => {
      state.staleOnce = true;
    },
    setAlwaysReject: () => {
      state.rejectAll = true;
    },
    setRejectRetry: () => {
      state.rejectRetry = true;
    },
    setLoadFailure: (failed = true) => {
      state.loadFailure = failed;
    },
    setSettingsFailure: (failed = true) => {
      state.settingsFailure = failed;
    },
    snapshot: () => state.current,
  };
}
