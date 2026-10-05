import type { IpcMain } from 'electron';
import { ipcChannels } from '../shared/contracts';
import type { Repository } from '../storage/repository';
import {
  applyCommands,
  getAppInfo,
  getSettings,
  loadSnapshot,
  setSetting,
} from './handlers';
import {
  cancelAiRequest,
  getManualPrompt,
  runAiRequest,
  submitManualReply,
} from './ai/ipc';
import type { AiRunner } from './ai/ai-runner';
import type { ManualExchangeProvider } from './ai/manual-exchange-provider';

type RegistrationDependencies = {
  readonly repository: Repository;
  readonly appInfo: { getName(): string; getVersion(): string };
  readonly aiRunner: AiRunner;
  readonly manualProvider: ManualExchangeProvider;
};

export function registerIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: RegistrationDependencies,
): void {
  ipc.handle(ipcChannels.snapshotLoad, (_event, request: unknown) =>
    loadSnapshot(request, deps),
  );
  ipc.handle(ipcChannels.commandsApply, (_event, request: unknown) =>
    applyCommands(request, deps),
  );
  ipc.handle(ipcChannels.settingsGet, (_event, request: unknown) =>
    getSettings(request, deps),
  );
  ipc.handle(ipcChannels.settingsSet, (_event, request: unknown) =>
    setSetting(request, deps),
  );
  ipc.handle(ipcChannels.appInfo, (_event, request: unknown) =>
    getAppInfo(request, deps.appInfo),
  );
  ipc.handle(ipcChannels.aiRun, (_event, request: unknown) =>
    runAiRequest(request, deps.aiRunner),
  );
  ipc.handle(ipcChannels.aiCancel, (_event, request: unknown) =>
    cancelAiRequest(request, deps.aiRunner),
  );
  ipc.handle(ipcChannels.aiPrompt, (_event, request: unknown) =>
    getManualPrompt(request, deps.manualProvider),
  );
  ipc.handle(ipcChannels.aiReply, (_event, request: unknown) =>
    submitManualReply(request, deps.manualProvider),
  );
}
