import { contextBridge } from 'electron';

import { ipcRenderer } from 'electron';
import {
  ipcChannels,
  type AppInfo,
  type FlowPilotApi,
  type CommandsApplyRequest,
  type SettingsSetRequest,
  type IpcSnapshot,
  type AiIpcRequest,
  type AiIpcResult,
  type AiCancelResult,
  type AiManualReplyResult,
  type ThemeChoiceRequest,
} from '../shared/contracts';
import type { Result } from '../shared/ipc-result';
// Electron types invoke as untyped; main validates requests and returns this FlowPilotApi contract.
const api: FlowPilotApi = Object.freeze({
  snapshot: {
    load: () =>
      ipcRenderer.invoke(ipcChannels.snapshotLoad, {}) as Promise<
        Result<IpcSnapshot>
      >,
  },
  appearance: {
    setTheme: (request: ThemeChoiceRequest) =>
      ipcRenderer.invoke(ipcChannels.appearanceSetTheme, request) as Promise<
        Result<null>
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
  ai: {
    run: (request: AiIpcRequest) =>
      ipcRenderer.invoke(ipcChannels.aiRun, request) as Promise<AiIpcResult>,
    cancel: (request: { operationId: string }) =>
      ipcRenderer.invoke(
        ipcChannels.aiCancel,
        request,
      ) as Promise<AiCancelResult>,
    prompt: (request: { operationId: string }) =>
      ipcRenderer.invoke(ipcChannels.aiPrompt, request) as Promise<
        Result<string>
      >,
    reply: (request: { operationId: string; text: string }) =>
      ipcRenderer.invoke(
        ipcChannels.aiReply,
        request,
      ) as Promise<AiManualReplyResult>,
  },
  app: {
    info: () =>
      ipcRenderer.invoke(ipcChannels.appInfo, {}) as Promise<Result<AppInfo>>,
  },
});

contextBridge.exposeInMainWorld('flowpilot', api);
