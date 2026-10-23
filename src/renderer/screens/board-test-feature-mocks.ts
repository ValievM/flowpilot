import { vi } from 'vitest';
import type { IpcSnapshot } from '../../shared/contracts';

function catalogMocks() {
  return {
    catalog: {
      list: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { taskTypes: [], disciplines: [] },
        }),
      ),
    },
  };
}

function scheduleMocks() {
  return {
    schedule: {
      list: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      importFile: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'Cancelled' as const },
        }),
      ),
      confirmImport: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'NotFound' as const },
        }),
      ),
    },
  };
}

function ruleMocks() {
  return {
    rules: {
      list: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      importFile: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'Cancelled' as const },
        }),
      ),
      exportFile: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'NotFound' as const },
        }),
      ),
      activate: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'NotFound' as const },
        }),
      ),
      deactivate: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'NotFound' as const },
        }),
      ),
      bind: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'NotFound' as const },
        }),
      ),
    },
  };
}

function historyFileMocks(getCurrent: () => IpcSnapshot) {
  return {
    history: {
      list: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      undo: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: getCurrent() }),
      ),
    },
    attachments: {
      add: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: getCurrent() }),
      ),
      open: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
      remove: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: getCurrent() }),
      ),
    },
    backup: {
      export: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            folderPath: '/tmp/FlowPilot-export-2026-10-05',
            exportedAt: '2026-10-05T12:00:00Z',
          },
        }),
      ),
      verify: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { packageToken: 'test-token', problems: [] as const },
        }),
      ),
      restore: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: getCurrent() }),
      ),
    },
  };
}

/** Mocks for the rule, history, attachment and backup bridges used by board tests. */
export function featureMocks(getCurrent: () => IpcSnapshot) {
  return {
    ...catalogMocks(),
    ...ruleMocks(),
    ...scheduleMocks(),
    ...historyFileMocks(getCurrent),
  };
}
