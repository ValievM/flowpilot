import { describe, expect, it, vi } from 'vitest';
import type { FlowPilotApi } from '../shared/flowpilot-api';

const bridgeState = vi.hoisted(() => {
  const captured: {
    name: string | undefined;
    api: FlowPilotApi | undefined;
    calls: number;
  } = { name: undefined, api: undefined, calls: 0 };
  const expose = vi.fn((name: string, api: FlowPilotApi) => {
    captured.name = name;
    captured.api = api;
    captured.calls += 1;
  });
  const invoke = vi.fn();
  return { captured, expose, invoke };
});

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridgeState.expose },
  ipcRenderer: { invoke: bridgeState.invoke },
}));

import './index';

describe('preload bridge', () => {
  it('exposes only the restricted FlowPilot API', () => {
    const { api, calls, name } = bridgeState.captured;
    if (!api) throw new Error('Preload API was not exposed');
    expect(calls).toBe(1);
    expect(name).toBe('flowpilot');
    expect(Object.keys(api).sort()).toEqual([
      'ai',
      'app',
      'appearance',
      'attachments',
      'backup',
      'catalog',
      'commands',
      'history',
      'rules',
      'settings',
      'snapshot',
    ]);
    expect(Object.keys(api.catalog).sort()).toEqual(['list']);
    expect(Object.keys(api.rules).sort()).toEqual([
      'activate',
      'bind',
      'deactivate',
      'exportFile',
      'importFile',
      'list',
    ]);
  });

  it('routes public generic theme writes through the validated settings channel', async () => {
    bridgeState.invoke.mockResolvedValue({
      ok: false,
      error: 'ValidationFailed',
    });
    const { api } = bridgeState.captured;
    if (!api) throw new Error('Preload API was not exposed');
    await expect(
      api.settings.set({
        key: 'theme',
        value: 'light',
        expectedRevision: 4,
      }),
    ).resolves.toEqual({ ok: false, error: 'ValidationFailed' });
    expect(bridgeState.invoke).toHaveBeenCalledWith('settings.set', {
      key: 'theme',
      value: 'light',
      expectedRevision: 4,
    });
  });
  it('routes history listing through the strict history channel', async () => {
    bridgeState.invoke.mockResolvedValue({ ok: true, value: [] });
    const { api } = bridgeState.captured;
    if (!api) throw new Error('Preload API was not exposed');

    await expect(api.history.list()).resolves.toEqual({ ok: true, value: [] });

    expect(bridgeState.invoke).toHaveBeenCalledWith('history.list', {
      limit: 50,
      before: undefined,
    });
  });
});
