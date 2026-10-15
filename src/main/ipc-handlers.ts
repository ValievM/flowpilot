import { ipcChannels } from '../shared/contracts';
import type { Repository } from '../storage/repository';
import { nativeTheme, type IpcMain } from 'electron';
import { applyAppearanceTheme, initializeAppearanceTheme } from './appearance';
import { applyCommands, loadSnapshot } from './handlers';
import type { AiRunner } from './ai/ai-runner';
import type { ManualExchangeProvider } from './ai/manual-exchange-provider';
import type { RuleFileDependencies } from './rules-handlers';
import { registerFeatureIpcHandlers } from './ipc-feature-handlers';

type RegistrationDependencies = {
  readonly repository: Repository;
  readonly ruleDialogs: RuleFileDependencies['dialogs'];
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
  registerFeatureIpcHandlers(ipc, deps);
}
