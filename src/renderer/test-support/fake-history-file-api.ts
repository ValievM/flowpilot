import type { FlowPilotApi, IpcSnapshot } from '../../shared/contracts';

export function createFakeHistoryFileApi(
  current: () => IpcSnapshot,
): Pick<FlowPilotApi, 'history' | 'attachments' | 'backup'> {
  return {
    history: {
      list: () => Promise.resolve({ ok: true, value: [] }),
      undo: () => Promise.resolve({ ok: true, value: current() }),
    },
    attachments: {
      add: () => Promise.resolve({ ok: true, value: current() }),
      open: () => Promise.resolve({ ok: true, value: null }),
      remove: () => Promise.resolve({ ok: true, value: current() }),
    },
    backup: {
      export: () => Promise.resolve({ ok: true, value: null }),
      verify: () => Promise.resolve({ ok: false, error: 'Cancelled' }),
      restore: () => Promise.resolve({ ok: true, value: current() }),
    },
  };
}

export function createFakeAppApi(
  clock: () => string | undefined,
): FlowPilotApi['app'] {
  return {
    info: () =>
      Promise.resolve({
        ok: true,
        value: {
          name: 'FlowPilot',
          version: 'test',
          now: clock() ?? '2026-10-05T12:00:00Z',
        },
      }),
  };
}
