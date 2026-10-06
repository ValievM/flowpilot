import { describe, expect, it, vi } from 'vitest';

const bridgeState = vi.hoisted(() => {
  const captured: {
    name: string | undefined;
    api: unknown;
    calls: number;
  } = { name: undefined, api: undefined, calls: 0 };
  const expose = vi.fn((name: string, api: unknown) => {
    captured.name = name;
    captured.api = api;
    captured.calls += 1;
  });
  return { captured, expose };
});

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridgeState.expose },
  ipcRenderer: { invoke: vi.fn() },
}));

import './index';

describe('preload bridge', () => {
  it('exposes only the restricted FlowPilot API', () => {
    const { api, calls, name } = bridgeState.captured;
    if (typeof api !== 'object' || api === null)
      throw new Error('Preload API was not exposed');
    expect(calls).toBe(1);
    expect(name).toBe('flowpilot');
    expect(Object.keys(api).sort()).toEqual([
      'ai',
      'app',
      'commands',
      'settings',
      'snapshot',
    ]);
  });
});
