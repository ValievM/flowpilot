import type { Temporal } from 'temporal-polyfill';
import type {
  CommandsApplyRequest,
  FlowPilotApi,
  IpcSnapshot,
  SettingsSetRequest,
} from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';

type TestTask = IpcSnapshot['tasks'][number];
type Command = CommandsApplyRequest['commands'][number];
type StatusInput =
  | { readonly kind: 'todo' }
  | { readonly kind: 'doing' }
  | { readonly kind: 'done' }
  | {
      readonly kind: 'waiting';
      readonly reason: string;
      readonly until?: string | Temporal.PlainDate | undefined;
    };
export interface TaskInput {
  readonly id: string;
  readonly status?: TestTask['status'];
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
  readonly estimate?: { readonly unit: 'workdays'; readonly value: number };
  readonly rolledOverFrom?: string;
  readonly title?: string;
  readonly addedOrder?: number;
}

function taskDates(
  input: TaskInput,
): Pick<TestTask, 'day' | 'time' | 'deadline'> {
  return {
    ...(input.day ? { day: input.day } : {}),
    ...(input.time ? { time: input.time } : {}),
    ...(input.deadline ? { deadline: input.deadline } : {}),
  };
}

function taskDetails(
  input: TaskInput,
): Pick<TestTask, 'estimate' | 'rolledOverFrom'> {
  return {
    ...(input.estimate ? { estimate: input.estimate } : {}),
    ...(input.rolledOverFrom ? { rolledOverFrom: input.rolledOverFrom } : {}),
  };
}

export function taskRecord(input: TaskInput): TestTask {
  return {
    id: input.id,
    title: input.title ?? input.id,
    status: input.status ?? { kind: 'todo' },
    columnId: input.status?.kind ?? 'todo',
    addedOrder: input.addedOrder ?? 1,
    subtasks: [],
    comments: [],
    attachments: [],
    ...taskDates(input),
    ...taskDetails(input),
  };
}

function serializedStatus(status: StatusInput): TestTask['status'] {
  if (status.kind !== 'waiting') return status;
  return {
    kind: 'waiting',
    reason: status.reason,
    ...(status.until ? { until: status.until.toString() } : {}),
  };
}

function createdTask(
  command: Extract<Command, { kind: 'task.create' }>,
): TestTask {
  const { task } = command;
  return {
    id: task.id,
    title: task.title,
    status: serializedStatus(task.status),
    columnId: task.columnId,
    addedOrder: task.addedOrder,
    subtasks: task.subtasks,
    comments: task.comments,
    attachments: [],
    ...(task.day ? { day: task.day.toString() } : {}),
    ...(task.time ? { time: task.time.toString() } : {}),
    ...(task.deadline ? { deadline: task.deadline.toString() } : {}),
    ...(task.estimate ? { estimate: task.estimate } : {}),
    ...(task.rolledOverFrom
      ? { rolledOverFrom: task.rolledOverFrom.toString() }
      : {}),
  };
}

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
  state.current = {
    ...state.current,
    tasks: updated,
    revision: state.current.revision + 1,
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
      setTheme: () => Promise.resolve({ ok: true, value: null }),
    },
    snapshot: { load: () => apiSnapshot(state) },
    commands: { apply: (request) => apiApply(state, request) },
    settings: {
      get: () => Promise.resolve({ ok: true, value: state.current.settings }),
      set: (request) => apiSetSetting(state, request),
    },
    ai: {
      run: () => Promise.resolve({ ok: false, error: 'ProviderUnavailable' }),
      cancel: () => Promise.resolve({ ok: false, error: 'ValidationFailed' }),
      prompt: () => Promise.resolve({ ok: false, error: 'NotFound' }),
      reply: () => Promise.resolve({ ok: false, error: 'NotFound' }),
    },
    app: {
      info: () =>
        Promise.resolve({
          ok: true,
          value: {
            name: 'FlowPilot',
            version: 'test',
            now: clock() ?? '2026-10-05T12:00:00Z',
          },
        }),
    },
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
