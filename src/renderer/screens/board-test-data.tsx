import { Temporal } from 'temporal-polyfill';
import { render } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import type {
  CommandsApplyRequest,
  FlowPilotApi,
  IpcSnapshot,
} from '../../shared/contracts';
import { BoardScreen } from './board-screen';

export const columns: IpcSnapshot['columns'] = [
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

export function snapshot(tasks: IpcSnapshot['tasks'] = [task()]): IpcSnapshot {
  return {
    columns,
    tasks,
    series: [],
    outcomes: [],
    settings: { workdays: [1, 2, 3, 4, 5] },
    revision: 12,
  };
}

export function task(
  id = 'task',
  columnId = 'todo',
  title = 'Написать отчёт',
): IpcSnapshot['tasks'][number] {
  return {
    id,
    title,
    status: { kind: 'todo' },
    columnId,
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}

type Apply = FlowPilotApi['commands']['apply'];
type Load = FlowPilotApi['snapshot']['load'];
export type MockBoardApi = FlowPilotApi & {
  applyMock: Mock<Apply>;
  loadMock: Mock<Load>;
};

export function createBoardApi(initial = snapshot()): MockBoardApi {
  let current = initial;
  const loadMock: Mock<Load> = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: current }),
  );
  const applyMock: Mock<Apply> = vi.fn((request) => {
    const command = request.commands[0];
    if (!command) return Promise.resolve({ ok: true as const, value: current });
    if (command.kind === 'column.delete') {
      current = {
        ...current,
        columns: current.columns.filter((item) => item.id !== command.id),
        revision: current.revision + 1,
      };
    } else if (command.kind === 'column.create') {
      current = {
        ...current,
        columns: [...current.columns, command.column],
        revision: current.revision + 1,
      };
    } else if (command.kind === 'column.rename') {
      current = {
        ...current,
        columns: current.columns.map((item) =>
          item.id === command.id ? { ...item, name: command.name } : item,
        ),
        revision: current.revision + 1,
      };
    } else if (command.kind === 'task.move') {
      current = {
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === command.id
            ? {
                ...item,
                columnId: command.columnId,
                status: toIpcStatus(command.status ?? item.status),
              }
            : item,
        ),
        revision: current.revision + 1,
      };
    }
    return Promise.resolve({ ok: true as const, value: current });
  });
  return {
    appearance: {
      initialize: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: 'system' as const }),
      ),
      ready: vi.fn(() => Promise.resolve()),
      setTheme: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: null }),
      ),
    },
    ai: {
      run: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: 'ProviderUnavailable' as const,
        }),
      ),
      cancel: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
      prompt: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: 'InternalError' as const,
        }),
      ),
      reply: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
    },
    snapshot: { load: loadMock },
    commands: { apply: applyMock },
    settings: {
      get: vi.fn(() => Promise.resolve({ ok: true as const, value: {} })),
      set: vi.fn(() => Promise.resolve({ ok: true as const, value: current })),
    },
    app: {
      info: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            name: 'FlowPilot',
            version: 'test',
            now: '2026-10-06T12:00:00Z',
          },
        }),
      ),
    },
    applyMock,
    loadMock,
  };
}
type MoveStatus = NonNullable<
  Extract<
    CommandsApplyRequest['commands'][number],
    { kind: 'task.move' }
  >['status']
>;

function toIpcStatus(
  status: MoveStatus | IpcSnapshot['tasks'][number]['status'],
): IpcSnapshot['tasks'][number]['status'] {
  if (status.kind !== 'waiting') return status;
  if (!status.until) return { kind: 'waiting', reason: status.reason };
  return {
    kind: 'waiting',
    reason: status.reason,
    until:
      typeof status.until === 'string' ? status.until : status.until.toString(),
  };
}

export function renderBoard(value = createBoardApi()): MockBoardApi {
  window.flowpilot = value;
  render(<BoardScreen today={Temporal.PlainDate.from('2026-10-06')} />);
  return value;
}
