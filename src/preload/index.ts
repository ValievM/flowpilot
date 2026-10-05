import { contextBridge } from 'electron';

import { ipcRenderer } from 'electron';
import {
  ipcChannels,
  type FlowPilotApi,
  type CommandsApplyRequest,
  type SettingsSetRequest,
  type IpcSnapshot,
} from '../shared/contracts';
import type { Result } from '../shared/ipc-result';
// Electron types invoke as untyped; main validates requests and returns this FlowPilotApi contract.
const testNow =
  process.defaultApp && process.env.FLOWPILOT_TEST === '1'
    ? process.env.FLOWPILOT_TEST_NOW
    : undefined;
const api: FlowPilotApi = Object.freeze({
  clock: { now: () => testNow },
  snapshot: {
    load: () =>
      ipcRenderer.invoke(ipcChannels.snapshotLoad, {}) as Promise<
        Result<IpcSnapshot>
      >,
  },
  commands: {
    apply: (request: CommandsApplyRequest) =>
      ipcRenderer.invoke(ipcChannels.commandsApply, request) as Promise<
        Result<IpcSnapshot>
      >,
  },
  settings: {
    get: () =>
      ipcRenderer.invoke(ipcChannels.settingsGet, {}) as Promise<
        Result<Readonly<Record<string, unknown>>>
      >,
    set: (request: SettingsSetRequest) =>
      ipcRenderer.invoke(ipcChannels.settingsSet, request) as Promise<
        Result<IpcSnapshot>
      >,
  },
  app: {
    info: () =>
      ipcRenderer.invoke(ipcChannels.appInfo, {}) as Promise<
        Result<{ name: string; version: string }>
      >,
  },
});

contextBridge.exposeInMainWorld('flowpilot', api);
