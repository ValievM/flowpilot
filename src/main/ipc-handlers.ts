import { ipcChannels } from '../shared/contracts';
import type { Repository } from '../storage/repository';
import { nativeTheme, type IpcMain } from 'electron';
import { applyAppearanceTheme, initializeAppearanceTheme } from './appearance';
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
  readonly appInfo: {
    getName(): string;
    getVersion(): string;
    getNow(): string;
  };
  readonly aiRunner: AiRunner;
  readonly manualProvider: ManualExchangeProvider;
  readonly onAppearanceReady: () => void;
};

export function registerIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: RegistrationDependencies,
): void {
  ipc.handle(ipcChannels.appearanceInitialize, (_event, request: unknown) =>
    initializeAppearanceTheme(request, {
      repository: deps.repository,
      nativeTheme,
    }),
  );
  ipc.handle(ipcChannels.appearanceReady, () => {
    deps.onAppearanceReady();
  });
  ipc.handle(ipcChannels.appearanceSetTheme, (_event, request: unknown) =>
    applyAppearanceTheme(request, {
      repository: deps.repository,
      nativeTheme,
    }),
  );
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
    runAiRequest(request, deps.aiRunner, deps.repository.load()),
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
